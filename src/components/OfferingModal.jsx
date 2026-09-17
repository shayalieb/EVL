import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import MoneyInput from './ui/MoneyInput';
import { useData } from '../context/DataContext';
import { computeOfferingTotal } from '../lib/offerings';
import { formatCurrency as currency } from '../lib/format';
import { uid } from '../lib/storage';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const moneyInputClass = 'w-full py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

const CATEGORIES = ['Lighting', 'Flowers', 'Rentals', 'Production', 'Décor', 'Transportation', 'Other'];
const UNITS = [['item', 'Item'], ['table', 'Table'], ['chair', 'Chair'], ['guest', 'Guest'], ['hour', 'Hour']];
const blankLine = () => ({ id: uid('pkg'), name: '', pricingType: 'flat', unitType: 'item', rate: '', quantity: 1, includedQuantity: 0, required: true, selected: true });
const emptyForm = { name: '', details: '', type: 'general', amount: '', unitCount: '', ratePerUnit: '', category: '', lineItems: [] };

export default function OfferingModal({ open, onClose, offering, onSaved }) {
  const { addOffering, updateOffering } = useData();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(offering ? {
        name: offering.name || '',
        details: offering.details || '',
        type: offering.type || 'general',
        amount: offering.amount ?? '',
        unitCount: offering.unitCount ?? '',
        ratePerUnit: offering.ratePerUnit ?? '',
        category: offering.category || '',
        lineItems: (offering.lineItems || []).map((item) => ({ ...item, selected: item.selected !== false })),
      } : emptyForm);
      setError('');
      setSaving(false);
    }
  }, [open, offering]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Offering name is required.');
      return;
    }
    if (form.type === 'package' && form.lineItems.length === 0) {
      setError('Add at least one package line item.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const record = offering ? await updateOffering(offering.id, form) : await addOffering(form);
      onSaved?.(record);
      onClose();
    } catch (err) {
      setError(err.message || 'Unable to save this offering.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={offering ? 'Edit Offering' : 'Add Offering'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div data-testid="offering-modal-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div>
          <label className={labelClass}>Offering Name *</label>
          <input required autoFocus value={form.name} onChange={(e) => update('name', e.target.value)} data-testid="offering-modal-name-input" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Offering Details</label>
          <textarea rows={3} value={form.details} onChange={(e) => update('details', e.target.value)} data-testid="offering-modal-details-textarea" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Type</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => update('type', 'general')}
              data-testid="offering-modal-type-general-button"
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold ${
                form.type === 'general' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Flat Price
            </button>
            <button
              type="button"
              onClick={() => update('type', 'perUnit')}
              data-testid="offering-modal-type-perunit-button"
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold ${
                form.type === 'perUnit' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Per Unit
            </button>
            <button type="button" onClick={() => update('type', 'package')} className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold ${form.type === 'package' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
              Package
            </button>
          </div>
        </div>

        {form.type === 'package' && (
          <div className="space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className={labelClass}>Category</label><select value={form.category} onChange={(e) => update('category', e.target.value)} className={inputClass}><option value="">Select category…</option>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div>
              <div><label className={labelClass}>Base Package Price</label><MoneyInput value={form.amount} onChange={(value) => update('amount', value)} className={moneyInputClass} /></div>
            </div>
            <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-800">Package line items</p><p className="text-xs text-slate-500">Included quantities are free; only additional units use the rate.</p></div><button type="button" onClick={() => update('lineItems', [...form.lineItems, blankLine()])} className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-700">+ Add line item</button></div>
            <div className="space-y-3">
              {form.lineItems.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-400">Add the items included in this package.</p>}
              {form.lineItems.map((item, index) => {
                const patchLine = (patch) => update('lineItems', form.lineItems.map((line, i) => i === index ? { ...line, ...patch } : line));
                return <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                  <div className="flex gap-2"><input required value={item.name} onChange={(e) => patchLine({ name: e.target.value })} placeholder="Line item name" className={`${inputClass} flex-1`} /><button type="button" onClick={() => update('lineItems', form.lineItems.filter((_, i) => i !== index))} className="px-2 text-slate-300 hover:text-red-600" aria-label="Remove line item">✕</button></div>
                  <div className="grid gap-2 sm:grid-cols-5">
                    <label className={labelClass}>Pricing<select value={item.pricingType} onChange={(e) => patchLine({ pricingType: e.target.value })} className={inputClass}><option value="flat">Flat</option><option value="perUnit">Per unit</option></select></label>
                    <label className={labelClass}>QTY<input type="number" min="0" value={item.quantity ?? 1} onChange={(e) => patchLine({ quantity: e.target.value })} className={inputClass} /></label>
                    {item.pricingType === 'perUnit' && <><label className={labelClass}>Unit<select value={item.unitType} onChange={(e) => patchLine({ unitType: e.target.value })} className={inputClass}>{UNITS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className={labelClass}>Included<input type="number" min="0" value={item.includedQuantity} onChange={(e) => patchLine({ includedQuantity: e.target.value })} className={inputClass} /></label></>}
                    <label className={labelClass}>{item.pricingType === 'flat' ? 'Price' : 'Additional rate'}<MoneyInput value={item.rate} onChange={(value) => patchLine({ rate: value })} className={moneyInputClass} /></label>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={item.required} onChange={(e) => patchLine({ required: e.target.checked, selected: e.target.checked || item.selected })} />Required item</label>
                </div>;
              })}
            </div>
          </div>
        )}

        {form.type === 'perUnit' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Unit Count</label>
              <input type="number" min="0" value={form.unitCount} onChange={(e) => update('unitCount', e.target.value)} data-testid="offering-modal-unitcount-input" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>$ Per Unit</label>
              <MoneyInput value={form.ratePerUnit} onChange={(v) => update('ratePerUnit', v)} testId="offering-modal-rate-per-unit-input" className={moneyInputClass} />
            </div>
          </div>
        ) : form.type === 'general' ? (
          <div>
            <label className={labelClass}>Amount</label>
            <MoneyInput value={form.amount} onChange={(v) => update('amount', v)} testId="offering-modal-amount-input" className={moneyInputClass} />
          </div>
        ) : null}

        <div className="text-right text-sm font-bold text-slate-800">
          Total: {currency(computeOfferingTotal(form))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={saving} data-testid="offering-modal-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving} data-testid="offering-modal-save-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving…' : offering ? 'Save Changes' : 'Add Offering'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
