import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { lockDownEnvironment, resetAllTables, seedTenant } from './support/bleedHarness.js';

lockDownEnvironment();
const [{ app }, { prisma }] = await Promise.all([import('../src/index.js'), import('../src/lib/prisma.js')]);
const rawPrisma = new PrismaClient();

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

async function send(method, path, { cookie, body } = {}) {
  counter += 1;
  const headers = { 'x-forwarded-for': `10.8.${(counter >> 8) & 255}.${counter & 255}`, 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: response.status, json, cookies: response.headers.getSetCookie?.() || [] };
}

async function login(tenant) {
  const r = await send('POST', '/api/auth/login', { body: { email: tenant.user.email, password: tenant.password } });
  assert.equal(r.status, 200);
  return r.cookies.map((v) => v.split(';', 1)[0]).join('; ');
}

test('client notes: log, pin exclusivity, list enrichment, tenant isolation', { timeout: 120_000 }, async () => {
  await resetAllTables(prisma);
  const a = await seedTenant(rawPrisma, 'A', 'band_orchestra');
  const b = await seedTenant(rawPrisma, 'B', 'band_orchestra');
  const cookieA = await login(a);
  const cookieB = await login(b);
  const clientId = a.ids.get('Client');

  const n1 = await send('POST', `/api/clients/${clientId}/notes`, { cookie: cookieA, body: { body: '  Prefers texts  ', type: 'preference', pinned: true } });
  assert.equal(n1.status, 201);
  assert.equal(n1.json.note.body, 'Prefers texts');
  assert.equal(n1.json.note.pinned, true);
  assert.ok(n1.json.note.authorName);

  const n2 = await send('POST', `/api/clients/${clientId}/notes`, { cookie: cookieA, body: { body: 'Called about date', type: 'call', pinned: true } });
  assert.equal(n2.status, 201);
  const list = await send('GET', `/api/clients/${clientId}/notes`, { cookie: cookieA });
  assert.equal(list.json.notes.filter((n) => n.pinned).length, 1, 'only one pinned note');
  assert.equal(list.json.notes[0].id, n2.json.note.id, 'pinned note sorts first');

  assert.equal((await send('POST', `/api/clients/${clientId}/notes`, { cookie: cookieA, body: { body: '' } })).status, 400);
  assert.equal((await send('POST', `/api/clients/${clientId}/notes`, { cookie: cookieA, body: { body: 'x', type: 'bogus' } })).status, 400);

  const unpin = await send('PATCH', `/api/clients/${clientId}/notes/${n2.json.note.id}`, { cookie: cookieA, body: { pinned: false } });
  assert.equal(unpin.json.note.pinned, false);
  const edit = await send('PATCH', `/api/clients/${clientId}/notes/${n1.json.note.id}`, { cookie: cookieA, body: { body: 'Prefers email' } });
  assert.equal(edit.json.note.body, 'Prefers email');

  await send('POST', '/api/reminders', { cookie: cookieA, body: { relatedType: 'client', relatedId: clientId, relatedName: 'x', note: 'Follow up', remindAt: new Date(Date.now() + 86_400_000).toISOString() } });
  const page = await send('GET', '/api/clients?page=1&pageSize=25', { cookie: cookieA });
  const row = page.json.clients.items.find((c) => c.id === clientId);
  assert.ok(row.noteCount >= 2);
  assert.ok(row.nextFollowUpAt, 'next follow-up surfaced');
  const searched = await send('GET', '/api/clients?page=1&pageSize=25&search=called%20about', { cookie: cookieA });
  assert.ok(searched.json.clients.items.some((c) => c.id === clientId), 'search matches note text');

  const fullName = await rawPrisma.client.findUnique({ where: { id: clientId } });
  // The raw seed skips the normalized-name column that every real write path fills in.
  await rawPrisma.client.update({ where: { id: clientId }, data: { nameNormalized: `${fullName.firstName} ${fullName.lastName}`.toLowerCase() } });
  const byFullName = await send('GET', `/api/clients?page=1&pageSize=25&search=${encodeURIComponent(`${fullName.firstName} ${fullName.lastName}`)}`, { cookie: cookieA });
  assert.ok(byFullName.json.clients.items.some((c) => c.id === clientId), 'search matches the full name');

  // Tenant B can neither read nor modify A's notes.
  assert.equal((await send('GET', `/api/clients/${clientId}/notes`, { cookie: cookieB })).status, 404);
  assert.equal((await send('POST', `/api/clients/${clientId}/notes`, { cookie: cookieB, body: { body: 'intrude' } })).status, 404);
  assert.equal((await send('PATCH', `/api/clients/${clientId}/notes/${n1.json.note.id}`, { cookie: cookieB, body: { body: 'intrude' } })).status, 404);
  assert.equal((await send('DELETE', `/api/clients/${clientId}/notes/${n1.json.note.id}`, { cookie: cookieB })).status, 404);

  const del = await send('DELETE', `/api/clients/${clientId}/notes/${n1.json.note.id}`, { cookie: cookieA });
  assert.equal(del.status, 200);
  assert.equal(await rawPrisma.clientNote.count({ where: { id: n1.json.note.id } }), 0);
});

test('client overview: aggregates one client, respects view permissions and tenants', { timeout: 120_000 }, async () => {
  await resetAllTables(prisma);
  const a = await seedTenant(rawPrisma, 'A', 'band_orchestra');
  const b = await seedTenant(rawPrisma, 'B', 'band_orchestra');
  const cookieA = await login(a);
  const cookieB = await login(b);
  const clientId = a.ids.get('Client');

  const mine = await rawPrisma.booking.findMany({ where: { accountId: a.account.id, clientId } });
  const bookingIds = mine.map((x) => x.id);
  await rawPrisma.invoice.updateMany({ where: { accountId: a.account.id, bookingId: { in: bookingIds } }, data: { status: 'sent', sentAt: new Date() } });
  await send('POST', `/api/clients/${clientId}/notes`, { cookie: cookieA, body: { body: 'Met at expo', type: 'meeting' } });

  const res = await send('GET', `/api/clients/${clientId}/overview`, { cookie: cookieA });
  assert.equal(res.status, 200);
  const o = res.json;
  assert.equal(o.client.id, clientId);
  assert.deepEqual(o.access, { bookings: true, events: true, email: true });
  assert.ok(o.bookings.every((x) => bookingIds.includes(x.id)));
  assert.ok(o.invoices.every((x) => bookingIds.includes(x.bookingId)));
  assert.ok(o.timeline.some((x) => x.kind === 'note' && x.detail === 'Met at expo'));
  assert.ok(o.timeline.some((x) => x.kind === 'client'));
  assert.ok(o.stats.lastContactAt, 'a meeting note counts as contact');
  assert.ok(o.stats.money && typeof o.stats.money.outstanding === 'number');
  assert.ok(o.timeline.every((x, i, arr) => i === 0 || arr[i - 1].at >= x.at), 'newest first');

  // Another tenant cannot read it.
  assert.equal((await send('GET', `/api/clients/${clientId}/overview`, { cookie: cookieB })).status, 404);

  // A member who can see clients but not bookings/events gets no booking, event, invoice or email data.
  const bcrypt = (await import('bcrypt')).default;
  const member = await rawPrisma.user.create({ data: { id: 'CN-member', firstName: 'Mem', lastName: 'Ber', email: 'cn-member@example.test', passwordHash: await bcrypt.hash('password-123', 4) } });
  await rawPrisma.membership.create({ data: { userId: member.id, accountId: a.account.id, role: 'member', permissions: { viewClients: true, viewBookings: false, viewEvents: false, viewContractors: false, viewVenues: false, viewOfferings: false } } });
  const lr = await send('POST', '/api/auth/login', { body: { email: member.email, password: 'password-123' } });
  assert.equal(lr.status, 200);
  const memberCookie = lr.cookies.map((v) => v.split(';', 1)[0]).join('; ');
  const limited = await send('GET', `/api/clients/${clientId}/overview`, { cookie: memberCookie });
  assert.equal(limited.status, 200);
  assert.deepEqual(limited.json.access, { bookings: false, events: false, email: false });
  assert.deepEqual([limited.json.bookings, limited.json.events, limited.json.invoices, limited.json.contracts], [[], [], [], []]);
  assert.equal(limited.json.stats.money, null);
  assert.ok(limited.json.timeline.every((x) => ['client', 'note'].includes(x.kind)), 'only client/note entries without area access');
});

test('client tags, stage, list filters and saved views', { timeout: 120_000 }, async () => {
  await resetAllTables(prisma);
  const a = await seedTenant(rawPrisma, 'A', 'band_orchestra');
  const b = await seedTenant(rawPrisma, 'B', 'band_orchestra');
  const cookieA = await login(a);
  const cookieB = await login(b);
  const clientId = a.ids.get('Client');
  const accountId = a.account.id;
  const list = async (query) => (await send('GET', `/api/clients?page=1&pageSize=25${query}`, { cookie: cookieA })).json.clients.items;

  // A second, untouched client so filters have something to exclude.
  const other = await rawPrisma.client.create({ data: { id: 'CN-other', accountId, firstName: 'Other', lastName: 'Person', email: 'other@example.test', emailNormalized: 'other@example.test', nameNormalized: 'other person' } });

  // Classification
  const set = await send('PATCH', `/api/clients/${clientId}/classification`, { cookie: cookieA, body: { tags: [' VIP ', 'Wedding', 'vip'], stage: 'vip' } });
  assert.equal(set.status, 200);
  assert.deepEqual(set.json.client.tags, ['vip', 'wedding']);
  assert.equal(set.json.client.stage, 'vip');
  assert.equal((await send('PATCH', `/api/clients/${clientId}/classification`, { cookie: cookieA, body: { stage: 'nonsense' } })).status, 400);
  assert.equal((await send('PATCH', `/api/clients/${clientId}/classification`, { cookie: cookieA, body: { tags: 'x' } })).status, 400);
  assert.equal((await send('PATCH', `/api/clients/${clientId}/classification`, { cookie: cookieB, body: { tags: ['intrude'] } })).status, 404);
  assert.deepEqual((await send('GET', '/api/clients/tags', { cookie: cookieA })).json.tags, ['vip', 'wedding']);
  assert.deepEqual((await send('GET', '/api/clients/tags', { cookie: cookieB })).json.tags, [], 'tags are per tenant');

  // Filters
  assert.deepEqual((await list('&tag=VIP')).map((c) => c.id), [clientId]);
  assert.deepEqual((await list('&stage=vip')).map((c) => c.id), [clientId]);
  const leads = await list('&stage=lead');
  assert.ok(leads.some((c) => c.id === other.id) && !leads.some((c) => c.id === clientId));
  assert.equal((await list('')).find((c) => c.id === other.id).effectiveStage, 'lead');
  assert.equal((await list('')).find((c) => c.id === clientId).effectiveStage, 'vip');
  await send('PATCH', `/api/clients/${clientId}/classification`, { cookie: cookieA, body: { stage: null } });
  assert.notEqual((await list('')).find((c) => c.id === clientId).effectiveStage, 'vip', 'clearing the override returns to automatic');

  // Money: one sent, part-paid invoice.
  const bookingId = (await rawPrisma.booking.findFirst({ where: { accountId, clientId } })).id;
  await rawPrisma.invoice.updateMany({ where: { accountId, bookingId }, data: { status: 'partial', paidAmount: 200, snapshot: { lineItems: [{ type: 'package', amount: 500 }] } } });
  const row = (await list('')).find((c) => c.id === clientId);
  assert.equal(row.money.paid, 200);
  assert.equal(row.money.outstanding, 300);
  assert.deepEqual((await list('&owes=1')).map((c) => c.id), [clientId]);

  // No contact: both are brand new, so neither is "silent" yet; a back-dated client is.
  assert.equal((await list('&noContactDays=30')).length, 0);
  await rawPrisma.client.update({ where: { id: other.id }, data: { createdAt: new Date(Date.now() - 90 * 86_400_000) } });
  assert.deepEqual((await list('&noContactDays=30')).map((c) => c.id), [other.id]);
  await send('POST', `/api/clients/${other.id}/notes`, { cookie: cookieA, body: { body: 'Rang them', type: 'call' } });
  assert.equal((await list('&noContactDays=30')).length, 0, 'a logged call counts as contact');
  assert.ok((await list('')).find((c) => c.id === other.id).lastContactAt);

  // Overdue follow-up
  await rawPrisma.reminder.create({ data: { accountId, relatedType: 'client', relatedId: other.id, relatedName: 'Other', note: 'Ring', remindAt: new Date(Date.now() - 3_600_000) } });
  assert.deepEqual((await list('&followUp=overdue')).map((c) => c.id), [other.id]);

  // Saved views
  const viewsBefore = (await send('GET', '/api/clients/views', { cookie: cookieA })).json.views.length; // the harness seeds one per tenant
  const viewsBeforeB = (await send('GET', '/api/clients/views', { cookie: cookieB })).json.views.length;
  const view = await send('POST', '/api/clients/views', { cookie: cookieA, body: { name: 'Owes money', filters: { owes: true, junk: 'x' } } });
  assert.equal(view.status, 201);
  assert.deepEqual(view.json.view.filters, { owes: true });
  assert.equal((await send('POST', '/api/clients/views', { cookie: cookieA, body: { name: 'Owes money', filters: { owes: true } } })).status, 409);
  assert.equal((await send('POST', '/api/clients/views', { cookie: cookieA, body: { name: 'Empty', filters: {} } })).status, 400);
  assert.equal((await send('GET', '/api/clients/views', { cookie: cookieA })).json.views.length, viewsBefore + 1);
  assert.equal((await send('GET', '/api/clients/views', { cookie: cookieB })).json.views.length, viewsBeforeB, 'views are per tenant');
  assert.equal((await send('DELETE', `/api/clients/views/${view.json.view.id}`, { cookie: cookieB })).status, 404);
  assert.equal((await send('DELETE', `/api/clients/views/${view.json.view.id}`, { cookie: cookieA })).status, 200);

  // A member without booking access cannot see money or filter by it.
  const bcrypt = (await import('bcrypt')).default;
  const member = await rawPrisma.user.create({ data: { id: 'CN-m2', firstName: 'M', lastName: 'Two', email: 'cn-m2@example.test', passwordHash: await bcrypt.hash('password-123', 4) } });
  await rawPrisma.membership.create({ data: { userId: member.id, accountId, role: 'member', permissions: { viewClients: true, viewBookings: false, viewEvents: false, viewContractors: false, viewVenues: false, viewOfferings: false } } });
  const lr = await send('POST', '/api/auth/login', { body: { email: member.email, password: 'password-123' } });
  const memberCookie = lr.cookies.map((v) => v.split(';', 1)[0]).join('; ');
  const limited = await send('GET', '/api/clients?page=1&pageSize=25', { cookie: memberCookie });
  assert.ok(limited.json.clients.items.every((c) => c.money === null));
  assert.equal((await send('GET', '/api/clients?page=1&pageSize=25&owes=1', { cookie: memberCookie })).status, 403);
  assert.equal((await send('PATCH', `/api/clients/${clientId}/classification`, { cookie: memberCookie, body: { tags: ['x'] } })).status, 403);
});

test('client contacts and companies', { timeout: 120_000 }, async () => {
  await resetAllTables(prisma);
  const a = await seedTenant(rawPrisma, 'A', 'band_orchestra');
  const b = await seedTenant(rawPrisma, 'B', 'band_orchestra');
  const cookieA = await login(a);
  const cookieB = await login(b);
  const accountId = a.account.id;
  const clientId = a.ids.get('Client');
  const other = await rawPrisma.client.create({ data: { id: 'CC-other', accountId, firstName: 'Olive', lastName: 'Second', email: 'olive@example.test', emailNormalized: 'olive@example.test', nameNormalized: 'olive second' } });

  // Contacts
  const c1 = await send('POST', `/api/clients/${clientId}/contacts`, { cookie: cookieA, body: { name: ' Pat Planner ', role: 'planner', email: 'PAT@Example.test', phone: '555-0100' } });
  assert.equal(c1.status, 201);
  assert.equal(c1.json.contact.name, 'Pat Planner');
  assert.equal(c1.json.contact.email, 'pat@example.test');
  assert.equal((await send('POST', `/api/clients/${clientId}/contacts`, { cookie: cookieA, body: { name: '' } })).status, 400);
  assert.equal((await send('POST', `/api/clients/${clientId}/contacts`, { cookie: cookieA, body: { name: 'X', role: 'boss' } })).status, 400);
  assert.equal((await send('POST', `/api/clients/${clientId}/contacts`, { cookie: cookieA, body: { name: 'X', email: 'not-an-email' } })).status, 400);
  const edited = await send('PATCH', `/api/clients/${clientId}/contacts/${c1.json.contact.id}`, { cookie: cookieA, body: { role: 'payer', email: '' } });
  assert.equal(edited.json.contact.role, 'payer');
  assert.equal(edited.json.contact.email, null);
  assert.equal((await send('GET', `/api/clients/${clientId}/contacts`, { cookie: cookieB })).status, 404);
  assert.equal((await send('POST', `/api/clients/${clientId}/contacts`, { cookie: cookieB, body: { name: 'Intruder' } })).status, 404);
  assert.equal((await send('PATCH', `/api/clients/${clientId}/contacts/${c1.json.contact.id}`, { cookie: cookieB, body: { name: 'Intruder' } })).status, 404);
  assert.equal((await send('DELETE', `/api/clients/${clientId}/contacts/${c1.json.contact.id}`, { cookie: cookieB })).status, 404);
  const wrongClient = await send('PATCH', `/api/clients/${other.id}/contacts/${c1.json.contact.id}`, { cookie: cookieA, body: { name: 'Moved' } });
  assert.equal(wrongClient.status, 404, 'a contact cannot be edited through a different client');

  // Search finds a client through their contact
  const byContact = await send('GET', '/api/clients?page=1&pageSize=25&search=pat%20planner', { cookie: cookieA });
  assert.ok(byContact.json.clients.items.some((c) => c.id === clientId), 'search matches contact name');

  // Companies: create-or-reuse, case-insensitive
  const co = await send('POST', '/api/client-companies', { cookie: cookieA, body: { name: '  Acme   Events ' } });
  assert.equal(co.status, 201);
  const again = await send('POST', '/api/client-companies', { cookie: cookieA, body: { name: 'acme events' } });
  assert.equal(again.status, 200);
  assert.equal(again.json.company.id, co.json.company.id);
  assert.equal((await send('POST', '/api/client-companies', { cookie: cookieA, body: { name: '  ' } })).status, 400);
  const coB = await send('POST', '/api/client-companies', { cookie: cookieB, body: { name: 'Acme Events' } });
  assert.notEqual(coB.json.company.id, co.json.company.id, 'the same name in another tenant is a different company');

  // Assign members; other tenants' companies are rejected
  const companyId = co.json.company.id;
  assert.equal((await send('PATCH', `/api/clients/${clientId}/classification`, { cookie: cookieA, body: { companyId: coB.json.company.id } })).status, 400);
  const assigned = await send('PATCH', `/api/clients/${clientId}/classification`, { cookie: cookieA, body: { companyId } });
  assert.equal(assigned.json.client.company.name, 'Acme Events');
  await send('PATCH', `/api/clients/${other.id}/classification`, { cookie: cookieA, body: { companyId } });
  const row = (await send('GET', '/api/clients?page=1&pageSize=25', { cookie: cookieA })).json.clients.items.find((c) => c.id === clientId);
  assert.equal(row.company.id, companyId);
  const byCompany = await send('GET', '/api/clients?page=1&pageSize=25&search=acme', { cookie: cookieA });
  assert.deepEqual(byCompany.json.clients.items.map((c) => c.id).sort(), [clientId, other.id].sort());
  const ov = await send('GET', `/api/clients/${clientId}/overview`, { cookie: cookieA });
  assert.equal(ov.json.company.id, companyId);
  assert.ok(ov.json.contacts.some((c) => c.id === c1.json.contact.id), 'overview carries contacts');

  // Company roll-up
  const bookingId = (await rawPrisma.booking.findFirst({ where: { accountId, clientId } })).id;
  await rawPrisma.invoice.updateMany({ where: { accountId, bookingId }, data: { status: 'partial', paidAmount: 200, snapshot: { lineItems: [{ type: 'package', amount: 500 }] } } });
  const detail = await send('GET', `/api/client-companies/${companyId}`, { cookie: cookieA });
  assert.equal(detail.status, 200);
  assert.equal(detail.json.stats.memberCount, 2);
  assert.equal(detail.json.stats.money.paid, 200);
  assert.equal(detail.json.stats.money.outstanding, 300);
  assert.equal(detail.json.members.length, 2);
  assert.equal((await send('GET', `/api/client-companies/${companyId}`, { cookie: cookieB })).status, 404);
  const list = await send('GET', '/api/client-companies?search=acme', { cookie: cookieA });
  assert.equal(list.json.companies.find((c) => c.id === companyId).memberCount, 2);
  assert.ok(!list.json.companies.some((c) => c.id === coB.json.company.id), 'company list is per tenant');

  // Rename conflict, then permissions for a member without booking access
  const second = await send('POST', '/api/client-companies', { cookie: cookieA, body: { name: 'Globex' } });
  assert.equal((await send('PATCH', `/api/client-companies/${second.json.company.id}`, { cookie: cookieA, body: { name: 'ACME events' } })).status, 409);
  const bcrypt = (await import('bcrypt')).default;
  const member = await rawPrisma.user.create({ data: { id: 'CC-m', firstName: 'M', lastName: 'Three', email: 'cc-m@example.test', passwordHash: await bcrypt.hash('password-123', 4) } });
  await rawPrisma.membership.create({ data: { userId: member.id, accountId, role: 'member', permissions: { viewClients: true, viewBookings: false, viewEvents: false, viewContractors: false, viewVenues: false, viewOfferings: false } } });
  const lr = await send('POST', '/api/auth/login', { body: { email: member.email, password: 'password-123' } });
  const memberCookie = lr.cookies.map((v) => v.split(';', 1)[0]).join('; ');
  assert.equal((await send('GET', `/api/client-companies/${companyId}`, { cookie: memberCookie })).json.stats.money, null);
  assert.equal((await send('POST', '/api/client-companies', { cookie: memberCookie, body: { name: 'Nope' } })).status, 403);
  assert.equal((await send('POST', `/api/clients/${clientId}/contacts`, { cookie: memberCookie, body: { name: 'Nope' } })).status, 403);

  // Deleting a company detaches members but keeps them
  assert.equal((await send('DELETE', `/api/client-companies/${companyId}`, { cookie: cookieA })).status, 200);
  const after = await rawPrisma.client.findUnique({ where: { id: clientId } });
  assert.equal(after.companyId, null);

  // Deleting a client removes its contacts
  await send('POST', `/api/clients/${other.id}/contacts`, { cookie: cookieA, body: { name: 'Temp' } });
  await rawPrisma.client.delete({ where: { id: other.id } });
  assert.equal(await rawPrisma.clientContact.count({ where: { clientId: other.id } }), 0);
});
