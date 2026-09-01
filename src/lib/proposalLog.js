const SEND_TYPES = new Set(['sent', 'manual_sent']);
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function isSameSend(bookingEntry, responseEntry) {
  if (!SEND_TYPES.has(bookingEntry?.type) || bookingEntry.type !== responseEntry?.type) return false;
  if (normalized(bookingEntry.actorEmail) !== normalized(responseEntry.actorEmail)) return false;
  if (normalized(bookingEntry.note) !== normalized(responseEntry.note)) return false;
  const bookingTime = new Date(bookingEntry.at).getTime();
  const responseTime = new Date(responseEntry.at).getTime();
  return Number.isFinite(bookingTime) && Number.isFinite(responseTime) && Math.abs(bookingTime - responseTime) <= DUPLICATE_WINDOW_MS;
}

// Older proposal sends were written to both the booking blob and the
// server-owned ProposalResponse. Prefer the server entry and remove only a
// matching cross-source duplicate; legitimate repeated sends within either
// individual log remain separate.
export function mergedProposalLog(bookingLog = [], responseLog = []) {
  const remainingBookingEntries = [...bookingLog];
  for (const responseEntry of responseLog) {
    const duplicateIndex = remainingBookingEntries.findIndex((bookingEntry) => isSameSend(bookingEntry, responseEntry));
    if (duplicateIndex >= 0) remainingBookingEntries.splice(duplicateIndex, 1);
  }
  return [...remainingBookingEntries, ...responseLog].sort((a, b) => new Date(a.at) - new Date(b.at));
}
