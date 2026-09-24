import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';

const inputClass = 'w-20 px-3 py-2 rounded-lg border border-slate-300 text-sm text-center focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

// Mirrors server/src/lib/reminderRuleEngine.js's DEFAULT_THRESHOLDS — kept
// as a separate copy rather than fetched, since these are just the values
// shown when an account hasn't customized anything yet (the server applies
// its own defaults independently either way, so the two never need to be
// read from a single source of truth).
const RULES = [
  { key: 'eventAtRiskDays', default: 3, label: 'Unconfirmed vendor', description: 'Remind when an event is within this many days and still has a vendor who hasn’t confirmed.' },
  { key: 'contractUnsignedDays', default: 3, label: 'Unsigned contract', description: 'Remind when an event is within this many days and its contract still isn’t fully signed.' },
  { key: 'depositDueSoonDays', default: 3, label: 'Deposit due', description: 'Remind when a booking’s deposit is due within this many days (or already overdue).' },
  { key: 'invoiceFirstReminderDays', default: 3, label: 'First invoice reminder', description: 'Days before the invoice due date when no deposit has been paid. Without a due date, days after sending.' },
  { key: 'invoiceDepositReminderDays', default: 7, label: 'Balance reminder after deposit', description: 'Days before the invoice due date after any payment or a booking deposit. Applies whether payment is due before, on, or after the gig. A due date is required.' },
  { key: 'invoiceRepeatDays', default: 7, min: 1, label: 'Repeat invoice reminders', description: 'Email again this many days after the last reminder while the invoice remains open. Stops when paid or void.' },
  { key: 'followUpGraceDays', default: 0, label: 'Booking follow-up', description: 'Remind this many days after a booking’s follow-up date arrives (0 = same day).' },
  { key: 'eventNotCompletedGraceDays', default: 1, label: 'Event not marked complete', description: 'Remind this many days after an event’s date passes if it’s still not marked complete.' },
  { key: 'proposalNoResponseDays', default: 5, label: 'Proposal awaiting response', description: 'Remind when a sent proposal has gone this many days without a client response.' },
];

const TOGGLES = [
  { key: 'inquiryEmailEnabled', label: 'Email me about new inquiries', description: 'Notify the account member who created the link, falling back to the account owner.' },
  { key: 'inquiryReminderEnabled', label: 'Keep an inquiry reminder in GigWorks', description: 'Keep the reminder open until the inquiry is applied to a booking or removed.' },
  { key: 'invoiceRemindersEnabled', label: 'Automated invoice reminders', description: 'Send reminders for sent and partially paid invoices using the timing below.' },
];

export default function ReminderRulesTab() {
  const { currentUser, updateCurrentUser, can } = useAuth();
  const canEdit = can('manageSettings');
  const { showToast } = useToast();
  const [form, setForm] = useState(() => {
    const saved = currentUser.reminderSettings || {};
    return { ...saved, ...Object.fromEntries(RULES.map((r) => [r.key, saved[r.key] ?? r.default])), ...Object.fromEntries(TOGGLES.map((r) => [r.key, saved[r.key] ?? true])), invoiceReminderRecipient: saved.invoiceReminderRecipient || 'owner' };
  });

  function update(key, value) {
    const n = value === '' ? '' : Math.max(0, Math.min(90, Number(value) || 0));
    setForm((f) => ({ ...f, [key]: n }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const cleaned = { ...form, ...Object.fromEntries(RULES.map((r) => [r.key, form[r.key] === '' ? r.default : Math.max(r.min || 0, form[r.key])])) };
    updateCurrentUser({ reminderSettings: cleaned });
    showToast('Reminder rules saved');
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-1">
      <p className="text-sm text-slate-500 mb-4">
        Automatic reminders are checked every 15 minutes. Inquiry emails are queued when a form is submitted. Changes to inquiry and invoice settings apply to existing open items on the next check.
      </p>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {TOGGLES.map((r) => (
          <label key={r.key} className="flex items-center justify-between gap-4 px-4 py-3">
            <div><div className="text-sm font-semibold text-slate-700">{r.label}</div><div className="text-xs text-slate-500 mt-0.5">{r.description}</div></div>
            <input type="checkbox" checked={form[r.key]} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, [r.key]: e.target.checked }))} />
          </label>
        ))}
        <label className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-sm font-semibold text-slate-700">Invoice reminder recipients</span>
          <select className="border border-slate-300 rounded-lg p-2 text-sm" disabled={!canEdit} value={form.invoiceReminderRecipient} onChange={(e) => setForm((f) => ({ ...f, invoiceReminderRecipient: e.target.value }))}>
            <option value="owner">GigWorks user / owner</option>
            <option value="client">Client</option>
            <option value="both">Both</option>
          </select>
        </label>
        {RULES.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-700">{r.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{r.description}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="number"
                aria-label={r.label}
                min={r.min || 0}
                max="90"
                disabled={!canEdit}
                value={form[r.key]}
                onChange={(e) => update(r.key, e.target.value)}
                data-testid={`reminder-rules-${r.key}-input`}
                className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
              />
              <span className="text-xs text-slate-400">days</span>
            </div>
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="pt-3">
          <button type="submit" data-testid="reminder-rules-save-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
            Save
          </button>
        </div>
      )}
    </form>
  );
}
