import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import bcrypt from 'bcrypt';
import Stripe from 'stripe';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ||= 'integration-test-session-secret-32-chars';
process.env.STRIPE_SECRET_KEY ||= 'sk_test_integration';
process.env.STRIPE_WEBHOOK_SECRET ||= 'whsec_integration';

const [{ app }, { prisma }, { withBackgroundJobLease }] = await Promise.all([
  import('../src/index.js'),
  import('../src/lib/prisma.js'),
  import('../src/lib/backgroundJobLease.js'),
]);

let server;
let baseUrl;

function listen() {
  return new Promise((resolve, reject) => {
    const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate));
    candidate.once('error', reject);
  });
}

function close(candidate) {
  return new Promise((resolve, reject) => candidate.close((err) => (err ? reject(err) : resolve())));
}

async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "User", "Account", "Session", "BackgroundJobLease", "WaitlistEntry" RESTART IDENTITY CASCADE',
  );
}

async function createIdentity({ email, password = 'password-123', role = 'owner', permissions = {}, accountId } = {}) {
  const passwordHash = await bcrypt.hash(password, 4);
  const account = accountId
    ? await prisma.account.findUniqueOrThrow({ where: { id: accountId } })
    : await prisma.account.create({ data: { approvedAt: new Date() } });
  const user = await prisma.user.create({
    data: { firstName: 'Test', lastName: 'User', email, passwordHash },
  });
  await prisma.membership.create({
    data: { userId: user.id, accountId: account.id, role, permissions },
  });
  return { user, account, password };
}

function responseCookies(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  return values.map((value) => value.split(';', 1)[0]).join('; ');
}

function cookieValue(cookies, name) {
  return cookies.split('; ').find((part) => part.startsWith(`${name}=`)) || null;
}

async function request(path, { cookie, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', cookie);
  return fetch(`${baseUrl}${path}`, { ...options, headers, redirect: 'manual' });
}

async function login(identity, cookie) {
  const response = await request('/api/auth/login', {
    method: 'POST',
    cookie,
    body: JSON.stringify({ email: identity.user.email, password: identity.password }),
  });
  assert.equal(response.status, 200);
  // fetch resolves at headers; wait for the response to finish so the
  // session-store save has completed before sending an authenticated request.
  await response.arrayBuffer();
  return responseCookies(response);
}

before(async () => {
  server = await listen();
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(resetDatabase);

after(async () => {
  await close(server);
  await prisma.$disconnect();
});

test('tenant-scoped lists never return another account’s records', async () => {
  const first = await createIdentity({ email: 'first@example.com' });
  const second = await createIdentity({ email: 'second@example.com' });
  await prisma.client.createMany({ data: [
    { id: 'client-first', accountId: first.account.id, firstName: 'First', lastName: 'Client' },
    { id: 'match-email', accountId: first.account.id, firstName: 'Jon', lastName: 'Smyth', email: 'jon@example.com', emailNormalized: 'jon@example.com', phone: '(212) 555-0101', phoneNormalized: '2125550101', nameNormalized: 'jon smyth' },
    { id: 'match-name', accountId: first.account.id, firstName: 'John', lastName: 'Smith', nameNormalized: 'john smith' },
    { id: 'client-second', accountId: second.account.id, firstName: 'Second', lastName: 'Client' },
    { id: 'foreign-match', accountId: second.account.id, firstName: 'John', lastName: 'Smith', email: 'jon@example.com', emailNormalized: 'jon@example.com', nameNormalized: 'john smith' },
  ] });

  const cookie = await login(first);
  const response = await request('/api/clients?limit=100', { cookie });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.clients.map((client) => client.id).sort(), ['client-first', 'match-email', 'match-name']);

  const matches = await request('/api/clients/matches/inquiry?firstName=John&lastName=Smith&email=jon%40example.com&phone=2125550101', { cookie });
  assert.equal(matches.status, 200);
  const matchesBody = await matches.json();
  assert.equal(matchesBody.candidates[0].id, 'match-email');
  assert.equal(matchesBody.candidates[0].match.emailExact, true);
  assert.ok(matchesBody.candidates.some((candidate) => candidate.id === 'match-name'));
  assert.ok(matchesBody.candidates.every((candidate) => candidate.id !== 'foreign-match'));
  assert.ok(matchesBody.candidates.length <= 8);
});

test('stage plots enforce tenant ownership and reject stale canvas saves', async () => {
  const first = await createIdentity({ email: 'stage-first@example.com' });
  const second = await createIdentity({ email: 'stage-second@example.com' });
  await prisma.account.updateMany({ where: { id: { in: [first.account.id, second.account.id] } }, data: { vertical: 'band_orchestra' } });
  await prisma.event.createMany({ data: [
    { id: 'stage-event-first', accountId: first.account.id, name: 'First event' },
    { id: 'stage-event-second', accountId: second.account.id, name: 'Second event' },
  ] });
  const cookie = await login(first);

  const foreign = await request('/api/stage-plots/stage-event-second', { cookie });
  assert.equal(foreign.status, 404);

  const own = await request('/api/stage-plots/stage-event-first', { cookie });
  assert.equal(own.status, 200);
  const page = (await own.json()).stagePlot.pages[0];
  assert.ok(page.updatedAt);

  const firstSave = await request(`/api/stage-plots/stage-event-first/pages/${page.id}`, {
    method: 'PATCH', cookie, body: JSON.stringify({ scene: { layers: [], elements: [] }, expectedUpdatedAt: page.updatedAt }),
  });
  assert.equal(firstSave.status, 200);
  const staleSave = await request(`/api/stage-plots/stage-event-first/pages/${page.id}`, {
    method: 'PATCH', cookie, body: JSON.stringify({ scene: { layers: [], elements: [{ id: 'late' }] }, expectedUpdatedAt: page.updatedAt }),
  });
  assert.equal(staleSave.status, 409);
  assert.equal((await staleSave.json()).code, 'STALE_STAGE_PLOT_PAGE');
});

test('all stage plot tables exposed by Supabase have row-level security enabled', async () => {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT relname, relrowsecurity
    FROM pg_class
    WHERE relname IN (
      'StagePlot', 'StagePlotPage', 'StagePlotChannel', 'StagePlotBacklineItem',
      'StagePlotLibraryItem', 'StagePlotLibraryPage', 'StagePlotLibraryChannel', 'StagePlotLibraryBacklineItem',
      'StagePlotShare', 'StagePlotRevision'
    )
  `);
  assert.equal(rows.length, 10);
  assert.ok(rows.every((row) => row.relrowsecurity), JSON.stringify(rows));
});

test('threaded email rejects a member without booking permission before sending', async () => {
  const member = await createIdentity({
    email: 'member@example.com',
    role: 'member',
    permissions: { manageBookings: false },
  });
  const cookie = await login(member);

  const response = await request('/api/email/threads/send', {
    method: 'POST',
    cookie,
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 403);
});

test('logging in rotates an existing authenticated session ID', async () => {
  const identity = await createIdentity({ email: 'rotation@example.com' });
  const firstCookies = await login(identity);
  const firstSession = cookieValue(firstCookies, 'connect.sid');
  assert.ok(firstSession);

  const secondCookies = await login(identity, firstCookies);
  const secondSession = cookieValue(secondCookies, 'connect.sid');
  assert.ok(secondSession);
  assert.notEqual(secondSession, firstSession);
});

test('pagination does not skip or duplicate records sharing a timestamp', async () => {
  const identity = await createIdentity({ email: 'pagination@example.com' });
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  await prisma.client.createMany({ data: ['a', 'b', 'c'].map((id) => ({
    id,
    accountId: identity.account.id,
    firstName: id.toUpperCase(),
    lastName: 'Client',
    createdAt,
  })) });
  const cookie = await login(identity);

  const firstResponse = await request('/api/clients?limit=2', { cookie });
  const firstPage = await firstResponse.json();
  assert.deepEqual(firstPage.clients.map((client) => client.id), ['a', 'b']);
  assert.ok(firstPage.nextCursor);

  const secondResponse = await request(`/api/clients?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor)}`, { cookie });
  const secondPage = await secondResponse.json();
  assert.deepEqual(secondPage.clients.map((client) => client.id), ['c']);
  assert.equal(secondPage.nextCursor, null);
});

test('a password-reset token can only be consumed by one concurrent request', async () => {
  const identity = await createIdentity({ email: 'reset@example.com' });
  const token = 'integration-reset-token';
  await prisma.passwordResetToken.create({
    data: {
      userId: identity.user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  const responses = await Promise.all(['new-password-one', 'new-password-two'].map((newPassword) => request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  })));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);

  const updated = await prisma.user.findUniqueOrThrow({ where: { id: identity.user.id } });
  const matches = await Promise.all([
    bcrypt.compare('new-password-one', updated.passwordHash),
    bcrypt.compare('new-password-two', updated.passwordHash),
  ]);
  assert.equal(matches.filter(Boolean).length, 1);
});

test('a contract signing token can only record one concurrent signature', async () => {
  const identity = await createIdentity({ email: 'contract-owner@example.com' });
  const token = 'integration-contract-token';
  const contract = await prisma.contract.create({
    data: {
      accountId: identity.account.id,
      bookingId: 'booking-contract',
      snapshot: {},
      status: 'owner_signed',
      recipientEmail: 'client@example.com',
      ownerEmail: identity.user.email,
      clientTokenHash: createHash('sha256').update(token).digest('hex'),
      ownerSignedAt: new Date(),
      ownerSignatureName: 'Owner',
      ownerSignatureImage: 'owner-signature',
      log: [{ id: 'owner-log', at: new Date().toISOString(), type: 'owner_signed' }],
    },
  });

  const submit = (signatureName) => request(`/api/contract-sign/${token}/submit`, {
    method: 'POST',
    body: JSON.stringify({ email: 'client@example.com', signatureName, signatureImage: 'client-signature', consentAccepted: true }),
  });
  const responses = await Promise.all([submit('First'), submit('Second')]);
  // The loser can observe either an already-signed snapshot (409) or the
  // rotated token (404); exactly one signature must still be recorded.
  const statuses = responses.map((response) => response.status).sort();
  assert.equal(statuses[0], 200);
  assert.ok([404, 409].includes(statuses[1]));

  const updated = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
  assert.equal(updated.status, 'fully_signed');
  assert.ok(['First', 'Second'].includes(updated.clientSignatureName));
  assert.equal(updated.log.filter((entry) => entry.type === 'client_signed').length, 1);
});

test('the database lease admits only one concurrent global job', async () => {
  let releaseFirst;
  const holdFirst = new Promise((resolve) => { releaseFirst = resolve; });
  let firstStarted;
  const started = new Promise((resolve) => { firstStarted = resolve; });

  const first = withBackgroundJobLease('integration-job', async () => {
    firstStarted();
    await holdFirst;
  });
  await started;

  const second = await withBackgroundJobLease('integration-job', async () => {
    assert.fail('second job should not acquire the lease');
  });
  assert.equal(second, false);
  releaseFirst();
  assert.equal(await first, true);
});

test('only one worker can claim the same due reminder', async () => {
  const identity = await createIdentity({ email: 'reminder@example.com' });
  const reminder = await prisma.reminder.create({
    data: {
      accountId: identity.account.id,
      note: 'Claim me once',
      remindAt: new Date(Date.now() - 1000),
      emailEnabled: true,
    },
  });

  const attempts = await Promise.all(Array.from({ length: 8 }, () => prisma.reminder.updateMany({
    where: { id: reminder.id, emailSentAt: null, emailClaimedAt: null },
    data: { emailClaimedAt: new Date() },
  })));
  assert.equal(attempts.reduce((sum, result) => sum + result.count, 0), 1);
});

test('shared inbox receives new mail, matches contacts, strips unsafe content and deduplicates notifications', async () => {
  const { resolveInboxTarget, receiveInboxMail } = await import('../src/lib/inboxReceiving.js');
  const identity = await createIdentity({ email: 'inbox-owner@example.com' });
  await prisma.emailDomain.create({ data: { accountId: identity.account.id, domain: 'mail.inbox.test', resendDomainId: 'domain-inbox', status: 'verified', sendingStatus: 'verified', receivingStatus: 'verified', dnsRecords: [] } });
  await prisma.client.create({ data: { id: 'inbox-client', accountId: identity.account.id, firstName: 'Client', lastName: 'One', email: 'client@example.com' } });
  await prisma.booking.create({ data: { id: 'inbox-booking', accountId: identity.account.id, clientId: 'inbox-client', eventName: 'Wedding', bookingStatus: 'active' } });
  const event = { email_id: 'received-inbox-1', to: ['bookings@mail.inbox.test'] };
  const target = await resolveInboxTarget(event);
  assert.equal(target.accountId, identity.account.id);
  const result = await receiveInboxMail(target, { from: 'Client <client@example.com>', subject: 'Wedding question', html: '<p>Can we talk?</p><script>alert(1)</script><img src="https://tracker.test">', attachments: [{ id: 'attachment-1', filename: 'details.pdf', content_type: 'application/pdf', size: 40 }], message_id: '<original@client.test>' }, event);
  assert.ok(result.threadId);
  assert.equal((await receiveInboxMail(target, { from: 'client@example.com' }, event)).duplicate, true);
  const thread = await prisma.inboxThread.findUnique({ where: { id: result.threadId }, include: { messages: { include: { attachments: true } } } });
  assert.equal(thread.clientId, 'inbox-client');
  assert.equal(thread.bookingId, 'inbox-booking');
  assert.equal(thread.messages.length, 1);
  assert.equal(thread.messages[0].body, '<p>Can we talk?</p>');
  assert.equal(thread.messages[0].attachments[0].providerAttachmentId, 'attachment-1');
  assert.equal(await prisma.reminder.count({ where: { ruleKey: 'inbox-unread' } }), 1);
  const cookie = await login(identity);
  const list = await request('/api/inbox', { cookie });
  const listed = await list.json();
  assert.equal(listed.threads[0].unreadCount, 1);
  assert.equal(listed.receivingAddress, 'hello@mail.inbox.test');
  const read = await request(`/api/inbox/${thread.id}/read`, { cookie, method: 'POST', body: JSON.stringify({ messageIds: [thread.messages[0].id] }) });
  assert.equal(read.status, 200);
  assert.equal((await (await request('/api/inbox/summary', { cookie })).json()).unreadCount, 0);
  assert.ok((await prisma.reminder.findFirst({ where: { relatedId: thread.id } })).completedAt);
  await prisma.booking.create({ data: { id: 'inbox-second-booking', accountId: identity.account.id, clientId: 'inbox-client', eventName: 'Another wedding', bookingStatus: 'active' } });
  const ambiguous = await receiveInboxMail(target, { from: 'client@example.com', text: 'Another question' }, { ...event, email_id: 'received-inbox-2' });
  assert.equal((await prisma.inboxThread.findUnique({ where: { id: ambiguous.threadId } })).bookingId, null);
});

test('inbox denies foreign records and members without booking permission, including attachments and linking', async () => {
  const first = await createIdentity({ email: 'inbox-first@example.com' });
  const second = await createIdentity({ email: 'inbox-second@example.com' });
  const limited = await createIdentity({ email: 'inbox-limited@example.com', accountId: first.account.id, role: 'member' });
  const thread = await prisma.inboxThread.create({ data: { accountId: first.account.id, subject: 'Private', contactEmail: 'client@example.com', messages: { create: { direction: 'inbound', fromAddress: 'client@example.com', toAddress: 'hello@inbox.test', subject: 'Private', body: 'Private', attachments: { create: { filename: 'private.txt', contentType: 'text/plain', size: 6, data: Buffer.from('secret') } } } } }, include: { messages: { include: { attachments: true } } } });
  const foreignCookie = await login(second);
  assert.equal((await request(`/api/inbox/${thread.id}`, { cookie: foreignCookie })).status, 404);
  assert.equal((await request(`/api/inbox/${thread.id}/attachments/${thread.messages[0].attachments[0].id}`, { cookie: foreignCookie })).status, 404);
  assert.deepEqual((await (await request('/api/inbox', { cookie: foreignCookie })).json()).threads, []);
  assert.equal((await request('/api/inbox', { cookie: await login(limited) })).status, 403);
  await prisma.client.create({ data: { id: 'foreign-inbox-client', accountId: second.account.id, firstName: 'Foreign', lastName: 'Client' } });
  const cookie = await login(first);
  assert.equal((await request(`/api/inbox/${thread.id}`, { cookie, method: 'PATCH', body: JSON.stringify({ clientId: 'foreign-inbox-client' }) })).status, 400);
  const attachment = await request(`/api/inbox/${thread.id}/attachments/${thread.messages[0].attachments[0].id}`, { cookie });
  assert.equal((await attachment.json()).base64, Buffer.from('secret').toString('base64'));
  assert.equal((await request(`/api/inbox/${thread.id}/reply`, { cookie, method: 'POST', body: JSON.stringify({ body: 'Should require CSRF' }) })).status, 403);
});

test('domain test sends a real tracked reply alias and reports when receiving is unavailable', async () => {
  const { getResendClient } = await import('../src/lib/resend.js');
  const { resolveInboxTarget, receiveInboxMail } = await import('../src/lib/inboxReceiving.js');
  process.env.RESEND_API_KEY ||= 're_inbox_test';
  const provider = getResendClient();
  const original = provider.emails.send;
  const previousDomain = process.env.RESEND_INBOUND_DOMAIN;
  process.env.RESEND_INBOUND_DOMAIN = '';
  const sent = [];
  provider.emails.send = async (data) => { sent.push(data); return { data: { id: `test-inbox-send-${sent.length}` } }; };
  try {
    const identity = await createIdentity({ email: 'domain-owner@example.com' });
    await prisma.emailDomain.create({ data: { accountId: identity.account.id, domain: 'mail.test-domain.test', resendDomainId: 'inbox-domain-test', status: 'verified', sendingStatus: 'verified', receivingStatus: 'verified', dnsRecords: [] } });
    const cookie = await login(identity);
    const response = await request('/api/email-domains/test-email', { cookie, method: 'POST', body: JSON.stringify({ to: 'tester@example.com' }) });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.replyTrackingActive, true);
    assert.match(sent[0].replyTo, /^inbox\+.+@mail\.test-domain\.test$/);
    const event = { to: [sent[0].replyTo], email_id: 'test-inbox-reply' };
    const target = await resolveInboxTarget(event);
    assert.equal(target.id, result.threadId);
    await receiveInboxMail(target, { from: 'tester@example.com', text: 'It works' }, event);
    assert.equal(await prisma.inboxMessage.count({ where: { threadId: result.threadId } }), 2);
    await prisma.emailDomain.update({ where: { accountId: identity.account.id }, data: { receivingStatus: 'pending' } });
    const second = await request('/api/email-domains/test-email', { cookie, method: 'POST', body: JSON.stringify({ to: 'tester@example.com' }) });
    assert.equal((await second.json()).replyTrackingActive, false);
    assert.equal(sent[1].replyTo, undefined);
    assert.match(sent[1].html, /Receiving is not configured/);
  } finally { provider.emails.send = original; process.env.RESEND_INBOUND_DOMAIN = previousDomain || ''; }
});

test('outgoing tracked mail reuses booking conversation, preserves secure links only in email, and records failures', async () => {
  const { getResendClient } = await import('../src/lib/resend.js');
  const { sendMail } = await import('../src/lib/mailer.js');
  process.env.RESEND_API_KEY ||= 're_inbox_test';
  const provider = getResendClient();
  const original = provider.emails.send;
  let calls = 0;
  provider.emails.send = async () => ({ data: { id: `tracked-send-${++calls}` } });
  try {
    const identity = await createIdentity({ email: 'tracked-owner@example.com' });
    const options = { from: 'hello@business.test', to: 'client@example.com', subject: 'Invoice', html: '<a href="https://app.test/invoice/secret-pay-token">Pay</a>', tracking: { accountId: identity.account.id, bookingId: 'test-booking' } };
    const a = await sendMail(options);
    const b = await sendMail(options);
    assert.equal(a.inboxThreadId, b.inboxThreadId);
    const messages = await prisma.inboxMessage.findMany({ where: { threadId: a.inboxThreadId } });
    assert.equal(messages.length, 2);
    assert.ok(messages.every((m) => !m.body.includes('secret-pay-token')));
    provider.emails.send = async () => ({ error: { message: 'Provider rejected' } });
    await assert.rejects(sendMail(options), /Provider rejected/);
    assert.equal(await prisma.inboxMessage.count({ where: { deliveryStatus: 'failed' } }), 1);
  } finally { provider.emails.send = original; }
});

test('reading displayed messages does not clear newly arriving mail and replies reopen archived conversations', async () => {
  const { receiveInboxMail } = await import('../src/lib/inboxReceiving.js');
  const identity = await createIdentity({ email: 'concurrent-reader@example.com' });
  const target = { accountId: identity.account.id, recipient: 'hello@mail.concurrent.test' };
  const first = await receiveInboxMail(target, { from: 'client@example.com', text: 'First' }, { email_id: 'concurrent-first' });
  const original = await prisma.inboxMessage.findFirst({ where: { threadId: first.threadId } });
  const thread = await prisma.inboxThread.findUnique({ where: { id: first.threadId } });
  const cookie = await login(identity);
  await request(`/api/inbox/${thread.id}`, { cookie, method: 'PATCH', body: JSON.stringify({ archived: true }) });
  await receiveInboxMail(thread, { from: 'client@example.com', text: 'Second' }, { email_id: 'concurrent-second' });
  await request(`/api/inbox/${thread.id}/read`, { cookie, method: 'POST', body: JSON.stringify({ messageIds: [original.id] }) });
  assert.equal((await (await request('/api/inbox/summary', { cookie })).json()).unreadCount, 1);
  assert.equal((await prisma.reminder.findFirst({ where: { relatedId: thread.id } })).completedAt, null);
  assert.equal((await prisma.inboxThread.findUnique({ where: { id: thread.id } })).archivedAt, null);
});

test('signed inbound webhooks retry provider failures and save only one message across redelivery', async () => {
  const { Webhook } = await import('svix');
  const { getResendClient } = await import('../src/lib/resend.js');
  process.env.RESEND_API_KEY ||= 're_inbox_test';
  const provider = getResendClient();
  const originalGet = provider.get;
  const originalSecret = process.env.RESEND_WEBHOOK_SECRET;
  process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from('isolated-inbox-webhook-secret').toString('base64')}`;
  const identity = await createIdentity({ email: 'webhook-inbox@example.com' });
  await prisma.emailDomain.create({ data: { accountId: identity.account.id, domain: 'mail.webhook.test', resendDomainId: 'webhook-domain', status: 'verified', sendingStatus: 'verified', receivingStatus: 'verified', dnsRecords: [] } });
  const body = JSON.stringify({ type: 'email.received', data: { email_id: 'webhook-inbox-message', to: ['hello@mail.webhook.test'], from: 'client@example.com' } });
  const now = new Date();
  const headers = { 'svix-id': 'msg_inbox_test', 'svix-timestamp': String(Math.floor(now.getTime() / 1000)), 'svix-signature': new Webhook(process.env.RESEND_WEBHOOK_SECRET).sign('msg_inbox_test', now, body) };
  try {
    assert.equal((await request('/api/webhooks/resend', { method: 'POST', body })).status, 400);
    provider.get = async () => ({ error: { message: 'Temporary failure' } });
    assert.equal((await request('/api/webhooks/resend', { method: 'POST', body, headers })).status, 503);
    provider.get = async () => ({ data: { from: 'client@example.com', text: 'Webhook delivered', subject: 'Hello', attachments: [] } });
    const deliveries = await Promise.all([request('/api/webhooks/resend', { method: 'POST', body, headers }), request('/api/webhooks/resend', { method: 'POST', body, headers })]);
    assert.ok(deliveries.every((r) => r.status === 200));
    assert.equal(await prisma.inboxMessage.count({ where: { providerMessageId: 'webhook-inbox-message' } }), 1);
    assert.equal(await prisma.inboxThread.count({ where: { accountId: identity.account.id } }), 1);
  } finally { provider.get = originalGet; process.env.RESEND_WEBHOOK_SECRET = originalSecret || ''; }
});

test('inbox reply sends attachments with RFC thread headers and keeps old reply aliases after domain changes', async () => {
  const { getResendClient } = await import('../src/lib/resend.js');
  const { receiveInboxMail, resolveInboxTarget } = await import('../src/lib/inboxReceiving.js');
  process.env.RESEND_API_KEY ||= 're_inbox_test';
  const provider = getResendClient();
  const original = provider.emails.send;
  const sent = [];
  provider.emails.send = async (data) => { sent.push(data); return { data: { id: 'reply-with-attachment' } }; };
  try {
    const identity = await createIdentity({ email: 'reply-owner@example.com' });
    await prisma.emailDomain.create({ data: { accountId: identity.account.id, domain: 'mail.new.test', resendDomainId: 'new-domain', status: 'verified', sendingStatus: 'verified', receivingStatus: 'verified', dnsRecords: [] } });
    const received = await receiveInboxMail({ accountId: identity.account.id, recipient: 'hello@mail.old.test' }, { from: 'client@example.com', text: 'Hello', message_id: '<real-message@client.test>' }, { email_id: 'reply-original' });
    const old = await prisma.inboxThread.findUnique({ where: { id: received.threadId } });
    const cookie = await login(identity);
    const csrf = cookieValue(cookie, 'csrf_token').split('=')[1];
    const form = new FormData();
    form.append('body', 'Here is the document.');
    form.append('attachments', new Blob(['sample document'], { type: 'text/plain' }), 'details.txt');
    const response = await fetch(`${baseUrl}/api/inbox/${old.id}/reply`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf }, body: form });
    assert.equal(response.status, 200);
    assert.equal(sent[0].to, 'client@example.com');
    assert.equal(sent[0].headers['In-Reply-To'], '<real-message@client.test>');
    assert.equal(sent[0].attachments[0].filename, 'details.txt');
    assert.match(sent[0].replyTo, /@mail\.new\.test$/);
    assert.equal((await resolveInboxTarget({ to: [old.replyAlias] })).id, old.id);
    assert.equal(await prisma.inboxAttachment.count({ where: { message: { threadId: old.id, direction: 'outbound' } } }), 1);
  } finally { provider.emails.send = original; }
});


test('security: every application table blocks public database roles, even with accidental table grants', async () => {
  const { readFile } = await import('node:fs/promises');
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  const names = [...schema.matchAll(/^model (\w+) \{/gm)].map((match) => match[1]);
  const rows = await prisma.$queryRaw`SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(${names}::text[]) AND c.relkind='r'`;
  assert.equal(rows.length, names.length);
  assert.ok(rows.every((row) => row.relrowsecurity), JSON.stringify(rows.filter((r) => !r.relrowsecurity)));
  const identity = await createIdentity({ email: 'rls-owner@example.com' });
  await prisma.inboxThread.create({ data: { accountId: identity.account.id, contactEmail: 'client@example.com', subject: 'private', id: 'rls-secret' } });
  await assert.rejects(prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('CREATE ROLE evl_security_probe NOLOGIN');
    await tx.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO evl_security_probe');
    await tx.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO evl_security_probe');
    await tx.$executeRawUnsafe('SET LOCAL ROLE evl_security_probe');
    assert.deepEqual(await tx.$queryRawUnsafe('SELECT * FROM "InboxThread"'), []);
    assert.deepEqual(await tx.$queryRawUnsafe('SELECT * FROM "User"'), []);
    assert.equal(await tx.$executeRawUnsafe('DELETE FROM "InboxThread"'), 0);
    await tx.$executeRawUnsafe(`INSERT INTO "InboxThread" ("id","accountId","contactEmail","subject") VALUES ('probe','fake','probe@example.com','probe')`);
    assert.fail('Public database role must not be able to insert');
  }), /row-level security/);
  assert.ok(await prisma.inboxThread.findUnique({ where: { id: 'rls-secret' } }));
});

test('security: private APIs require login and refuse restricted or disabled accounts', async () => {
  for (const path of ['/api/inbox', '/api/inbox/summary', '/api/account-data', '/api/bookings', '/api/clients', '/api/invoices', '/api/contracts', '/api/reminders', '/api/email-domains', '/api/team/members']) {
    assert.equal((await request(path)).status, 401, path);
  }
  const member = await createIdentity({ email: 'restricted-security@example.com', role: 'member', permissions: { manageClients: true } });
  const cookie = await login(member);
  for (const [method, path, body] of [
    ['GET', '/api/inbox'], ['GET', '/api/inbox/summary'], ['GET', '/api/inbox/unknown'],
    ['PATCH', '/api/inbox/unknown', { archived: true }], ['POST', '/api/inbox/unknown/read', { messageIds: [] }],
    ['POST', '/api/inbox/unknown/reply', { body: 'Unauthorized reply' }], ['GET', '/api/inbox/unknown/attachments/unknown'],
    ['POST', '/api/email-domains/custom-domain', { domain: 'mail.evil.test' }],
  ]) assert.equal((await request(path, { cookie, method, ...(body ? { body: JSON.stringify(body) } : {}) })).status, 403, path);
  const owner = await createIdentity({ email: 'disabled-security@example.com' });
  const ownerCookie = await login(owner);
  await prisma.account.update({ where: { id: owner.account.id }, data: { disabledAt: new Date() } });
  assert.equal((await request('/api/inbox', { cookie: ownerCookie })).status, 403);
});

test('security: foreign inbox IDs cannot disclose or change records, message reads or attachment downloads', async () => {
  const a = await createIdentity({ email: 'tenant-a-security@example.com' });
  const b = await createIdentity({ email: 'tenant-b-security@example.com' });
  const makeThread = (identity, id) => prisma.inboxThread.create({ data: { id, accountId: identity.account.id, contactEmail: 'client@example.com', subject: id, messages: { create: { direction: 'inbound', fromAddress: 'client@example.com', toAddress: 'inbox@example.com', subject: 'private', body: 'secret-body', attachments: { create: { filename: 'secret.txt', size: 6, contentType: 'text/plain', data: Buffer.from('secret') } } } } }, include: { messages: { include: { attachments: true } } } });
  const own = await makeThread(a, 'security-thread-a');
  const other = await makeThread(b, 'security-thread-b');
  const cookie = await login(a);
  for (const [method, suffix, body] of [['GET', ''], ['PATCH', '', { archived: true }], ['POST', '/read', { messageIds: [other.messages[0].id] }], ['GET', `/attachments/${other.messages[0].attachments[0].id}`]]) {
    const response = await request(`/api/inbox/${other.id}${suffix}`, { cookie, method, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /secret-body/);
  }
  assert.equal((await request(`/api/inbox/${own.id}/attachments/${other.messages[0].attachments[0].id}`, { cookie })).status, 404);
  await request(`/api/inbox/${own.id}/read`, { cookie, method: 'POST', body: JSON.stringify({ messageIds: [other.messages[0].id] }) });
  assert.equal((await prisma.inboxMessage.findUnique({ where: { id: other.messages[0].id } })).readAt, null);
  const modified = await request(`/api/inbox/${own.id}`, { cookie, method: 'PATCH', body: JSON.stringify({ accountId: b.account.id, contactEmail: 'attacker@evil.test', replyAlias: 'attacker@evil.test' }) });
  assert.equal(modified.status, 200);
  const persisted = await prisma.inboxThread.findUnique({ where: { id: own.id } });
  assert.equal(persisted.accountId, a.account.id);
  assert.equal(persisted.contactEmail, 'client@example.com');
  assert.equal(persisted.replyAlias, null);
  const listed = await request('/api/inbox?search=%27%20OR%201%3D1--', { cookie });
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await listed.json()).threads, []);
});

test('security: template-editing permission cannot change business settings or notification recipients', async () => {
  const member = await createIdentity({ email: 'template-security@example.com', role: 'member', permissions: { manageEmailTemplates: true } });
  const data = { businessInfo: { name: 'Original business' }, reminderSettings: { invoiceReminderRecipient: 'owner' }, inboxSettings: { emailNotifications: true }, emailTemplates: [] };
  const saved = await prisma.accountData.create({ data: { accountId: member.account.id, data } });
  const cookie = await login(member);
  for (const patch of [{ businessInfo: { name: 'Hijacked' } }, { reminderSettings: { invoiceReminderRecipient: 'client' } }, { inboxSettings: { emailNotifications: false } }]) {
    assert.equal((await request('/api/account-data', { cookie, method: 'PUT', body: JSON.stringify({ data: { ...data, ...patch }, version: saved.version }) })).status, 403);
  }
  assert.equal((await request('/api/account-data', { cookie, method: 'PUT', body: JSON.stringify({ data: { ...data, emailTemplates: [{ id: 'safe-template', subject: 'Hello' }] }, version: saved.version }) })).status, 200);
  assert.equal((await prisma.accountData.findUnique({ where: { accountId: member.account.id } })).data.inboxSettings.emailNotifications, true);
});

test('security: email routing follows actual delivered recipients and cannot cross tenant boundaries through headers', async () => {
  const { resolveInboxTarget } = await import('../src/lib/inboxReceiving.js');
  const owner = await createIdentity({ email: 'envelope-security@example.com' });
  const victim = await prisma.inboxThread.create({ data: { accountId: owner.account.id, contactEmail: 'client@example.com', subject: 'Private', replyAlias: 'inbox+private@mail.victim.test' } });
  assert.equal(await resolveInboxTarget({ to: [victim.replyAlias], received_for: ['hello@mail.attacker.test'] }), null);
  assert.equal(await resolveInboxTarget({ to: ['inbox+private@wrong.test'] }), null);
  assert.equal((await resolveInboxTarget({ to: ['display@example.com'], received_for: [victim.replyAlias] })).id, victim.id);
  assert.equal(await resolveInboxTarget({ to: ['hello@gigworks.io'], from: 'envelope-security@example.com' }), null);
});

test('security: signed webhook uses provider delivery envelope over forged visible recipients', async () => {
  const { Webhook } = await import('svix');
  const { getResendClient } = await import('../src/lib/resend.js');
  process.env.RESEND_API_KEY ||= 're_inbox_test';
  const provider = getResendClient();
  const originalGet = provider.get;
  const originalSecret = process.env.RESEND_WEBHOOK_SECRET;
  process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from('isolated-envelope-secret').toString('base64')}`;
  const owner = await createIdentity({ email: 'forged-envelope@example.com' });
  const victim = await prisma.inboxThread.create({ data: { accountId: owner.account.id, contactEmail: 'client@example.com', subject: 'Private', replyAlias: 'inbox+private@mail.victim.test' } });
  const body = JSON.stringify({ type: 'email.received', data: { email_id: 'forged-envelope-message', to: [victim.replyAlias], from: 'client@example.com' } });
  const now = new Date();
  const headers = { 'svix-id': 'msg_envelope_test', 'svix-timestamp': String(Math.floor(now.getTime() / 1000)), 'svix-signature': new Webhook(process.env.RESEND_WEBHOOK_SECRET).sign('msg_envelope_test', now, body) };
  try {
    provider.get = async () => ({ data: { from: 'client@example.com', received_for: ['hello@mail.attacker.test'], text: 'Forged recipient', attachments: [] } });
    assert.equal((await request('/api/webhooks/resend', { method: 'POST', body, headers })).status, 200);
    assert.equal(await prisma.inboxMessage.count(), 0);
    provider.get = async () => ({ data: { from: 'client@example.com', received_for: [victim.replyAlias], text: 'Actual recipient', attachments: [] } });
    assert.equal((await request('/api/webhooks/resend', { method: 'POST', body, headers })).status, 200);
    assert.equal(await prisma.inboxMessage.count({ where: { threadId: victim.id } }), 1);
  } finally { provider.get = originalGet; process.env.RESEND_WEBHOOK_SECRET = originalSecret || ''; }
});

test('security: multipart replies enforce CSRF and attachment limits before calling the email provider', async () => {
  const owner = await createIdentity({ email: 'upload-security@example.com' });
  const thread = await prisma.inboxThread.create({ data: { accountId: owner.account.id, contactEmail: 'client@example.com', subject: 'Files' } });
  const cookie = await login(owner);
  const csrf = cookieValue(cookie, 'csrf_token').split('=')[1];
  const send = (data, token) => fetch(`${baseUrl}/api/inbox/${thread.id}/reply`, { method: 'POST', headers: { cookie, ...(token ? { 'x-csrf-token': token } : {}) }, body: data });
  const empty = new FormData(); empty.append('body', 'Hello');
  assert.equal((await send(empty)).status, 403);
  assert.equal((await send(empty, 'forged-token')).status, 403);
  const oversized = new FormData(); oversized.append('body', 'Hello'); oversized.append('attachments', new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]), 'large.bin');
  assert.equal((await send(oversized, csrf)).status, 400);
  const tooMany = new FormData(); tooMany.append('body', 'Hello');
  for (let i = 0; i < 4; i++) tooMany.append('attachments', new Blob(['small']), `file-${i}.txt`);
  assert.equal((await send(tooMany, csrf)).status, 400);
  assert.equal(await prisma.inboxMessage.count(), 0);
  assert.equal((await request('/api/inbox', { cookie, headers: { origin: 'https://evil.example' } })).status, 403);
});

test('custom domain receiving setup is account scoped and restricted to administrators', async () => {
  const { getResendClient } = await import('../src/lib/resend.js');
  process.env.RESEND_API_KEY ||= 're_inbox_test';
  const provider = getResendClient();
  const originalPatch = provider.patch;
  const originalGet = provider.get;
  const owner = await createIdentity({ email: 'domain-setup@example.com' });
  const member = await createIdentity({ email: 'domain-member@example.com', accountId: owner.account.id, role: 'member' });
  await prisma.emailDomain.create({ data: { accountId: owner.account.id, domain: 'mail.customer.test', isCustomDomain: true, resendDomainId: 'owned-domain', status: 'verified', sendingStatus: 'verified', receivingStatus: 'not_configured', dnsRecords: [] } });
  const calls = [];
  provider.patch = async (path, body) => { calls.push({ path, body }); return { data: { id: 'owned-domain' } }; };
  provider.get = async () => ({ data: { status: 'verified', records: [{ type: 'TXT', value: 'dkim', status: 'verified' }, { type: 'MX', value: 'inbound-smtp.us-east-1.amazonaws.com', status: 'pending' }] } });
  try {
    assert.equal((await request('/api/email-domains/enable-receiving', { cookie: await login(member), method: 'POST' })).status, 403);
    assert.equal(calls.length, 0);
    const result = await request('/api/email-domains/enable-receiving', { cookie: await login(owner), method: 'POST', body: JSON.stringify({ resendDomainId: 'foreign-domain' }) });
    assert.equal(result.status, 200);
    assert.equal(calls[0].path, '/domains/owned-domain');
    const updated = (await result.json()).domain;
    assert.equal(updated.sendingStatus, 'verified');
    assert.equal(updated.receivingStatus, 'pending');
    assert.equal(updated.dnsRecords.length, 2);
  } finally { provider.patch = originalPatch; provider.get = originalGet; }
});

test('a redelivered Stripe checkout webhook does not apply invoice payment twice', async () => {
  const identity = await createIdentity({ email: 'stripe@example.com' });
  await prisma.account.update({
    where: { id: identity.account.id },
    data: { stripeAccountId: 'acct_integration' },
  });
  const invoice = await prisma.invoice.create({
    data: {
      accountId: identity.account.id,
      bookingId: 'booking-stripe',
      snapshot: { lineItems: [{ type: 'flat', amount: 125 }] },
      status: 'sent',
      recipientEmail: 'client@example.com',
      ownerEmail: identity.user.email,
      stripeCheckoutSessionId: 'cs_integration',
    },
  });
  const payload = JSON.stringify({
    id: 'evt_integration_checkout',
    object: 'event',
    type: 'checkout.session.completed',
    account: 'acct_integration',
    data: { object: {
      id: 'cs_integration',
      object: 'checkout.session',
      metadata: { invoiceId: invoice.id },
      payment_status: 'paid',
      payment_intent: 'pi_integration',
    } },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });

  const deliver = () => request('/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    body: payload,
  });
  const concurrentDeliveries = await Promise.all([deliver(), deliver()]);
  assert.deepEqual(concurrentDeliveries.map((response) => response.status), [200, 200]);
  const afterFirst = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(afterFirst.status, 'paid');
  assert.equal(afterFirst.paidAmount, 125);

  assert.equal((await deliver()).status, 200);
  const afterSecond = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(afterSecond.paidAmount, 125);
  assert.equal(afterSecond.paidAt.getTime(), afterFirst.paidAt.getTime());
});
