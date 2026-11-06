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
