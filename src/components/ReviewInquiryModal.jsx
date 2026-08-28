import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './ui/Modal';
import { useData } from '../context/DataContext';
import { useToast } from './ui/Toast';
import { applyInquiryLink } from '../lib/inquiryLinks';
import { formatEmailInput, formatEventDate, isValidEmailAddress } from '../lib/format';
import { getBooking } from '../lib/bookings';
import { findInquiryClientCandidates } from '../lib/clients';

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

// Review view for a submitted InquiryLink. Apply is one atomic server-side
// operation so client/booking creation and consuming the inquiry either all
// succeed or all roll back. Two apply paths:
//  - link.bookingId unset: creates a brand-new Client + Booking.
//  - link.bookingId set: merges into that existing Booking instead (see
//    src/lib/applyInquiry.js's buildBookingMergePatch) — used when the link
//    was sent from an in-progress booking to fill in the remaining gaps.
// `onApplyOverride`, if given, mirrors the committed server result into
// BookingFormPage's already-open form state after the transaction succeeds.
export default function ReviewInquiryModal({ open, link, onClose, onApplied, onApplyOverride, navigateAfterApply = true, currentClientId = null }) {
  const { clients, searchVenues, loadClient, loadBooking } = useData();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [applying, setApplying] = useState(false);
  const [targetBooking, setTargetBooking] = useState(null);
  const [targetBookingLoading, setTargetBookingLoading] = useState(false);
  const [clientCandidates, setClientCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [clientChoice, setClientChoice] = useState(null);
  const [candidateLookupFailed, setCandidateLookupFailed] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');

  useEffect(() => {
    if (open && link?.response) {
      const response = link.response;
      setCustomerEmail(response.email || '');
      setCandidateLookupFailed(false);
      if (response.venueName) searchVenues(response.venueName).catch(() => {});
      if (currentClientId) {
        setClientCandidates([]);
        setClientChoice('new');
        setCandidatesLoading(false);
      } else {
        setCandidatesLoading(true);
        setClientChoice(null);
        findInquiryClientCandidates(response)
          .then((candidates) => { setClientCandidates(candidates); setClientChoice(candidates.length ? null : 'new'); })
          .catch(() => { setClientCandidates([]); setClientChoice(null); setCandidateLookupFailed(true); })
          .finally(() => setCandidatesLoading(false));
      }
    }
    if (!open || !link?.bookingId || onApplyOverride) { setTargetBooking(null); setTargetBookingLoading(false); return; }
    let cancelled = false;
    setTargetBookingLoading(true);
    getBooking(link.bookingId).then((record) => { if (!cancelled) setTargetBooking(record); }).catch(() => { if (!cancelled) setTargetBooking(null); }).finally(() => { if (!cancelled) setTargetBookingLoading(false); });
    return () => { cancelled = true; };
  }, [currentClientId, open, link, onApplyOverride, searchVenues]);

  if (!link) return null;
  const r = link.response || {};

  // Preview-only — never creates/mutates anything itself, just informs the
  // "what will Apply do" note below so a duplicate client isn't a surprise.
  const linkedClientId = currentClientId || targetBooking?.clientId || null;
  const alreadyLinkedClient = linkedClientId ? clients.find((c) => c.id === linkedClientId) : null;
  const needsClientDecision = !linkedClientId && clientCandidates.length > 0;

  async function handleApply() {
    setApplying(true);
    try {
      const applied = await applyInquiryLink(link.id, { selectedClientId: clientChoice === 'new' ? null : clientChoice, createNewClient: clientChoice === 'new', customerEmail });
      const { bookingId, clientId } = applied;
      await Promise.all([loadClient(clientId), loadBooking(bookingId)]);
      if (onApplyOverride) await onApplyOverride(r, { bookingId, clientId });
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
          <div className="py-1.5 text-sm">
            <label className="block text-slate-400 mb-1">Email *</label>
            <input type="email" required value={customerEmail} onChange={(event) => setCustomerEmail(formatEmailInput(event.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-700" />
            {!isValidEmailAddress(customerEmail) && <p className="mt-1 text-xs text-amber-600">Add a valid email before creating the booking.</p>}
          </div>
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

        <div data-testid="review-inquiry-modal-client-note" className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-3">
          {linkedClientId ? (
            `Already linked to ${alreadyLinkedClient ? `${alreadyLinkedClient.firstName} ${alreadyLinkedClient.lastName}` : 'an existing client'} — that link will be preserved.`
          ) : candidatesLoading ? 'Checking for similar clients…' : candidateLookupFailed ? (
            <span className="font-semibold text-red-600">Client comparison could not be completed. Close and try again before applying this inquiry.</span>
          ) : needsClientDecision ? (
            <fieldset>
              <legend className="font-bold text-slate-700 mb-2">Possible existing client found — compare and choose</legend>
              <div className="mb-2 rounded-md border border-indigo-100 bg-white p-2">
                <div className="font-semibold text-slate-700">Inquiry: {r.firstName} {r.lastName}</div>
                <div>{r.email || 'No email'} · {r.phone || 'No phone'}</div>
              </div>
              <div className="space-y-2">
                {clientCandidates.map((candidate) => (
                  <label key={candidate.id} className="flex cursor-pointer gap-2 rounded-md border border-slate-200 bg-white p-2">
                    <input type="radio" name="inquiry-client-choice" value={candidate.id} checked={clientChoice === candidate.id} onChange={() => setClientChoice(candidate.id)} />
                    <span>
                      <span className="block font-semibold text-slate-700">Use {candidate.firstName} {candidate.lastName}</span>
                      <span className="block">{candidate.email || 'No email'} · {candidate.phone || 'No phone'}</span>
                      <span className="block text-indigo-600">{candidate.match.emailExact ? 'Same email' : candidate.match.phoneExact ? 'Same phone' : `${Math.round(candidate.match.nameScore * 100)}% name similarity`}</span>
                    </span>
                  </label>
                ))}
                <label className="flex cursor-pointer gap-2 rounded-md border border-slate-200 bg-white p-2">
                  <input type="radio" name="inquiry-client-choice" value="new" checked={clientChoice === 'new'} onChange={() => setClientChoice('new')} />
                  <span><span className="block font-semibold text-slate-700">Create a new client</span><span className="block">Keep this inquiry as a separate person.</span></span>
                </label>
              </div>
            </fieldset>
          ) : 'No similar client found — a new client will be created automatically.'}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} data-testid="review-inquiry-modal-dismiss-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Dismiss</button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || targetBookingLoading || candidatesLoading || candidateLookupFailed || !isValidEmailAddress(customerEmail) || (needsClientDecision && !clientChoice)}
            data-testid="review-inquiry-modal-apply-button"
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
          >
            {applying ? 'Applying…' : targetBookingLoading ? 'Loading booking…' : link.bookingId ? 'Apply — Update Booking' : 'Apply — Create Booking'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
