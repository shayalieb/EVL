import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { lockDownEnvironment, resetAllTables, seedTenant } from './support/bleedHarness.js';

// Client-portal isolation (part of the regular integration suite; the full
// tenant-bleed sweep lives in tenantBleed.sweep.js). Provider keys are blanked
// and outbound sockets blocked, as in the sweep.
lockDownEnvironment();
const [{ app }, { prisma }, { hashToken }] = await Promise.all([
  import('../src/index.js'),
  import('../src/lib/prisma.js'),
  import('../src/lib/resetToken.js'),
]);
const rawPrisma = new PrismaClient();

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

// Own address per request so per-IP rate limiters never interfere.
async function send(method, path, { cookie, query } = {}) {
  addressCounter += 1;
  const headers = { 'x-forwarded-for': `10.9.${(addressCounter >> 8) & 255}.${addressCounter & 255}` };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${path}${query ? `?${new URLSearchParams(query)}` : ''}`, { method, headers, redirect: 'manual' });
  return { status: response.status, text: await response.text(), cookies: response.headers.getSetCookie?.() || [] };
}

// ---------------------------------------------------------------------------
// Client portal. A portal session is scoped to one client, not to an account.
// Three clients exist: two in tenant A and one in tenant B, A's first sharing an
// email address with B's. Each session must see exactly its own client's
// records, even when another tenant holds an invoice pointing at them.
// ---------------------------------------------------------------------------
test('client portal sessions only ever see their own client’s records', { timeout: 120_000 }, async () => {
  await resetAllTables(prisma);
  const tenantA = await seedTenant(rawPrisma, 'A', 'band_orchestra');
  const tenantB = await seedTenant(rawPrisma, 'B', 'band_orchestra');
  const clientA1 = tenantA.ids.get('Client');
  const clientB = tenantB.ids.get('Client');
  await rawPrisma.client.updateMany({ where: { id: { in: [clientA1, clientB] } }, data: { email: 'shared@example.test', emailNormalized: 'shared@example.test' } });

  // A's second client, with a booking, event and invoice of their own.
  const secondClient = await rawPrisma.client.create({ data: { id: 'PORTAL2-client', accountId: tenantA.account.id, firstName: 'Second', lastName: 'Client', email: 'second@example.test', emailNormalized: 'second@example.test' } });
  const bookingSource = await rawPrisma.booking.findUnique({ where: { id: tenantA.ids.get('Booking') } });
  const eventSource = await rawPrisma.event.findUnique({ where: { id: tenantA.ids.get('Event') } });
  const invoiceSource = await rawPrisma.invoice.findUnique({ where: { id: tenantA.ids.get('Invoice') } });
  await rawPrisma.booking.create({ data: { ...bookingSource, id: 'PORTAL2-booking', clientId: secondClient.id, eventName: 'PORTAL2-SECRET-booking' } });
  await rawPrisma.event.create({ data: { ...eventSource, id: 'PORTAL2-event', clientId: secondClient.id, name: 'PORTAL2-SECRET-event' } });
  await rawPrisma.invoice.create({ data: { ...invoiceSource, id: 'PORTAL2-invoice', number: 77, displayNumber: 100077, stripeCheckoutSessionId: null, stripePaymentIntentId: null, bookingId: 'PORTAL2-booking', payTokenHash: hashToken('tok-portal2-pay') } });

  // Tenant B holds an invoice that points at A's first client's booking.
  const bInvoice = await rawPrisma.invoice.findUnique({ where: { id: tenantB.ids.get('Invoice') } });
  await rawPrisma.invoice.create({ data: { ...bInvoice, id: 'POISON-B-invoice', number: 88, displayNumber: 100088, stripeCheckoutSessionId: null, stripePaymentIntentId: null, bookingId: tenantA.ids.get('Booking'), status: 'sent', payTokenHash: hashToken('tok-poison-b-pay') } });

  const sessions = [
    { name: 'A client 1', clientId: clientA1, token: 'tok-portal-a1', accountId: tenantA.account.id },
    { name: 'A client 2', clientId: secondClient.id, token: 'tok-portal-a2', accountId: tenantA.account.id },
    { name: 'B client', clientId: clientB, token: 'tok-portal-b', accountId: tenantB.account.id },
  ];
  for (const session of sessions) {
    await rawPrisma.clientPortalToken.create({ data: { clientId: session.clientId, tokenHash: hashToken(session.token), expiresAt: new Date(Date.now() + 3_600_000) } });
  }

  for (const session of sessions) {
    const verified = await send('GET', '/api/portal/verify', { query: { token: session.token } });
    assert.equal(verified.status, 200, `${session.name}: ${verified.text}`);
    const cookie = verified.cookies.map((value) => value.split(';', 1)[0]).join('; ');
    const get = async (path) => { const response = await send('GET', `/api/portal${path}`, { cookie, query: { clientId: sessions[1 - sessions.indexOf(session) === 0 ? 0 : 1].clientId, accountId: 'BLEED-X' } }); return { status: response.status, body: (() => { try { return JSON.parse(response.text); } catch { return null; } })(), text: response.text }; };

    const [me, events, bookings, invoices] = await Promise.all([get('/me'), get('/events'), get('/bookings'), get('/invoices')]);
    assert.equal(me.status, 200);
    assert.equal(me.body.client.id, session.clientId, `${session.name}: /me returned a different client`);

    const ownBookings = await rawPrisma.booking.findMany({ where: { accountId: session.accountId, clientId: session.clientId, deletedAt: null }, select: { id: true } });
    const ownEvents = await rawPrisma.event.findMany({ where: { accountId: session.accountId, clientId: session.clientId, deletedAt: null }, select: { id: true } });
    const ownInvoices = await rawPrisma.invoice.findMany({
      where: { accountId: session.accountId, bookingId: { in: (await rawPrisma.booking.findMany({ where: { accountId: session.accountId, clientId: session.clientId }, select: { id: true } })).map((booking) => booking.id) }, status: { not: 'draft' } },
      select: { id: true },
    });
    const ids = (rows) => rows.map((row) => row.id).sort();
    assert.deepEqual(ids(bookings.body.bookings), ids(ownBookings), `${session.name}: bookings differ from this client's own`);
    assert.deepEqual(ids(events.body.events), ids(ownEvents), `${session.name}: events differ from this client's own`);
    assert.deepEqual(ids(invoices.body.invoices), ids(ownInvoices), `${session.name}: invoices differ from this client's own (an invoice from outside this client's account may be showing)`);

    // Nothing of any other client or tenant is present anywhere in what this session received.
    const everything = [me, events, bookings, invoices].map((part) => part.text).join(' ');
    const foreign = ['PORTAL2-SECRET', 'POISON-B', 'PORTAL2-', session.accountId === tenantA.account.id ? 'BLEED-B' : 'BLEED-A'].filter((marker) => {
      if (session.name === 'A client 2' && marker.startsWith('PORTAL2')) return false;
      return everything.includes(marker);
    });
    assert.deepEqual(foreign, [], `${session.name}: response contains another client's or tenant's data`);

    // A portal session is not a staff session.
    for (const path of ['/api/clients', '/api/bookings', '/api/events', '/api/account-data']) {
      const staff = await send('GET', path, { cookie });
      assert.ok([401, 403].includes(staff.status), `${session.name}: portal cookie reached staff route ${path} (${staff.status})`);
    }
  }

  // Tokens are single use and bound to their own client.
  const reused = await send('GET', '/api/portal/verify', { query: { token: 'tok-portal-a1' } });
  assert.equal(reused.status, 400, 'a portal login token was accepted twice');
});
