import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import ContractorCombobox from './ContractorCombobox';
import { useData } from '../context/DataContext';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

// Add/edit modal for a saved Contractor Group (a reusable ensemble/lineup —
// e.g. "String Quartet", "Wedding Trio"). Just a name and a set of
// contractor ids — no per-slot roles, this is a specific set of people, not
// a staffing template. "+ Add Ensemble" on EventFormPage.jsx's roster
// clones contractorIds into that event's own contractorBookings; editing
// this saved group afterward never touches events it was already added to
// (same "pick a template, clone it, the copy is independent" contract as
// Set List Library).
export default function ContractorGroupModal({ open, onClose, group, onSaved }) {
  const { contractors, addContractorGroup, updateContractorGroup } = useData();
  const [name, setName] = useState('');
  const [contractorIds, setContractorIds] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(group?.name || '');
      setContractorIds(group?.contractorIds || []);
      setError('');
    }
  }, [open, group]);

  const selectedContractors = contractorIds.map((id) => contractors.find((c) => c.id === id)).filter(Boolean);

  function addContractor(contractor) {
    setContractorIds((prev) => (prev.includes(contractor.id) ? prev : [...prev, contractor.id]));
  }

  function removeContractor(contractorId) {
    setContractorIds((prev) => prev.filter((id) => id !== contractorId));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Group name is required.');
      return;
    }
    if (!contractorIds.length) {
      setError('Add at least one contractor.');
      return;
    }
    const payload = { name: name.trim(), contractorIds };
    const record = group ? { ...group, ...payload } : addContractorGroup(payload);
    if (group) updateContractorGroup(group.id, payload);
    onSaved?.(record);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={group ? 'Edit Group' : 'Add Group'} widthClass="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div data-testid="contractor-group-modal-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div>
          <label className={labelClass}>Group Name *</label>
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

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} data-testid="contractor-group-modal-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" data-testid="contractor-group-modal-save-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
            {group ? 'Save Changes' : 'Add Group'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
