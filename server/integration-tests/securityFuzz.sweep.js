import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { camel, lockDownEnvironment, ownableModels, resetAllTables, seedTenant } from './support/bleedHarness.js';
import { buildRouteTable, pathParams } from './support/routeTable.js';

// Whole-API security sweep. Two parts, both driven by the route table:
//
//  1. Hostile-input fuzzing. Every private route receives wrong-typed values,
//     Prisma operator objects (`{ not: '' }`, `?id[contains]=…`), prototype
//     pollution keys, SQL meta-characters, NULs and oversized strings in every
//     query and body slot. It fails if a response contains another tenant's
//     data, internals (stack traces, SQL, file paths, secrets), if the other
//     tenant's rows change, or if Object.prototype is polluted. Server errors
//     (5xx) are catalogued per route.
//  2. A permission matrix. A member whose every permission is off is run against
//     every route; anything that succeeds must be on a short, justified list.
//
// Run with: npm run test:security-sweep. Wipes every table; refuses a database
// whose name does not look like a throwaway. Provider keys are blanked and
// outbound sockets blocked, as in the tenant sweep.

const databaseName = new URL(process.env.DATABASE_URL || 'postgresql://invalid/none').pathname.slice(1);
assert.match(databaseName, /test|bleed|scratch/i, `refusing to run: this sweep truncates every table, and DATABASE_URL points at "${databaseName}".`);

lockDownEnvironment();
const [{ app }, { prisma }] = await Promise.all([import('../src/index.js'), import('../src/lib/prisma.js')]);
const rawPrisma = new PrismaClient();
// The server logs every 500 with its request id and the error's class; tie them back to the probe.
const errorKinds = new Map();
const originalConsoleError = console.error;
console.error = (...args) => {
  try { const line = JSON.parse(String(args[0])); if (line?.type === 'request_error') errorKinds.set(line.requestId, `${line.error}${line.code ? `/${line.code}` : ''}`); } catch { /* not a log line */ }
  originalConsoleError(...args);
};
const PROTOTYPE_BASELINE = Object.getOwnPropertyNames(Object.prototype).sort().join(',');

let server;
let baseUrl;
let counter = 0;
before(async () => {
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rawPrisma.$disconnect();
  await prisma.$disconnect();
});

const nextIp = () => { counter += 1; return `10.${100 + ((counter >> 16) & 100)}.${(counter >> 8) & 255}.${counter & 255}`; };
const jsonOf = (value) => { try { return JSON.stringify(value) ?? ''; } catch { return ''; } };

async function send(method, path, { cookie, json, raw, query } = {}) {
  const headers = { 'x-forwarded-for': nextIp() };
  if (cookie) headers.cookie = cookie;
  let body;
  if (raw !== undefined) { headers['content-type'] = 'application/json'; body = raw; }
  else if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  const url = `${baseUrl}${path}${query ? `?${query}` : ''}`;
  try {
    const response = await fetch(url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    const text = await response.text();
    return { status: response.status, text, requestId: response.headers.get('x-request-id'), requestText: `${url} ${raw ?? jsonOf(json) ?? ''}`, cookies: (response.headers.getSetCookie?.() || []).map((value) => value.split(';', 1)[0]).join('; ') };
  } catch (error) {
    return { status: 0, text: String(error), requestText: url, cookies: '' };
  }
}

async function loginAs(email, password) {
  const response = await send('POST', '/api/auth/login', { json: { email, password } });
  assert.equal(response.status, 200, `login failed for ${email}: ${response.text}`);
  return response.cookies;
}

const singular = (word) => word.replace(/ies$/, 'y').replace(/s$/, '');
function idFor(tenant, paramName, previousSegment) {
  const hints = [paramName.endsWith('Id') ? paramName.slice(0, -2).toLowerCase() : null, singular((previousSegment || '').replace(/-/g, '').toLowerCase())].filter(Boolean);
  const models = ownableModels().map((model) => model.name);
  for (const hint of hints) {
    const exact = models.find((name) => name.toLowerCase() === hint);
    const partial = models.find((name) => name.toLowerCase().endsWith(hint) || name.toLowerCase().includes(hint));
    const found = tenant.ids.get(exact || partial);
    if (found) return found;
  }
  if (/number$|index$|revision/i.test(paramName)) return '1';
  return tenant.ids.get('Client');
}

// ---- hostile values ---------------------------------------------------------
const INTERNALS = [
  [/\bat\s+[\w.$<>[\] ]+\s+\((?:\/|file:|node:)[^)\n]*:\d+:\d+\)/, 'stack trace'],
  [/PrismaClient|Invalid `prisma|\bP20\d\d\b|PostgresError|ConnectorError|prisma\.\w+\.(find|create|update|delete)/, 'ORM error'],
  [/\b(SELECT|INSERT INTO|UPDATE "|DELETE FROM)\b.*\b(FROM|VALUES|SET)\b|syntax error at or near|relation "\w+" does not exist/i, 'SQL'],
  [/node_modules|\/Users\/|\/home\/\w+|\/app\/src|server\/src\//, 'file path'],
  [/SESSION_SECRET|sk_(live|test)_[A-Za-z0-9]{6,}|whsec_[A-Za-z0-9+/=]{8,}|re_[A-Za-z0-9]{20,}|postgres(ql)?:\/\//, 'secret'],
];

const BODY_PAYLOADS = [
  ['operator-not', { not: '' }], ['operator-contains', { contains: 'BLEED-A' }], ['operator-in', { in: ['BLEED-A-Client', 'BLEED-A-Booking'] }], ['operator-gt', { gt: '' }],
  ['mongo-ne', { $ne: null }], ['array', ['a', 'b']], ['empty-array', []], ['number', 123456789], ['negative', -1], ['float', 1e308], ['true', true], ['null', null],
  ['empty', ''], ['sql', "' OR '1'='1'; DROP TABLE \"User\";--"], ['nul', 'a\u0000b'], ['long', 'A'.repeat(120_000)], ['nested', JSON.parse(`${'{"a":'.repeat(40)}1${'}'.repeat(40)}`)],
  ['unicode', '‮😀﻿'], ['traversal', '../../../../etc/passwd'], ['template', '${7*7}{{7*7}}<%= 7*7 %>'],
];
const QUERY_PAYLOADS = (key) => [
  `${key}[not]=zzz`, `${key}[contains]=BLEED-A`, `${key}[startsWith]=BLEED`, `${key}[gt]=`, `${key}[in][]=BLEED-A-Client&${key}[in][]=BLEED-A-Booking`, `${key}[equals]=BLEED-A-Client`,
  `${key}[]=a&${key}[]=b`, `${key}=%27%20OR%201%3D1--`, `${key}=%00`, `${key}=${'a'.repeat(4000)}`, `${key}[__proto__][polluted]=1`,
  `${key}[constructor][prototype][polluted]=1`, `${key}=${'9'.repeat(40)}`,
];
const QUERY_KEYS = ['id', 'search', 'status', 'eventId', 'clientId', 'bookingId', 'cursor', 'sort', 'limit', 'pageSize', 'accountId', 'email'];
const BODY_KEYS = ['id', 'name', 'firstName', 'email', 'note', 'status', 'amount', 'type', 'items', 'eventId', 'bookingId', 'clientId', 'contractorId', 'accountId', 'permissions', 'scene', 'data', 'snapshot', 'body', 'subject', 'recipientEmail', 'filename', 'storageKey', 'lineItems'];

// The one place an actor-owned test row is addressed: B's own ids, so requests reach the handler.
function pathFor(route, tenant) {
  const segments = route.path.split('/');
  return route.path.replace(/:(\w+)/g, (_m, name) => encodeURIComponent(idFor(tenant, name, segments[segments.indexOf(`:${name}`) - 1])));
}

async function snapshot(tenant) {
  const rows = new Map();
  for (const model of ownableModels()) {
    for (const row of await rawPrisma[camel(model.name)].findMany().catch(() => [])) {
      const text = jsonOf(row);
      if (new RegExp(`BLEED[-_ ]?${tenant.label}`, 'i').test(text)) rows.set(`${model.name}:${row[model.fields.find((field) => field.isId).name]}`, text);
    }
  }
  return rows;
}

const EXCLUDED = (route) => (route.path.startsWith('/api/auth') && route.method !== 'GET') || route.path.startsWith('/api/webhooks');

for (const vertical of ['band_orchestra', 'party_planning']) {
  test(`security fuzz sweep (${vertical} accounts)`, { timeout: 25 * 60_000 }, async () => {
    await resetAllTables(prisma);
    const tenantA = await seedTenant(rawPrisma, 'A', vertical);
    const tenantB = await seedTenant(rawPrisma, 'B', vertical);
    const cookieB = await loginAs(tenantB.user.email, tenantB.password);

    const findings = [];
    const note = (type, detail) => findings.push({ type, ...detail });
    const serverErrors = new Map(); // route -> { count, sample }
    let probes = 0;

    const routes = buildRouteTable().filter((route) => !EXCLUDED(route));
    const onlyNewForVertical = (route) => vertical === 'band_orchestra' || /^\/api\/(guests|floor-plans)/.test(route.path);
    const unauth = [];
    const publicRoutes = [];
    for (const route of routes.filter(onlyNewForVertical)) {
      const response = await send(route.method, pathFor(route, tenantA), { json: route.method === 'GET' ? undefined : {} });
      (response.status === 401 ? unauth : publicRoutes).push(route);
    }
    const before = await snapshot(tenantA);

    async function probe(route, request, label) {
      const response = await send(route.method, request.path, { cookie: cookieB, json: request.json, raw: request.raw, query: request.query });
      probes += 1;
      if (response.status >= 500 || response.status === 0) {
        const kind = errorKinds.get(response.requestId) || 'unlogged';
        const entry = serverErrors.get(`${route.method} ${route.path}`) || { count: 0, sample: label, kinds: {} };
        entry.count += 1;
        entry.kinds[kind] = (entry.kinds[kind] || 0) + 1;
        if (!entry.samples) entry.samples = {};
        entry.samples[kind] ||= label;
        serverErrors.set(`${route.method} ${route.path}`, entry);
      }
      const leaked = [...new Set(response.text.match(/BLEED[-_]A[-\w]*/gi) || [])].filter((token) => !response.requestText.toLowerCase().includes(token.toLowerCase()));
      if (leaked.length && response.status < 500) note('another tenant’s data in a response', { route: `${route.method} ${route.path}`, probe: label, samples: leaked.slice(0, 3) });
      for (const [pattern, kind] of INTERNALS) {
        if (pattern.test(response.text)) { note(`response exposes ${kind}`, { route: `${route.method} ${route.path}`, probe: label, status: response.status, excerpt: response.text.slice(0, 160) }); break; }
      }
      return response;
    }

    for (const route of unauth.filter(onlyNewForVertical)) {
      const path = pathFor(route, tenantB);
      const writing = route.method !== 'GET' && route.method !== 'DELETE';
      // Query-slot payloads.
      const keys = route.method === 'GET' && !pathParams(route.path).length ? QUERY_KEYS : QUERY_KEYS.slice(0, 7);
      for (const key of keys) for (const query of QUERY_PAYLOADS(key)) await probe(route, { path, query }, `?${query.slice(0, 60)}`);
      // Body-slot payloads, one key at a time.
      if (writing) {
        for (const key of BODY_KEYS) {
          for (const [name, value] of BODY_PAYLOADS) await probe(route, { path, json: { [key]: value } }, `{${key}: ${name}}`);
          await probe(route, { path, raw: `{"${key}":{"__proto__":{"polluted":true}},"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}` }, `{${key}: __proto__}`);
        }
        for (const raw of ['null', '[]', '"string"', '123', '{', '{"a":', '\u0000', '[[[[[[[[[[[[[[[[[[[[']) await probe(route, { path, raw }, `body ${raw.slice(0, 20)}`);
      }
      // Path-slot payloads.
      if (pathParams(route.path).length) {
        for (const value of ['%00', '..%2f..%2fetc%2fpasswd', 'a'.repeat(3000), '%ff%fe', '%27%20OR%201%3D1--', '__proto__', 'constructor', '{}', 'null', 'undefined', '-1', '9'.repeat(30)]) {
          await probe(route, { path: route.path.replace(/:\w+/g, value), json: writing ? {} : undefined }, `path ${value.slice(0, 30)}`);
        }
      }
    }


    // Did the authenticated fuzzing touch the other tenant, or the shared prototype?
    const after = await snapshot(tenantA);
    for (const [key, text] of before) {
      if (!after.has(key)) note('a tenant A row was deleted by hostile input', { row: key });
      else if (after.get(key) !== text) note('a tenant A row was changed by hostile input', { row: key });
    }
    if (Object.getOwnPropertyNames(Object.prototype).sort().join(',') !== PROTOTYPE_BASELINE || ({}).polluted !== undefined) note('Object.prototype was polluted', {});
    for (const stray of ['polluted', 'isAdmin', 'admin']) if (stray in {}) note(`Object.prototype gained "${stray}"`, {});


    const beforePublic = await snapshot(tenantB);
    // ---- Public routes: anyone on the internet can send these, so a crash here is reachable without an account.
    const tokenSources = [
      ['/api/inquiry/', 'InquiryLink.tokenHash'], ['/api/rsvp/', 'EventRsvpLink.tokenHash'], ['/api/prep-request/', 'EventPrepFormLink.tokenHash'],
      ['/api/contractor-calendar/', 'ContractorCalendarLink.tokenHash'], ['/api/public/stage-plots/', 'StagePlotShare.tokenHash'],
      ['/api/public/run-of-show/', 'RunOfShowShare.tokenHash'], ['/api/contract-sign/', 'Contract.clientTokenHash'],
      ['/api/proposal-respond/', 'ProposalResponse.tokenHash'], ['/api/invoice-pay/', 'Invoice.payTokenHash'],
    ];
    const PUBLIC_BODY_KEYS = ['firstName', 'lastName', 'email', 'name', 'attending', 'partySize', 'notes', 'action', 'note', 'signatureName', 'signatureImage', 'consentAccepted', 'eventDate', 'details', 'certified', 'selectedClientId', 'message', 'subject', 'phone', 'items', 'submitterName', 'token'];
    const PUBLIC_QUERY_KEYS = ['token', 'uid', 'summary', 'start', 'end', 'attendeeEmail', 'attendeeName', 'location', 'description', 'sequence', 'email', 'q'];
    let publicProbes = 0;
    for (const route of publicRoutes.filter((entry) => !entry.path.startsWith('/api/webhooks') && !entry.path.startsWith('/api/auth'))) {
      const hit = tokenSources.find(([prefix]) => route.path.startsWith(prefix));
      const segments = route.path.split('/');
      const path = route.path.replace(/:(\w+)/g, (_m, name) => encodeURIComponent(name === 'token' ? (hit ? tenantA.tokens.get(hit[1]) : 'tok-none') : idFor(tenantB, name, segments[segments.indexOf(`:${name}`) - 1])));
      const writing = route.method !== 'GET' && route.method !== 'DELETE';
      const send1 = async (request, label) => {
        const response = await send(route.method, request.path, { json: request.json, raw: request.raw, query: request.query });
        publicProbes += 1; probes += 1;
        if (response.status >= 500 || response.status === 0) {
          const kind = errorKinds.get(response.requestId) || 'unlogged';
          const entry = serverErrors.get(`PUBLIC ${route.method} ${route.path}`) || { count: 0, sample: label, kinds: {}, samples: {} };
          entry.count += 1; entry.kinds[kind] = (entry.kinds[kind] || 0) + 1; entry.samples[kind] ||= label;
          serverErrors.set(`PUBLIC ${route.method} ${route.path}`, entry);
        }
        for (const [pattern, kind] of INTERNALS) if (pattern.test(response.text)) { note(`public response exposes ${kind}`, { route: `${route.method} ${route.path}`, probe: label, status: response.status, excerpt: response.text.slice(0, 160) }); break; }
        const leaked = [...new Set(response.text.match(/BLEED[-_]B[-\w]*/gi) || [])].filter((token) => !response.requestText.toLowerCase().includes(token.toLowerCase()));
        if (leaked.length && response.status < 500) note('a public response contains another tenant’s data', { route: `${route.method} ${route.path}`, probe: label, samples: leaked.slice(0, 3) });
      };
      for (const key of PUBLIC_QUERY_KEYS) for (const query of QUERY_PAYLOADS(key)) await send1({ path, query }, `?${query.slice(0, 50)}`);
      if (writing) {
        for (const key of PUBLIC_BODY_KEYS) {
          for (const [name, value] of BODY_PAYLOADS) await send1({ path, json: { [key]: value } }, `{${key}: ${name}}`);
          await send1({ path, raw: `{"${key}":1,"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}` }, `{${key}: __proto__}`);
        }
        for (const raw of ['null', '[]', '"string"', '123', '{', '\u0000']) await send1({ path, raw }, `body ${raw.slice(0, 12)}`);
      }
    }

    const afterPublic = await snapshot(tenantB);
    for (const [key, text] of beforePublic) {
      if (!afterPublic.has(key)) note('a tenant B row was deleted by an anonymous caller', { row: key });
      else if (afterPublic.get(key) !== text) note('a tenant B row was changed by an anonymous caller', { row: key });
    }
    if (Object.getOwnPropertyNames(Object.prototype).sort().join(',') !== PROTOTYPE_BASELINE || ({}).polluted !== undefined) note('Object.prototype was polluted by a public request', {});

    // Hostile input must be answered with a 4xx. Provider/timeouts are not the caller's doing and are ignored;
    // everything that reached application code and failed is a finding unless explained below.
    const INPUT_CAUSED = /^(TypeError|RangeError|ReferenceError|SyntaxError|URIError|PrismaClient(Validation|KnownRequest|UnknownRequest)Error)/;
    const EXPLAINED = new Map([
      ['POST /api/stage-plots/:eventId/share', 'the seeded revision has a snapshot shape no real record has'],
      ['POST /api/stage-plots/:eventId/share/publish', 'the seeded revision has a snapshot shape no real record has'],
    ]);
    for (const [route, entry] of serverErrors) {
      const kinds = Object.keys(entry.kinds || {}).filter((kind) => INPUT_CAUSED.test(kind));
      if (kinds.length && !EXPLAINED.has(route)) note('hostile input caused a server error', { route, kinds: Object.fromEntries(kinds.map((kind) => [kind, entry.kinds[kind]])), example: kinds.map((kind) => entry.samples?.[kind]).filter(Boolean)[0] });
    }

    const summary = {
      vertical, probes, privateRoutes: unauth.length, publicRoutesProbed: publicRoutes.length,
      serverErrors: Object.fromEntries([...serverErrors].sort((a, b) => b[1].count - a[1].count)),
      findings: findings.slice(0, 200),
    };
    if (process.env.FUZZ_REPORT_PATH) writeFileSync(process.env.FUZZ_REPORT_PATH.replace('.json', `-${vertical}.json`), JSON.stringify(summary, null, 2));
    console.log(`FUZZ SUMMARY ${vertical}: ${unauth.length} private routes, ${probes} probes, ${serverErrors.size} routes returned 5xx, ${findings.length} finding(s)`);
    assert.equal(findings.length, 0, `security findings:\n${JSON.stringify(findings.slice(0, 15), null, 2)}`);
  });
}

// ---- permission matrix -------------------------------------------------------
// Routes a member with every permission switched off may legitimately use: they
// act on the member's own session, or are read-only context every member needs.
const MEMBER_MAY_WRITE = new Set([
  'PUT /api/assistant/training/:guideId', // own training progress
  'POST /api/assistant/ask', 'POST /api/assistant/draft-proposal', 'POST /api/assistant/confirm-action', // each tool re-checks the member's own permission
  'POST /api/support/threads', 'POST /api/support/threads/:id/messages', 'PATCH /api/support/threads/:id/rating', // a member can ask for help
  'POST /api/portal/logout',
  'POST /api/landing/waitlist', // a public form; it appears here only because it answers anyone
  'PATCH /api/email/threads/:threadId/read', // marks a thread read for whoever opened it
  // Reminders are shared team to-dos with no permission behind them. Whether any member should be able to edit or
  // delete another person's reminder is a product decision, recorded in the security report rather than asserted here.
  'PATCH /api/reminders/:id', 'PATCH /api/reminders/:id/complete', 'DELETE /api/reminders/:id',
  'DELETE /api/assistant/messages', // clears the assistant chat history
]);
const MEMBER_MAY_CHANGE = /^(Reminder|AssistantMessage|EmailThread|EmailMessage|AssistantAction|AssistantProposal|AssistantTrainingProgress):/;

test('permission matrix: a member with every permission off can read little and change nothing', { timeout: 10 * 60_000 }, async () => {
  await resetAllTables(prisma);
  const owner = await seedTenant(rawPrisma, 'B', 'band_orchestra');
  const other = await seedTenant(rawPrisma, 'A', 'band_orchestra');
  const memberUser = await rawPrisma.user.create({ data: { firstName: 'No', lastName: 'Permissions', email: 'no-permissions@example.test', passwordHash: await bcrypt.hash('member-password-1', 4) } });
  await rawPrisma.membership.create({ data: { userId: memberUser.id, accountId: owner.account.id, role: 'member', permissions: {} } });
  const cookie = await loginAs('no-permissions@example.test', 'member-password-1');
  const before = await snapshot(owner);

  const succeededWrites = [];
  const succeededReads = [];
  const routes = buildRouteTable().filter((route) => !EXCLUDED(route) && !route.path.startsWith('/api/portal'));
  for (const route of routes) {
    const path = pathFor(route, owner);
    const writing = route.method !== 'GET';
    const bodies = writing ? [{}, { id: `m-${counter}`, name: 'x', firstName: 'x', lastName: 'x', email: 'x@example.test', note: 'x', amount: 1, category: 'other_expense', description: 'x', type: 'general', subject: 'x', body: 'x', status: 'confirmed', source: 'x', item: 'x', recipientEmail: 'x@example.test', snapshot: { client: {}, booking: {} } }] : [undefined];
    for (const json of bodies) {
      const response = await send(route.method, path, { cookie, json });
      if (response.status === 401) break; // not a private route
      if (response.status >= 200 && response.status < 300) (writing ? succeededWrites : succeededReads).push(`${route.method} ${route.path} -> ${response.status}`);
    }
  }
  const unexpectedWrites = succeededWrites.filter((entry) => !MEMBER_MAY_WRITE.has(entry.replace(/ -> \d+$/, '')));
  const after = await snapshot(owner);
  const changed = [...before].filter(([key, text]) => after.get(key) !== text).map(([key]) => key).filter((key) => !MEMBER_MAY_CHANGE.test(key));
  if (process.env.FUZZ_REPORT_PATH) writeFileSync(process.env.FUZZ_REPORT_PATH.replace('.json', '-permissions.json'), JSON.stringify({ succeededWrites, succeededReads, changed, other: other.account.id }, null, 2));
  console.log(`PERMISSION MATRIX: ${succeededWrites.length} writes and ${succeededReads.length} reads succeeded for a member with no permissions; ${unexpectedWrites.length} writes unexpected`);
  assert.deepEqual(unexpectedWrites, [], 'a member with every permission off changed data');
  assert.deepEqual(changed, [], 'a member with every permission off changed or deleted the account’s rows');
});
