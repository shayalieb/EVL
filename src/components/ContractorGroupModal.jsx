import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import MoneyInput from './ui/MoneyInput';
import ContractorCombobox from './ContractorCombobox';
import { useData } from '../context/DataContext';
import { computeGroupSuggestedPrice } from '../lib/contractorGroups';
import { formatCurrency as currency } from '../lib/format';
import { useContractorHydration } from '../lib/useContractorHydration';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const moneyInputClass = 'w-full py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

// Add/edit modal for a saved Contractor Group (a reusable ensemble/lineup —
// e.g. "String Quartet", "Wedding Trio"), managed from the Offerings page. A
// name, a set of contractor ids, and an optional flat package price — no
// per-slot roles, this is a specific set of people, not a staffing
// template. "+ Add Ensemble" on EventFormPage.jsx's roster clones
// contractorIds into that event's own contractorBookings, and the same
// action on a proposal/contract's Offering picker clones an instrument-only
// snapshot (see OfferingPickerModal.jsx's buildEnsembleOffering) priced via
// computeGroupPrice; editing this saved group afterward never touches
// anything it was already added to (same "pick a template, clone it, the
// copy is independent" contract as Set List Library).
export default function ContractorGroupModal({ open, onClose, group, onSaved }) {
  const { contractors, addContractorGroup, updateContractorGroup } = useData();
  const [name, setName] = useState('');
  const [contractorIds, setContractorIds] = useState([]);
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(group?.name || '');
      setContractorIds(group?.contractorIds || []);
      setPrice(group?.price ?? '');
      setError('');
      setSaving(false);
    }
  }, [open, group]);

  useContractorHydration(open ? contractorIds : []);

  const selectedContractors = contractorIds.map((id) => contractors.find((c) => c.id === id)).filter(Boolean);
  const suggestedPrice = computeGroupSuggestedPrice({ contractorIds }, contractors);

  function addContractor(contractor) {
    setContractorIds((prev) => (prev.includes(contractor.id) ? prev : [...prev, contractor.id]));
  }

  function removeContractor(contractorId) {
    setContractorIds((prev) => prev.filter((id) => id !== contractorId));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Group name is required.');
      return;
    }
    if (!contractorIds.length) {
      setError('Add at least one contractor.');
      return;
    }
    const payload = { name: name.trim(), contractorIds, price };
    setSaving(true);
    setError('');
    try {
      const record = group ? await updateContractorGroup(group.id, payload) : await addContractorGroup(payload);
      onSaved?.(record);
      onClose();
    } catch (err) {
      setError(err.message || 'Unable to save this ensemble.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={group ? 'Edit Ensemble' : 'Add Ensemble'} widthClass="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div data-testid="contractor-group-modal-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div>
          <label className={labelClass}>Ensemble Name *</label>
          <input
            required
            autoFocus
            placeholder="e.g. String Quartet"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="contractor-group-modal-name-input"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Contractors</label>
          <ContractorCombobox
            contractors={contractors}
            selectedContractors={selectedContractors}
            onAdd={addContractor}
            onRemove={removeContractor}
            testId="contractor-group-modal-contractor-picker"
          />
          <p className="text-xs text-slate-400 mt-1">
            "+ Add Ensemble" on an event's roster adds everyone in this group in one click — you can still add or remove people from that event's roster afterward.
          </p>
        </div>

        <div>
          <label className={labelClass}>Package Price (optional)</label>
          <MoneyInput
            value={price}
            onChange={setPrice}
            placeholder={`Suggested: ${currency(suggestedPrice)}`}
            testId="contractor-group-modal-price-input"
            className={moneyInputClass}
          />
          <p className="text-xs text-slate-400 mt-1">
            Leave blank to use the sum of each member's own rate ({currency(suggestedPrice)} right now) whenever this ensemble is added to a proposal or contract. Set a price here for a flat package rate instead.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={saving} data-testid="contractor-group-modal-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving} data-testid="contractor-group-modal-save-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving…' : group ? 'Save Changes' : 'Add Ensemble'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
