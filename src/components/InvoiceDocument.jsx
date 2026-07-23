import { computeOfferingTotal, computeOfferingsTotal } from '../lib/offerings';
import { formatCurrency as currency, formatEventDate } from '../lib/format';

// Shared between the composer's live Preview (BookingFormPage, not-yet-sent
// draft state) and the actual public pay page (InvoicePayPage, the sent/
// frozen snapshot) — same rendering either way, so what the business
// previews is exactly what the client will see.
export default function InvoiceDocument({ businessInfo, client, lineItems, dueDate, memo, total }) {
  const items = lineItems || [];
  const grandTotal = total ?? computeOfferingsTotal(items);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="font-bold text-slate-800">{businessInfo?.name || 'Your Business'}</div>
          <div className="text-xs text-slate-400">
            Invoice for {client ? `${client.firstName} ${client.lastName}`.trim() : 'your client'}
          </div>
        </div>
        {dueDate && <div className="text-xs text-slate-400">Due {formatEventDate(dueDate.slice(0, 10))}</div>}
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
          No line items yet.
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
              <div>
                <div className="text-sm font-semibold text-slate-700">{item.name || 'Item'}</div>
                {item.details && <div className="text-xs text-slate-400 mt-0.5">{item.details}</div>}
              </div>
              <div className="text-sm font-semibold text-slate-700 shrink-0">{currency(computeOfferingTotal(item))}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <span className="text-sm font-bold text-slate-800">Total</span>
        <span className="text-lg font-bold text-slate-800">{currency(grandTotal)}</span>
      </div>

      {memo && (
        <div className="mt-6 pt-6 border-t border-slate-100 text-sm text-slate-600 whitespace-pre-wrap">{memo}</div>
      )}
    </div>
  );
}
