export const BOOKING_DISPOSITIONS = [
  { id: 'active', label: 'Active', color: '#6366f1' },
  { id: 'on_hold', label: 'On Hold', color: '#eab308' },
  { id: 'lost', label: 'Lost', color: '#64748b' },
  { id: 'cancelled', label: 'Cancelled', color: '#ef4444' },
];

// Older bookings store an account-specific status id. Resolve that id before
// mapping the former pipeline-like labels into the new exception-only field.
// Nothing is rewritten until the user next saves the booking, so rollout is
// backward compatible with existing records and audit history.
export function bookingDisposition(value, legacyStatuses = []) {
  const legacyLabel = legacyStatuses.find((status) => status.id === value)?.label;
  const normalized = String(legacyLabel || value || 'active').trim().toLowerCase().replace(/[ -]+/g, '_');
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (normalized === 'lost' || normalized === 'declined') return 'lost';
  if (normalized === 'on_hold' || normalized === 'paused') return 'on_hold';
  return 'active';
}

export function dispositionInfo(value, legacyStatuses = []) {
  const id = bookingDisposition(value, legacyStatuses);
  return BOOKING_DISPOSITIONS.find((item) => item.id === id) || BOOKING_DISPOSITIONS[0];
}
