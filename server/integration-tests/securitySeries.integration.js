import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import { after, before, test } from 'node:test';
import bcrypt from 'bcrypt';
import { blockedConnections, lockDownEnvironment, resetAllTables } from './support/bleedHarness.js';

// Security series (HTTP level): headers, CORS/CSRF, authentication, sessions,
// team authorization, webhook forgery, SSRF, ICS injection, limits and error
// handling. The whole-API sweeps live in securityFuzz.sweep.js; static and
// crypto checks in test/securityStatic.test.js.
//
// Provider keys are blanked and outbound sockets blocked (lockDownEnvironment),
// so nothing here can contact a real provider. Every request comes from its own
// address so the per-IP login limiter is only ever exercised on purpose.

lockDownEnvironment();

// Outgoing mail goes to a local capture server instead of a provider: the Resend
// SDK reads RESEND_BASE_URL when it loads, so this must be set before the app is
// imported. Tests can then read exactly what would have been emailed.
const sentMail = [];
const mailMode = { reject: false }; // flip to simulate the provider refusing mail
const mailCapture = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (mailMode.reject) { res.statusCode = 422; res.end(JSON.stringify({ name: 'validation_error', message: 'rejected', statusCode: 422 })); return; }
    try { sentMail.push({ path: req.url, ...JSON.parse(Buffer.concat(chunks).toString('utf8')) }); } catch { /* not JSON */ }
    res.end(JSON.stringify({ id: `captured_${sentMail.length}` }));
  });
});
await new Promise((resolve) => mailCapture.listen(0, '127.0.0.1', resolve));
process.env.RESEND_BASE_URL = `http://127.0.0.1:${mailCapture.address().port}`;
process.env.RESEND_API_KEY = 're_capture_only';
process.env.RESEND_FROM_EMAIL = 'GigWorks <noreply@gigworks.test>';
process.env.FRONTEND_URL = 'http://localhost:5173';

const [{ app }, { prisma }, { hashToken, generateToken }] = await Promise.all([
  import('../src/index.js'),
  import('../src/lib/prisma.js'),
  import('../src/lib/resetToken.js'),
]);

let server;
let baseUrl;
let counter = 0;
before(async () => {
  await resetAllTables(prisma);
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => mailCapture.close(resolve));
  await prisma.$disconnect();
});

const nextIp = () => { counter += 1; return `10.50.${(counter >> 8) & 255}.${counter & 255}`; };

async function call(method, path, { cookie, body, rawBody, headers = {}, ip = nextIp() } = {}) {
  const finalHeaders = { 'x-forwarded-for': ip, ...headers };
  if (cookie) finalHeaders.cookie = cookie;
  let payload = rawBody;
  if (body !== undefined) { finalHeaders['content-type'] ||= 'application/json'; payload = JSON.stringify(body); }
  const response = await fetch(`${baseUrl}${path}`, { method, headers: finalHeaders, body: payload, redirect: 'manual' });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, headers: response.headers, text, json, cookies: (response.headers.getSetCookie?.() || []).map((value) => value.split(';', 1)[0]).join('; '), setCookie: response.headers.getSetCookie?.() || [] };
}

let userCounter = 0;
async function makeUser({ role = 'owner', permissions = {}, accountId, password = 'correct-horse-battery', cost = 4, vertical = 'band_orchestra' } = {}) {
  userCounter += 1;
  const email = `sec-${userCounter}-${Date.now().toString(36)}@example.test`;
  const account = accountId
    ? await prisma.account.findUniqueOrThrow({ where: { id: accountId } })
    : await prisma.account.create({ data: { approvedAt: new Date(), vertical } });
  const user = await prisma.user.create({ data: { firstName: 'Sec', lastName: `User${userCounter}`, email, passwordHash: await bcrypt.hash(password, cost) } });
  const membership = await prisma.membership.create({ data: { userId: user.id, accountId: account.id, role, permissions } });
  return { user, account, membership, email, password };
}
async function loginAs(identity, password = identity.password) {
  const response = await call('POST', '/api/auth/login', { body: { email: identity.email, password } });
  assert.equal(response.status, 200, `login failed: ${response.text}`);
  return response.cookies;
}

// ---------------------------------------------------------------------------
// Transport and browser-facing headers
// ---------------------------------------------------------------------------
test('security: headers: every response carries the hardening headers, including errors and 404s', async () => {
  const owner = await makeUser();
  const cookie = await loginAs(owner);
  const responses = await Promise.all([
    call('GET', '/api/health'),
    call('GET', '/api/auth/me'),
    call('GET', '/api/no-such-route'),
    call('POST', '/api/auth/login', { rawBody: '{not json', headers: { 'content-type': 'application/json' } }),
    call('GET', '/api/bookings?limit=1', { cookie }),
  ]);
  for (const response of responses) {
    const where = `${response.status} ${response.text.slice(0, 60)}`;
    assert.match(response.headers.get('content-security-policy') || '', /default-src 'none'/, `CSP missing: ${where}`);
    assert.match(response.headers.get('content-security-policy') || '', /frame-ancestors 'none'/, `frame-ancestors missing: ${where}`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', where);
    assert.equal(response.headers.get('x-frame-options'), 'DENY', where);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer', where);
    assert.equal(response.headers.get('cache-control'), 'no-store', where);
    assert.equal(response.headers.get('x-powered-by'), null, `framework disclosed: ${where}`);
  }
});

test('security: headers: HSTS is sent in production and the localhost CORS allowance is not', async () => {
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const response = await call('GET', '/api/health');
    assert.match(response.headers.get('strict-transport-security') || '', /max-age=\d{8,}; includeSubDomains/);
    // The development shortcut for localhost origins must be off in production.
    const origin = await call('GET', '/api/health', { headers: { origin: 'http://localhost:5173' } });
    assert.equal(origin.status, 403, 'a localhost Origin was accepted in production');
  } finally {
    process.env.NODE_ENV = original;
  }
});

// ---------------------------------------------------------------------------
// CORS, and CSRF (the app's defence is the Origin allowlist plus JSON bodies)
// ---------------------------------------------------------------------------
test('security: cors: hostile origins are refused on simple requests and preflights; allowed ones are echoed, never wildcarded', async () => {
  const hostile = ['https://evil.example', 'null', 'http://localhost.evil.example', 'http://127.0.0.1.evil.example', 'http://localhost:5173@evil.example', 'HTTP://LOCALHOST:5173', 'http://localhost:5173.evil.example', 'http://evil.example/http://localhost:5173'];
  for (const origin of hostile) {
    for (const method of ['GET', 'POST', 'OPTIONS']) {
      const response = await call(method, '/api/auth/me', { headers: { origin, ...(method === 'OPTIONS' ? { 'access-control-request-method': 'POST' } : {}) } });
      assert.equal(response.status, 403, `${method} with Origin ${origin} was not refused (${response.status})`);
      assert.equal(response.headers.get('access-control-allow-origin'), null, `ACAO set for ${origin}`);
    }
  }
  const allowed = await call('GET', '/api/health', { headers: { origin: 'http://localhost:5173' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
  assert.notEqual(allowed.headers.get('access-control-allow-origin'), '*');
  assert.match(allowed.headers.get('vary') || '', /Origin/i);
});

test('security: csrf: a cross-site request carrying a valid session is refused for every state-changing route, and nothing changes', async () => {
  const { buildRouteTable } = await import('./support/routeTable.js');
  const owner = await makeUser();
  const cookie = await loginAs(owner);
  const before = await prisma.client.count();
  const mutating = buildRouteTable().filter((route) => route.method !== 'GET' && !route.path.startsWith('/api/webhooks'));
  const accepted = [];
  for (const route of mutating) {
    const path = route.path.replace(/:\w+/g, 'x');
    for (const origin of ['https://evil.example', 'null']) {
      // The three content types a cross-site <form> can send without a preflight, plus JSON.
      for (const type of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x', 'application/json']) {
        const response = await call(route.method, path, { cookie, rawBody: type === 'application/json' ? '{}' : 'a=b', headers: { origin, 'content-type': type } });
        if (response.status !== 403 || !/CORS/.test(response.text)) accepted.push(`${route.method} ${route.path} [${origin} / ${type}] -> ${response.status}`);
      }
    }
  }
  assert.deepEqual(accepted, [], 'cross-site requests reached route logic');
  assert.equal(await prisma.client.count(), before);
});

test('security: csrf: multipart upload routes demand a matching double-submit token', async () => {
  const owner = await makeUser();
  const cookie = await loginAs(owner);
  const csrf = cookie.split('; ').find((part) => part.startsWith('csrf_token='))?.slice('csrf_token='.length);
  assert.ok(csrf && csrf.length >= 32, 'no CSRF cookie issued on login');
  const headers = { origin: 'http://localhost:5173' };
  const missing = await call('POST', '/api/support/threads', { cookie, headers });
  assert.equal(missing.status, 403);
  assert.match(missing.text, /CSRF/);
  const wrong = await call('POST', '/api/support/threads', { cookie, headers: { ...headers, 'x-csrf-token': 'x'.repeat(csrf.length) } });
  assert.equal(wrong.status, 403);
  const matching = await call('POST', '/api/support/threads', { cookie, headers: { ...headers, 'x-csrf-token': decodeURIComponent(csrf) } });
  assert.notEqual(matching.status, 403, 'a correct token was refused');
});

test('security: oauth: a callback with a forged or foreign state never connects an account', async () => {
  const owner = await makeUser();
  const other = await makeUser();
  const cookie = await loginAs(owner);
  for (const state of ['', 'forged', 'a.b.c', 'v1.AAAA.BBBB']) {
    const response = await call('GET', `/api/integrations/google-calendar/callback?code=stolen&state=${encodeURIComponent(state)}`, { cookie });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /googleCalendar=error/, `state "${state}" was not rejected`);
  }
  assert.equal(await prisma.googleCalendarConnection.count({ where: { accountId: { in: [owner.account.id, other.account.id] } } }), 0);
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
test('security: auth: malformed or hostile login input is a client error, never a server error', async () => {
  const bodies = [
    { email: {}, password: 'x' }, { email: [], password: 'x' }, { email: 123, password: 'x' }, { email: true, password: 'x' },
    { email: { $ne: null }, password: { $ne: null } }, { email: 'a@b.test', password: {} }, { email: 'a@b.test', password: [] },
    { email: "' OR '1'='1", password: "' OR '1'='1" }, { email: 'a@b.test"; DROP TABLE "User";--', password: 'x' },
    { email: 'a@b.test', password: 'x'.repeat(5000) }, { email: `${'a'.repeat(5000)}@b.test`, password: 'x' }, { email: 'a@b.test', password: 'p\u0000w' }, {},
  ];
  const serverErrors = [];
  for (const body of bodies) {
    const response = await call('POST', '/api/auth/login', { body });
    if (response.status >= 500 || ![400, 401].includes(response.status)) serverErrors.push(`${JSON.stringify(body).slice(0, 70)} -> ${response.status}`);
  }
  assert.deepEqual(serverErrors, []);
});

test('security: auth: an unknown email and a wrong password are indistinguishable by response and by timing', async () => {
  const real = await makeUser({ cost: 12 }); // production hashes use cost 12
  const sample = async (email) => {
    const times = [];
    let last;
    for (let i = 0; i < 9; i += 1) {
      const start = process.hrtime.bigint();
      last = await call('POST', '/api/auth/login', { body: { email, password: 'wrong-password-123' } });
      times.push(Number(process.hrtime.bigint() - start) / 1e6);
    }
    times.sort((a, b) => a - b);
    return { median: times[4], last };
  };
  const known = await sample(real.email);
  const unknown = await sample(`nobody-${Date.now()}@example.test`);
  assert.equal(known.last.status, unknown.last.status);
  assert.equal(known.last.text, unknown.last.text);
  const ratio = Math.max(known.median, unknown.median) / Math.min(known.median, unknown.median);
  assert.ok(ratio < 1.6, `login timing reveals whether an account exists (known ${known.median.toFixed(0)}ms vs unknown ${unknown.median.toFixed(0)}ms)`);
});

test('security: auth: the login limiter stops brute force per address and does not punish other addresses', async () => {
  const user = await makeUser();
  const ip = '10.77.0.1';
  let limitedAt = null;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const response = await call('POST', '/api/auth/login', { body: { email: user.email, password: `guess-${attempt}` }, ip });
    if (response.status === 429) { limitedAt = attempt; break; }
  }
  assert.ok(limitedAt && limitedAt <= 25, `no 429 within 25 attempts (stopped at ${limitedAt})`);
  const rightPassword = await call('POST', '/api/auth/login', { body: { email: user.email, password: user.password }, ip });
  assert.equal(rightPassword.status, 429, 'a limited address could still log in');
  const elsewhere = await call('POST', '/api/auth/login', { body: { email: user.email, password: user.password }, ip: '10.77.0.2' });
  assert.equal(elsewhere.status, 200);
});

test('security: auth: forgot-password gives one answer whether or not the email has an account', async () => {
  const user = await makeUser();
  const known = await call('POST', '/api/auth/forgot-password', { body: { email: user.email } });
  const unknown = await call('POST', '/api/auth/forgot-password', { body: { email: 'no-such-user@example.test' } });
  assert.equal(known.status, unknown.status);
  assert.equal(known.text, unknown.text);
  const typeConfusion = await call('POST', '/api/auth/forgot-password', { body: { email: { $ne: 1 } } });
  assert.ok(typeConfusion.status < 500, `forgot-password crashed on an object email (${typeConfusion.status})`);
  // The raw token must never be stored: only its hash.
  const stored = await prisma.passwordResetToken.findMany({ where: { userId: user.user.id } });
  assert.ok(stored.length >= 1 && stored.every((row) => /^[0-9a-f]{64}$/.test(row.tokenHash)));
});

test('security: auth: reset links are single-use, expire, can be revoked, and a successful reset ends every session', async () => {
  const user = await makeUser();
  const oldCookie = await loginAs(user);
  const issue = async (changes = {}) => {
    const token = generateToken();
    await prisma.passwordResetToken.create({ data: { userId: user.user.id, tokenHash: hashToken(token), purpose: 'password_reset', expiresAt: new Date(Date.now() + 3_600_000), ...changes } });
    return token;
  };
  const reset = (token, newPassword = 'a-brand-new-password') => call('POST', '/api/auth/reset-password', { body: { token, newPassword } });

  assert.equal((await reset(await issue({ expiresAt: new Date(Date.now() - 1000) }))).status, 400, 'expired token accepted');
  assert.equal((await reset(await issue({ usedAt: new Date() }))).status, 400, 'used token accepted');
  assert.equal((await reset(await issue({ revokedAt: new Date() }))).status, 400, 'revoked token accepted');
  assert.equal((await reset('not-a-real-token')).status, 400);
  assert.equal((await reset(await issue(), 'short')).status, 400, 'weak password accepted');
  assert.ok((await reset({ $ne: '' })).status < 500, 'token object crashed the route');

  const good = await issue();
  assert.equal((await reset(good)).status, 200);
  assert.equal((await reset(good, 'another-new-password')).status, 400, 'a reset token worked twice');
  assert.equal((await call('GET', '/api/auth/me', { cookie: oldCookie })).status, 401, 'a session survived a password reset');
  assert.equal((await call('POST', '/api/auth/login', { body: { email: user.email, password: user.password } })).status, 401, 'the old password still works');
  assert.equal((await call('POST', '/api/auth/login', { body: { email: user.email, password: 'a-brand-new-password' } })).status, 200);
});

test('security: auth: changing a password signs out every other session and needs the current password', async () => {
  const user = await makeUser();
  const sessionA = await loginAs(user);
  const sessionB = await loginAs(user);
  const wrong = await call('POST', '/api/auth/change-password', { cookie: sessionA, body: { currentPassword: 'not-it', newPassword: 'fresh-password-123' } });
  assert.equal(wrong.status, 401);
  assert.equal((await call('GET', '/api/auth/me', { cookie: sessionB })).status, 200, 'a failed change signed someone out');
  const ok = await call('POST', '/api/auth/change-password', { cookie: sessionA, body: { currentPassword: user.password, newPassword: 'fresh-password-123' } });
  assert.equal(ok.status, 200);
  const stillValid = await call('GET', '/api/auth/me', { cookie: sessionB });
  assert.equal(stillValid.status, 401, 'another session stayed signed in after the password changed — a stolen session survives a password change');
  const refreshed = ok.cookies.split('; ').find((part) => part.startsWith('connect.sid='));
  assert.ok(refreshed, 'the session was not refreshed after the password changed');
  assert.equal((await call('GET', '/api/auth/me', { cookie: refreshed })).status, 200, 'the session that changed the password was signed out');
});

test('security: auth: the current-password check cannot be brute-forced through change-password', async () => {
  const user = await makeUser();
  const cookie = await loginAs(user);
  let limited = false;
  for (let attempt = 0; attempt < 40 && !limited; attempt += 1) {
    const response = await call('POST', '/api/auth/change-password', { cookie, body: { currentPassword: `guess-${attempt}`, newPassword: 'fresh-password-123' }, ip: '10.78.0.1' });
    limited = response.status === 429;
  }
  assert.ok(limited, 'unlimited guesses at the current password are possible from a hijacked session');
});

test('security: sessions: logout destroys the session on the server, and the cookie is HttpOnly', async () => {
  const user = await makeUser();
  const login = await call('POST', '/api/auth/login', { body: { email: user.email, password: user.password } });
  const sessionCookie = login.setCookie.find((value) => value.startsWith('connect.sid='));
  assert.ok(sessionCookie, 'no session cookie');
  assert.match(sessionCookie, /HttpOnly/i);
  assert.match(sessionCookie, /SameSite=(Lax|None|Strict)/i);
  const cookie = login.cookies;
  assert.equal((await call('GET', '/api/auth/me', { cookie })).status, 200);
  assert.equal((await call('POST', '/api/auth/logout', { cookie })).status, 200);
  assert.equal((await call('GET', '/api/auth/me', { cookie })).status, 401, 'a logged-out cookie still works');
});

test('security: sessions: a removed team member keeps no access to the account they were removed from', async () => {
  const owner = await makeUser();
  const member = await makeUser({ role: 'member', accountId: owner.account.id, permissions: { manageClients: true, manageBookings: true } });
  const clientId = `removal-${owner.account.id}`;
  await prisma.client.create({ data: { id: clientId, accountId: owner.account.id, firstName: 'Kept', lastName: 'Private' } });
  const memberCookie = await loginAs(member);
  assert.equal((await call('GET', `/api/clients/${clientId}`, { cookie: memberCookie })).status, 200);
  const ownerCookie = await loginAs(owner);
  const removed = await call('DELETE', `/api/team/members/${member.membership.id}`, { cookie: ownerCookie });
  assert.equal(removed.status, 200, removed.text);
  const direct = await call('GET', `/api/clients/${clientId}`, { cookie: memberCookie });
  assert.ok([401, 403, 404].includes(direct.status), `a removed member still reads the account's clients (${direct.status})`);
  const list = await call('GET', '/api/clients?limit=100', { cookie: memberCookie });
  assert.ok(!list.text.includes('Kept'), 'a removed member can still list the account\'s clients');
  const me = await call('GET', '/api/auth/me', { cookie: memberCookie });
  if (me.status === 200) assert.notEqual(me.json.user.accountId ?? me.json.user.membership?.accountId, owner.account.id, 'the removed member is still in the account');
});

test('security: signup: privileged fields in the request are ignored', async () => {
  // Public signup is off by default; switch it on so the route can actually be attacked.
  const current = await prisma.websiteSetting.findUnique({ where: { id: 'main' } });
  await prisma.websiteSetting.upsert({ where: { id: 'main' }, update: { config: { ...(current?.config || {}), publicSignupsEnabled: true } }, create: { id: 'main', config: { publicSignupsEnabled: true } } });
  const probe = await call('POST', '/api/auth/signup', { body: { firstName: 'S', lastName: 'U', email: 'probe-signup@example.test', password: 'long-enough-pw', selectedPlan: 'solo', billingInterval: 'month' } });
  assert.equal(probe.status, 201, `public signup could not be enabled for the test: ${probe.status} ${probe.text}`);
  const victim = await makeUser();
  const response = await call('POST', '/api/auth/signup', { body: {
    firstName: 'Mallory', lastName: 'M', email: 'mallory-signup@example.test', password: 'long-enough-pw', selectedPlan: 'solo', billingInterval: 'month',
    role: 'admin', accountId: victim.account.id, approvedAt: new Date().toISOString(), isPlatformAdmin: true, platformRole: 'owner', quickBooksAccessEnabled: true, planTier: 'agency', seatLimit: 9999, permissions: { manageSettings: true },
  } });
  assert.equal(response.status, 201, response.text);
  // Wrong-typed values must be a client error, not a crash.
  for (const bad of [{ firstName: {} }, { lastName: [] }, { email: { $ne: 1 } }, { password: 12345678 }, { phone: { a: 1 } }]) {
    const rejected = await call('POST', '/api/auth/signup', { body: { firstName: 'A', lastName: 'B', email: `typed-${Date.now()}@example.test`, password: 'long-enough-pw', selectedPlan: 'solo', billingInterval: 'month', ...bad } });
    assert.equal(rejected.status, 400, `signup with ${JSON.stringify(bad)} -> ${rejected.status}`);
  }
  const created = await prisma.user.findUniqueOrThrow({ where: { email: 'mallory-signup@example.test' }, include: { membership: { include: { account: true } } } });
  assert.notEqual(created.membership.accountId, victim.account.id, 'signup attached the new user to another account');
  assert.equal(created.membership.account.approvedAt, null, 'signup self-approved the account');
  assert.equal(created.membership.account.quickBooksAccessEnabled, false);
  assert.notEqual(created.membership.account.planTier, 'agency');
  assert.equal(await prisma.membership.count({ where: { accountId: victim.account.id } }), 1, 'a member was added to the victim account');
});

// ---------------------------------------------------------------------------
// Authorization inside one account
// ---------------------------------------------------------------------------
test('security: authorization: a member with no permissions is locked out of settings, people, money and admin', async () => {
  const owner = await makeUser();
  const none = await makeUser({ role: 'member', accountId: owner.account.id, permissions: {} });
  const cookie = await loginAs(none);
  const reads = ['/api/team/members', '/api/financials/summary', '/api/billing/status', '/api/integrations/quickbooks/status', '/api/admin/accounts'];
  for (const path of reads) {
    const response = await call('GET', path, { cookie });
    assert.ok([401, 403, 404].includes(response.status), `GET ${path} gave a permission-less member ${response.status}`);
  }
  const writes = [
    ['POST', '/api/team/members', { firstName: 'A', lastName: 'B', email: 'x@example.test' }],
    ['POST', '/api/clients', { id: 'c1', firstName: 'A', lastName: 'B' }],
    ['POST', '/api/bookings', { id: 'b1' }], ['POST', '/api/events', { id: 'e1' }], ['POST', '/api/contractors', { id: 'k1', firstName: 'A', lastName: 'B' }],
    ['POST', '/api/venues', { id: 'v1', name: 'V' }], ['POST', '/api/offerings', { id: 'o1', name: 'O', type: 'general' }],
    ['POST', '/api/financials/expenses', { amount: 1, category: 'other_expense', description: 'x' }],
    ['PUT', '/api/account-data', { data: { businessInfo: { name: 'Hijacked' } } }],
    ['POST', '/api/email-domains/custom-domain', { domain: 'mail.attacker.example' }],
  ];
  for (const [method, path, body] of writes) {
    const response = await call(method, path, { cookie, body });
    assert.equal(response.status, 403, `${method} ${path} gave a permission-less member ${response.status}: ${response.text.slice(0, 80)}`);
  }
  const data = await prisma.accountData.findUnique({ where: { accountId: owner.account.id } });
  assert.notEqual(data?.data?.businessInfo?.name, 'Hijacked');
});

test('security: authorization: roles cannot be escalated through the team routes', async () => {
  const owner = await makeUser();
  const admin = await makeUser({ role: 'admin', accountId: owner.account.id });
  const otherAdmin = await makeUser({ role: 'admin', accountId: owner.account.id });
  const member = await makeUser({ role: 'member', accountId: owner.account.id, permissions: { manageClients: true } });
  const ownerCookie = await loginAs(owner);
  const adminCookie = await loginAs(admin);
  const memberCookie = await loginAs(member);

  // A member cannot reach team management at all, so cannot promote themselves.
  assert.equal((await call('PATCH', `/api/team/members/${member.membership.id}`, { cookie: memberCookie, body: { role: 'admin' } })).status, 403);
  // An admin cannot promote, demote, edit or remove peers or the owner.
  assert.equal((await call('PATCH', `/api/team/members/${member.membership.id}`, { cookie: adminCookie, body: { role: 'admin' } })).status, 403);
  assert.equal((await call('PATCH', `/api/team/members/${otherAdmin.membership.id}`, { cookie: adminCookie, body: { role: 'member' } })).status, 403);
  assert.equal((await call('PATCH', `/api/team/members/${owner.membership.id}`, { cookie: adminCookie, body: { role: 'member' } })).status, 403);
  assert.equal((await call('DELETE', `/api/team/members/${owner.membership.id}`, { cookie: adminCookie })).status, 403);
  assert.equal((await call('DELETE', `/api/team/members/${otherAdmin.membership.id}`, { cookie: adminCookie })).status, 403);
  // Not even the owner can mint a second owner or an unknown role, or demote themselves.
  for (const role of ['owner', 'superadmin', 'platform_admin', '', null, {}, ['admin']]) {
    const response = await call('PATCH', `/api/team/members/${member.membership.id}`, { cookie: ownerCookie, body: { role } });
    assert.ok(response.status === 400 || response.status === 200 && role === '' , `owner set role ${JSON.stringify(role)} -> ${response.status}`);
  }
  assert.equal((await prisma.membership.findUniqueOrThrow({ where: { id: member.membership.id } })).role, 'member');
  assert.equal((await call('PATCH', `/api/team/members/${owner.membership.id}`, { cookie: ownerCookie, body: { role: 'member' } })).status, 403);
  assert.equal((await prisma.membership.findUniqueOrThrow({ where: { id: owner.membership.id } })).role, 'owner');

  // Unknown or hostile permission keys are discarded rather than stored.
  const patched = await call('PATCH', `/api/team/members/${member.membership.id}`, { cookie: ownerCookie, body: { permissions: { manageClients: true, isAdmin: true, role: 'owner', __proto__: { manageSettings: true }, constructor: { prototype: { polluted: 1 } } } } });
  assert.equal(patched.status, 200, patched.text);
  const stored = (await prisma.membership.findUniqueOrThrow({ where: { id: member.membership.id } })).permissions;
  assert.equal(stored.isAdmin, undefined);
  assert.equal(stored.role, undefined);
  assert.equal(stored.manageSettings, false);
  assert.equal({}.polluted, undefined, 'Object.prototype was polluted');
  // A new member cannot be created pre-promoted or inside another account.
  const other = await makeUser();
  const created = await call('POST', '/api/team/members', { cookie: ownerCookie, body: { firstName: 'N', lastName: 'M', email: `invitee-${Date.now()}@example.test`, role: 'admin', accountId: other.account.id } });
  assert.equal(created.status, 201, created.text);
  const invited = await prisma.membership.findFirstOrThrow({ where: { user: { email: { startsWith: 'invitee-' } } } });
  assert.equal(invited.role, 'member');
  assert.equal(invited.accountId, owner.account.id);
  assert.equal((await call('POST', '/api/team/members', { cookie: ownerCookie, body: { firstName: 'D', lastName: 'U', email: admin.email } })).status, 409);
});

test('security: authorization: a tenant owner is not a platform admin', async () => {
  const owner = await makeUser();
  const cookie = await loginAs(owner);
  const { buildRouteTable } = await import('./support/routeTable.js');
  const allowed = [];
  for (const route of buildRouteTable().filter((entry) => entry.path.startsWith('/api/admin'))) {
    const path = route.path.replace(/:\w+/g, 'x');
    const response = await call(route.method, path, { cookie, body: route.method === 'GET' ? undefined : {} });
    if (![401, 403].includes(response.status)) allowed.push(`${route.method} ${route.path} -> ${response.status}`);
  }
  assert.deepEqual(allowed, [], 'a tenant owner reached platform-admin routes');
});

// ---------------------------------------------------------------------------
// Webhook forgery
// ---------------------------------------------------------------------------
test('security: webhooks: unsigned, forged, tampered and replayed provider calls are refused; an unconfigured secret fails closed', async () => {
  const { Webhook } = await import('svix');
  const Stripe = (await import('stripe')).default;
  const secret = `whsec_${Buffer.from('security-series-resend-secret').toString('base64')}`;
  const payload = JSON.stringify({ type: 'email.delivered', created_at: new Date().toISOString(), data: { email_id: 'em_x' } });
  const sign = (body, when = new Date(), key = secret, id = 'msg_sec') => ({ 'svix-id': id, 'svix-timestamp': String(Math.floor(when.getTime() / 1000)), 'svix-signature': new Webhook(key).sign(id, when, body), 'content-type': 'application/json' });
  const post = (path, rawBody, headers) => call('POST', path, { rawBody, headers });

  const original = process.env.RESEND_WEBHOOK_SECRET;
  try {
    delete process.env.RESEND_WEBHOOK_SECRET; process.env.RESEND_WEBHOOK_SECRET = '';
    assert.equal((await post('/api/webhooks/resend', payload, sign(payload))).status, 503, 'Resend webhook accepted events with no secret configured');
    process.env.RESEND_WEBHOOK_SECRET = secret;
    assert.equal((await post('/api/webhooks/resend', payload, { 'content-type': 'application/json' })).status, 400, 'unsigned event accepted');
    assert.equal((await post('/api/webhooks/resend', payload, sign(payload, new Date(), `whsec_${Buffer.from('attacker-guess').toString('base64')}`))).status, 400, 'event signed with the wrong secret accepted');
    assert.equal((await post('/api/webhooks/resend', `${payload} `, sign(payload))).status, 400, 'tampered body accepted');
    assert.equal((await post('/api/webhooks/resend', payload, sign(payload, new Date(Date.now() - 3_600_000)))).status, 400, 'a replayed (one hour old) event was accepted');
    assert.equal((await post('/api/webhooks/resend', payload, { ...sign(payload), 'svix-signature': 'v1,AAAA' })).status, 400);
    assert.equal((await post('/api/webhooks/resend', payload, sign(payload))).status, 200, 'a correctly signed event was refused');
  } finally {
    process.env.RESEND_WEBHOOK_SECRET = original;
  }

  const stripe = new Stripe('sk_test_security');
  const body = JSON.stringify({ id: 'evt_sec', object: 'event', type: 'checkout.session.completed', data: { object: { metadata: { invoiceId: 'x' } } } });
  const stripeSecret = 'whsec_security_series_stripe';
  process.env.STRIPE_WEBHOOK_SECRET = stripeSecret;
  process.env.STRIPE_BILLING_WEBHOOK_SECRET = stripeSecret;
  for (const path of ['/api/webhooks/stripe', '/api/webhooks/stripe-billing']) {
    const header = (options = {}) => stripe.webhooks.generateTestHeaderString({ payload: body, secret: stripeSecret, ...options });
    assert.equal((await post(path, body, { 'content-type': 'application/json' })).status, 400, `${path}: unsigned event accepted`);
    assert.equal((await post(path, body, { 'stripe-signature': header({ secret: 'whsec_wrong' }), 'content-type': 'application/json' })).status, 400, `${path}: wrong secret accepted`);
    assert.equal((await post(path, `${body} `, { 'stripe-signature': header(), 'content-type': 'application/json' })).status, 400, `${path}: tampered body accepted`);
    assert.equal((await post(path, body, { 'stripe-signature': header({ timestamp: Math.floor(Date.now() / 1000) - 7200 }), 'content-type': 'application/json' })).status, 400, `${path}: replayed event accepted`);
  }
  process.env.STRIPE_WEBHOOK_SECRET = '';
  process.env.STRIPE_BILLING_WEBHOOK_SECRET = '';
  for (const path of ['/api/webhooks/stripe', '/api/webhooks/stripe-billing']) {
    assert.notEqual((await post(path, body, { 'stripe-signature': 't=1,v1=00', 'content-type': 'application/json' })).status, 200, `${path} accepted events with no secret`);
  }
});

test('security: webhooks: Twilio callbacks need a signature made with the real token; an empty token is never a valid key', async () => {
  const params = new URLSearchParams({ MessageSid: 'SM1', MessageStatus: 'delivered' });
  const post = (headers = {}) => call('POST', '/api/webhooks/twilio/sms/status', { rawBody: params.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded', host: '127.0.0.1', ...headers } });
  const sign = (token, url) => createHmac('sha1', token).update([...params.keys()].sort().reduce((text, key) => `${text}${key}${params.get(key)}`, url)).digest('base64');
  const url = `${baseUrl}/api/webhooks/twilio/sms/status`;
  const originalSid = process.env.TWILIO_ACCOUNT_SID;
  const originalToken = process.env.TWILIO_AUTH_TOKEN;
  try {
    process.env.TWILIO_ACCOUNT_SID = ''; process.env.TWILIO_AUTH_TOKEN = '';
    const unconfigured = await post({ 'x-twilio-signature': sign('', url) });
    assert.equal(unconfigured.status, 503, 'Twilio accepted a signature computed with an empty key');
    process.env.TWILIO_ACCOUNT_SID = 'ACsecurityseries'; process.env.TWILIO_AUTH_TOKEN = 'real-auth-token-for-test';
    assert.equal((await post()).status, 403, 'unsigned callback accepted');
    assert.equal((await post({ 'x-twilio-signature': sign('attacker-token', url) })).status, 403, 'callback signed with the wrong token accepted');
    assert.equal((await post({ 'x-twilio-signature': sign('real-auth-token-for-test', `${url}?x=1`) })).status, 403, 'signature for a different URL accepted');
  } finally {
    process.env.TWILIO_ACCOUNT_SID = originalSid; process.env.TWILIO_AUTH_TOKEN = originalToken;
  }
});

// ---------------------------------------------------------------------------
// SSRF through the venue website importer
// ---------------------------------------------------------------------------
test('security: ssrf: the website importer never connects to loopback, private or metadata addresses', async () => {
  const owner = await makeUser();
  const cookie = await loginAs(owner);
  const hits = [];
  const honeypot = http.createServer((req, res) => { hits.push(`${req.method} ${req.url}`); res.end('<html><title>internal</title></html>'); });
  await new Promise((resolve) => honeypot.listen(0, '127.0.0.1', resolve));
  const port = honeypot.address().port;
  const targets = [
    `http://127.0.0.1:${port}/`, `http://localhost:${port}/`, `http://127.1:${port}/`, `http://0x7f000001:${port}/`, `http://2130706433:${port}/`, `http://0177.0.0.1:${port}/`,
    `http://[::1]:${port}/`, `http://[::ffff:7f00:1]:${port}/`, `http://0.0.0.0:${port}/`, `http://user:pass@127.0.0.1:${port}/`, `http://127.0.0.1.:${port}/`,
    'http://169.254.169.254/latest/meta-data/', 'http://[fd00:ec2::254]/latest/meta-data/', 'http://10.0.0.1/', 'http://192.168.1.1/', 'http://172.16.0.1/', 'http://100.64.0.1/',
    'file:///etc/passwd', 'gopher://127.0.0.1:70/_x', 'ftp://127.0.0.1/', 'javascript:alert(1)', 'data:text/html,<script>1</script>',
  ];
  try {
    const before = blockedConnections.length;
    for (const url of targets) {
      const response = await call('POST', '/api/venues/website-import', { cookie, body: { url, website: url, venueWebsite: url } });
      assert.ok(response.status < 500, `${url} -> ${response.status}`);
      assert.ok(!/internal/.test(response.text), `${url} returned the internal page`);
    }
    assert.deepEqual(hits, [], `the importer reached an internal service: ${hits.join(', ')}`);
    const internalAttempts = blockedConnections.slice(before).filter((attempt) => /^(169\.254|10\.|192\.168|172\.(1[6-9]|2\d|3[01])|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])|fd|fe80)/.test(attempt.host));
    assert.deepEqual(internalAttempts, [], 'the importer tried to open a connection to a private address');
  } finally {
    await new Promise((resolve) => honeypot.close(resolve));
  }
});

// ---------------------------------------------------------------------------
// Output encoding
// ---------------------------------------------------------------------------
test('security: ics: hostile query values cannot inject calendar properties', async () => {
  const base = 'uid=u1&summary=Gig&start=20270101T100000&end=20270101T110000';
  const payloads = {
    attendeeEmail: ['a@b.test\r\nATTENDEE:mailto:evil@example.test', 'a@b.test%0d%0aORGANIZER:mailto:evil@example.test', 'a@b.test\nBEGIN:VALARM\nACTION:DISPLAY'],
    attendeeName: ['Bob\r\nORGANIZER:mailto:evil@example.test', 'Bob";X-EVIL=1:'],
    summary: ['Gig\r\nATTENDEE:mailto:evil@example.test'],
    location: ['Hall\r\nATTENDEE:mailto:evil@example.test'],
    description: ['Hi\r\nATTENDEE:mailto:evil@example.test'],
    uid: ['u1\r\nATTENDEE:mailto:evil@example.test'],
  };
  for (const [field, values] of Object.entries(payloads)) {
    for (const value of values) {
      const query = field === 'summary' || field === 'uid' ? base.replace(new RegExp(`${field}=[^&]*`), `${field}=${encodeURIComponent(value)}`) : `${base}&${field}=${encodeURIComponent(value)}${field === 'attendeeName' ? '&attendeeEmail=ok@example.test' : ''}`;
      const response = await call('GET', `/api/calendar/invite.ics?${query}`);
      if (response.status !== 200) continue;
      // Unfold, then every property must be one of the ones the server writes, once.
      const lines = response.text.replace(/\r\n[ \t]/g, '').split(/\r\n/).filter(Boolean);
      const names = lines.map((line) => line.split(/[:;]/, 1)[0]);
      const allowed = new Set(['BEGIN', 'END', 'VERSION', 'PRODID', 'METHOD', 'UID', 'DTSTAMP', 'DTSTART', 'DTEND', 'SEQUENCE', 'SUMMARY', 'LOCATION', 'DESCRIPTION', 'ATTENDEE', 'STATUS']);
      assert.deepEqual(names.filter((name) => !allowed.has(name)), [], `${field}=${JSON.stringify(value)} added a calendar property`);
      assert.ok(names.filter((name) => name === 'ATTENDEE').length <= 1, `${field}=${JSON.stringify(value)} added a second attendee`);
      for (const single of ['SUMMARY', 'UID', 'DTSTART', 'DTEND', 'LOCATION', 'DESCRIPTION']) assert.ok(names.filter((name) => name === single).length <= 1, `${single} appears more than once`);
      assert.equal(lines.filter((line) => line === 'BEGIN:VEVENT').length, 1);
      assert.equal(lines.filter((line) => line.startsWith('BEGIN:')).length, 2, 'an extra component was injected');
    }
  }
});

// ---------------------------------------------------------------------------
// Resource limits and error handling
// ---------------------------------------------------------------------------
test('security: limits: oversized, deeply nested and malformed input is refused cheaply', async () => {
  const big = await call('POST', '/api/auth/login', { rawBody: JSON.stringify({ email: 'a@b.test', password: 'x'.repeat(300_000) }), headers: { 'content-type': 'application/json' } });
  assert.equal(big.status, 413, `a 300 KB login body was processed (${big.status})`);
  const nested = await call('POST', '/api/auth/login', { rawBody: `${'['.repeat(50_000)}${']'.repeat(50_000)}`, headers: { 'content-type': 'application/json' } });
  assert.ok([400, 413].includes(nested.status), `deeply nested JSON -> ${nested.status}`);
  const started = Date.now();
  const manyParams = await call('GET', `/api/auth/me?${Array.from({ length: 5000 }, (_v, i) => `a[]=${i}`).join('&')}`);
  assert.ok(manyParams.status < 500 && Date.now() - started < 3000, `a 5000-parameter query took ${Date.now() - started}ms / ${manyParams.status}`);
  const hugeHeader = await call('GET', '/api/health', { headers: { 'x-big': 'a'.repeat(40_000) } }).catch(() => ({ status: 431 }));
  assert.ok([400, 431].includes(hugeHeader.status), `a 40 KB header was accepted (${hugeHeader.status})`);
  const malformed = await call('POST', '/api/auth/login', { rawBody: '{"email":', headers: { 'content-type': 'application/json' } });
  assert.equal(malformed.status, 400);
  assert.doesNotMatch(malformed.text, /SyntaxError|node_modules|at .*\(.*:\d+:\d+\)/, 'a parse error leaked internals');
  const wrongType = await call('POST', '/api/auth/login', { rawBody: 'email=a&password=b', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.ok(wrongType.status < 500);
});

test('security: limits: pagination parameters cannot be used to pull unbounded pages', async () => {
  const owner = await makeUser();
  const cookie = await loginAs(owner);
  await prisma.client.createMany({ data: Array.from({ length: 650 }, (_v, i) => ({ id: `page-${owner.account.id}-${i}`, accountId: owner.account.id, firstName: 'P', lastName: String(i) })) });
  const rowsOf = (response) => response.json?.clients?.items ?? response.json?.clients ?? [];
  for (const query of ['limit=1000000', 'limit=-5', 'limit=abc', 'limit[]=5', 'limit=1e9', 'limit=0']) {
    const response = await call('GET', `/api/clients?${query}`, { cookie });
    assert.ok(response.status < 500, `${query} -> ${response.status}`);
    assert.ok(rowsOf(response).length <= 500, `${query} returned ${rowsOf(response).length} rows`);
  }
  for (const query of ['page=1&pageSize=1000000', 'page=-1&pageSize=5', 'pageSize=0&page=1', 'page=abc&pageSize=abc', 'page=99999999999&pageSize=5']) {
    const response = await call('GET', `/api/clients?${query}`, { cookie });
    assert.ok(response.status < 500, `${query} -> ${response.status}`);
    assert.ok(rowsOf(response).length <= 100, `${query} returned ${rowsOf(response).length} rows`);
  }
});

test('security: errors: failures never reveal stack traces, SQL, file paths or secrets', async () => {
  const owner = await makeUser();
  const cookie = await loginAs(owner);
  const responses = [
    await call('GET', '/api/nope/../../etc/passwd'), await call('GET', '/api/clients/%00'), await call('GET', '/api/clients/%ff%fe'),
    await call('GET', `/api/clients/${'a'.repeat(5000)}`, { cookie }), await call('POST', '/api/clients', { cookie, body: { id: owner.account.id, firstName: 'x', lastName: 'y' } }),
    await call('POST', '/api/clients', { cookie, body: { id: ['x'], firstName: {}, lastName: 5 } }), await call('PATCH', '/api/bookings/x', { cookie, rawBody: '[1,2', headers: { 'content-type': 'application/json' } }),
    await call('GET', '/api/health'), await call('GET', '/api/ready'),
  ];
  for (const response of responses) {
    assert.doesNotMatch(response.text, /\bat [\w.<>$ ]+\(?(\/|file:)[^)\n]*:\d+:\d+/, `stack trace in ${response.status} response`);
    assert.doesNotMatch(response.text, /prisma|PrismaClient|SELECT |INSERT |postgres(ql)?:\/\/|ECONN|node_modules|\/Users\/|\/app\/|SESSION_SECRET|sk_(live|test)_/i, `internals in ${response.status} response: ${response.text.slice(0, 120)}`);
  }
  const traceStatus = await new Promise((resolve, reject) => {
    const request = http.request(`${baseUrl}/api/health`, { method: 'TRACE', headers: { 'x-forwarded-for': nextIp(), 'x-probe': 'reflect-me' } }, (response) => { response.resume(); response.on('end', () => resolve({ status: response.statusCode, header: response.headers['x-probe'] })); });
    request.on('error', reject);
    request.end();
  });
  assert.ok([404, 405, 501].includes(traceStatus.status), `TRACE answered ${traceStatus.status}`);
  assert.equal(traceStatus.header, undefined, 'TRACE echoed request headers');
});

// ---------------------------------------------------------------------------
// What actually goes out by email
// ---------------------------------------------------------------------------
test('security: email: invitations carry no raw tokens in links the owner can be tricked into, and have clean headers', async () => {
  const owner = await makeUser();
  const cookie = await loginAs(owner);
  sentMail.length = 0;
  const response = await call('POST', '/api/team/members', { cookie, body: { firstName: 'New', lastName: 'Hire', email: `hire-${Date.now()}@example.test` } });
  assert.equal(response.status, 201, response.text);
  assert.equal(sentMail.length, 1);
  const mail = sentMail[0];
  for (const field of ['from', 'subject']) assert.doesNotMatch(String(mail[field]), /[\r\n]/, `${field} contains a line break`);
  assert.equal([mail.to].flat().length, 1, 'an invitation went to more than one recipient');
  const link = mail.html.match(/href="([^"]+reset-password[^"]+)"/)?.[1];
  assert.ok(link && link.startsWith('http://localhost:5173/'), `invitation link points off-site: ${link}`);
  const token = new URL(link.replace(/&amp;/g, '&')).searchParams.get('token');
  const stored = await prisma.passwordResetToken.findFirstOrThrow({ where: { purpose: 'team_invite' }, orderBy: { createdAt: 'desc' } });
  assert.notEqual(stored.tokenHash, token, 'the raw invitation token is stored in the database');
  assert.equal(stored.tokenHash, hashToken(token));
  assert.ok(stored.expiresAt && stored.expiresAt > new Date(), 'an invitation token was issued without an expiry');
});

test('security: email: a failed invitation email leaves no half-created member behind', async () => {
  const owner = await makeUser();
  const cookie = await loginAs(owner);
  const email = `failed-invite-${Date.now()}@example.test`;
  mailMode.reject = true;
  try {
    const response = await call('POST', '/api/team/members', { cookie, body: { firstName: 'No', lastName: 'Mail', email } });
    assert.equal(response.status, 502, `expected a clear failure, got ${response.status}: ${response.text}`);
    assert.equal(await prisma.user.count({ where: { email } }), 0, 'a user was left behind');
    assert.equal(await prisma.membership.count({ where: { accountId: owner.account.id, role: 'member' } }), 0, 'a membership was left behind');
  } finally {
    mailMode.reject = false;
  }
  const retry = await call('POST', '/api/team/members', { cookie, body: { firstName: 'No', lastName: 'Mail', email } });
  assert.equal(retry.status, 201, `the owner could not simply try again (${retry.status})`);
});

test('security: email: hostile text from public forms is escaped in the owner notification and cannot forge the sender', async () => {
  const owner = await makeUser();
  const hostileBusiness = 'Evil" <attacker@evil.test>, "Bad\r\nBcc: spy@evil.test';
  await prisma.accountData.create({ data: { accountId: owner.account.id, data: { businessInfo: { name: hostileBusiness, email: owner.email } } } });
  const xss = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', '<a href="javascript:alert(1)">click</a>', "'><svg/onload=alert(1)>", '<iframe src="https://evil.example"></iframe>', '${{7*7}} {{constructor.constructor("alert(1)")()}}'];
  const addresses = (header) => [...String(header).replace(/"(?:[^"\\]|\\.)*"/g, '').matchAll(/<([^>]+)>/g)].map((match) => match[1]);

  // Public inquiry form -> email to the owner.
  const inquiryToken = generateToken();
  await prisma.inquiryLink.create({ data: { accountId: owner.account.id, tokenHash: hashToken(inquiryToken), status: 'open', expiresAt: new Date(Date.now() + 86_400_000), ownerEmail: owner.email, recipientEmail: null } });
  sentMail.length = 0;
  const submit = await call('POST', `/api/inquiry/${inquiryToken}/submit`, { body: { firstName: xss[0], lastName: xss[1], email: 'client@example.test', eventDate: '2027-05-05', eventType: xss[2], brideName: xss[3], groomName: xss[4], eventName: xss[5], venueName: xss[0], address1: xss[1], city: xss[2], details: xss.join(' ') } });
  assert.ok(submit.status < 400, `inquiry submit failed: ${submit.status} ${submit.text}`);

  // RSVP page -> email to the owner.
  const event = await prisma.event.create({ data: { id: `rsvp-event-${owner.account.id}`, accountId: owner.account.id, name: xss[1] } });
  const rsvpToken = generateToken();
  await prisma.eventRsvpLink.create({ data: { accountId: owner.account.id, eventId: event.id, tokenHash: hashToken(rsvpToken), publicToken: rsvpToken } });
  const rsvp = await call('POST', `/api/rsvp/${rsvpToken}`, { body: { name: `${xss[0]}\r\nBcc: spy@evil.test`, attending: true, partySize: 2, notes: xss[2], email: 'guest@example.test' } });
  assert.ok(rsvp.status < 400, `rsvp failed: ${rsvp.status} ${rsvp.text}`);

  assert.ok(sentMail.length >= 1, 'no notification emails were produced to inspect');
  for (const mail of sentMail) {
    const label = `${mail.subject}`.slice(0, 50);
    assert.doesNotMatch(String(mail.subject), /[\r\n]/, `subject contains a line break: ${label}`);
    assert.doesNotMatch(String(mail.from), /[\r\n]/, 'From contains a line break');
    assert.equal(addresses(mail.from).length, 1, `From has ${addresses(mail.from).length} addresses: ${mail.from}`);
    assert.doesNotMatch(addresses(mail.from)[0], /evil\.test/, `From was forged: ${mail.from}`);
    assert.equal([mail.to].flat().every((to) => !/evil\.test/.test(to)), true, 'a hostile address became a recipient');
    // Judge the real structure: escaped text such as &lt;img onerror=…&gt; is inert, a live tag is not.
    const tags = [...mail.html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)].map((match) => ({ name: match[1].toLowerCase(), attrs: match[2] }));
    const template = new Set(['html', 'head', 'meta', 'title', 'style', 'body', 'div', 'p', 'a', 'span', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'br', 'hr', 'ul', 'ol', 'li', 'center', 'img']);
    assert.deepEqual([...new Set(tags.map((tag) => tag.name).filter((name) => !template.has(name)))], [], `unexpected element in "${label}" — injected markup`);
    for (const tag of tags) {
      assert.doesNotMatch(tag.attrs, /(^|\s)on[a-z]+\s*=/i, `an event handler attribute is live in <${tag.name}> of "${label}"`);
      assert.doesNotMatch(tag.attrs, /(href|src)\s*=\s*["']?\s*(javascript|data|vbscript):/i, `a script URL is live in <${tag.name}> of "${label}"`);
    }
    assert.ok(!/<img/i.test(mail.html) || tags.filter((tag) => tag.name === 'img').every((tag) => !/evil|alert|onerror/i.test(tag.attrs)), 'an attacker-controlled image tag is live');
    assert.doesNotMatch(mail.html, /<script/i, `a raw <script> reached "${label}"`);
    assert.ok(!mail.headers || !Object.keys(mail.headers).some((name) => /bcc|cc/i.test(name)), 'a Bcc/Cc header was set from user input');
    assert.ok(!('bcc' in mail) && !('cc' in mail), 'a Bcc/Cc field was set from user input');
  }
});

test('security: values the database cannot store (NUL bytes) are a client error in text and JSON columns alike', async () => {
  const owner = await makeUser();
  const cookie = await loginAs(owner);
  const contract = await prisma.contract.create({ data: { accountId: owner.account.id, bookingId: 'nul-booking', snapshot: {}, status: 'sent', recipientEmail: 'r@example.test', ownerEmail: 'o@example.test', clientTokenHash: hashToken(generateToken()) } });
  const attempts = [
    ['POST', '/api/clients', { id: `nul-${Date.now()}`, firstName: 'a\u0000b', lastName: 'c' }], // text column
    ['POST', `/api/contracts/${contract.id}/log`, { note: 'a\u0000b' }], // JSON column
    ['POST', '/api/reminders', { note: 'a\u0000b', remindAt: new Date(Date.now() + 86_400_000).toISOString() }],
  ];
  for (const [method, path, body] of attempts) {
    const response = await call(method, path, { cookie, body });
    assert.ok(response.status >= 400 && response.status < 500, `${method} ${path} with a NUL byte -> ${response.status}`);
  }
  assert.equal(await call('GET', '/api/clients/%00', { cookie }).then((response) => response.status), 400, 'a NUL byte in a URL path was not a client error');
  assert.equal(await call('GET', '/api/clients/%ff%fe', { cookie }).then((response) => response.status), 400, 'malformed percent-encoding was not a client error');
});
