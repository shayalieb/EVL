import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import { useData } from '../context/DataContext';
import { formatEmailInput, formatPhoneNumber } from '../lib/format';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

const emptyForm = {
  name: '', address1: '', address2: '', city: '', state: '', zip: '',
  contactName: '', contactPhone: '', contactPhoneExt: '', contactEmail: '', locationNote: '', loadInInfo: '',
};

// Editing/deleting a saved venue here never touches past bookings/events —
// they each hold their own copied venue object, not a live reference (see
// DataContext's ensureVenueSaved comment). This is purely the reusable
// "address book" entry the picker on Booking/Event forms reads from.
export default function VenueModal({ open, onClose, venue, onSaved }) {
  const { addVenue, updateVenue } = useData();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(venue ? {
        name: venue.name || '',
        address1: venue.address1 || '',
        address2: venue.address2 || '',
        city: venue.city || '',
        state: venue.state || '',
        zip: venue.zip || '',
        contactName: venue.contactName || '',
        contactPhone: venue.contactPhone || '',
        contactPhoneExt: venue.contactPhoneExt || '',
        contactEmail: venue.contactEmail || '',
        locationNote: venue.locationNote || '',
        loadInInfo: venue.loadInInfo || '',
      } : emptyForm);
      setError('');
    }
  }, [open, venue]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Venue name is required.');
      return;
    }
    try {
      const record = venue ? await updateVenue(venue.id, form) : await addVenue(form);
      onSaved?.(record);
      onClose();
    } catch (saveError) {
      setError(saveError.message || 'Unable to save venue.');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={venue ? 'Edit Venue' : 'Add Venue'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div data-testid="venue-modal-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div>
          <label className={labelClass}>Venue Name *</label>
          <input required value={form.name} onChange={(e) => update('name', e.target.value)} data-testid="venue-modal-name-input" className={inputClass} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Address 1</label>
            <input value={form.address1} onChange={(e) => update('address1', e.target.value)} data-testid="venue-modal-address1-input" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Address 2</label>
            <input value={form.address2} onChange={(e) => update('address2', e.target.value)} data-testid="venue-modal-address2-input" className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>City</label>
            <input value={form.city} onChange={(e) => update('city', e.target.value)} data-testid="venue-modal-city-input" className={inputClass} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={labelClass}>State</label>
              <input value={form.state} onChange={(e) => update('state', e.target.value)} data-testid="venue-modal-state-input" className={inputClass} />
            </div>
            <div className="w-24">
              <label className={labelClass}>Zip</label>
              <input value={form.zip} onChange={(e) => update('zip', e.target.value)} data-testid="venue-modal-zip-input" className={inputClass} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Contact Name</label>
            <input value={form.contactName} onChange={(e) => update('contactName', e.target.value)} data-testid="venue-modal-contactname-input" className={inputClass} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={labelClass}>Contact Phone</label>
              <input type="tel" value={form.contactPhone} onChange={(e) => update('contactPhone', formatPhoneNumber(e.target.value))} data-testid="venue-modal-contactphone-input" className={inputClass} />
            </div>
            <div className="w-20">
              <label className={labelClass}>Ext.</label>
              <input value={form.contactPhoneExt} onChange={(e) => update('contactPhoneExt', e.target.value)} data-testid="venue-modal-contactphoneext-input" className={inputClass} />
            </div>
          </div>
        </div>

        <div>
          <label className={labelClass}>Contact Email</label>
          <input
            type="email"
            value={form.contactEmail}
            onChange={(e) => update('contactEmail', formatEmailInput(e.target.value))}
            data-testid="venue-modal-contactemail-input"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Event-day Venue Notes</label>
          <textarea
            rows={2}
            placeholder="e.g. Loading dock around back, no elevator access"
            value={form.locationNote}
            onChange={(e) => update('locationNote', e.target.value)}
            data-testid="venue-modal-location-note-textarea"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Load-in Instructions</label>
          <textarea
            rows={2}
            placeholder="e.g. Load in through the back entrance, freight elevator to 2nd floor"
            value={form.loadInInfo}
            onChange={(e) => update('loadInInfo', e.target.value)}
            data-testid="venue-modal-load-in-info-textarea"
            className={inputClass}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} data-testid="venue-modal-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" data-testid="venue-modal-save-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
            {venue ? 'Save Changes' : 'Add Venue'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
