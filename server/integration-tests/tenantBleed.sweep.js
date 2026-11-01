import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import {
  MARK, blockedConnections, camel, current, lockDownEnvironment, ownableModels, resetAllTables, seedPoison, seedTenant, seedVictimClient,
} from './support/bleedHarness.js';
import { buildRouteTable, pathParams } from './support/routeTable.js';

// Tenant and data-bleed sweep for the whole API.
// Run with: npm run test:tenant-bleed (about six minutes; one pass per vertical).
//
// Two tenants (A and B) are seeded with a marker-tagged row in every
// tenant-owned model. B then sends every private route a request that
// carries A's real ids in every path, query and body slot, and the run
// fails if:
//   * a response to B contains any of A's data,
//   * a database write issued while serving B touches A's rows, or stores a
//     reference to one,
//   * A's rows are different afterwards, or B's rows reference A.
// Provider keys are blanked and non-loopback sockets are blocked, so nothing
// here can send mail/SMS or call a payment, AI, domain or storage provider.

// The sweep wipes every table between passes, so it only ever runs against a
// throwaway database (the name must say so).
const databaseName = new URL(process.env.DATABASE_URL || 'postgresql://invalid/none').pathname.slice(1);
assert.match(databaseName, /test|bleed|scratch/i, `refusing to run: this sweep truncates every table, and DATABASE_URL points at "${databaseName}". Use a database whose name contains "test".`);

lockDownEnvironment();

const [{ app }, { prisma }, { VERTICALS }] = await Promise.all([
  import('../src/index.js'),
  import('../src/lib/prisma.js'),
  import('../src/lib/verticals.js'),
]);

const rawPrisma = new PrismaClient(); // no middleware: used for read-only inspection
const WRITE_ACTIONS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
// Free-form snapshot fields that carry an id the server never resolves (the UI
// matches them against its own account-scoped lists, and an unmatched id is
// ignored). A foreign id there is inert, so it is not a bleed. Anything not
// listed here is held to the strict rule. Revisit if a server route ever starts
// loading a row from one of these ids.
const OPAQUE_FIELDS = new Set(['Booking.venue', 'Event.venue', 'Offering.lineItems', 'AccountActivity.metadata']); // metadata: the audit log echoes the filters a caller sent
const echoAllowed = new Set(); // victim ids the actor legitimately stored through an exempt field
const patternOf = (label) => new RegExp(`BLEED[-_ ]?${label}`, 'i');
function mentions(model, row, pattern) {
  return Object.entries(row ?? {}).some(([field, value]) => !OPAQUE_FIELDS.has(`${model}.${field}`) && pattern.test(jsonOf(value)));
}
function rememberExempt(model, row) {
  for (const [field, value] of Object.entries(row ?? {})) {
    if (OPAQUE_FIELDS.has(`${model}.${field}`)) for (const token of jsonOf(value).match(/BLEED[-_][AB][-\w]*/gi) || []) echoAllowed.add(token.toLowerCase());
  }
}
const violations = [];
const jsonOf = (value) => { try { return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? String(v) : v)) ?? ''; } catch { return ''; } };
const probeLabel = () => (current.probe ? `${current.probe.method} ${current.probe.path}` : 'setup');

function record(type, detail) {
  violations.push({ type, probe: probeLabel(), ...detail });
}

// While a probe is in flight, every database write issued on its behalf is
// inspected: it must not store a reference to the victim tenant and must not
// touch a row the victim owns. (A rejected write stores nothing, so only a
// write that actually succeeded counts.)
prisma.$use(async (params, next) => {
  const probe = current.probe;
  if (!probe || !probe.watch) return next(params);
  const victim = probe.victim || 'A';
  const pattern = patternOf(victim);
  const { model, action, args } = params;
  if (pattern.test(jsonOf(args))) probe.reachedDatabaseWithA = true;

  if (!WRITE_ACTIONS.has(action)) return next(params);
  const written = jsonOf([args?.data, args?.create, args?.update]);
  const rows = [args?.data, args?.create, args?.update].flatMap((entry) => (Array.isArray(entry) ? entry : [entry])).filter(Boolean);
  const storesVictim = rows.some((row) => mentions(model, row, pattern));
  rows.forEach((row) => rememberExempt(model, row));

  let preRows = [];
  if (args?.where && ['update', 'delete', 'upsert'].includes(action)) {
    const row = await rawPrisma[camel(model)].findUnique({ where: args.where }).catch(() => null);
    preRows = row ? [row] : [];
  } else if (args?.where && ['updateMany', 'deleteMany'].includes(action)) {
    preRows = await rawPrisma[camel(model)].findMany({ where: args.where, take: 5 }).catch(() => []);
  }
  // A row belongs to the victim by owner, not by content: the actor's own row can
  // legitimately end up *mentioning* the victim after a hijacked reference, which
  // is reported separately.
  const touchesVictim = preRows.some((row) => pattern.test(row.accountId ? String(row.accountId) : String(row.id ?? '')));
  const result = await next(params);
  if (storesVictim) record(`write stores a reference to tenant ${victim}`, { model, action, data: written.slice(0, 200) });
  if (touchesVictim && (typeof result === 'object' ? (result?.count ?? 1) > 0 : true)) {
    record(`write modified a tenant ${victim} row`, { model, action, where: jsonOf(args.where).slice(0, 200) });
  }
  return result;
});

let server;
let baseUrl;
let addressCounter = 0;
before(async () => {
  server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rawPrisma.$disconnect();
  await prisma.$disconnect();
});

// Each request comes from its own address (the app trusts one proxy hop), so
// per-IP rate limiters never turn a probe into a 429 before it reaches the route.
function nextAddress() {
  addressCounter += 1;
  return `10.${(addressCounter >> 16) & 255}.${(addressCounter >> 8) & 255}.${addressCounter & 255}`;
}

async function send(method, path, { cookie, body, query, form } = {}) {
  const headers = { 'x-forwarded-for': nextAddress() };
  if (cookie) headers.cookie = cookie;
  let payload;
  if (form) {
    payload = new FormData();
    for (const [key, value] of Object.entries(form)) payload.append(key, String(value));
    const csrf = cookie?.split('; ').find((part) => part.startsWith('csrf_token='))?.slice('csrf_token='.length);
    if (csrf) headers['x-csrf-token'] = decodeURIComponent(csrf);
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const url = `${baseUrl}${path}${query ? `?${new URLSearchParams(query)}` : ''}`;
  const requestText = `${url} ${form ? JSON.stringify(form) : body === undefined ? '' : JSON.stringify(body)}`;
  try {
    const response = await fetch(url, { method, headers, body: payload, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    const text = await response.text();
    return { status: response.status, text, cookies: response.headers.getSetCookie?.() || [], requestText };
  } catch (error) {
    return { status: 0, text: String(error), cookies: [], requestText };
  }
}

async function loginAs(tenant) {
  const response = await send('POST', '/api/auth/login', { body: { email: tenant.user.email, password: tenant.password } });
  assert.equal(response.status, 200, `login for ${tenant.label} failed: ${response.text}`);
  return response.cookies.map((value) => value.split(';', 1)[0]).join('; ');
}

const singular = (word) => word.replace(/ies$/, 'y').replace(/s$/, '');

function buildCandidates(tenantA, paramName, previousSegment) {
  const aIds = tenantA.ids;
  const pool = [...new Set(aIds.values())];
  const modelsByLower = ownableModels().map((model) => ({ name: model.name, lower: model.name.toLowerCase() }));
  const idFor = (name) => aIds.get(name);
  if (/number$|index$|revision/i.test(paramName)) return ['1'];
  if (/^domain$/i.test(paramName)) return ['example.test'];
  if (/^(token|key|slug|code)$/i.test(paramName)) return [`${MARK.A}-token`];
  const stem = paramName.endsWith('Id') ? paramName.slice(0, -2).toLowerCase() : null;
  const hints = [stem, singular((previousSegment || '').replace(/-/g, '').toLowerCase())].filter(Boolean);
  const found = [];
  for (const hint of hints) {
    for (const model of modelsByLower) {
      if (model.lower === hint) found.unshift(idFor(model.name));
      else if (model.lower.endsWith(hint) || model.lower.includes(hint)) found.push(idFor(model.name));
    }
  }
  const unique = [...new Set(found.filter(Boolean))].slice(0, 6);
  return unique.length ? unique : pool.slice(0, 40);
}

// Valid request shapes for routes the generic body cannot get past validation,
// so their ownership logic is actually reached. Each entry is a list of bodies,
// every one carrying a foreign reference.
const MULTIPART = new Set(['POST /api/inbox/:id/reply', 'POST /api/support/threads', 'POST /api/support/threads/:id/messages']);
function specialBodies(A) {
  const id = (model) => A.ids.get(model);
  const later = new Date(Date.now() + 86_400_000).toISOString();
  const doc = { recipientEmail: 'probe@example.test', recipientName: 'Probe', snapshot: { client: { firstName: 'Probe' }, booking: { eventName: 'Probe' }, lineItems: [] } };
  const expense = { amount: 1, category: 'other_expense', description: 'Probe', occurredAt: '2026-01-01' };
  return {
    'POST /api/contracts': [{ ...doc, bookingId: id('Booking'), terms: 'Probe' }, { ...doc, bookingId: id('Booking'), previousContractId: id('Contract') }],
    'POST /api/invoices': [{ ...doc, bookingId: id('Booking'), number: 1 }],
    'POST /api/proposal-responses': [{ ...doc, bookingId: id('Booking') }],
    'POST /api/contracts/:id/owner-sign': [{ signatureName: 'Probe', signatureImage: 'data:image/png;base64,AAAA', consentAccepted: true }],
    'POST /api/contracts/:id/log': [{ note: 'Probe' }],
    'POST /api/email/threads/send': [{ eventId: id('Event'), contractorId: id('Contractor'), subject: 'Probe', body: 'Probe' }],
    'POST /api/email/threads/log': [{ eventId: id('Event'), contractorId: id('Contractor'), channel: 'phone', note: 'Probe' }],
    'POST /api/messaging/send': [{ eventId: id('Event'), contractorId: id('Contractor'), body: 'Probe' }],
    'PATCH /api/messaging/contractors/:contractorId/consent': [{ status: 'opted_in' }],
    'POST /api/contractors/bulk-email': [{ contractorIds: [id('Contractor')], subject: 'Probe', body: 'Probe' }],
    'POST /api/reminders': ['booking', 'event', 'client', 'contractor'].map((type) => ({ relatedType: type, relatedId: id(type[0].toUpperCase() + type.slice(1)), relatedName: 'Probe', note: 'Probe', remindAt: later })),
    'POST /api/financials/expenses': [{ bookingId: id('Booking') }, { eventId: id('Event') }, { contractorId: id('Contractor') }, { groupId: id('AgencyGroup') }].map((extra) => ({ ...expense, ...extra })),
    'POST /api/financials/export-events': ['receivables', 'payables'].map((report) => ({ format: 'csv', report, filters: { groupId: id('AgencyGroup'), from: '2020-01-01', to: '2035-01-01' } })),
    'POST /api/offerings': [{ id: id('Offering'), name: 'Probe', type: 'general' }, { id: 'probe-offering', name: 'Probe', type: 'package', lineItems: [{ offeringId: id('Offering'), quantity: 1 }] }],
    'POST /api/catalog/sync': [{ offerings: [{ id: id('Offering'), name: 'Probe', type: 'general' }], contractorGroups: [{ id: id('ContractorGroup'), name: 'Probe', contractorIds: [id('Contractor')] }] }],
    'POST /api/set-list-library/sync': [{ setListLibrary: [{ id: id('SetListLibraryItem'), name: 'Probe', songs: [] }] }],
    'POST /api/run-of-show-library/sync': [{ runOfShowLibrary: [{ id: id('RunOfShowLibraryItem'), name: 'Probe', items: [] }] }],
    'POST /api/assistant/confirm-action': [{ proposalId: id('AssistantProposal') }],
    'POST /api/assistant/draft-proposal': [{ bookingId: id('Booking'), inquiryText: 'Probe' }],
    'POST /api/stage-plots/:eventId/ai-items/confirm': [{ items: [{ listType: 'channel', source: 'Probe' }] }],
    'POST /api/inbox/:id/reply': [{ body: 'Probe' }],
    'POST /api/support/threads': [{ subject: 'Probe', body: 'Probe' }],
    'POST /api/support/threads/:id/messages': [{ body: 'Probe' }],
  };
}

function* combos(lists, cap = 12) {
  const indices = lists.map(() => 0);
  let produced = 0;
  while (produced < cap) {
    yield indices.map((index, position) => lists[position][index]);
    produced += 1;
    let position = lists.length - 1;
    while (position >= 0) {
      indices[position] += 1;
      if (indices[position] < lists[position].length) break;
      indices[position] = 0;
      position -= 1;
    }
    if (position < 0) return;
  }
}

// `id` is the id of the row in the route's OWN collection (so a create that
// reuses A's primary key, or an upsert keyed on it, is actually attempted).
function injected(tenantA, route) {
  const idFields = {};
  for (const [model, id] of tenantA.ids) idFields[`${camel(model)}Id`] = id;
  const collection = route.path.split('/')[2];
  const own = buildCandidates(tenantA, 'id', collection)[0];
  return { ...idFields, id: own, accountId: tenantA.account.id, userId: tenantA.user.id };
}


// One body per foreign reference, so a validation that rejects one reference
// cannot hide an unchecked one behind it.
function singleReferenceBodies(tenantA, idsForBody) {
  const base = { name: 'Probe', firstName: 'Probe', lastName: 'Probe', email: 'probe@example.test', title: 'Probe', notes: 'Probe', status: 'confirmed', amount: 1, quantity: 1, source: 'Probe', item: 'Probe', id: idsForBody.id };
  const references = {
    ...Object.fromEntries(Object.entries(idsForBody).filter(([key]) => key !== 'id' && key !== 'accountId')),
    accountId: tenantA.account.id,
    contractorBookings: [{ id: 'probe-cb', contractorId: tenantA.ids.get('Contractor'), contractorName: 'Probe' }],
    contractorIds: [tenantA.ids.get('Contractor')],
    clientIds: [tenantA.ids.get('Client')],
    recipients: [tenantA.ids.get('Client'), tenantA.ids.get('Contractor')],
    venue: { id: tenantA.ids.get('Venue'), name: 'Probe' },
    lineItems: [{ id: 'probe-li', offeringId: tenantA.ids.get('Offering'), name: 'Probe', amount: 1 }],
    setLists: [{ id: 'probe-sl', libraryId: tenantA.ids.get('SetListLibraryItem'), name: 'Probe' }],
  };
  return Object.entries(references).map(([key, value]) => ({ ...base, [key]: value }));
}

async function snapshotTenant(tenant) {
  const pattern = patternOf(tenant.label);
  const rows = new Map();
  const counts = {};
  for (const model of ownableModels()) {
    const delegate = rawPrisma[camel(model.name)];
    const all = await delegate.findMany().catch(() => []);
    counts[model.name] = 0;
    for (const row of all) {
      if (String(row.id).startsWith('POISON-')) continue; // A's own seeded documents; public actions legitimately change them
      const text = jsonOf(row);
      if (pattern.test(text)) rows.set(`${model.name}:${row[model.fields.find((field) => field.isId).name]}`, text);
      if (row.accountId === tenant.account.id) counts[model.name] += 1;
    }
  }
  return { rows, counts };
}

// After a pass: the victim's rows are exactly as they were, and nothing the
// actor owns (or anything anywhere) mixes the two tenants' data.
async function finalChecks(victim, actor, before) {
  const pattern = patternOf(victim.label);
  const actorPattern = patternOf(actor.label);
  const after = await snapshotTenant(victim);
  for (const [key, text] of before.rows) {
    if (!after.rows.has(key)) record(`tenant ${victim.label} row was deleted`, { row: key });
    else if (after.rows.get(key) !== text) record(`tenant ${victim.label} row was changed`, { row: key });
  }
  for (const [model, count] of Object.entries(before.counts)) {
    if (after.counts[model] !== count) record(`rows were added to or removed from tenant ${victim.label}`, { model, before: count, after: after.counts[model] });
  }
  for (const model of ownableModels()) {
    const rows = await rawPrisma[camel(model.name)].findMany().catch(() => []);
    for (const row of rows) {
      const text = jsonOf(row);
      if (String(row.id).startsWith('POISON-')) continue; // seeded on purpose to point at the other tenant
      if (row.accountId === actor.account.id && mentions(model.name, row, pattern)) record(`a tenant ${actor.label} row references tenant ${victim.label}`, { model: model.name, row: text.slice(0, 200) });
      if (mentions(model.name, row, pattern) && mentions(model.name, row, actorPattern)) record('a row mixes tenant A and tenant B data', { model: model.name, row: text.slice(0, 200) });
    }
  }
}

const EXCLUDED = (route) => route.path.startsWith('/api/auth') && route.method !== 'GET';

for (const vertical of VERTICALS) {
  test(`tenant bleed sweep (${vertical} accounts)`, { timeout: 15 * 60_000 }, async () => {
    violations.length = 0;
    echoAllowed.clear();
    blockedConnections.length = 0;
    await resetAllTables(prisma);
    const tenantA = await seedTenant(rawPrisma, 'A', vertical);
    const tenantB = await seedTenant(rawPrisma, 'B', vertical);
    await seedVictimClient(rawPrisma, tenantB);
    const poison = await seedPoison(rawPrisma, tenantA, tenantB);
    const seededA = tenantA.ids.size;
    assert.ok(seededA > 40, `only ${seededA} models seeded for tenant A; seed errors: ${JSON.stringify(tenantA.errors)}`);

    const cookieB = await loginAs(tenantB);
    let activeCookie = cookieB;
    const routes = buildRouteTable().filter((route) => !EXCLUDED(route));
    const stats = new Map();

    // Which routes demand a login at all? The rest is the public attack surface.
    const publicRoutes = [];
    const privateRoutes = [];
    for (const route of routes) {
      const params = pathParams(route.path);
      const path = route.path.replace(/:(\w+)/g, (_m, name) => encodeURIComponent(buildCandidates(tenantA, name, route.path.split('/')[route.path.split('/').indexOf(`:${name}`) - 1])[0] ?? 'x'));
      current.probe = { tenant: 'anon', method: route.method, path };
      const response = await send(route.method, path, { body: route.method === 'GET' || route.method === 'DELETE' ? undefined : {} });
      current.probe = null;
      if (response.status === 404 && /Cannot (GET|POST|PUT|PATCH|DELETE)/.test(response.text)) record('route table lists a route the app does not serve', { path: route.path, method: route.method });
      (response.status === 401 ? privateRoutes : publicRoutes).push({ ...route, params: params.length });
    }

    const before = await snapshotTenant(tenantA);
    let relogins = 0;
    let probes = 0;

    const specials = specialBodies(tenantA);
    privateRoutes.sort((left, right) => Number(Boolean(specials[`${right.method} ${right.path}`])) - Number(Boolean(specials[`${left.method} ${left.path}`])));

    for (const route of privateRoutes) {
      const segments = route.path.split('/');
      const params = pathParams(route.path);
      const lists = params.map((name) => buildCandidates(tenantA, name, segments[segments.indexOf(`:${name}`) - 1]));
      const idsA = injected(tenantA, route);
      const stat = { statuses: new Set(), reached: false, probes: 0, ownData: false, messages: new Map() };
      stats.set(`${route.method} ${route.path}`, stat);
      const writing = route.method !== 'GET' && route.method !== 'DELETE';
      const variants = writing ? [idsA, { ...idsA, id: `probe-${probes}-${route.method}` }] : [idsA];
      const attempts = [];
      for (const values of combos(lists)) for (const variant of variants) attempts.push([values, variant]);
      // B's OWN rows in the path, A's ids smuggled into the body/query: the
      // relation-hijack case (e.g. pointing B's booking at A's client).
      if (route.method !== 'DELETE' && params.length) {
        const ownLists = params.map((name) => buildCandidates(tenantB, name, segments[segments.indexOf(`:${name}`) - 1]));
        const ownId = buildCandidates(tenantB, 'id', route.path.split('/')[2])[0];
        for (const values of combos(ownLists, 4)) attempts.push([values, { ...idsA, id: ownId }]);
      }
      const special = specials[`${route.method} ${route.path}`];
      if (special) {
        const ownLists = params.map((name) => buildCandidates(tenantB, name, segments[segments.indexOf(`:${name}`) - 1]));
        for (const body of special) {
          for (const values of combos(lists, 3)) attempts.push([values, { __single: body, id: body.id }]);
          if (params.length) for (const values of combos(ownLists, 2)) attempts.push([values, { __single: body, id: body.id }]);
        }
      }
      if (writing) {
        const ownValues = params.length ? [...combos(params.map((name) => buildCandidates(tenantB, name, segments[segments.indexOf(`:${name}`) - 1])), 1)][0] : [];
        const ownId = params.length ? buildCandidates(tenantB, 'id', route.path.split('/')[2])[0] : null;
        singleReferenceBodies(tenantA, { ...idsA, id: ownId || `probe-single-${route.method}` }).forEach((body) => attempts.push([ownValues, { ...idsA, __single: body, id: body.id }]));
      }
      for (const [pathValues, idsForBody] of attempts) {
        const values = [...pathValues];
        const path = route.path.replace(/:(\w+)/g, () => encodeURIComponent(values.shift()));
        const reading = route.method === 'GET';
        const body = reading ? undefined : idsForBody.__single ? idsForBody.__single : { ...idsForBody, name: 'Probe', firstName: 'Probe', lastName: 'Probe', email: 'probe@example.test', title: 'Probe', notes: 'Probe', status: 'confirmed', amount: 1, quantity: 1, items: [], contractorBookings: [{ id: 'probe-cb', contractorId: tenantA.ids.get('Contractor'), contractorName: 'Probe' }], contractorIds: [tenantA.ids.get('Contractor')], clientIds: [tenantA.ids.get('Client')], recipients: [tenantA.ids.get('Client'), tenantA.ids.get('Contractor')], venue: { id: tenantA.ids.get('Venue'), name: 'Probe' }, orderedIds: [...tenantA.ids.values()].slice(0, 6), source: 'Probe', item: 'Probe' };
        const query = reading || route.method === 'DELETE' ? { ...idsA, search: 'BLEED-A-', q: 'BLEED-A-', limit: '100' } : undefined;
        current.probe = { tenant: 'B', watch: true, victim: 'A', method: route.method, path: route.path, reachedDatabaseWithA: false };
        const multipart = MULTIPART.has(`${route.method} ${route.path}`) && idsForBody.__single;
        const response = await send(route.method, path, { cookie: activeCookie, body: multipart ? undefined : body, form: multipart ? idsForBody.__single : undefined, query });
        const probe = current.probe;
        current.probe = null;
        probes += 1;
        stat.probes += 1;
        stat.statuses.add(response.status);
        if (response.status >= 400) { const text = (() => { try { return JSON.parse(response.text).error || response.text.slice(0, 120); } catch { return response.text.slice(0, 120); } })(); const known = stat.messages.get(response.status) || []; if (known.length < 3 && !known.includes(text)) stat.messages.set(response.status, [...known, text]); }
        if (probe.reachedDatabaseWithA) stat.reached = true;
        if (response.text.includes(MARK.B)) stat.ownData = true;

        const leaked = [...new Set(response.text.match(/BLEED[-_]A[-\w]*/gi) || [])].filter((token) => !response.requestText.toLowerCase().includes(token.toLowerCase()) && !echoAllowed.has(token.toLowerCase()));
        if (leaked.length && response.status < 500) record('response to tenant B contains tenant A data', { route: `${route.method} ${route.path}`, status: response.status, samples: leaked.slice(0, 4) });
        if (response.status === 401 && relogins < 50) { activeCookie = await loginAs(tenantB).catch(() => activeCookie); relogins += 1; }
      }
    }

    await finalChecks(tenantA, tenantB, before);

    // ---- Pass 2: bearer-token (public) routes. Someone holding A's REAL links, with
    // no login, tries to reach tenant B through them. Webhooks authenticate by
    // provider signature and are covered by their own tests.
    const tokenSources = [
      ['/api/inquiry/', 'InquiryLink.tokenHash'], ['/api/rsvp/', 'EventRsvpLink.tokenHash'], ['/api/prep-request/', 'EventPrepFormLink.tokenHash'],
      ['/api/contractor-calendar/', 'ContractorCalendarLink.tokenHash'], ['/api/public/stage-plots/', 'StagePlotShare.tokenHash'],
      ['/api/public/run-of-show/', 'RunOfShowShare.tokenHash'], ['/api/contract-sign/', 'Contract.clientTokenHash'],
      ['/api/proposal-respond/', 'ProposalResponse.tokenHash'], ['/api/invoice-pay/', 'Invoice.payTokenHash'],
    ];
    const tokensFor = (route) => {
      const hit = tokenSources.find(([prefix]) => route.path.startsWith(prefix));
      if (!hit) return [`${MARK.A}-token`];
      return [tenantA.tokens.get(hit[1]), poison.tokens.get(hit[1])].filter(Boolean);
    };
    // Valid shapes for the public POST routes, each carrying a reference to B.
    const publicBodies = {
      'POST /api/proposal-respond/:token/respond': [{ action: 'accept' }, { action: 'request_revision', note: 'Probe' }],
      'POST /api/contract-sign/:token/submit': [{ email: 'recipient@example.test', signatureName: 'Probe', signatureImage: 'data:image/png;base64,AAAA', consentAccepted: true }],
      'POST /api/inquiry/:token/submit': [{ firstName: 'Probe', lastName: 'Probe', email: 'victim.bravo@example.test', eventDate: '2027-02-02', eventType: 'Wedding', details: 'Probe', selectedClientId: tenantB.ids.get('Client') }],
      'POST /api/rsvp/:token': [{ name: 'Probe', attending: true, partySize: 2 }],
      'POST /api/contractor-calendar/:token/gigs/:eventId/respond': [{ action: 'confirm' }, { action: 'decline' }],
      'POST /api/contractor-calendar/:token/gigs/:eventId/payment-request': [{ certified: true, invoiceNumber: 'X', note: 'Probe' }],
      'POST /api/contract-sign/:token/view': [{}],
      'POST /api/invoice-pay/:token/view': [{}],
      'POST /api/invoice-pay/:token/checkout': [{}],
    };
    const beforeB = await snapshotTenant(tenantB);
    // /api/portal/request-link looks a client up by the email typed into it, across
    // every account, and emails the login link to that address only; its response is
    // identical whether or not anything matched. Cross-account by design, so excluded.
    const tokenRoutes = publicRoutes.filter((route) => !route.path.startsWith('/api/webhooks') && !route.path.startsWith('/api/auth') && route.path !== '/api/portal/request-link');
    let publicProbes = 0;
    const publicReached = new Set();
    const publicStatuses = new Map();
    for (const route of tokenRoutes) {
      const segments = route.path.split('/');
      const params = pathParams(route.path);
      const lists = params.map((name) => (name === 'token' ? tokensFor(route) : buildCandidates(tenantB, name, segments[segments.indexOf(`:${name}`) - 1])));
      const idsB = injected(tenantB, route);
      const writing = route.method !== 'GET' && route.method !== 'DELETE';
      const bodies = writing ? [...(publicBodies[`${route.method} ${route.path}`] || []), { ...idsB, name: 'Probe', firstName: 'Probe', lastName: 'Probe', email: 'probe@example.test', attending: true, selectedClientId: tenantB.ids.get('Client'), clientChoice: tenantB.ids.get('Client'), orderedIds: [] }, ...singleReferenceBodies(tenantB, idsB), ...['selectedClientId', 'clientChoice', 'eventId', 'bookingId', 'clientId'].map((key) => ({ name: 'Probe', firstName: 'Probe', lastName: 'Probe', email: 'probe@example.test', attending: true, [key]: tenantB.ids.get(key === 'selectedClientId' || key === 'clientChoice' || key === 'clientId' ? 'Client' : key === 'eventId' ? 'Event' : 'Booking') }))] : [undefined];
      for (const values of combos(lists, 6)) {
        for (const body of bodies) {
          const remaining = [...values];
          const path = route.path.replace(/:(\w+)/g, () => encodeURIComponent(remaining.shift()));
          const query = writing ? undefined : { ...idsB, search: 'BLEED-B-', q: 'BLEED-B-' };
          current.probe = { tenant: 'public', watch: true, victim: 'B', method: route.method, path: route.path, reachedDatabaseWithA: false };
          const response = await send(route.method, path, { body, query });
          const probe = current.probe;
          current.probe = null;
          publicProbes += 1;
          publicStatuses.set(`${route.method} ${route.path}`, new Set([...(publicStatuses.get(`${route.method} ${route.path}`) || []), response.status]));
          if (probe.reachedDatabaseWithA) publicReached.add(`${route.method} ${route.path}`);
          const leaked = [...new Set(response.text.match(/BLEED[-_]B[-\w]*/gi) || [])].filter((token) => !response.requestText.toLowerCase().includes(token.toLowerCase()) && !echoAllowed.has(token.toLowerCase()));
          if (leaked.length && response.status < 500) record('response to a holder of tenant A’s link contains tenant B data', { route: `${route.method} ${route.path}`, status: response.status, samples: leaked.slice(0, 4) });
        }
      }
    }
    await finalChecks(tenantB, tenantA, beforeB);

    const summary = {
      vertical,
      routesInTable: routes.length,
      publicRoutes: publicRoutes.map((route) => `${route.method} ${route.path}`),
      privateRoutes: privateRoutes.length,
      probes,
      publicRoutesProbed: tokenRoutes.length,
      publicProbes,
      publicStatuses: Object.fromEntries([...publicStatuses].map(([key, statuses]) => [key, [...statuses].sort().join(',')])),
      publicRoutesWhereBIdReachedTheDatabase: publicReached.size,
      relogins,
      modelsSeeded: seededA,
      seedErrors: tenantA.errors,
      poisonErrors: poison.errors,
      routesWhereAIdReachedTheDatabase: [...stats].filter(([, stat]) => stat.reached).length,
      routesReturningOwnDataWithoutAs: [...stats].filter(([, stat]) => stat.ownData).length,
      routesNeverExercised: [...stats].filter(([, stat]) => !stat.reached && !stat.ownData && ![...stat.statuses].some((status) => status >= 200 && status < 300)).map(([key, stat]) => `${key} ${[...stat.messages].map(([status, messages]) => `${status}: ${messages.join(' // ')}`).join(' | ')}`),
      serverErrors: [...stats].filter(([, stat]) => [...stat.statuses].some((status) => status >= 500)).map(([key]) => key),
      blockedOutboundConnections: blockedConnections.slice(0, 50),
      violations: violations.slice(0, 200),
    };
    if (process.env.BLEED_REPORT_PATH) writeFileSync(process.env.BLEED_REPORT_PATH.replace('.json', `-${vertical}.json`), JSON.stringify(summary, null, 2));
    console.log(`BLEED SUMMARY ${vertical}: ${privateRoutes.length} private / ${publicRoutes.length} public routes, ${probes} probes (+${publicProbes} public across ${tokenRoutes.length} token routes), A's id reached the database on ${summary.routesWhereAIdReachedTheDatabase} routes (B's, via public tokens, on ${publicReached.size}), ${violations.length} violation(s)`);
    assert.equal(violations.length, 0, `tenant bleed detected:\n${JSON.stringify(violations.slice(0, 20), null, 2)}`);
  });
}
