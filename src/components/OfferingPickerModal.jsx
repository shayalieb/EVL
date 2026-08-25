import { useState } from 'react';
import Modal from './ui/Modal';
import OfferingModal from './OfferingModal';
import MoneyInput from './ui/MoneyInput';
import { useData } from '../context/DataContext';
import { uid } from '../lib/storage';
import { computeOfferingTotal } from '../lib/offerings';
import { computeGroupPrice, formatInstrumentLine } from '../lib/contractorGroups';
import { formatCurrency as currency } from '../lib/format';
import { useContractorHydration } from '../lib/useContractorHydration';

// Instrument + role, never names — a musician can be swapped for another
// playing the same part without misrepresenting who's contracted to
// perform, and it sidesteps naming a specific person in a legal document at
// all. Frozen at add-time (one string per member, in group order, not
// deduped) same as every other "clone the template, then it's independent"
// flow in this app — editing the saved group afterward never touches an
// ensemble already added to a proposal/contract. The amount defaults to the
// group's own package price if it has one, else the live sum of members'
// rates (see computeGroupPrice) — either way it's just a starting point,
// editable per-instance afterward like any other offering.
function buildEnsembleOffering(group, contractors) {
  const instruments = group.contractorIds
    .map((id) => contractors.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => formatInstrumentLine(c));
  const amount = computeGroupPrice(group, contractors);
  return { id: uid('offitem'), name: group.name, details: '', type: 'ensemble', amount: String(amount), unitCount: '', ratePerUnit: '', instruments };
}

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
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Rush delivery fee" data-testid="offering-picker-quick-item-name-input" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Amount</label>
        <MoneyInput value={amount} onChange={setAmount} testId="offering-picker-quick-item-amount-input" className={moneyInputClass} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} data-testid="offering-picker-quick-item-cancel-button" className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
        <button type="submit" data-testid="offering-picker-quick-item-add-button" className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Add Item</button>
      </div>
    </form>
  );
}

export default function OfferingPickerModal({ open, onClose, onSelect, allowEnsemble = false }) {
  const { offerings, contractorGroups, contractors } = useData();
  useContractorHydration(open && allowEnsemble ? contractorGroups.flatMap((group) => group.contractorIds || []) : []);
  const [query, setQuery] = useState('');
  const [addingQuickItem, setAddingQuickItem] = useState(false);
  const [creatingOffering, setCreatingOffering] = useState(false);
  const [pickingEnsemble, setPickingEnsemble] = useState(false);
  const filtered = offerings.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()));

  function handleSelect(offering) {
    onSelect(offering);
    onClose();
  }

  function handleClose() {
    setQuery('');
    setAddingQuickItem(false);
    setPickingEnsemble(false);
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
        ) : pickingEnsemble ? (
          <div className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500">Choose a saved group</span>
              <button
                type="button"
                onClick={() => setPickingEnsemble(false)}
                data-testid="offering-picker-ensemble-cancel-button"
                className="text-xs font-semibold text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            </div>
            {contractorGroups.length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-4">
                No saved ensembles yet — add one from the Offerings page.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1.5">
                {contractorGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => { setPickingEnsemble(false); handleSelect(buildEnsembleOffering(g, contractors)); }}
                    data-testid="offering-picker-ensemble-option"
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{g.name}</div>
                      <div className="text-xs text-slate-400">{g.contractorIds.length} musician{g.contractorIds.length === 1 ? '' : 's'}</div>
                    </div>
                    <div className="text-sm font-semibold text-slate-600 shrink-0">{currency(computeGroupPrice(g, contractors))}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setAddingQuickItem(true)}
              data-testid="offering-picker-modal-quick-item-button"
              className="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
            >
              + One-time item
            </button>
            {allowEnsemble && (
              <button
                type="button"
                onClick={() => setPickingEnsemble(true)}
                data-testid="offering-picker-modal-ensemble-button"
                className="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
              >
                + Add Ensemble
              </button>
            )}
            <button
              type="button"
              onClick={() => setCreatingOffering(true)}
              data-testid="offering-picker-modal-create-offering-button"
              className="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
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
            data-testid="offering-picker-modal-search-input"
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
                data-testid="offering-picker-item"
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
