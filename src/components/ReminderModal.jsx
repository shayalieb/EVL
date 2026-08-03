import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import { useData } from '../context/DataContext';
import { createReminder, updateReminder } from '../lib/reminders';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

function personName(person) {
  return `${person.firstName || ''} ${person.lastName || ''}`.trim();
}

function toDateInputValue(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInputValue(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const emptyForm = {
  relatedType: '',
  relatedId: '',
  date: '',
  time: '09:00',
  note: '',
  emailEnabled: false,
};

export default function ReminderModal({ open, onClose, reminder, onSaved }) {
  const { clients, contractors } = useData();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(reminder ? {
        relatedType: reminder.relatedType || '',
        relatedId: reminder.relatedId || '',
        date: toDateInputValue(reminder.remindAt),
        time: toTimeInputValue(reminder.remindAt),
        note: reminder.note || '',
        emailEnabled: !!reminder.emailEnabled,
      } : emptyForm);
      setError('');
    }
  }, [open, reminder]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  function updateRelatedType(type) {
    setForm((f) => ({ ...f, relatedType: type, relatedId: '' }));
  }

  const relatedOptions = form.relatedType === 'client' ? clients : form.relatedType === 'contractor' ? contractors : [];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.note.trim()) return setError('Reminder note is required.');
    if (!form.date || !form.time) return setError('Reminder date and time are required.');

    const related = relatedOptions.find((p) => p.id === form.relatedId);
    const payload = {
      relatedType: form.relatedType || null,
      relatedId: form.relatedType ? form.relatedId || null : null,
      relatedName: form.relatedType && related ? personName(related) : null,
      note: form.note.trim(),
      remindAt: new Date(`${form.date}T${form.time}`).toISOString(),
      emailEnabled: form.emailEnabled,
    };

    setSaving(true);
    try {
      const saved = reminder ? await updateReminder(reminder.id, payload) : await createReminder(payload);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={reminder ? 'Edit Reminder' : 'Add Reminder'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div data-testid="reminder-modal-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Related To</label>
            <select
              value={form.relatedType}
              onChange={(e) => updateRelatedType(e.target.value)}
              data-testid="reminder-modal-related-type-select"
              className={inputClass}
            >
              <option value="">None</option>
              <option value="client">Client</option>
              <option value="contractor">Contractor</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{form.relatedType === 'client' ? 'Client' : form.relatedType === 'contractor' ? 'Contractor' : '—'}</label>
            <select
              value={form.relatedId}
              onChange={(e) => update('relatedId', e.target.value)}
              disabled={!form.relatedType}
              data-testid="reminder-modal-related-id-select"
              className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
            >
              <option value="">Select…</option>
              {relatedOptions.map((p) => (
                <option key={p.id} value={p.id}>{personName(p)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Reminder Date *</label>
            <input required type="date" value={form.date} onChange={(e) => update('date', e.target.value)} data-testid="reminder-modal-date-input" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Reminder Time *</label>
            <input required type="time" value={form.time} onChange={(e) => update('time', e.target.value)} data-testid="reminder-modal-time-input" className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Reminder Note *</label>
          <textarea
            required
            rows={3}
            placeholder="e.g. Follow up about final headcount"
            value={form.note}
            onChange={(e) => update('note', e.target.value)}
            data-testid="reminder-modal-note-textarea"
            className={inputClass}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.emailEnabled}
            onChange={(e) => update('emailEnabled', e.target.checked)}
            data-testid="reminder-modal-email-checkbox"
            className="rounded border-slate-300"
          />
          Email me a reminder
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} data-testid="reminder-modal-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving} data-testid="reminder-modal-save-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
            {saving ? 'Saving…' : reminder ? 'Save Changes' : 'Add Reminder'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
