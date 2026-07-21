import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import MoneyInput from './ui/MoneyInput';
import { useData } from '../context/DataContext';
import { computeOfferingTotal } from '../lib/offerings';
import { formatCurrency as currency } from '../lib/format';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const moneyInputClass = 'w-full py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

const emptyForm = { name: '', details: '', type: 'general', amount: '', unitCount: '', ratePerUnit: '' };

export default function OfferingModal({ open, onClose, offering }) {
  const { addOffering, updateOffering } = useData();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(offering ? {
        name: offering.name || '',
        details: offering.details || '',
        type: offering.type || 'general',
        amount: offering.amount ?? '',
        unitCount: offering.unitCount ?? '',
        ratePerUnit: offering.ratePerUnit ?? '',
      } : emptyForm);
      setError('');
    }
  }, [open, offering]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Offering name is required.');
      return;
    }
    if (offering) updateOffering(offering.id, form);
    else addOffering(form);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={offering ? 'Edit Offering' : 'Add Offering'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div>
          <label className={labelClass}>Offering Name *</label>
          <input required autoFocus value={form.name} onChange={(e) => update('name', e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Offering Details</label>
          <textarea rows={3} value={form.details} onChange={(e) => update('details', e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => update('type', 'general')}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold ${
                form.type === 'general' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => update('type', 'perUnit')}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold ${
                form.type === 'perUnit' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Per Unit
            </button>
          </div>
        </div>

        {form.type === 'perUnit' ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Unit Count</label>
              <input type="number" min="0" value={form.unitCount} onChange={(e) => update('unitCount', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>$ Per Unit</label>
              <MoneyInput value={form.ratePerUnit} onChange={(v) => update('ratePerUnit', v)} className={moneyInputClass} />
            </div>
          </div>
        ) : (
          <div>
            <label className={labelClass}>Amount</label>
            <MoneyInput value={form.amount} onChange={(v) => update('amount', v)} className={moneyInputClass} />
          </div>
        )}

        <div className="text-right text-sm font-bold text-slate-800">
          Total: {currency(computeOfferingTotal(form))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
            {offering ? 'Save Changes' : 'Add Offering'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
