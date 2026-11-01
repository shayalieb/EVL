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

const invoiceData = (accountId, extra) => ({
  accountId, bookingId: 'b1', recipientEmail: 'c@example.com', recipientName: 'Client', ownerEmail: 'o@example.com',
  snapshot: { lineItems: [{ name: 'Service', amount: 500 }] }, ...extra,
});

test('the dashboard loads for an account with a sent invoice that has a past due date', async () => {
  const { account } = await identity({ email: 'dash@example.com' });
  await prisma.invoice.createMany({ data: [
    invoiceData(account.id, { status: 'sent', sentAt: new Date(), dueDate: new Date('2026-01-01T00:00:00Z') }),
    invoiceData(account.id, { status: 'partial', paidAmount: 100, sentAt: new Date(), dueDate: new Date('2025-06-15T00:00:00Z') }),
    invoiceData(account.id, { status: 'sent', sentAt: new Date(), dueDate: new Date(Date.now() + 40 * 86_400_000) }),
    invoiceData(account.id, { status: 'sent', sentAt: new Date() }),
    invoiceData(account.id, { status: 'paid', paidAmount: 500, dueDate: new Date('2024-01-01T00:00:00Z') }),
  ] });
  const response = await call('/api/dashboard', { cookie: await login('dash@example.com') });
  assert.equal(response.status, 200);
  const { dashboard: body } = await response.json();
  assert.equal(body.overdueInvoices.length, 2);
  // Oldest first, and the client still reads dueDate as an ISO string.
  assert.deepEqual(body.overdueInvoices.map((invoice) => invoice.dueDate), ['2025-06-15T00:00:00.000Z', '2026-01-01T00:00:00.000Z']);
  assert.equal(body.overdueInvoices[1].paidAmount, 0);
});

async function proposalFixture() {
  const { account, user } = await identity({ email: 'owner@example.com' });
  await prisma.booking.create({ data: { id: 'b1', accountId: account.id, eventName: 'Gig' } });
  const cookie = await login('owner@example.com');
  const send = async () => {
    const response = await call('/api/proposal-responses', { cookie, method: 'POST', json: { bookingId: 'b1', recipientEmail: 'client@example.com', snapshot: { lineItems: [] } } });
    assert.equal(response.status, 201);
    return (await response.json()).proposalResponse;
  };
  return { account, user, cookie, send };
}

test('withdrawing an undelivered proposal removes it and restores the one it replaced', async () => {
  const { cookie, send } = await proposalFixture();
  const first = await send();
  const second = await send();
  assert.equal((await prisma.proposalResponse.findUniqueOrThrow({ where: { id: first.id } })).status, 'superseded');

  const response = await call(`/api/proposal-responses/${second.id}/rollback`, { cookie, method: 'POST' });
  assert.equal(response.status, 200);
  const rows = await prisma.proposalResponse.findMany({ where: { bookingId: 'b1' } });
  assert.deepEqual(rows.map((row) => [row.id, row.status]), [[first.id, 'sent']]);

  const latest = await (await call('/api/proposal-responses?bookingId=b1', { cookie })).json();
  assert.equal(latest.proposalResponse.id, first.id);
  assert.equal(latest.proposalResponse.status, 'sent');
});

test('withdrawing the only proposal leaves the booking with none', async () => {
  const { cookie, send } = await proposalFixture();
  const only = await send();
  assert.equal((await call(`/api/proposal-responses/${only.id}/rollback`, { cookie, method: 'POST' })).status, 200);
  assert.equal(await prisma.proposalResponse.count(), 0);
  const latest = await (await call('/api/proposal-responses?bookingId=b1', { cookie })).json();
  assert.equal(latest.proposalResponse, null);
});

test('a proposal cannot be withdrawn once answered, after the window, twice, or by another account', async () => {
  const { cookie, send } = await proposalFixture();
  const answered = await send();
  await prisma.proposalResponse.update({ where: { id: answered.id }, data: { status: 'accepted', respondedAt: new Date() } });
  assert.equal((await call(`/api/proposal-responses/${answered.id}/rollback`, { cookie, method: 'POST' })).status, 409);

  const old = await send();
  await prisma.proposalResponse.update({ where: { id: old.id }, data: { sentAt: new Date(Date.now() - 60 * 60 * 1000) } });
  assert.equal((await call(`/api/proposal-responses/${old.id}/rollback`, { cookie, method: 'POST' })).status, 409);

  const fresh = await send();
  assert.equal((await call(`/api/proposal-responses/${fresh.id}/rollback`, { cookie, method: 'POST' })).status, 200);
  assert.equal((await call(`/api/proposal-responses/${fresh.id}/rollback`, { cookie, method: 'POST' })).status, 404);

  const another = await send();
  await identity({ email: 'other@example.com' });
  assert.equal((await call(`/api/proposal-responses/${another.id}/rollback`, { cookie: await login('other@example.com'), method: 'POST' })).status, 404);
  assert.equal((await prisma.proposalResponse.findUniqueOrThrow({ where: { id: another.id } })).status, 'sent');
});

test('withdrawing never revives a proposal the client already answered', async () => {
  const { cookie, send } = await proposalFixture();
  const first = await send();
  const second = await send();
  // The first was superseded, then (hypothetically) answered before the second is withdrawn.
  await prisma.proposalResponse.update({ where: { id: first.id }, data: { status: 'accepted', respondedAt: new Date() } });
  assert.equal((await call(`/api/proposal-responses/${second.id}/rollback`, { cookie, method: 'POST' })).status, 200);
  assert.equal((await prisma.proposalResponse.findUniqueOrThrow({ where: { id: first.id } })).status, 'accepted');
});

test('a member without booking permission can neither send nor withdraw a proposal', async () => {
  const { account } = await identity({ email: 'owner2@example.com' });
  await prisma.booking.create({ data: { id: 'b1', accountId: account.id, eventName: 'Gig' } });
  await identity({ email: 'limited@example.com', role: 'member', permissions: {}, accountId: account.id });
  const limited = await login('limited@example.com');

  const sent = await call('/api/proposal-responses', { cookie: limited, method: 'POST', json: { bookingId: 'b1', recipientEmail: 'client@example.com', snapshot: { lineItems: [] } } });
  assert.equal(sent.status, 403);
  assert.equal(await prisma.proposalResponse.count(), 0);

  const real = await prisma.proposalResponse.create({ data: { accountId: account.id, bookingId: 'b1', status: 'sent', sentAt: new Date(), recipientEmail: 'c@example.com', ownerEmail: 'o@example.com', snapshot: {} } });
  const withdrawn = await call(`/api/proposal-responses/${real.id}/rollback`, { cookie: limited, method: 'POST' });
  assert.equal(withdrawn.status, 403);
  assert.equal(await prisma.proposalResponse.count(), 1);
});
