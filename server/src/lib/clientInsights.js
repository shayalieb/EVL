import { summarizeClientMoney } from './clientOverview.js';

export const CLIENT_STAGES = ['lead', 'active', 'past', 'vip', 'do_not_contact'];
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 30;
// Keys a saved view may store, with the type each must have. Anything else is dropped.
export const SAVED_VIEW_FILTER_KEYS = {
  search: 'string', engagement: 'string', stage: 'string', tag: 'string',
  owes: 'boolean', followUp: 'string', noContactDays: 'number', sort: 'string',
};

// Lower-case, trim, collapse spaces, drop empties/duplicates, cap the count.
export function normalizeTags(input) {
  if (!Array.isArray(input)) return { error: 'Tags must be a list.' };
  const seen = new Set();
  const tags = [];
  for (const raw of input) {
    const tag = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!tag || seen.has(tag)) continue;
    if (tag.length > MAX_TAG_LENGTH) return { error: `Tags are limited to ${MAX_TAG_LENGTH} characters.` };
    seen.add(tag);
    tags.push(tag);
  }
  if (tags.length > MAX_TAGS) return { error: `A client can have at most ${MAX_TAGS} tags.` };
  return { tags };
}

export function sanitizeSavedViewFilters(input) {
  const out = {};
  for (const [key, type] of Object.entries(SAVED_VIEW_FILTER_KEYS)) {
    const value = input?.[key];
    if (value === undefined || value === null || value === '' || value === false) continue;
    if (typeof value !== type) continue;
    if (type === 'number' && !(Number.isFinite(value) && value > 0 && value <= 3650)) continue;
    if (type === 'string' && value.length > 200) continue;
    out[key] = type === 'number' ? Math.floor(value) : value;
  }
  return out;
}

// A manual stage wins. Otherwise: any open booking or event means active; only
// finished or closed work means past; nothing yet means a lead.
export function effectiveStage({ stage, openWork, anyWork }) {
  if (stage && CLIENT_STAGES.includes(stage)) return stage;
  if (openWork) return 'active';
  return anyWork ? 'past' : 'lead';
}

const CLOSED_LABELS = new Set(['cancelled', 'canceled', 'declined', 'lost']);
const closedLabel = (statuses, id) => CLOSED_LABELS.has(String(statuses.find((s) => s.id === id)?.label || id || '').trim().toLowerCase());

// One pass of aggregate queries for a set of clients (or every client when
// `clientIds` is null): work status, money, and when we last were in touch.
export async function loadClientSignals(prisma, accountId, clientIds = null) {
  const clientFilter = clientIds ? { in: clientIds } : { not: null };
  const [bookings, events, notes, accountData] = await Promise.all([
    prisma.booking.findMany({ where: { accountId, clientId: clientFilter }, select: { id: true, clientId: true, completedAt: true, deletedAt: true, convertedEventId: true, bookingStatus: true } }),
    prisma.event.findMany({ where: { accountId, clientId: clientFilter, deletedAt: null }, select: { clientId: true, completedAt: true, eventStatus: true } }),
    prisma.clientNote.findMany({ where: { accountId, ...(clientIds ? { clientId: { in: clientIds } } : {}), type: { in: ['call', 'meeting'] } }, select: { clientId: true, createdAt: true } }),
    prisma.accountData.findUnique({ where: { accountId }, select: { data: true } }),
  ]);
  const eventStatuses = accountData?.data?.eventStatuses || [];
  const bookingStatuses = accountData?.data?.bookingStatuses || [];

  const signals = new Map();
  const get = (id) => {
    if (!signals.has(id)) signals.set(id, { openWork: false, anyWork: false, invoices: [], lastContactAt: null });
    return signals.get(id);
  };
  const bookingOwner = new Map();
  for (const b of bookings) {
    bookingOwner.set(b.id, b.clientId);
    if (b.deletedAt) continue;
    const s = get(b.clientId);
    s.anyWork = true;
    const label = bookingStatuses.find((x) => x.id === b.bookingStatus)?.label || b.bookingStatus;
    const closed = b.completedAt || b.convertedEventId || closedLabel([], label);
    if (!closed) s.openWork = true;
  }
  for (const e of events) {
    const s = get(e.clientId);
    s.anyWork = true;
    if (!e.completedAt && !closedLabel(eventStatuses, e.eventStatus)) s.openWork = true;
  }

  const bookingIds = [...bookingOwner.keys()];
  const [invoices, threads] = await Promise.all([
    bookingIds.length ? prisma.invoice.findMany({ where: { accountId, bookingId: { in: bookingIds } }, select: { bookingId: true, status: true, paidAmount: true, snapshot: true, dueDate: true } }) : [],
    prisma.inboxThread.findMany({ where: { accountId, clientId: clientFilter }, select: { id: true, clientId: true } }),
  ]);
  for (const invoice of invoices) get(bookingOwner.get(invoice.bookingId)).invoices.push(invoice);

  const threadOwner = new Map(threads.map((t) => [t.id, t.clientId]));
  const latest = threads.length
    ? await prisma.inboxMessage.groupBy({ by: ['threadId'], where: { threadId: { in: [...threadOwner.keys()] } }, _max: { createdAt: true } })
    : [];
  const bump = (clientId, at) => {
    if (!at) return;
    const s = get(clientId);
    if (!s.lastContactAt || at > s.lastContactAt) s.lastContactAt = at;
  };
  for (const row of latest) bump(threadOwner.get(row.threadId), row._max.createdAt);
  for (const note of notes) bump(note.clientId, note.createdAt);

  for (const s of signals.values()) {
    s.money = summarizeClientMoney(s.invoices);
    delete s.invoices;
  }
  return signals;
}

export const EMPTY_SIGNALS = Object.freeze({ openWork: false, anyWork: false, lastContactAt: null, money: { billed: 0, paid: 0, outstanding: 0, overdue: 0 } });
