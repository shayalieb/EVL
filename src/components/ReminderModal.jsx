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
  recurrenceFrequency: '',
  recurrenceEndsAt: '',
};

function defaultReminderDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date;
}

export default function ReminderModal({ open, onClose, reminder, onSaved }) {
  const {
    searchClients, loadClient, searchContractors, loadContractor, searchEvents, loadEvent, searchBookings, loadBooking,
  } = useData();
  const [invoices, setInvoices] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [relatedQuery, setRelatedQuery] = useState('');
  const [relatedResults, setRelatedResults] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const relatedType = form.relatedType;
  const relatedId = form.relatedId;

  useEffect(() => {
    if (open) {
      const defaultDate = defaultReminderDate();
      setForm(reminder ? {
        relatedType: reminder.relatedType || '',
        relatedId: reminder.relatedId || '',
        date: toDateInputValue(reminder.remindAt),
        time: toTimeInputValue(reminder.remindAt),
        note: reminder.note || '',
        emailEnabled: !!reminder.emailEnabled,
        recurrenceFrequency: reminder.recurrenceFrequency || '',
        recurrenceEndsAt: reminder.recurrenceEndsAt ? toDateInputValue(reminder.recurrenceEndsAt) : '',
      } : { ...emptyForm, date: toDateInputValue(defaultDate), time: toTimeInputValue(defaultDate) });
      setError('');
      setRelatedQuery('');
      setRelatedResults([]);
    }
  }, [open, reminder]);

  // Loaded regardless of whether this reminder is invoice-related, so the
  // read-only "Related to" card below can resolve an invoice's own booking
  // for its View link (Invoice has no page of its own — see
  // relatedRecordPath in lib/reminders.js).
  useEffect(() => {
    if (!open) return;
    listInvoices().then(setInvoices).catch(() => setInvoices([]));
    const loaders = { client: loadClient, contractor: loadContractor, event: loadEvent, booking: loadBooking };
    const loader = loaders[reminder?.relatedType];
    if (loader && reminder.relatedId) loader(reminder.relatedId).then((record) => setRelatedResults([record])).catch(() => {});
  }, [open, reminder?.relatedId, reminder?.relatedType, loadClient, loadContractor, loadEvent, loadBooking]);

  useEffect(() => {
    if (!open || !['client', 'contractor', 'event', 'booking'].includes(relatedType)) return undefined;
    let cancelled = false;
    const searches = { client: searchClients, contractor: searchContractors, event: searchEvents, booking: searchBookings };
    const timer = setTimeout(() => {
      setRelatedLoading(true);
      searches[relatedType](relatedQuery)
        .then((items) => {
          if (!cancelled) setRelatedResults((previous) => {
            const selected = previous.find((item) => item.id === relatedId);
            return selected && !items.some((item) => item.id === selected.id) ? [selected, ...items] : items;
          });
        })
        .catch(() => { if (!cancelled) setRelatedResults([]); })
        .finally(() => { if (!cancelled) setRelatedLoading(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, relatedType, relatedId, relatedQuery, searchClients, searchContractors, searchEvents, searchBookings]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  function updateRelatedType(type) {
    setForm((f) => ({ ...f, relatedType: type, relatedId: '' }));
    setRelatedQuery('');
    setRelatedResults([]);
  }

  const invoiceQuery = relatedQuery.trim().toLowerCase();
  const relatedOptions = form.relatedType === 'invoice'
    ? invoices.filter((invoice) => invoiceLabel(invoice).toLowerCase().includes(invoiceQuery))
    : relatedResults;

  function labelFor(type, record) {
    if (type === 'event') return record.name || 'Untitled event';
    if (type === 'booking') return record.name || record.eventName || record.clientName || 'Untitled booking';
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

    const remindAt = new Date(`${form.date}T${form.time}`);
    if (!reminder && remindAt <= new Date()) return setError('Choose a future date and time for a new reminder.');
    const payload = {
      relatedType: form.relatedType || null,
      relatedId: form.relatedType ? form.relatedId || null : null,
      relatedName: form.relatedType ? relatedName : null,
      note: form.note.trim(),
      remindAt: remindAt.toISOString(),
      emailEnabled: form.emailEnabled,
      emailTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      recurrenceFrequency: isAutoGenerated ? null : form.recurrenceFrequency || null,
      recurrenceEndsAt: form.recurrenceFrequency && form.recurrenceEndsAt ? new Date(`${form.recurrenceEndsAt}T23:59:59`).toISOString() : null,
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
                <option value="">None (standalone)</option>
                <option value="client">Client</option>
                <option value="contractor">Contractor</option>
                <option value="event">Event</option>
                <option value="invoice">Invoice</option>
                <option value="booking">Booking</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>{RELATED_TYPE_LABELS[form.relatedType] || '—'}</label>
              {form.relatedType && (
                <input
                  value={relatedQuery}
                  onChange={(e) => setRelatedQuery(e.target.value)}
                  placeholder={`Search ${RELATED_TYPE_LABELS[form.relatedType]?.toLowerCase() || 'records'}…`}
                  aria-label={`Search ${RELATED_TYPE_LABELS[form.relatedType]?.toLowerCase() || 'related records'}`}
                  data-testid="reminder-modal-related-search-input"
                  className={`${inputClass} mb-2`}
                />
              )}
              <select
                value={form.relatedId}
                onChange={(e) => update('relatedId', e.target.value)}
                disabled={!form.relatedType}
                aria-label={form.relatedType ? `Select related ${RELATED_TYPE_LABELS[form.relatedType].toLowerCase()}` : 'No related record type selected'}
                data-testid="reminder-modal-related-id-select"
                className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
              >
                <option value="">{relatedLoading ? 'Searching…' : 'Select…'}</option>
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
            <input required type="date" min={!reminder ? toDateInputValue(new Date()) : undefined} value={form.date} onChange={(e) => update('date', e.target.value)} data-testid="reminder-modal-date-input" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Reminder Time *</label>
            <input required type="time" value={form.time} onChange={(e) => update('time', e.target.value)} data-testid="reminder-modal-time-input" className={inputClass} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap -mt-2">
          <span className="text-xs text-slate-400">Quick set:</span>
          {[
            { label: 'Tomorrow, 9 AM', days: 1 },
            { label: 'In 3 days, 9 AM', days: 3 },
            { label: 'Next week, 9 AM', days: 7 },
          ].map((option) => (
            <button
              key={option.days}
              type="button"
              onClick={() => {
                const next = new Date();
                next.setDate(next.getDate() + option.days);
                next.setHours(9, 0, 0, 0);
                setForm((current) => ({ ...current, date: toDateInputValue(next), time: toTimeInputValue(next) }));
              }}
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50"
            >
              {option.label}
            </button>
          ))}
          <span className="text-xs text-slate-400">Times use {Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll('_', ' ')}.</span>
        </div>

        {!isAutoGenerated && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div>
              <label className={labelClass}>Repeat</label>
              <select
                value={form.recurrenceFrequency}
                onChange={(e) => {
                  update('recurrenceFrequency', e.target.value);
                  if (!e.target.value) update('recurrenceEndsAt', '');
                }}
                data-testid="reminder-modal-repeat-select"
                className={inputClass}
              >
                <option value="">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Repeat Until <span className="font-normal">(optional)</span></label>
              <input
                type="date"
                min={form.date || toDateInputValue(new Date())}
                value={form.recurrenceEndsAt}
                onChange={(e) => update('recurrenceEndsAt', e.target.value)}
                disabled={!form.recurrenceFrequency}
                data-testid="reminder-modal-repeat-until-input"
                className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-400`}
              />
            </div>
            {form.recurrenceFrequency && (
              <p className="sm:col-span-2 text-xs text-slate-500">
                The next reminder is created when this one is marked done. Delete the current open reminder to stop the series.
              </p>
            )}
          </div>
        )}

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
          Email me when this reminder is due
        </label>
        {form.emailEnabled && <p className="text-xs text-slate-400 -mt-2">The email is sent to the account email for the person creating this reminder.</p>}

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
