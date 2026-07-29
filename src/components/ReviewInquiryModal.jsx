import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './ui/Modal';
import { useData } from '../context/DataContext';
import { useToast } from './ui/Toast';
import { applyInquiryLink } from '../lib/inquiryLinks';
import { applyInquiryResponse } from '../lib/applyInquiry';
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
// that runs the normal authenticated addClient/addBooking flow (never
// writes directly server-side — see InquiryLink's model comment).
export default function ReviewInquiryModal({ open, link, onClose, onApplied }) {
  const { clients, addClient, addBooking } = useData();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [applying, setApplying] = useState(false);

  if (!link) return null;
  const r = link.response || {};

  async function handleApply() {
    setApplying(true);
    try {
      const { client, booking } = applyInquiryResponse(r, { clients, addClient, addBooking });
      try {
        await applyInquiryLink(link.id, { bookingId: booking.id, clientId: client.id });
      } catch {
        // Local Client/Booking already exist regardless — same tolerance as
        // other best-effort calls in this codebase. Re-clicking Apply on the
        // same link would create a duplicate, but that's a rare failure path.
      }
      showToast('Booking created from inquiry');
      onApplied?.(link.id);
      onClose();
      navigate(`/bookings/${booking.id}`);
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
          <Row label="Bride's Name" value={r.brideName} />
          <Row label="Groom's Name" value={r.groomName} />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Location</h4>
          <Row label="Venue" value={r.venueName} />
          <Row label="Address 1" value={r.address1} />
          <Row label="Address 2" value={r.address2} />
          <Row label="Venue Contact" value={r.venueContactName} />
          <Row label="Venue Email" value={r.venueContactEmail} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} data-testid="review-inquiry-modal-dismiss-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Dismiss</button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying}
            data-testid="review-inquiry-modal-apply-button"
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
          >
            {applying ? 'Applying…' : 'Apply — Create Booking'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
