import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import MoneyInput from './ui/MoneyInput';
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

// Generic "accept a payment" popover — for money that moved outside Stripe
// (ACH, check, card run elsewhere, cash, etc.) and just needs to be
// recorded. Used both for marking a client invoice paid and for paying a
// contractor after a gig; the caller owns what actually happens with the
// collected values via `onAccept` (async — throwing shows the error inline
// and keeps the modal open, same as a failed fetch would).
//
// `overtime` is optional and contractor-only (an invoice has no such
// concept) — when passed, this becomes the primary place to reconcile
// actual overtime hours worked, since that's usually only known once
// you're actually paying the contractor. Editing hours here recomputes
// Amount live; the resolved hours come back to the caller via
// onAccept's `overtimeHours` so it can persist the same override
// ContractorPickerRow's own OT Hours field writes to — one field, two
// convenient places to edit it.
export default function AcceptPaymentModal({ open, title = 'Accept Payment', amountDue, amountLabel = 'Amount due', initialValues, overtime, onClose, onAccept }) {
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayLocalDate());
  const [method, setMethod] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [memo, setMemo] = useState('');
  const [overtimeHours, setOvertimeHours] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(String(initialValues?.amount ?? amountDue ?? ''));
      setPaymentDate(initialValues?.paymentDate || todayLocalDate());
      setMethod(initialValues?.method || '');
      setCheckNumber(initialValues?.checkNumber || '');
      setMemo(initialValues?.memo || '');
      setOvertimeHours(overtime ? String(overtime.hours || '') : '');
      setError('');
    }
    // Only meant to reset when the popover opens, not on every keystroke of
    // its own state or every re-render with a fresh amountDue/initialValues
    // object reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function handleOvertimeHoursChange(value) {
    setOvertimeHours(value);
    // Recomputes Amount for you, same as amountDue's initial suggestion —
    // still just a starting point, Amount stays freely editable afterward.
    if (overtime) setAmount(String(overtime.baseAmount + (Number(value) || 0) * overtime.rate));
  }

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
      await onAccept({
        amount: Number(amount),
        paymentDate,
        method,
        checkNumber: method === 'check' ? checkNumber.trim() : undefined,
        memo: memo.trim() || undefined,
        ...(overtime ? { overtimeHours: Number(overtimeHours) || 0 } : {}),
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to accept payment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={submitting ? undefined : onClose} title={title}>
      <div className="space-y-4">
        {error && <div data-testid="accept-payment-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        {overtime && (
          <div>
            <label className={labelClass}>Overtime Hours</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={overtimeHours}
              onChange={(e) => handleOvertimeHoursChange(e.target.value)}
              data-testid="accept-payment-overtime-hours-input"
              className={inputClass}
            />
            <div className="text-xs text-slate-400 mt-1">
              {currency(overtime.baseAmount)} base + {overtimeHours || 0} hrs × {currency(overtime.rate)}/hr
            </div>
          </div>
        )}

        <div>
          <label className={labelClass}>Amount</label>
          <MoneyInput value={amount} onChange={setAmount} testId="accept-payment-amount-input" className={moneyInputClass} />
          {amountDue !== undefined && <div className="text-xs text-slate-400 mt-1">{amountLabel}: {currency(amountDue)}</div>}
        </div>

        <div>
          <label className={labelClass}>Payment Date</label>
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} data-testid="accept-payment-date-input" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Payment Method</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                data-testid="accept-payment-method-button"
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
            <input autoFocus value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} data-testid="accept-payment-check-number-input" className={inputClass} />
          </div>
        )}

        <div>
          <label className={labelClass}>Memo</label>
          <textarea
            rows={2}
            placeholder="Optional internal note about this payment"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            data-testid="accept-payment-memo-textarea"
            className={inputClass}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            data-testid="accept-payment-cancel-button"
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={submitting}
            data-testid="accept-payment-accept-button"
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
