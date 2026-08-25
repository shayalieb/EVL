import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from './ui/Modal';
import Badge from './ui/Badge';
import { useData } from '../context/DataContext';
import { createReminder, updateReminder, relatedRecordPath } from '../lib/reminders';
import { listInvoices } from '../lib/invoices';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

const RELATED_TYPE_LABELS = { client: 'Client', contractor: 'Contractor', event: 'Event', invoice: 'Invoice', booking: 'Booking' };
const RELATED_TYPE_COLORS = { client: '#6366f1', contractor: '#0ea5e9', event: '#d97706', invoice: '#e11d48', booking: '#8b5cf6' };

function personName(person) {
  return `${person.firstName || ''} ${person.lastName || ''}`.trim();
}

function invoiceLabel(invoice) {
  return invoice.recipientName || `Invoice #${invoice.number ?? '—'}`;
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
  const {
    clients, contractors, events,
    searchClients, loadClient, searchContractors, loadContractor, searchEvents, loadEvent,
  } = useData();
  const [invoices, setInvoices] = useState([]);
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

  // Loaded regardless of whether this reminder is invoice-related, so the
  // read-only "Related to" card below can resolve an invoice's own booking
  // for its View link (Invoice has no page of its own — see
  // relatedRecordPath in lib/reminders.js).
  useEffect(() => {
    if (!open) return;
    listInvoices().then(setInvoices).catch(() => setInvoices([]));
    searchClients('').catch(() => {});
    searchContractors('').catch(() => {});
    searchEvents('').catch(() => {});
    if (reminder?.relatedType === 'client' && reminder.relatedId) loadClient(reminder.relatedId).catch(() => {});
    if (reminder?.relatedType === 'contractor' && reminder.relatedId) loadContractor(reminder.relatedId).catch(() => {});
    if (reminder?.relatedType === 'event' && reminder.relatedId) loadEvent(reminder.relatedId).catch(() => {});
  }, [open, reminder?.relatedId, reminder?.relatedType, searchClients, loadClient, searchContractors, loadContractor, searchEvents, loadEvent]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  function updateRelatedType(type) {
    setForm((f) => ({ ...f, relatedType: type, relatedId: '' }));
  }

  const relatedOptions = form.relatedType === 'client' ? clients
    : form.relatedType === 'contractor' ? contractors
    : form.relatedType === 'event' ? events
    : form.relatedType === 'invoice' ? invoices
    : [];

  function labelFor(type, record) {
    if (type === 'event') return record.name || 'Untitled event';
    if (type === 'invoice') return invoiceLabel(record);
    return personName(record);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.note.trim()) return setError('Reminder note is required.');
    if (!form.date || !form.time) return setError('Reminder date and time are required.');

    const related = relatedOptions.find((r) => r.id === form.relatedId);
    // A manual reminder's relatedId only ever changes through the pickers
    // below, which always resolve `related` when it's actually set — so a
    // missed lookup here means the linked record was deleted since this
    // reminder was created/last edited, not that the link is gone. Keep
    // showing the name that was there before instead of silently blanking
    // it (this exact silent-blank was the bug: editing an auto-generated
    // reminder used to always hit this path, since its type was never one
    // the old picker could resolve at all — auto-generated reminders don't
    // reach this function anymore; see the read-only branch in the render
    // below).
    const relatedName = related
      ? labelFor(form.relatedType, related)
      : (form.relatedType === reminder?.relatedType && form.relatedId === reminder?.relatedId ? reminder?.relatedName : null);

    const payload = {
      relatedType: form.relatedType || null,
      relatedId: form.relatedType ? form.relatedId || null : null,
      relatedName: form.relatedType ? relatedName : null,
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

  // Auto-generated reminders (see server/src/lib/reminderRuleEngine.js) are
  // owned by the rule that created them — reassigning what they're "about"
  // doesn't make sense (the rule's own logic decides that), so this shows a
  // plain, unmissable read-only summary of what it's related to instead of
  // an editable picker. This is also what fixes the underlying bug: there's
  // no dropdown here at all, so there's nothing to silently fail to resolve.
  const isAutoGenerated = !!reminder?.autoGenerated;
  const invoiceForLink = isAutoGenerated && reminder.relatedType === 'invoice'
    ? invoices.find((inv) => inv.id === reminder.relatedId)
    : null;
  const autoRelatedPath = isAutoGenerated
    ? (reminder.relatedType === 'invoice'
      ? (invoiceForLink ? `/bookings/${invoiceForLink.bookingId}?tab=invoices` : null)
      : relatedRecordPath(reminder))
    : null;

  return (
    <Modal open={open} onClose={onClose} title={reminder ? 'Edit Reminder' : 'Add Reminder'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div data-testid="reminder-modal-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        {isAutoGenerated ? (
          <div data-testid="reminder-modal-auto-related-card" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Related To</span>
              <span className="text-[11px] font-semibold text-slate-400">Auto-generated</span>
            </div>
            {reminder.relatedName ? (
              <div className="flex items-center justify-between gap-3">
                <Badge color={RELATED_TYPE_COLORS[reminder.relatedType] || '#0ea5e9'}>
                  {RELATED_TYPE_LABELS[reminder.relatedType] || 'Related'}: {reminder.relatedName}
                </Badge>
                {autoRelatedPath && (
                  <Link to={autoRelatedPath} onClick={onClose} data-testid="reminder-modal-related-view-link" className="text-xs font-semibold text-indigo-600 hover:underline shrink-0">
                    View →
                  </Link>
                )}
              </div>
            ) : (
              <div className="text-sm text-slate-400">Not linked to a specific record.</div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <option value="event">Event</option>
                <option value="invoice">Invoice</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>{RELATED_TYPE_LABELS[form.relatedType] || '—'}</label>
              <select
                value={form.relatedId}
                onChange={(e) => update('relatedId', e.target.value)}
                disabled={!form.relatedType}
                data-testid="reminder-modal-related-id-select"
                className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
              >
                <option value="">Select…</option>
                {relatedOptions.map((r) => (
                  <option key={r.id} value={r.id}>{labelFor(form.relatedType, r)}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
