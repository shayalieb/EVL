import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './ui/Modal';
import { useData } from '../context/DataContext';
import { useToast } from './ui/Toast';
import { applyInquiryLink } from '../lib/inquiryLinks';
import { applyInquiryResponse, buildBookingMergePatch, findMatchingClient, resolveClientForMerge } from '../lib/applyInquiry';
import { formatEventDate } from '../lib/format';

const rowClass = 'flex justify-between gap-4 py-1.5 text-sm';
const labelSpanClass = 'text-slate-400';
const valueSpanClass = 'text-slate-700 font-medium text-right';

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className={rowClass} data-testid="review-inquiry-modal-field-row">
      <span className={labelSpanClass}>{label}</span>
      <span className={valueSpanClass}>{value}</span>
    </div>
  );
}

// Read-only view of a submitted InquiryLink, with an explicit Apply step
// that runs the normal authenticated addClient/addBooking(orUpdateBooking)
// flow — never writes directly server-side (see InquiryLink's model comment
// in schema.prisma). Two apply paths:
//  - link.bookingId unset: creates a brand-new Client + Booking.
//  - link.bookingId set: merges into that existing Booking instead (see
//    src/lib/applyInquiry.js's buildBookingMergePatch) — used when the link
//    was sent from an in-progress booking to fill in the remaining gaps.
// `onApplyOverride`, if given, replaces both built-in paths entirely — used
// by BookingFormPage's own inline widget so the merge writes into that
// page's already-open form state (and gets picked up by its normal
// autosave) instead of going through DataContext.updateBooking, which the
// currently-open form's one-time hydration effect wouldn't pick up live.
export default function ReviewInquiryModal({ open, link, onClose, onApplied, onApplyOverride, navigateAfterApply = true }) {
  const { clients, bookings, venues, addClient, addBooking, updateBooking } = useData();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [applying, setApplying] = useState(false);

  if (!link) return null;
  const r = link.response || {};

  // Preview-only — never creates/mutates anything itself, just informs the
  // "what will Apply do" note below so a duplicate client isn't a surprise.
  const targetBooking = link.bookingId ? bookings.find((b) => b.id === link.bookingId) : null;
  const alreadyLinkedClient = targetBooking?.clientId ? clients.find((c) => c.id === targetBooking.clientId) : null;
  const matchedClient = !alreadyLinkedClient ? findMatchingClient(clients, r) : null;

  async function handleApply() {
    setApplying(true);
    try {
      let bookingId;
      let clientId;
      if (onApplyOverride) {
        ({ bookingId, clientId } = await onApplyOverride(r));
      } else if (link.bookingId) {
        if (!targetBooking) throw new Error('The booking this was sent from no longer exists.');
        const resolved = resolveClientForMerge(r, { clients, addClient, currentClientId: targetBooking.clientId });
        const patch = buildBookingMergePatch(r, targetBooking, venues);
        updateBooking(targetBooking.id, { ...patch, clientId: resolved.clientId });
        bookingId = targetBooking.id;
        clientId = resolved.clientId;
      } else {
        const created = applyInquiryResponse(r, { clients, venues, addClient, addBooking });
        bookingId = created.booking.id;
        clientId = created.client.id;
      }
      try {
        await applyInquiryLink(link.id, { bookingId, clientId });
      } catch {
        // Local Client/Booking are already created/updated regardless — same
        // tolerance as other best-effort calls in this codebase. Re-clicking
        // Apply on the same link would create/merge a second time, but
        // that's a rare failure path.
      }
      showToast(link.bookingId ? 'Booking updated from inquiry' : 'Booking created from inquiry');
      onApplied?.(link.id);
      onClose();
      if (navigateAfterApply) navigate(`/bookings/${bookingId}`);
    } catch (err) {
      showToast(err.message || 'Failed to apply inquiry', 'error');
    } finally {
      setApplying(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Inquiry Response">
      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Your Info</h4>
          <Row label="Name" value={`${r.firstName || ''} ${r.lastName || ''}`.trim()} />
          <Row label="Phone" value={r.phone} />
          <Row label="Email" value={r.email} />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Event Info</h4>
          <Row label="Date" value={r.eventDate ? formatEventDate(r.eventDate) : ''} />
          <Row label="Type" value={r.eventType} />
          <Row label="Event Name" value={r.eventName} />
          <Row label="Bride's Name" value={r.brideName} />
          <Row label="Groom's Name" value={r.groomName} />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Location</h4>
          <Row label="Venue" value={r.venueName} />
          <Row label="Address 1" value={r.address1} />
          <Row label="Address 2" value={r.address2} />
          <Row label="City" value={r.city} />
          <Row label="State" value={r.state} />
          <Row label="Zip" value={r.zip} />
          <Row label="Venue Contact" value={r.venueContactName} />
          <Row label="Venue Email" value={r.venueContactEmail} />
        </div>

        {r.details && (
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Details</h4>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.details}</p>
          </div>
        )}

        {!onApplyOverride && (
          <div data-testid="review-inquiry-modal-client-note" className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            {alreadyLinkedClient
              ? `Already linked to client ${alreadyLinkedClient.firstName} ${alreadyLinkedClient.lastName} — won't be changed.`
              : matchedClient
                ? `Matches existing client ${matchedClient.firstName} ${matchedClient.lastName} (${matchedClient.email || matchedClient.phone}) — will link to it instead of creating a new one.`
                : 'No matching client found — a new one will be created.'}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} data-testid="review-inquiry-modal-dismiss-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Dismiss</button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying}
            data-testid="review-inquiry-modal-apply-button"
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
          >
            {applying ? 'Applying…' : link.bookingId ? 'Apply — Update Booking' : 'Apply — Create Booking'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
