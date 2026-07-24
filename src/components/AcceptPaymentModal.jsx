import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import MoneyInput from './ui/MoneyInput';
import { markInvoicePayment } from '../lib/invoices';
import { formatCurrency as currency } from '../lib/format';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const moneyInputClass = 'w-full py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

const METHODS = [
  { value: 'ach', label: 'ACH' },
  { value: 'check', label: 'Check' },
  { value: 'card', label: 'Credit/Debit Card' },
  { value: 'other', label: 'Other' },
];

function todayLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Manual "accept a payment" flow — for money collected outside Stripe
// (ACH, check, card run elsewhere, etc.). Opened from the Mark Paid action
// in a booking's Invoice History; submitting calls the same mark-payment
// endpoint the quick-action buttons use, just with the fuller payload this
// form collects.
export default function AcceptPaymentModal({ open, invoice, onClose, onAccepted }) {
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayLocalDate());
  const [method, setMethod] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && invoice) {
      setAmount(String(invoice.total ?? ''));
      setPaymentDate(todayLocalDate());
      setMethod('');
      setCheckNumber('');
      setMemo('');
      setError('');
    }
  }, [open, invoice]);

  if (!open || !invoice) return null;

  async function handleAccept() {
    if (!(Number(amount) > 0)) {
      setError('Enter an amount greater than $0.');
      return;
    }
    if (!paymentDate) {
      setError('Payment date is required.');
      return;
    }
    if (!method) {
      setError('Select a payment method.');
      return;
    }
    if (method === 'check' && !checkNumber.trim()) {
      setError('Enter the check number.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const updated = await markInvoicePayment(invoice.id, {
        status: 'paid',
        paidAmount: Number(amount),
        paidAt: paymentDate,
        paymentMethod: method,
        paymentReference: method === 'check' ? checkNumber.trim() : undefined,
        paymentMemo: memo.trim() || undefined,
      });
      onAccepted(updated);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to accept payment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={submitting ? undefined : onClose} title="Accept Payment">
      <div className="space-y-4">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div>
          <label className={labelClass}>Amount</label>
          <MoneyInput value={amount} onChange={setAmount} className={moneyInputClass} />
          <div className="text-xs text-slate-400 mt-1">Invoice amount: {currency(invoice.total)}</div>
        </div>

        <div>
          <label className={labelClass}>Payment Date</label>
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Payment Method</label>
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                className={`px-3 py-2 rounded-lg border text-sm font-semibold ${
                  method === m.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {method === 'check' && (
          <div>
            <label className={labelClass}>Check Number</label>
            <input autoFocus value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} className={inputClass} />
          </div>
        )}

        <div>
          <label className={labelClass}>Memo</label>
          <textarea
            rows={2}
            placeholder="Optional internal note about this payment"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2"
          >
            {submitting && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            Accept Payment
          </button>
        </div>
      </div>
    </Modal>
  );
}
