import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './ui/Modal';
import ClientModal from './ClientModal';
import { useData } from '../context/DataContext';
import { useToast } from './ui/Toast';
import { uid } from '../lib/storage';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

export const PRIORITIES = [
  { value: 'hot', label: 'Hot', color: '#ef4444' },
  { value: 'warm', label: 'Warm', color: '#eab308' },
  { value: 'cold', label: 'Cold', color: '#3b82f6' },
];

const emptyForm = {
  clientId: '', eventDate: '', eventType: '',
  package: '', quotedTotal: '',
  depositAmount: '', depositDueDate: '', depositPaid: false,
  bookingStatus: '', priority: '', nextFollowUpDate: '',
  contractSignedDate: '', referralSource: '', notes: '', activityLog: [],
};

export default function BookingModal({ open, onClose, booking }) {
  const {
    clients, eventTypes, addEventType, bookingStatuses,
    addBooking, updateBooking, convertBookingToEvent,
  } = useData();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [newClientModalOpen, setNewClientModalOpen] = useState(false);
  const [addingType, setAddingType] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [newActivityText, setNewActivityText] = useState('');

  useEffect(() => {
    if (open) {
      setForm(booking ? {
        clientId: booking.clientId || '',
        eventDate: booking.eventDate || '',
        eventType: booking.eventType || '',
        package: booking.package || '',
        quotedTotal: booking.quotedTotal ?? '',
        depositAmount: booking.depositAmount ?? '',
        depositDueDate: booking.depositDueDate || '',
        depositPaid: !!booking.depositPaid,
        bookingStatus: booking.bookingStatus || (bookingStatuses[0]?.id || ''),
        priority: booking.priority || '',
        nextFollowUpDate: booking.nextFollowUpDate || '',
        contractSignedDate: booking.contractSignedDate || '',
        referralSource: booking.referralSource || '',
        notes: booking.notes || '',
        activityLog: booking.activityLog || [],
      } : { ...emptyForm, bookingStatus: bookingStatuses[0]?.id || '' });
      setError('');
      setAddingType(false);
      setNewActivityText('');
    }
  }, [open, booking, bookingStatuses]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  function handleAddActivity() {
    if (!newActivityText.trim()) return;
    const entry = { id: uid('activity'), date: new Date().toISOString(), text: newActivityText.trim() };
    setForm((f) => ({ ...f, activityLog: [entry, ...f.activityLog] }));
    setNewActivityText('');
  }

  function handleAddType() {
    if (!newTypeLabel.trim()) return;
    addEventType(newTypeLabel);
    update('eventType', newTypeLabel.trim());
    setNewTypeLabel('');
    setAddingType(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.clientId) {
      setError('A client is required.');
      return;
    }
    const patch = {
      ...form,
      quotedTotal: form.quotedTotal === '' ? null : Number(form.quotedTotal),
      depositAmount: form.depositAmount === '' ? null : Number(form.depositAmount),
    };
    if (booking) updateBooking(booking.id, patch);
    else addBooking(patch);
    onClose();
  }

  function handleConvert() {
    const event = convertBookingToEvent(booking.id);
    if (!event) return;
    showToast('Booking converted to event');
    onClose();
    navigate(`/events/${event.id}`);
  }

  const status = bookingStatuses.find((s) => s.id === form.bookingStatus);
  const canConvert = booking && !booking.convertedEventId && status?.isBooked;

  return (
    <Modal open={open} onClose={onClose} title={booking ? 'Edit Booking' : 'Add Booking'} widthClass="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        {booking?.convertedEventId && (
          <div className="flex items-center justify-between gap-3 text-sm bg-blue-50 border border-blue-100 text-blue-700 rounded-lg px-3 py-2">
            <span>Converted to an event.</span>
            <button
              type="button"
              onClick={() => { onClose(); navigate(`/events/${booking.convertedEventId}`); }}
              className="font-semibold hover:underline shrink-0"
            >
              View Event →
            </button>
          </div>
        )}

        <div>
          <label className={labelClass}>Client *</label>
          <div className="flex gap-2">
            <select required value={form.clientId} onChange={(e) => update('clientId', e.target.value)} className={inputClass}>
              <option value="">Select a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setNewClientModalOpen(true)}
              className="shrink-0 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
            >
              + New Client
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Event Date (tentative is fine)</label>
            <input type="date" value={form.eventDate} onChange={(e) => update('eventDate', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Event Type</label>
            {!addingType ? (
              <div className="flex gap-2">
                <select value={form.eventType} onChange={(e) => update('eventType', e.target.value)} className={inputClass}>
                  <option value="">Select a type…</option>
                  {eventTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button type="button" onClick={() => setAddingType(true)} className="shrink-0 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50">+ Add</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input autoFocus value={newTypeLabel} onChange={(e) => setNewTypeLabel(e.target.value)} placeholder="New event type" className={inputClass} />
                <button type="button" onClick={handleAddType} className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Save</button>
                <button type="button" onClick={() => setAddingType(false)} className="shrink-0 px-3 py-2 rounded-lg text-slate-500 text-sm">Cancel</button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Package / Pricing Tier</label>
            <input value={form.package} onChange={(e) => update('package', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Quoted Total</label>
            <input type="number" min="0" step="0.01" value={form.quotedTotal} onChange={(e) => update('quotedTotal', e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Deposit Amount</label>
            <input type="number" min="0" step="0.01" value={form.depositAmount} onChange={(e) => update('depositAmount', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Deposit Due Date</label>
            <input type="date" value={form.depositDueDate} onChange={(e) => update('depositDueDate', e.target.value)} className={inputClass} />
          </div>
          <div className="flex items-end pb-2.5">
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={form.depositPaid} onChange={(e) => update('depositPaid', e.target.checked)} />
              Deposit paid
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Booking Status</label>
            <select value={form.bookingStatus} onChange={(e) => update('bookingStatus', e.target.value)} className={inputClass}>
              {bookingStatuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Contract Signed Date</label>
            <input type="date" value={form.contractSignedDate} onChange={(e) => update('contractSignedDate', e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Priority</label>
            <select value={form.priority} onChange={(e) => update('priority', e.target.value)} className={inputClass}>
              <option value="">None</option>
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Next Follow-up Date</label>
            <input type="date" value={form.nextFollowUpDate} onChange={(e) => update('nextFollowUpDate', e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Referral Source</label>
          <input value={form.referralSource} onChange={(e) => update('referralSource', e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} className={inputClass} />
        </div>

        {booking && (
          <div>
            <label className={labelClass}>Activity Log</label>
            <div className="flex gap-2 mb-2">
              <input
                value={newActivityText}
                onChange={(e) => setNewActivityText(e.target.value)}
                placeholder="e.g. Called, left voicemail"
                className={inputClass}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddActivity(); } }}
              />
              <button type="button" onClick={handleAddActivity} className="shrink-0 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50">Add</button>
            </div>
            {form.activityLog.length > 0 && (
              <div className="space-y-1.5 max-h-32 overflow-y-auto border border-slate-200 rounded-lg px-3 py-2">
                {form.activityLog.map((entry) => (
                  <div key={entry.id} className="text-sm text-slate-600 flex gap-2">
                    <span className="text-slate-400 shrink-0">
                      {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span>{entry.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          <div>
            {canConvert && (
              <button
                type="button"
                onClick={handleConvert}
                className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
              >
                Convert to Event →
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
              {booking ? 'Save Changes' : 'Add Booking'}
            </button>
          </div>
        </div>
      </form>

      <ClientModal
        open={newClientModalOpen}
        onClose={() => setNewClientModalOpen(false)}
        onSaved={(record) => update('clientId', record.id)}
      />
    </Modal>
  );
}
