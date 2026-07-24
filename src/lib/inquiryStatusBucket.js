// Inquiry statuses (Settings → Contractor "Inquiry Status") are fully
// user-editable and can be arbitrarily granular (Emailed, Called, etc.) —
// `bucket` groups each one into exactly one of these 3 buckets so contractor
// lists (e.g. on an Event) can be sectioned without caring how many
// statuses exist within a bucket.
export const BUCKETS = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'unavailable', label: 'Not Avail' },
];

// Accounts created before `bucket` existed only have `isConfirmed` — derive
// a sensible bucket from that (plus a label guess for the common "Not
// Available"/"Declined" defaults) rather than requiring a real migration.
// The field fills in explicitly the next time the status is edited in
// Settings.
export function statusBucket(status) {
  if (!status) return 'tentative';
  if (status.bucket === 'confirmed' || status.bucket === 'tentative' || status.bucket === 'unavailable') return status.bucket;
  if (status.isConfirmed) return 'confirmed';
  return /not.?avail|declin/i.test(status.label || '') ? 'unavailable' : 'tentative';
}
