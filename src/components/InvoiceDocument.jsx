import Badge from './ui/Badge';
import { computeOfferingTotal, computeOfferingsTotal } from '../lib/offerings';
import { formatCurrency as currency, formatEventDate } from '../lib/format';

const STATUS_META = {
  draft: { label: 'Draft', color: '#94a3b8' },
  sent: { label: 'Open', color: '#eab308' },
  partial: { label: 'Partially Paid', color: '#f97316' },
  paid: { label: 'Paid', color: '#22c55e' },
  void: { label: 'Void', color: '#ef4444' },
};

// A cuid is unguessable and already used as a public-safe identifier
// elsewhere in the app, so slicing it into a short reference number avoids
// needing a real sequential-numbering column just for display.
function invoiceNumber(invoiceId) {
  return invoiceId ? invoiceId.slice(-6).toUpperCase() : null;
}

// Event vendors (catering, DJs, photo booths, etc.) bill per-event, so this
// is styled like a formal line-item invoice — number, bill-to, the event
// it's for, a proper item table, and a running balance — rather than the
// plainer receipt-style list it started as.
//
// Shared between the composer's live Preview (BookingFormPage, not-yet-sent
// draft state) and the actual public pay page (InvoicePayPage, the sent/
// frozen snapshot) — same rendering either way, so what the business
// previews is exactly what the client will see.
export default function InvoiceDocument({
  businessInfo, client, event, lineItems, dueDate, memo, total,
  status, paidAmount, invoiceId, issueDate,
}) {
  const items = lineItems || [];
  const grandTotal = total ?? computeOfferingsTotal(items);
  const statusMeta = status ? STATUS_META[status] : null;
  const balanceDue = grandTotal - (paidAmount || 0);
  const eventLine = event ? [event.type, event.date ? formatEventDate(event.date) : null].filter(Boolean).join(' · ') : '';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
      <div className="flex items-start justify-between gap-4 pb-5 mb-5 border-b border-slate-100 flex-wrap">
        <div className="flex items-center gap-3">
          {businessInfo?.logo && <img src={businessInfo.logo} alt="" className="h-12 w-auto object-contain" />}
          <div>
            <div className="font-bold text-slate-800">{businessInfo?.name || 'Your Business'}</div>
            <div className="text-xs text-slate-400">
              {[businessInfo?.address, businessInfo?.phone, businessInfo?.email].filter(Boolean).join('  ·  ')}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-slate-800 tracking-wide">INVOICE</div>
          <div className="text-xs text-slate-400">{invoiceNumber(invoiceId) ? `#${invoiceNumber(invoiceId)}` : 'Draft'}</div>
          <div className="text-xs text-slate-400">{formatEventDate(issueDate ? issueDate.slice(0, 10) : new Date().toISOString().slice(0, 10))}</div>
          {statusMeta && <div className="mt-1.5"><Badge color={statusMeta.color}>{statusMeta.label}</Badge></div>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Bill To</div>
          <div className="text-sm font-semibold text-slate-800">{client ? `${client.firstName} ${client.lastName}`.trim() : 'Your client'}</div>
          <div className="text-xs text-slate-400">{client?.email || 'No email on file'}</div>
        </div>
        {eventLine && (
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Event</div>
            <div className="text-sm text-slate-700">{eventLine}</div>
            {event?.venue && <div className="text-xs text-slate-400">{event.venue}</div>}
          </div>
        )}
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Due Date</div>
          <div className="text-sm text-slate-700">{dueDate ? formatEventDate(dueDate.slice(0, 10)) : 'Due on receipt'}</div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center mb-6">
          No line items yet.
        </div>
      ) : (
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                <th className="pb-2 font-semibold">Description</th>
                <th className="pb-2 font-semibold text-right w-16">Qty</th>
                <th className="pb-2 font-semibold text-right w-24">Rate</th>
                <th className="pb-2 font-semibold text-right w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-slate-700">{item.name || 'Item'}</div>
                    {item.details && <div className="text-xs text-slate-400 mt-0.5">{item.details}</div>}
                  </td>
                  <td className="py-3 text-right text-slate-500">{item.type === 'perUnit' ? item.unitCount : '—'}</td>
                  <td className="py-3 text-right text-slate-500">{item.type === 'perUnit' ? currency(item.ratePerUnit) : '—'}</td>
                  <td className="py-3 text-right font-semibold text-slate-700 whitespace-nowrap">{currency(computeOfferingTotal(item))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end">
        <div className="w-full max-w-xs text-sm">
          <div className="flex justify-between py-1">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-semibold text-slate-700">{currency(grandTotal)}</span>
          </div>
          {status === 'partial' && (
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Paid</span>
              <span className="font-semibold text-emerald-600">−{currency(paidAmount)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 mt-1 border-t border-slate-200">
            <span className="font-bold text-slate-800">{status === 'partial' ? 'Balance Due' : status === 'paid' ? 'Total Paid' : 'Total Due'}</span>
            <span className="font-bold text-lg text-slate-800">{currency(status === 'partial' ? balanceDue : grandTotal)}</span>
          </div>
        </div>
      </div>

      {memo && (
        <div className="mt-6 pt-6 border-t border-slate-100 text-sm text-slate-600 whitespace-pre-wrap">{memo}</div>
      )}

      <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-400">
        Thank you for your business!
      </div>
    </div>
  );
}
