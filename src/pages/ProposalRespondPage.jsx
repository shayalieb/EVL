import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Logo from '../components/ui/Logo';
import { getProposalResponseByToken, submitProposalResponse } from '../lib/proposalResponses';
import { formatCurrency as currency, formatEventDate, formatVenueLine } from '../lib/format';
import { computeOfferingTotal, computeOfferingsTotal } from '../lib/offerings';

const textareaClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ProposalRespondPage() {
  const { token } = useParams();
  const [proposalResponse, setProposalResponse] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [respondMode, setRespondMode] = useState(null); // null | 'accept' | 'revise'
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  // Once already responded, the Accept/Request Revision bar hides behind
  // the status banner's "changed your mind?" link rather than staying
  // permanently visible — this flips it back on.
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProposalResponseByToken(token)
      .then((data) => { if (!cancelled) setProposalResponse(data); })
      .catch((err) => { if (!cancelled) setLoadError(err.message || 'This link is invalid or has expired.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  function startRespond(mode) {
    setSubmitError('');
    setNote('');
    setRespondMode(mode);
  }

  function handleChangeResponse() {
    setShowActions(true);
    setRespondMode(null);
  }

  async function handleSubmit() {
    setSubmitError('');
    if (respondMode === 'revise' && !note.trim()) {
      setSubmitError('Please explain what needs to change.');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await submitProposalResponse(token, {
        action: respondMode === 'accept' ? 'accept' : 'request_revision',
        note: note.trim(),
      });
      setProposalResponse(updated);
      setRespondMode(null);
      setShowActions(false);
    } catch (err) {
      setSubmitError(err.message || 'Failed to submit your response.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-400">Loading…</div>;
  }

  if (loadError || !proposalResponse) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
          <Logo className="h-10 w-auto mx-auto mb-4" />
          <p data-testid="proposal-respond-error" className="text-sm text-red-600">{loadError || 'This link is invalid or has expired.'}</p>
        </div>
      </div>
    );
  }

  const { snapshot, status, respondedAt, responseNote } = proposalResponse;
  const businessInfo = snapshot?.businessInfo || {};
  const client = snapshot?.client || {};
  const booking = snapshot?.booking || {};
  const proposal = snapshot?.proposal || {};
  const lineItems = proposal.lineItems || [];
  const offeringsList = proposal.offerings || [];
  const sections = (proposal.sections || []).filter((s) => s.title);
  const grandTotal = lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) + computeOfferingsTotal(offeringsList);
  const alreadyResponded = status === 'accepted' || status === 'revision_requested';

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 pb-28">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Logo className="h-10 w-auto" />
          <div>
            <div className="font-bold text-slate-800">{businessInfo.name || 'Event Proposal'}</div>
            <div className="text-xs text-slate-400">Proposal for {client.firstName} {client.lastName}</div>
          </div>
        </div>

        {status === 'accepted' && !respondMode && (
          <div data-testid="proposal-respond-accepted-banner" className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
            <div className="font-semibold">You accepted this proposal{respondedAt ? ` on ${formatDateTime(respondedAt)}` : ''}.</div>
            {responseNote && <div className="mt-1 text-emerald-800">"{responseNote}"</div>}
            <button type="button" onClick={handleChangeResponse} data-testid="proposal-respond-change-link" className="mt-2 text-xs font-semibold text-emerald-700 underline">
              Changed your mind? Update your response
            </button>
          </div>
        )}
        {status === 'revision_requested' && !respondMode && (
          <div data-testid="proposal-respond-revision-banner" className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
            <div className="font-semibold">You requested changes{respondedAt ? ` on ${formatDateTime(respondedAt)}` : ''}.</div>
            {responseNote && <div className="mt-1 text-amber-800">"{responseNote}"</div>}
            <div className="mt-1 text-amber-600">We'll follow up once the proposal has been updated.</div>
            <button type="button" onClick={handleChangeResponse} data-testid="proposal-respond-change-link" className="mt-2 text-xs font-semibold text-amber-700 underline">
              Want to accept instead? Update your response
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Event Details</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div className="text-slate-500">Event Type</div>
              <div className="text-slate-800">{booking.eventType || '—'}</div>
              <div className="text-slate-500">Event Date</div>
              <div className="text-slate-800">{booking.eventDate ? formatEventDate(booking.eventDate) : 'Tentative'}</div>
              {(booking.brideName || booking.groomName) && (
                <>
                  <div className="text-slate-500">Bride & Groom</div>
                  <div className="text-slate-800">{[booking.brideName, booking.groomName].filter(Boolean).join(' & ')}</div>
                </>
              )}
              <div className="text-slate-500">Location</div>
              <div className="text-slate-800">{formatVenueLine(booking.venue) || '—'}</div>
              {proposal.hours && (
                <>
                  <div className="text-slate-500">Estimated Hours</div>
                  <div className="text-slate-800">{proposal.hours} hrs</div>
                </>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Investment</div>
            <div className="space-y-1 text-sm">
              {lineItems.map((item, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-slate-600">{item.name || 'Item'}</span>
                  <span className="text-slate-800">{currency(Number(item.amount) || 0)}</span>
                </div>
              ))}
              {offeringsList.map((o, i) => {
                const total = computeOfferingTotal(o);
                return (
                  <div key={`o${i}`}>
                    <div className="flex justify-between">
                      <span className="text-slate-600">
                        {o.name || 'Offering'}
                        {o.type === 'perUnit' && <span className="text-slate-400"> ({o.unitCount || 0} × {currency(o.ratePerUnit || 0)})</span>}
                      </span>
                      <span className="text-slate-800">{currency(total)}</span>
                    </div>
                    {o.type === 'ensemble' && o.instruments?.length > 0 && (
                      <ul className="mt-0.5 ml-3 list-disc text-xs text-slate-400 space-y-0.5">
                        {o.instruments.map((inst, idx) => <li key={idx}>{inst}</li>)}
                      </ul>
                    )}
                  </div>
                );
              })}
              <div className="flex justify-between pt-2 mt-2 border-t border-slate-100 font-semibold">
                <span className="text-slate-800">Grand Total</span>
                <span className="text-slate-800">{currency(grandTotal)}</span>
              </div>
              {booking.depositAmount ? (
                <div className="flex justify-between text-slate-500">
                  <span>Deposit{booking.depositDueDate ? ` (due ${formatEventDate(booking.depositDueDate)})` : ''}</span>
                  <span>{currency(booking.depositAmount)}</span>
                </div>
              ) : null}
            </div>
          </div>

          {sections.map((section) => (
            <div key={section.id}>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{section.title}</div>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{section.text}</p>
            </div>
          ))}
        </div>

        {submitError && <div data-testid="proposal-respond-error-banner" className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{submitError}</div>}

        {respondMode && (
          <div className="mt-4 bg-white rounded-2xl border border-slate-200 p-5">
            <div className="text-sm font-semibold text-slate-700 mb-2">
              {respondMode === 'accept' ? 'Add a note (optional)' : 'What needs to change?'}
            </div>
            <textarea
              autoFocus
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={respondMode === 'accept' ? 'Anything you want us to know…' : 'Please be specific — this goes straight to us.'}
              data-testid="proposal-respond-note-textarea"
              className={textareaClass}
            />
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                data-testid="proposal-respond-confirm-button"
                className={`px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-60 ${respondMode === 'accept' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}`}
              >
                {submitting ? 'Submitting…' : respondMode === 'accept' ? 'Confirm Accept' : 'Submit Revision Request'}
              </button>
              <button type="button" onClick={() => setRespondMode(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-500">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {!respondMode && (!alreadyResponded || showActions) && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <div className="max-w-3xl mx-auto flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => startRespond('revise')}
              data-testid="proposal-respond-request-revision-button"
              className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-600 font-semibold text-sm hover:bg-slate-50"
            >
              Request Revision
            </button>
            <button
              type="button"
              onClick={() => startRespond('accept')}
              data-testid="proposal-respond-accept-button"
              className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700"
            >
              Accept Proposal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
