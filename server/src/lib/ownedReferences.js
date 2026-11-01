import { prisma } from './prisma.js';

// clientId, bookingId and similar columns are loose strings, not foreign keys,
// so the database will happily store another account's id. Nothing resolved
// that id safely downstream either, so a write route has to prove the account
// owns whatever it is asked to point at. Each helper returns an error message,
// or null when the reference is fine (empty, unchanged, or owned).
function isBlank(value) {
  return value === undefined || value === null || value === '';
}

export async function clientReferenceError(accountId, clientId, currentClientId = null) {
  if (isBlank(clientId) || clientId === currentClientId) return null;
  if (typeof clientId !== 'string') return 'Invalid client.';
  const client = await prisma.client.findFirst({ where: { id: clientId, accountId }, select: { id: true } });
  return client ? null : 'Invalid client.';
}

export async function bookingReferenceError(accountId, bookingId, currentBookingId = null) {
  if (isBlank(bookingId) || bookingId === currentBookingId) return null;
  if (typeof bookingId !== 'string') return 'Invalid booking.';
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, accountId }, select: { id: true } });
  return booking ? null : 'Invalid booking.';
}

// Every contractor id that is new to a record (not already stored on it) must
// belong to the account. Ids already present are left alone so records that
// predate this check, or point at a since-deleted contractor, keep saving.
export async function contractorReferencesError(accountId, contractorIds, currentContractorIds = []) {
  if (contractorIds === undefined || contractorIds === null) return null;
  const list = Array.isArray(contractorIds) ? contractorIds : [];
  if (list.some((id) => !isBlank(id) && typeof id !== 'string')) return 'Invalid contractor.';
  const current = new Set(currentContractorIds);
  const wanted = [...new Set(list.filter((id) => !isBlank(id) && !current.has(id)))];
  if (!wanted.length) return null;
  const owned = await prisma.contractor.count({ where: { accountId, id: { in: wanted } } });
  return owned === wanted.length ? null : 'Invalid contractor.';
}

export const assignedContractorIds = (contractorBookings) => (
  Array.isArray(contractorBookings) ? contractorBookings.map((assignment) => assignment?.contractorId) : []
);

// A reminder's relatedType/relatedId is an opaque pointer that background jobs
// and the UI later resolve. Types the app never resolves are left alone.
const RELATED_MODELS = {
  booking: 'booking', event: 'event', client: 'client', contractor: 'contractor', invoice: 'invoice', inbox: 'inboxThread', inquiry: 'inquiryLink',
};

export async function relatedRecordError(accountId, relatedType, relatedId, current = {}) {
  if (isBlank(relatedId) || (relatedId === current.relatedId && relatedType === current.relatedType)) return null;
  if (typeof relatedId !== 'string') return 'Invalid related record.';
  const model = RELATED_MODELS[relatedType];
  if (!model) return null;
  const found = await prisma[model].findFirst({ where: { id: relatedId, accountId }, select: { id: true } });
  return found ? null : 'Invalid related record.';
}

// For routes that provision or attach records to an event named in the request.
export async function ownsEvent(accountId, eventId) {
  if (typeof eventId !== 'string' || !eventId) return false;
  const event = await prisma.event.findFirst({ where: { id: eventId, accountId }, select: { id: true } });
  return !!event;
}
