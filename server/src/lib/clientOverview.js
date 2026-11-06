import { invoiceTotal } from '../routes/invoices.js';

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Summarise a client's money from their invoices. Drafts have not been sent so
// they are neither revenue nor a balance owed; void invoices are ignored.
export function summarizeClientMoney(invoices) {
  let billed = 0;
  let paid = 0;
  let outstanding = 0;
  let overdue = 0;
  const now = Date.now();
  for (const invoice of invoices) {
    if (invoice.status === 'draft' || invoice.status === 'void') continue;
    const total = invoiceTotal(invoice);
    const received = Math.min(Number(invoice.paidAmount) || 0, total);
    const balance = Math.max(0, total - received);
    billed += total;
    paid += received;
    outstanding += balance;
    if (balance > 0 && invoice.dueDate && new Date(invoice.dueDate).getTime() < now) overdue += balance;
  }
  return { billed: money(billed), paid: money(paid), outstanding: money(outstanding), overdue: money(overdue) };
}

const round1 = (n) => Math.round(n * 10) / 10;

// How a client pays: average booking value (billed per invoiced booking) and
// average days from sending an invoice to it being paid. Drafts and voids are ignored.
export function summarizeClientPayments(invoices) {
  const billedByBooking = new Map();
  const days = [];
  for (const invoice of invoices) {
    if (invoice.status === 'draft' || invoice.status === 'void') continue;
    billedByBooking.set(invoice.bookingId, (billedByBooking.get(invoice.bookingId) || 0) + invoiceTotal(invoice));
    if (invoice.paidAt && invoice.sentAt) {
      const elapsed = (new Date(invoice.paidAt).getTime() - new Date(invoice.sentAt).getTime()) / 86_400_000;
      if (Number.isFinite(elapsed) && elapsed >= 0) days.push(elapsed);
    }
  }
  const bookings = [...billedByBooking.values()];
  return {
    avgBookingValue: bookings.length ? money(bookings.reduce((a, b) => a + b, 0) / bookings.length) : null,
    avgDaysToPay: days.length ? round1(days.reduce((a, b) => a + b, 0) / days.length) : null,
    paidInvoiceCount: days.length,
  };
}

export const SLOW_PAYER_DAYS = 14;
export const SILENT_ACTIVE_DAYS = 45;
export const UNSIGNED_CONTRACT_DAYS = 3;

// Things worth a glance before you contact this client. Each flag is a key plus
// a detail the UI words; none of them is a verdict, just a prompt.
export function clientFlags({ money: m, payments, openWork, lastContactAt, createdAt, contracts = [], now = Date.now() }) {
  const flags = [];
  if (m?.overdue > 0) flags.push({ key: 'overdue_balance', detail: m.overdue });
  if (payments && payments.paidInvoiceCount >= 2 && payments.avgDaysToPay > SLOW_PAYER_DAYS) flags.push({ key: 'slow_payer', detail: payments.avgDaysToPay });
  const stale = contracts.find((c) => c.status !== 'fully_signed' && c.status !== 'superseded' && c.sentAt && now - new Date(c.sentAt).getTime() > UNSIGNED_CONTRACT_DAYS * 86_400_000);
  if (stale) flags.push({ key: 'unsigned_contract', detail: stale.displayNumber });
  if (openWork) {
    const since = new Date(lastContactAt || createdAt).getTime();
    const quiet = Math.floor((now - since) / 86_400_000);
    if (quiet > SILENT_ACTIVE_DAYS) flags.push({ key: 'silent', detail: quiet });
  }
  return flags;
}

// One chronological feed across everything that happened with a client. Every
// input is optional because each source is gated by its own permission.
export function buildClientTimeline({ client, bookings = [], events = [], contracts = [], invoices = [], messages = [], notes = [], limit = 150 }) {
  const items = [];
  const push = (at, kind, title, detail, link) => {
    if (!at) return;
    const date = new Date(at);
    if (Number.isNaN(date.getTime())) return;
    items.push({ at: date.toISOString(), kind, title, detail: detail || null, link: link || null });
  };

  push(client.createdAt, 'client', 'Client added');
  for (const b of bookings) {
    const name = b.eventName || 'Untitled booking';
    const link = `/bookings/${b.id}`;
    push(b.createdAt, 'booking', `Inquiry or booking created: ${name}`, null, link);
    if (b.proposal?.sentAt) push(b.proposal.sentAt, 'proposal', `Proposal sent: ${name}`, null, link);
  }
  for (const e of events) push(e.createdAt, 'event', `Event created: ${e.name || 'Untitled event'}`, null, `/events/${e.id}`);
  for (const c of contracts) {
    const link = `/bookings/${c.bookingId}?tab=contract`;
    const label = `Contract #${c.displayNumber}`;
    push(c.sentAt || c.createdAt, 'contract', `${label} sent`, null, link);
    push(c.clientSignedAt, 'contract', `${label} signed by client`, null, link);
    push(c.ownerSignedAt, 'contract', `${label} countersigned`, null, link);
  }
  for (const i of invoices) {
    const link = `/bookings/${i.bookingId}?tab=invoices`;
    const label = `Invoice #${i.displayNumber}`;
    const total = invoiceTotal(i);
    push(i.sentAt, 'invoice', `${label} sent`, `$${money(total).toFixed(2)}`, link);
    push(i.paidAt, 'payment', `${label} paid`, `$${money(i.paidAmount).toFixed(2)}`, link);
    push(i.voidedAt, 'invoice', `${label} voided`, null, link);
  }
  for (const m of messages) {
    const inbound = m.direction === 'inbound';
    push(m.createdAt, 'email', `${inbound ? 'Email received' : 'Email sent'}: ${m.subject || '(no subject)'}`, null, '/inbox');
  }
  for (const n of notes) {
    const preview = n.body.length > 160 ? `${n.body.slice(0, 157)}…` : n.body;
    push(n.createdAt, 'note', `${n.type === 'general' ? 'Note' : `${n.type[0].toUpperCase()}${n.type.slice(1)} note`} by ${n.authorName || 'a teammate'}`, preview);
  }

  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return items.slice(0, limit);
}
