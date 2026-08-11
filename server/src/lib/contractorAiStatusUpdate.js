import { randomUUID } from 'crypto';
import { statusBucket } from './inquiryStatusBucket.js';

const CLASSIFICATION_BUCKET = { confirmed: 'confirmed', declined: 'unavailable' };

// Applies a confident AI reply classification to the contractor's booking on
// this event — mirrors the manual "1-tap Gig Response" logic in
// contractorCalendar.js (same bucket lookup, same contractorBookings
// mapping), but gated: it only acts while the booking is still 'tentative'.
// If a human already moved it to Confirmed/Declined, that was a deliberate
// decision — an AI reading of a later reply shouldn't silently overturn it.
// Returns { contractorBookings, history } to merge into the event.update
// call, or null if nothing should change (ambiguous classification, no
// matching booking, already-decided status, or no status configured for the
// target bucket).
export function applyAiReplyClassification({ event, inquiryStatuses, contractorId, classification, contractorName }) {
  const targetBucket = CLASSIFICATION_BUCKET[classification];
  if (!targetBucket) return null;

  const booking = (event.contractorBookings || []).find((b) => b.contractorId === contractorId);
  if (!booking) return null;

  const currentStatus = inquiryStatuses.find((s) => s.id === booking.inquiryStatusId);
  if (statusBucket(currentStatus) !== 'tentative') return null;

  const targetStatus = inquiryStatuses.find((s) => statusBucket(s) === targetBucket);
  if (!targetStatus) return null;

  const contractorBookings = event.contractorBookings.map((b) =>
    (b.contractorId === contractorId ? { ...b, inquiryStatusId: targetStatus.id } : b)
  );

  const history = [
    ...(event.history || []),
    {
      id: `hist_${randomUUID()}`,
      at: new Date().toISOString(),
      type: 'ai-status-update',
      actorEmail: null,
      actorName: 'AI (email reply)',
      changes: [{
        label: contractorName ? `${contractorName} status` : 'Contractor status',
        from: currentStatus?.label || '(none)',
        to: targetStatus.label,
      }],
    },
  ];

  return { contractorBookings, history };
}
