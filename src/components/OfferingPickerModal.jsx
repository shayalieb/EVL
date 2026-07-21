import { useState } from 'react';
import Modal from './ui/Modal';
import OfferingModal from './OfferingModal';
import MoneyInput from './ui/MoneyInput';
import { useData } from '../context/DataContext';
import { uid } from '../lib/storage';
import { computeOfferingTotal } from '../lib/offerings';
import { formatCurrency as currency } from '../lib/format';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const moneyInputClass = 'w-full py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

// Quick, un-cataloged item — same shape as a saved offering so it flows
// through the exact same editing/PDF/total logic once added, it just never
// touches the reusable Offerings list.
function QuickItemForm({ onAdd, onCancel }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ id: uid('offitem'), name: name.trim(), details: '', type: 'general', amount, unitCount: '', ratePerUnit: '' });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border border-dashed border-slate-300 rounded-lg p-3">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Item Name</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Rush delivery fee" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Amount</label>
        <MoneyInput value={amount} onChange={setAmount} className={moneyInputClass} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
        <button type="submit" className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Add Item</button>
      </div>
    </form>
  );
}

export default function OfferingPickerModal({ open, onClose, onSelect }) {
  const { offerings } = useData();
  const [query, setQuery] = useState('');
  const [addingQuickItem, setAddingQuickItem] = useState(false);
  const [creatingOffering, setCreatingOffering] = useState(false);
  const filtered = offerings.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()));

  function handleSelect(offering) {
    onSelect(offering);
    onClose();
  }

  function handleClose() {
    setQuery('');
    setAddingQuickItem(false);
    onClose();
  }

  // A brand-new catalog offering is exactly what the user wants added right
  // now too — no need to reopen the picker just to click it a second time.
  if (creatingOffering) {
    return (
      <OfferingModal
        open={open}
        offering={null}
        onClose={() => setCreatingOffering(false)}
        onSaved={(record) => { setCreatingOffering(false); handleSelect(record); }}
      />
    );
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Offering">
      <div className="space-y-3">
        {addingQuickItem ? (
          <QuickItemForm
            onAdd={(item) => { setAddingQuickItem(false); handleSelect(item); }}
            onCancel={() => setAddingQuickItem(false)}
          />
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAddingQuickItem(true)}
              className="flex-1 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
            >
              + One-time item
            </button>
            <button
              type="button"
              onClick={() => setCreatingOffering(true)}
              className="flex-1 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
            >
              + Create new offering
            </button>
          </div>
        )}

        {offerings.length > 0 && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search offerings…"
            className={inputClass}
          />
        )}
        {offerings.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-8">
            No saved offerings yet — use the buttons above to add a one-time item or create a reusable one.
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-8">No offerings match &ldquo;{query}&rdquo;.</div>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-1.5">
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => handleSelect(o)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-left"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{o.name}</div>
                  <div className="text-xs text-slate-400">{o.type === 'perUnit' ? 'Per Unit' : 'General'}</div>
                </div>
                <div className="text-sm font-semibold text-slate-600 shrink-0">{currency(computeOfferingTotal(o))}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
