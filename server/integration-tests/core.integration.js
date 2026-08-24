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
    { id: 'client-second', accountId: second.account.id, firstName: 'Second', lastName: 'Client' },
  ] });

  const cookie = await login(first);
  const response = await request('/api/clients?limit=100', { cookie });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.clients.map((client) => client.id), ['client-first']);
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

test('a redelivered Stripe checkout webhook does not apply invoice payment twice', async () => {
  const identity = await createIdentity({ email: 'stripe@example.com' });
  const invoice = await prisma.invoice.create({
    data: {
      accountId: identity.account.id,
      bookingId: 'booking-stripe',
      snapshot: { lineItems: [{ type: 'flat', amount: 125 }] },
      status: 'sent',
      recipientEmail: 'client@example.com',
      ownerEmail: identity.user.email,
    },
  });
  const payload = JSON.stringify({
    id: 'evt_integration_checkout',
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: {
      id: 'cs_integration',
      object: 'checkout.session',
      metadata: { invoiceId: invoice.id },
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
  assert.equal((await deliver()).status, 200);
  const afterFirst = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(afterFirst.status, 'paid');
  assert.equal(afterFirst.paidAmount, 125);

  assert.equal((await deliver()).status, 200);
  const afterSecond = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(afterSecond.paidAmount, 125);
  assert.equal(afterSecond.paidAt.getTime(), afterFirst.paidAt.getTime());
});
