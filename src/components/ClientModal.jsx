import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import { useData } from '../context/DataContext';
import { formatPhoneNumber, formatEmailInput } from '../lib/format';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

const emptyForm = {
  firstName: '', lastName: '', phone: '', email: '',
  address1: '', address2: '', city: '', state: '', zip: '',
  notes: '',
};

export default function ClientModal({ open, onClose, client }) {
  const { addClient, updateClient } = useData();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(client ? {
        firstName: client.firstName || '',
        lastName: client.lastName || '',
        phone: client.phone || '',
        email: client.email || '',
        address1: client.address1 || '',
        address2: client.address2 || '',
        city: client.city || '',
        state: client.state || '',
        zip: client.zip || '',
        notes: client.notes || '',
      } : emptyForm);
      setError('');
    }
  }, [open, client]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First name and last name are required.');
      return;
    }
    if (client) updateClient(client.id, form);
    else addClient(form);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={client ? 'Edit Client' : 'Add Client'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>First Name *</label>
            <input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Last Name *</label>
            <input required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Phone Number</label>
            <input
              type="tel"
              placeholder="(555) 555-0100"
              value={form.phone}
              onChange={(e) => update('phone', formatPhoneNumber(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Email Address</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update('email', formatEmailInput(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Address 1</label>
            <input value={form.address1} onChange={(e) => update('address1', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Address 2</label>
            <input value={form.address2} onChange={(e) => update('address2', e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>City</label>
            <input value={form.city} onChange={(e) => update('city', e.target.value)} className={inputClass} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={labelClass}>State</label>
              <input value={form.state} onChange={(e) => update('state', e.target.value)} className={inputClass} />
            </div>
            <div className="w-24">
              <label className={labelClass}>Zip</label>
              <input value={form.zip} onChange={(e) => update('zip', e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        <div>
          <label className={labelClass}>Client Notes</label>
          <textarea rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} className={inputClass} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
            {client ? 'Save Changes' : 'Add Client'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
