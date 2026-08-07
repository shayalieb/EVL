import { useEffect, useState } from 'react';
import { usePortalAuth } from '../../context/PortalAuthContext';
import { listPortalEvents, listPortalBookings, listPortalInvoices } from '../../lib/portal';
import { formatEventDate, formatCurrency, formatVenueLine } from '../../lib/format';

function StatusBadge({ status }) {
  if (!status) return null;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: `${status.color}1a`, color: status.color }}
    >
      {status.label}
    </span>
  );
}

const INVOICE_STATUS_LABELS = { sent: 'Awaiting payment', partial: 'Partially paid', paid: 'Paid', void: 'Voided' };

export default function PortalHomePage() {
  const { client, businessInfo, logout } = usePortalAuth();
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listPortalEvents(), listPortalBookings(), listPortalInvoices()])
      .then(([e, b, i]) => {
        if (cancelled) return;
        setEvents(e);
        setBookings(b);
        setInvoices(i);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {businessInfo?.logo
              ? <img src={businessInfo.logo} alt={businessInfo.name} className="h-8 max-w-[140px] object-contain" />
              : <div className="text-sm font-bold text-slate-800 truncate">{businessInfo?.name || 'GigWorks'}</div>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-slate-500 hidden sm:inline">Hi, {client.firstName}</span>
            <button
              type="button"
              onClick={logout}
              data-testid="portal-logout-button"
              className="text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              Log out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-bold text-slate-700 mb-4">Your Events</h2>
          {events.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-6">No events yet.</div>
          ) : (
            <div className="space-y-3">
              {events.map((e) => (
                <div key={e.id} data-testid="portal-event-row" className="flex items-center justify-between gap-3 border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{e.name}</div>
                    <div className="text-xs text-slate-400">
                      {e.eventDate ? formatEventDate(e.eventDate) : 'Date TBD'}
                      {formatVenueLine(e.venue) ? ` · ${formatVenueLine(e.venue)}` : ''}
                    </div>
                  </div>
                  <StatusBadge status={e.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-bold text-slate-700 mb-4">Your Bookings</h2>
          {bookings.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-6">No bookings yet.</div>
          ) : (
            <div className="space-y-3">
              {bookings.map((b) => (
                <div key={b.id} data-testid="portal-booking-row" className="flex items-center justify-between gap-3 border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{b.eventName || b.eventType || 'Booking'}</div>
                    <div className="text-xs text-slate-400">{b.eventDate ? formatEventDate(b.eventDate) : 'Date TBD'}</div>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-bold text-slate-700 mb-4">Payment History</h2>
          {invoices.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-6">No invoices yet.</div>
          ) : (
            <div className="space-y-3">
              {invoices.map((inv) => (
                <div key={inv.id} data-testid="portal-invoice-row" className="flex items-center justify-between gap-3 border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800">Invoice #{inv.number}</div>
                    <div className="text-xs text-slate-400">{inv.dueDate ? `Due ${formatEventDate(inv.dueDate.slice(0, 10))}` : ''}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-slate-700">{formatCurrency(inv.total)}</div>
                    <div className="text-xs text-slate-400">{INVOICE_STATUS_LABELS[inv.status] || inv.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 text-center">
          Need to make a payment, sign a document, or RSVP? Use the link from the email we sent you for that specific request.
        </p>
      </div>
    </div>
  );
}
