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
  { key: 'invoiceOverdueDays', default: 3, label: 'Overdue invoice', description: 'Remind when a sent invoice is this many days past its due date.' },
  { key: 'followUpGraceDays', default: 0, label: 'Booking follow-up', description: 'Remind this many days after a booking’s follow-up date arrives (0 = same day).' },
  { key: 'eventNotCompletedGraceDays', default: 1, label: 'Event not marked complete', description: 'Remind this many days after an event’s date passes if it’s still not marked complete.' },
  { key: 'proposalNoResponseDays', default: 5, label: 'Proposal awaiting response', description: 'Remind when a sent proposal has gone this many days without a client response.' },
];

export default function ReminderRulesTab() {
  const { currentUser, updateCurrentUser, can } = useAuth();
  const canEdit = can('manageSettings');
  const { showToast } = useToast();
  const [form, setForm] = useState(() => {
    const saved = currentUser.reminderSettings || {};
    return Object.fromEntries(RULES.map((r) => [r.key, saved[r.key] ?? r.default]));
  });

  function update(key, value) {
    const n = value === '' ? '' : Math.max(0, Math.min(90, Number(value) || 0));
    setForm((f) => ({ ...f, [key]: n }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const cleaned = Object.fromEntries(RULES.map((r) => [r.key, form[r.key] === '' ? r.default : form[r.key]]));
    updateCurrentUser({ reminderSettings: cleaned });
    showToast('Reminder rules saved');
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-1">
      <p className="text-sm text-slate-500 mb-4">
        Automatic reminders are checked every 15 minutes. Changes here apply the next time a rule runs — they don't retroactively touch reminders already created.
      </p>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {RULES.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-700">{r.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{r.description}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="number"
                min="0"
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
