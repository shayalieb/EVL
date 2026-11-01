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


import { emptyPermissions } from '../src/lib/membership.js';

async function member(account, email, permissions) {
  await identity({ email, role: 'member', permissions, accountId: account.id });
  return login(email);
}

const READ_ROUTES = {
  viewClients: ['/api/clients'],
  viewContractors: ['/api/contractors', '/api/contractor-groups'],
  viewBookings: ['/api/bookings', '/api/contracts', '/api/proposal-responses', '/api/invoices', '/api/booking-documents'],
  viewEvents: ['/api/events', '/api/prep-forms'],
  viewVenues: ['/api/venues'],
  viewOfferings: ['/api/offerings'],
};

test('members saved before the view switches existed can still read everything', async () => {
  const { account } = await identity({ email: 'owner@example.com' });
  const legacy = await member(account, 'legacy@example.com', { manageBookings: true });
  const bare = await member(account, 'bare@example.com', {});
  for (const cookie of [legacy, bare]) {
    for (const path of Object.values(READ_ROUTES).flat()) {
      const response = await call(path, { cookie });
      assert.notEqual(response.status, 403, `${path} was blocked for a member who never had a view switch`);
    }
  }
});

test('a member with a view switch turned off cannot read that area through any of its routes', async () => {
  const { account } = await identity({ email: 'owner@example.com' });
  for (const [view, paths] of Object.entries(READ_ROUTES)) {
    const permissions = { ...emptyPermissions(), ...Object.fromEntries(Object.keys(READ_ROUTES).map((key) => [key, key !== view])) };
    const cookie = await member(account, `no-${view.toLowerCase()}@example.com`, permissions);
    for (const path of paths) assert.equal((await call(path, { cookie })).status, 403, `${path} readable without ${view}`);
    // Everything else they were allowed to see still works.
    const other = Object.entries(READ_ROUTES).find(([key]) => key !== view)[1][0];
    assert.notEqual((await call(other, { cookie })).status, 403);
  }
});

test('managing an area includes seeing what it depends on, but not unrelated areas', async () => {
  const { account } = await identity({ email: 'owner@example.com' });
  const offAll = Object.fromEntries(Object.keys(READ_ROUTES).map((key) => [key, false]));
  const cookie = await member(account, 'booker@example.com', { ...emptyPermissions(), ...offAll, manageBookings: true });
  for (const view of ['viewBookings', 'viewClients', 'viewVenues', 'viewOfferings']) {
    for (const path of READ_ROUTES[view]) assert.notEqual((await call(path, { cookie })).status, 403, `${path} blocked for a bookings manager`);
  }
  for (const view of ['viewEvents', 'viewContractors']) {
    for (const path of READ_ROUTES[view]) assert.equal((await call(path, { cookie })).status, 403, `${path} readable by a bookings manager`);
  }
});

test('owners and admins read everything regardless of stored switches', async () => {
  const { account } = await identity({ email: 'owner@example.com' });
  await identity({ email: 'admin@example.com', role: 'admin', permissions: emptyPermissions(), accountId: account.id });
  const cookie = await login('admin@example.com');
  for (const path of Object.values(READ_ROUTES).flat()) assert.notEqual((await call(path, { cookie })).status, 403, path);
});

test('the dashboard counts only what the member may view', async () => {
  const { account } = await identity({ email: 'owner@example.com' });
  await prisma.client.create({ data: { id: 'dash-client', accountId: account.id, firstName: 'A', lastName: 'B' } });
  await prisma.event.create({ data: { id: 'dash-event', accountId: account.id, name: 'Gig', eventDate: '2099-01-01' } });
  const owner = await (await call('/api/dashboard', { cookie: await login('owner@example.com') })).json();
  assert.equal(owner.dashboard.counts.clients, 1);
  assert.equal(owner.dashboard.counts.events, 1);

  const blind = await member(account, 'blind@example.com', emptyPermissions());
  const response = await call('/api/dashboard', { cookie: blind });
  assert.equal(response.status, 200);
  const { dashboard } = await response.json();
  assert.equal(dashboard.counts.clients, 0);
  assert.equal(dashboard.counts.events, 0);
  assert.equal(dashboard.isFreshAccount, false);
});

test('the team list returns both what was chosen and what applies', async () => {
  const { account } = await identity({ email: 'owner@example.com' });
  await identity({ email: 'booker@example.com', role: 'member', permissions: { ...emptyPermissions(), manageBookings: true }, accountId: account.id });
  const response = await call('/api/team/members', { cookie: await login('owner@example.com') });
  const { members } = await response.json();
  const booker = members.find((item) => item.email === 'booker@example.com');
  assert.equal(booker.permissions.viewClients, false);
  assert.equal(booker.effectivePermissions.viewClients, true);
});

async function reminderFixture() {
  const { account, user: ownerUser } = await identity({ email: 'owner@example.com' });
  const alice = await identity({ email: 'alice@example.com', role: 'member', permissions: {}, accountId: account.id });
  await identity({ email: 'bob@example.com', role: 'member', permissions: {}, accountId: account.id });
  const aliceCookie = await login('alice@example.com');
  const bobCookie = await login('bob@example.com');
  const ownerCookie = await login('owner@example.com');
  const mine = await prisma.reminder.create({ data: { accountId: account.id, createdByUserId: alice.user.id, note: 'Alice private', remindAt: new Date(Date.now() + 86_400_000) } });
  const system = await prisma.reminder.create({ data: { accountId: account.id, createdByUserId: ownerUser.id, autoGenerated: true, note: 'Proposal accepted', remindAt: new Date() } });
  return { account, mine, system, aliceCookie, bobCookie, ownerCookie };
}

test('a member can change only reminders they created', async () => {
  const { mine, bobCookie, aliceCookie } = await reminderFixture();
  assert.equal((await call(`/api/reminders/${mine.id}`, { cookie: bobCookie, method: 'PATCH', json: { note: 'hijacked' } })).status, 403);
  assert.equal((await call(`/api/reminders/${mine.id}/complete`, { cookie: bobCookie, method: 'PATCH', json: { completed: true } })).status, 403);
  assert.equal((await call(`/api/reminders/${mine.id}`, { cookie: bobCookie, method: 'DELETE' })).status, 403);
  const untouched = await prisma.reminder.findUniqueOrThrow({ where: { id: mine.id } });
  assert.equal(untouched.note, 'Alice private');
  assert.equal(untouched.completedAt, null);

  assert.equal((await call(`/api/reminders/${mine.id}`, { cookie: aliceCookie, method: 'PATCH', json: { note: 'Alice edited' } })).status, 200);
  assert.equal((await call(`/api/reminders/${mine.id}/complete`, { cookie: aliceCookie, method: 'PATCH', json: { completed: true } })).status, 200);
  assert.equal((await call(`/api/reminders/${mine.id}`, { cookie: aliceCookie, method: 'DELETE' })).status, 200);
});

test('owners and admins manage every reminder, and anyone can complete a system one but not edit or delete it', async () => {
  const { mine, system, bobCookie, ownerCookie } = await reminderFixture();
  assert.equal((await call(`/api/reminders/${mine.id}`, { cookie: ownerCookie, method: 'PATCH', json: { note: 'Owner edit' } })).status, 200);

  assert.equal((await call(`/api/reminders/${system.id}/complete`, { cookie: bobCookie, method: 'PATCH', json: { completed: true } })).status, 200);
  assert.equal((await call(`/api/reminders/${system.id}`, { cookie: bobCookie, method: 'PATCH', json: { note: 'x' } })).status, 403);
  assert.equal((await call(`/api/reminders/${system.id}`, { cookie: bobCookie, method: 'DELETE' })).status, 403);
  assert.equal((await call(`/api/reminders/${system.id}`, { cookie: ownerCookie, method: 'DELETE' })).status, 200);
  assert.equal((await call(`/api/reminders/${mine.id}`, { cookie: ownerCookie, method: 'DELETE' })).status, 200);
});

test('anyone on the team still sees every reminder', async () => {
  const { bobCookie } = await reminderFixture();
  const { reminders } = await (await call('/api/reminders', { cookie: bobCookie })).json();
  assert.deepEqual(reminders.map((item) => item.note).sort(), ['Alice private', 'Proposal accepted']);
});
