import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import bcrypt from 'bcrypt';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ||= 'integration-test-session-secret-32-chars';
process.env.STRIPE_SECRET_KEY ||= 'sk_test_integration';
process.env.STRIPE_WEBHOOK_SECRET ||= 'whsec_integration';

const [{ app }, { prisma }] = await Promise.all([
  import('../src/index.js'),
  import('../src/lib/prisma.js'),
]);

let server;
let baseUrl;
let ipCounter = 0;

const listen = () => new Promise((resolve, reject) => {
  const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate));
  candidate.once('error', reject);
});
const close = (candidate) => new Promise((resolve, reject) => candidate.close((err) => (err ? reject(err) : resolve())));

async function identity({ email, role = 'owner', permissions = {}, accountId } = {}) {
  const account = accountId
    ? await prisma.account.findUniqueOrThrow({ where: { id: accountId } })
    : await prisma.account.create({ data: { approvedAt: new Date() } });
  const user = await prisma.user.create({ data: { firstName: 'Test', lastName: 'User', email, passwordHash: await bcrypt.hash('password-123', 4) } });
  await prisma.membership.create({ data: { userId: user.id, accountId: account.id, role, permissions } });
  return { user, account };
}

const cookiesOf = (response) => (typeof response.headers.getSetCookie === 'function'
  ? response.headers.getSetCookie()
  : [response.headers.get('set-cookie')].filter(Boolean)).map((value) => value.split(';', 1)[0]).join('; ');

async function call(path, { cookie, json, method = 'GET' } = {}) {
  const headers = new Headers({ 'x-forwarded-for': `10.9.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}` });
  if (json !== undefined) headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', cookie);
  return fetch(`${baseUrl}${path}`, { method, headers, body: json === undefined ? undefined : JSON.stringify(json), redirect: 'manual' });
}

async function login(email) {
  const response = await call('/api/auth/login', { method: 'POST', json: { email, password: 'password-123' } });
  assert.equal(response.status, 200);
  await response.arrayBuffer();
  return cookiesOf(response);
}

before(async () => {
  server = await listen();
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => prisma.$executeRawUnsafe('TRUNCATE TABLE "User", "Account", "Session", "BackgroundJobLease", "WaitlistEntry" RESTART IDENTITY CASCADE'));
after(async () => {
  await close(server);
  await prisma.$disconnect();
});


import { createHash } from 'node:crypto';
import { inquiryEventName } from '../src/routes/inquiryLinks.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');

test('the signed-in check answers 200 with no user when asked quietly, and still 401 otherwise', async () => {
  const quiet = await call('/api/auth/me?optional=1');
  assert.equal(quiet.status, 200);
  assert.deepEqual(await quiet.json(), { user: null });
  assert.equal((await call('/api/auth/me')).status, 401);

  await identity({ email: 'me@example.com' });
  const cookie = await login('me@example.com');
  const signedIn = await (await call('/api/auth/me?optional=1', { cookie })).json();
  assert.equal(signedIn.user.email, 'me@example.com');
});

test('the contract link says who it is from before asking for an email, and reveals nothing else', async () => {
  const { account } = await identity({ email: 'owner@example.com' });
  await prisma.contract.create({ data: {
    accountId: account.id, bookingId: 'b1', status: 'sent', clientTokenHash: hash('gate-token'), recipientEmail: 'client@example.com', recipientName: 'Secret Client', ownerEmail: 'owner@example.com',
    snapshot: { businessInfo: { name: 'Gate Events' }, client: { firstName: 'Secret', lastName: 'Client' }, lineItems: [{ name: 'Private pricing', amount: 999 }] },
  } });
  const response = await call('/api/contract-sign/gate-token');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { requiresEmail: true, businessName: 'Gate Events' });
  assert.equal((await call('/api/contract-sign/not-a-real-token')).status, 404);
});

test('a client accepting a proposal creates one in-app reminder and no second email for it', async () => {
  const { account } = await identity({ email: 'owner@example.com' });
  await prisma.proposalResponse.create({ data: {
    accountId: account.id, bookingId: 'b1', status: 'sent', sentAt: new Date(), tokenHash: hash('accept-token'), recipientEmail: 'client@example.com', recipientName: 'Client Name',
    ownerEmail: 'owner@example.com', snapshot: { businessInfo: { name: 'Gate Events' }, lineItems: [] },
  } });
  const response = await call('/api/proposal-respond/accept-token/respond', { method: 'POST', json: { action: 'accept' } });
  assert.equal(response.status, 200);
  const reminders = await prisma.reminder.findMany({ where: { accountId: account.id, relatedId: 'b1' } });
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].emailEnabled, false);
});

test('an inquiry booking is named after who it is for when there is no event name or couple', () => {
  assert.equal(inquiryEventName({ firstName: 'Jordan', lastName: 'Rivera', eventType: 'Wedding' }), 'Jordan Rivera — Wedding');
  assert.equal(inquiryEventName({ firstName: 'Jordan', lastName: 'Rivera', brideName: 'Ana Lopez', groomName: 'Sam Reed', eventType: 'Wedding' }), 'Reed & Lopez — Wedding');
  assert.equal(inquiryEventName({ eventName: 'Smith Family Reunion', firstName: 'A', lastName: 'B' }), 'Smith Family Reunion');
  assert.equal(inquiryEventName({ firstName: 'Jordan', lastName: 'Rivera' }), 'Jordan Rivera');
});

test('a rate-limited login says how long to wait', async () => {
  await identity({ email: 'limited@example.com' });
  const attempt = () => fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'x-forwarded-for': '10.250.0.1', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'limited@example.com', password: 'wrong-password' }) });
  let last;
  for (let n = 0; n < 22; n += 1) {
    last = await attempt();
    if (last.status === 429) break;
    await last.arrayBuffer();
  }
  assert.equal(last.status, 429);
  assert.match((await last.json()).error, /15 minutes/);
});

test('many successful sign-ins from one address are never rate limited, while failures still are', async () => {
  await identity({ email: 'shared-office@example.com' });
  const login = (password) => fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'x-forwarded-for': '10.251.0.1', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'shared-office@example.com', password }) });
  for (let n = 0; n < 30; n += 1) {
    const response = await login('password-123');
    assert.equal(response.status, 200, `sign-in ${n + 1} was refused`);
    await response.arrayBuffer();
  }
  let limitedAt = null;
  for (let n = 1; n <= 30; n += 1) {
    const response = await login(`wrong-${n}`);
    await response.arrayBuffer();
    if (response.status === 429) { limitedAt = n; break; }
  }
  assert.ok(limitedAt && limitedAt <= 21, `failures were not limited (stopped at ${limitedAt})`);
  assert.equal((await login('password-123')).status, 429);
});

test('inquiry links can be listed by the booking they became, and only within the account', async () => {
  const { account } = await identity({ email: 'owner@example.com' });
  const other = await identity({ email: 'other-owner@example.com' });
  const link = (accountId, tokenHash, extra) => prisma.inquiryLink.create({ data: { accountId, tokenHash: hash(tokenHash), ownerEmail: 'o@example.com', status: 'applied', response: { firstName: 'A' }, ...extra } });
  await link(account.id, 'mine', { appliedBookingId: 'booking-1' });
  await link(account.id, 'unrelated', { appliedBookingId: 'booking-2' });
  await link(other.account.id, 'foreign', { appliedBookingId: 'booking-1' });
  const cookie = await login('owner@example.com');

  const { links } = await (await call('/api/inquiry-links?status=applied&appliedBookingId=booking-1', { cookie })).json();
  assert.equal(links.length, 1);
  assert.equal(links[0].appliedBookingId, 'booking-1');
  // A filter that is not a plain string is ignored rather than breaking the query.
  assert.equal((await call('/api/inquiry-links?appliedBookingId[a]=1', { cookie })).status, 200);
});
