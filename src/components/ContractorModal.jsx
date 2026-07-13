import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import { useData } from '../context/DataContext';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

const emptyForm = {
  firstName: '', middleName: '', lastName: '',
  contractorType1: '', contractorType2: '',
  price: '', priceNotes: '',
};

export default function ContractorModal({ open, onClose, contractor }) {
  const { contractorTypes, addContractorType, addContractor, updateContractor } = useData();
  const [form, setForm] = useState(emptyForm);
  const [addingType, setAddingType] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(contractor ? {
        firstName: contractor.firstName,
        middleName: contractor.middleName || '',
        lastName: contractor.lastName,
        contractorType1: contractor.contractorType1,
        contractorType2: contractor.contractorType2 || '',
        price: contractor.price,
        priceNotes: contractor.priceNotes || '',
        email: contractor.email || '',
        phone: contractor.phone || '',
      } : { ...emptyForm, email: '', phone: '' });
      setError('');
      setAddingType(false);
      setNewTypeLabel('');
    }
  }, [open, contractor]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  function handleAddType() {
    if (!newTypeLabel.trim()) return;
    addContractorType(newTypeLabel);
    update('contractorType1', newTypeLabel.trim());
    setNewTypeLabel('');
    setAddingType(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.contractorType1) {
      setError('First name, last name, and contractor type are required.');
      return;
    }
    const payload = {
      ...form,
      price: Number(form.price) || 0,
    };
    if (contractor) updateContractor(contractor.id, payload);
    else addContractor(payload);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={contractor ? 'Edit Contractor' : 'Add Contractor'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>First Name *</label>
            <input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Middle Name</label>
            <input value={form.middleName} onChange={(e) => update('middleName', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Last Name *</label>
            <input required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Email Address</label>
            <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Phone Number</label>
            <input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Contractor Type 1 *</label>
          {!addingType ? (
            <div className="flex gap-2">
              <select required value={form.contractorType1} onChange={(e) => update('contractorType1', e.target.value)} className={inputClass}>
                <option value="">Select a type…</option>
                {contractorTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button type="button" onClick={() => setAddingType(true)} className="shrink-0 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50">
                + Add
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input autoFocus value={newTypeLabel} onChange={(e) => setNewTypeLabel(e.target.value)} placeholder="New contractor type" className={inputClass} />
              <button type="button" onClick={handleAddType} className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
                Save
              </button>
              <button type="button" onClick={() => setAddingType(false)} className="shrink-0 px-3 py-2 rounded-lg text-slate-500 text-sm">
                Cancel
              </button>
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>Contractor Type 2 <span className="font-normal text-slate-400">(optional — e.g. instrument)</span></label>
          <input value={form.contractorType2} onChange={(e) => update('contractorType2', e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Contractor Price</label>
          <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => update('price', e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Price Notes</label>
          <textarea rows={2} value={form.priceNotes} onChange={(e) => update('priceNotes', e.target.value)} className={inputClass} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
            {contractor ? 'Save Changes' : 'Add Contractor'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
