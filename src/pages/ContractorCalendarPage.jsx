import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE } from '../context/AuthContext';
import { getContractorCalendarByToken, requestContractorPaymentByToken, respondToGigByToken } from '../lib/contractors';
import EventsCalendarView from '../components/events/EventsCalendarView';
import { Skeleton, SkeletonTable } from '../components/ui/Skeleton';
import Modal from '../components/ui/Modal';
import { formatCurrency as currency } from '../lib/format';

const PAYMENT_METHOD_LABELS = { ach: 'ACH', check: 'Check', card: 'Credit/Debit Card', cash: 'Cash', wire: 'Wire', other: 'Other' };

function friendlyDate(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const BUCKET_COLORS = [
  { id: 'confirmed', color: '#22c55e' },
  { id: 'tentative', color: '#eab308' },
];

export default function ContractorCalendarPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedGig, setSelectedGig] = useState(null);
  const [respondingGigId, setRespondingGigId] = useState(null);
  const [requestingPayment, setRequestingPayment] = useState(false);
  const [paymentRequestForm, setPaymentRequestForm] = useState({ invoiceNumber: '', note: '', certified: false });
  const [paymentRequestError, setPaymentRequestError] = useState('');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getContractorCalendarByToken(token)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err.message || 'This link is invalid.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = `${API_BASE}/contractor-calendar/${token}/manifest.webmanifest`;
    document.head.appendChild(manifestLink);

    const appleCapable = document.createElement('meta');
    appleCapable.name = 'apple-mobile-web-app-capable';
    appleCapable.content = 'yes';
    document.head.appendChild(appleCapable);

    const appleTitle = document.createElement('meta');
    appleTitle.name = 'apple-mobile-web-app-title';
    appleTitle.content = 'My Gigs';
    document.head.appendChild(appleTitle);

    const appleIcon = document.createElement('link');
    appleIcon.rel = 'apple-touch-icon';
    appleIcon.href = '/icons/gig-calendar-180.png';
    document.head.appendChild(appleIcon);

    return () => {
      manifestLink.remove();
      appleCapable.remove();
      appleTitle.remove();
      appleIcon.remove();
    };
  }, [token]);

  async function handleRespond(gigId, action) {
    setRespondingGigId(gigId);
    try {
      await respondToGigByToken(token, gigId, action);
      const updatedData = await getContractorCalendarByToken(token);
      setData(updatedData);
      if (selectedGig && selectedGig.id === gigId) {
        setSelectedGig(updatedData.gigs.find((g) => g.id === gigId) || null);
      }
    } catch (err) {
      alert(err.message || 'Failed to update gig status.');
    } finally {
      setRespondingGigId(null);
    }
  }

  async function handlePaymentRequest(event) {
    event.preventDefault();
    setRequestingPayment(true);
    setPaymentRequestError('');
    try {
      await requestContractorPaymentByToken(token, selectedGig.id, paymentRequestForm);
      const updatedData = await getContractorCalendarByToken(token);
      setData(updatedData);
      setSelectedGig(updatedData.gigs.find((gig) => gig.id === selectedGig.id) || null);
      setPaymentRequestForm({ invoiceNumber: '', note: '', certified: false });
    } catch (err) {
      setPaymentRequestError(err.message || 'The payment request could not be submitted.');
    } finally {
      setRequestingPayment(false);
    }
  }

  if (loading) {
    return (
      <div data-testid="contractor-calendar-loading" className="min-h-screen bg-slate-50 p-4 max-w-3xl mx-auto space-y-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-5 w-24 rounded-md" />
        </div>
        <SkeletonTable rows={3} />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div data-testid="contractor-calendar-error" className="min-h-screen flex items-center justify-center text-sm text-red-600 px-4 text-center">
        {error || 'This link is invalid.'}
      </div>
    );
  }

  const { contractor, businessInfo, gigs } = data;
  const calendarEvents = gigs.map((g) => ({ ...g, eventStatus: g.bucket, paid: g.paymentStatus === 'paid' }));

  return (
    <div data-testid="contractor-calendar-page" className={`min-h-screen ${darkMode ? 'dark-backstage bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800'} transition-colors duration-200`}>
      <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} border-b`}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {businessInfo?.logo
              ? <img src={businessInfo.logo} alt={businessInfo.name} className="h-8 max-w-[140px] object-contain" />
              : <div className="text-sm font-bold truncate">{businessInfo?.name || 'GigWorks'}</div>}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              title="Toggle Backstage Dark Mode"
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border ${darkMode ? 'bg-slate-700 border-slate-600 text-yellow-400' : 'bg-slate-100 border-slate-200 text-slate-600'}`}
            >
              {darkMode ? '☀️ Light' : '🌙 Backstage Mode'}
            </button>
            <span className="text-sm text-slate-500">Hi, {contractor.firstName}</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Confirmed</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Pending Confirmation</span>
          </div>
        </div>

        {gigs.length === 0 ? (
          <div data-testid="contractor-calendar-empty" className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} rounded-xl border text-sm text-slate-400 text-center py-6`}>No upcoming gigs yet.</div>
        ) : (
          <div className={`${darkMode ? 'bg-slate-800 border-slate-700 divide-slate-700' : 'bg-white border-slate-200 divide-slate-100'} rounded-xl border divide-y overflow-hidden`}>
            {gigs.map((g) => {
              const isPending = g.bucket === 'tentative';
              const isResponding = respondingGigId === g.id;
              return (
                <div
                  key={g.id}
                  data-testid="contractor-calendar-gig-row"
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50/50 cursor-pointer"
                  onClick={() => setSelectedGig(g)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold truncate">{g.name}</div>
                      <span
                        className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: g.bucket === 'confirmed' ? '#22c55e1a' : '#eab3081a', color: g.bucket === 'confirmed' ? '#16a34a' : '#a16207' }}
                      >
                        {g.bucket === 'confirmed' ? 'Confirmed' : 'Pending'}
                      </span>
                      {g.paymentStatus === 'paid' && (
                        <span
                          data-testid="contractor-calendar-gig-paid-badge"
                          className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700"
                        >
                          ✓ Paid
                        </span>
                      )}
                      {g.paymentStatus !== 'paid' && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${g.paymentRequest ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>{g.paymentRequest ? 'Payment requested' : 'Payment pending'}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                      <span>{g.eventDate ? new Date(`${g.eventDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBD'}</span>
                      {g.venue?.name && <span>· {g.venue.name}</span>}
                      {g.startTime && <span>· {g.startTime}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {isPending ? (
                      <>
                        <button
                          type="button"
                          disabled={isResponding}
                          onClick={() => handleRespond(g.id, 'confirm')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
                        >
                          {isResponding ? '...' : 'Accept Gig'}
                        </button>
                        <button
                          type="button"
                          disabled={isResponding}
                          onClick={() => handleRespond(g.id, 'decline')}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-medium disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedGig(g)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-semibold text-slate-700 dark:text-slate-200"
                      >
                        View Details →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <EventsCalendarView events={calendarEvents} eventStatuses={BUCKET_COLORS} onSelectEvent={(evt) => setSelectedGig(evt)} />

        <p className="text-xs text-slate-400 text-center pt-2">
          Add this page to your home screen for quick access — tap Share then &quot;Add to Home Screen&quot; (iOS) or the menu then &quot;Install app&quot; (Android).
        </p>
      </div>

      {selectedGig && (
        <Modal open title={selectedGig.name} onClose={() => setSelectedGig(null)} testId="contractor-gig-detail-modal">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  {selectedGig.eventDate ? new Date(`${selectedGig.eventDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Date TBD'}
                </div>
                <div className="text-xs text-slate-500">Gig Details & Logistics</div>
              </div>
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: selectedGig.bucket === 'confirmed' ? '#22c55e1a' : '#eab3081a', color: selectedGig.bucket === 'confirmed' ? '#16a34a' : '#a16207' }}
              >
                {selectedGig.bucket === 'confirmed' ? 'Confirmed' : 'Pending Confirmation'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <span className="font-semibold text-slate-500 block">Call Time</span>
                <span className="text-sm font-bold text-slate-800">{selectedGig.callTime || 'TBD'}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500 block">Soundcheck</span>
                <span className="text-sm font-bold text-slate-800">{selectedGig.soundcheckTime || 'TBD'}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500 block">Performance Start</span>
                <span className="text-slate-800 font-medium">{selectedGig.startTime || 'TBD'}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500 block">Performance End</span>
                <span className="text-slate-800 font-medium">{selectedGig.endTime || 'TBD'}</span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment</div>
              {selectedGig.paymentStatus === 'paid' ? (
                <div data-testid="contractor-gig-detail-payment-paid" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="mb-3 flex items-center gap-2 text-sm font-bold text-emerald-800"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">✓</span>Paid</div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                    <div><dt className="font-semibold text-emerald-700">Amount paid</dt><dd className="mt-0.5 text-sm font-bold text-slate-800">{selectedGig.paidAmount != null ? currency(selectedGig.paidAmount) : 'Not recorded'}</dd></div>
                    <div><dt className="font-semibold text-emerald-700">Paid on</dt><dd className="mt-0.5 text-slate-800">{friendlyDate(selectedGig.paidAt) || 'Not recorded'}</dd></div>
                    <div><dt className="font-semibold text-emerald-700">Method</dt><dd className="mt-0.5 text-slate-800">{PAYMENT_METHOD_LABELS[selectedGig.paymentMethod] || selectedGig.paymentMethod || 'Not recorded'}</dd></div>
                    {selectedGig.paymentReference && <div><dt className="font-semibold text-emerald-700">Reference</dt><dd className="mt-0.5 break-words text-slate-800">{selectedGig.paymentReference}</dd></div>}
                    {selectedGig.paymentDueDate && <div><dt className="font-semibold text-emerald-700">Originally due</dt><dd className="mt-0.5 text-slate-800">{friendlyDate(selectedGig.paymentDueDate)}</dd></div>}
                  </dl>
                </div>
              ) : (
                <div data-testid="contractor-gig-detail-payment-unpaid" className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="text-sm font-bold text-amber-800">{selectedGig.paymentRequest ? 'Payment requested' : 'Payment pending'}</div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                    <div><dt className="font-semibold text-amber-700">Expected pay</dt><dd className="mt-0.5 text-sm font-bold text-slate-800">{selectedGig.expectedAmount != null ? currency(selectedGig.expectedAmount) : 'Rate not set'}</dd></div>
                    <div><dt className="font-semibold text-amber-700">Expected by</dt><dd className="mt-0.5 text-slate-800">{friendlyDate(selectedGig.paymentDueDate) || 'Not scheduled'}{selectedGig.paymentDueDateIsDefault ? ' (event date)' : ''}</dd></div>
                  </dl>
                  {selectedGig.paymentRequest && <div className="mt-3 border-t border-amber-200 pt-3 text-xs text-slate-700"><p><strong>Status:</strong> {selectedGig.paymentRequest.status === 'disputed' ? 'Needs an update' : 'Sent to the business for review'}</p><p className="mt-1"><strong>Requested:</strong> {currency(selectedGig.paymentRequest.amount)}</p>{selectedGig.paymentRequest.invoiceNumber && <p className="mt-1"><strong>Invoice/reference:</strong> {selectedGig.paymentRequest.invoiceNumber}</p>}{selectedGig.paymentRequest.note && <p className="mt-1 whitespace-pre-wrap"><strong>Note:</strong> {selectedGig.paymentRequest.note}</p>}</div>}
                </div>
              )}
            </div>

            {selectedGig.paymentStatus !== 'paid' && (!selectedGig.paymentRequest || selectedGig.paymentRequest.status === 'disputed') && selectedGig.eventDate && selectedGig.eventDate <= new Date().toISOString().slice(0, 10) && selectedGig.expectedAmount > 0 && (
              <form onSubmit={handlePaymentRequest} className="space-y-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
                <div><h3 className="text-sm font-bold text-violet-900">Request payment</h3><p className="mt-1 text-xs text-violet-700">This is a payment request, not an invoice. The business will review it before recording payment.</p></div>
                <label className="block text-xs font-semibold text-slate-600">Invoice or reference number (optional)<input value={paymentRequestForm.invoiceNumber} maxLength={100} onChange={(e) => setPaymentRequestForm((form) => ({ ...form, invoiceNumber: e.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800" /></label>
                <label className="block text-xs font-semibold text-slate-600">Note (optional)<textarea value={paymentRequestForm.note} maxLength={1000} rows={3} onChange={(e) => setPaymentRequestForm((form) => ({ ...form, note: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm font-normal text-slate-800" /></label>
                <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={paymentRequestForm.certified} onChange={(e) => setPaymentRequestForm((form) => ({ ...form, certified: e.target.checked }))} className="mt-0.5 h-4 w-4" /><span>I confirm the services were completed and this request for {currency(selectedGig.expectedAmount)} is accurate.</span></label>
                {paymentRequestError && <p className="text-xs font-semibold text-rose-600">{paymentRequestError}</p>}
                <button type="submit" disabled={requestingPayment || !paymentRequestForm.certified} className="min-h-11 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{requestingPayment ? 'Submitting…' : 'Submit payment request'}</button>
              </form>
            )}

            {selectedGig.venue?.name && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Venue Location</div>
                <div className="text-sm font-semibold text-slate-800">{selectedGig.venue.name}</div>
                {(selectedGig.venue.address || selectedGig.venue.city) && (
                  <div className="text-xs text-slate-600">
                    {[selectedGig.venue.address, selectedGig.venue.city, selectedGig.venue.state, selectedGig.venue.zipCode].filter(Boolean).join(', ')}
                  </div>
                )}
                {selectedGig.venue.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedGig.venue.name} ${selectedGig.venue.address} ${selectedGig.venue.city || ''}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 mt-1"
                  >
                    📍 Open in Maps →
                  </a>
                )}
              </div>
            )}

            {selectedGig.notes && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Gig Notes</div>
                <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 whitespace-pre-wrap">{selectedGig.notes}</p>
              </div>
            )}

            {selectedGig.bucket === 'tentative' && (
              <div className="pt-2 flex items-center gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleRespond(selectedGig.id, 'confirm')}
                  className="flex-1 py-2 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700"
                >
                  Accept Gig
                </button>
                <button
                  type="button"
                  onClick={() => handleRespond(selectedGig.id, 'decline')}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 font-semibold text-xs hover:bg-slate-50"
                >
                  Decline
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
