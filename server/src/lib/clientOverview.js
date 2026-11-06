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
