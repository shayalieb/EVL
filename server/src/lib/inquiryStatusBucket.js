// Server-side port of src/lib/inquiryStatusBucket.js — frontend and backend
// share no code in this repo (separate package.json/build contexts), so this
// is a deliberate duplicate, not a divergent reimplementation. Keep the two
// in sync if either changes. Used by the public contractor-calendar route
// (server/src/routes/contractorCalendar.js) to bucket a contractor's gigs
// without a browser involved.
//
// Note: reminderRuleEngine.js's isVendorPending() is a DIFFERENT, narrower
// check (only looks at status.isConfirmed) for a different purpose (is this
// vendor still worth nudging about) — don't confuse the two or copy from it.
export const BUCKETS = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'unavailable', label: 'Not Avail' },
];

export function statusBucket(status) {
  if (!status) return 'tentative';
  if (status.bucket === 'confirmed' || status.bucket === 'tentative' || status.bucket === 'unavailable') return status.bucket;
  if (status.isConfirmed) return 'confirmed';
  return /not.?avail|declin/i.test(status.label || '') ? 'unavailable' : 'tentative';
}
