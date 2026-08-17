import { useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import OfferingModal from '../components/OfferingModal';
import ContractorGroupModal from '../components/ContractorGroupModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SearchInput from '../components/ui/SearchInput';
import FilterSelect from '../components/ui/FilterSelect';
import { useToast } from '../components/ui/Toast';
import { computeOfferingTotal } from '../lib/offerings';
import { computeGroupPrice } from '../lib/contractorGroups';
import { formatCurrency as currency } from '../lib/format';
import { matchesSearch } from '../lib/search';

export default function OfferingsPage() {
  const { offerings, deleteOffering, contractors, contractorGroups, deleteContractorGroup } = useData();
  const { can } = useAuth();
  const canEdit = can('manageOfferings');
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOffering, setEditingOffering] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState(null);

  const hasFilters = !!(search || typeFilter);
  const filteredOfferings = offerings.filter((o) => {
    if (typeFilter && o.type !== typeFilter) return false;
    return matchesSearch(search, [o.name]);
  });

  function openAdd() {
    setEditingOffering(null);
    setModalOpen(true);
  }

  function openEdit(offering) {
    setEditingOffering(offering);
    setModalOpen(true);
  }

  function handleDelete() {
    deleteOffering(deleteTarget.id);
    setDeleteTarget(null);
  }

  function openAddGroup() {
    setEditingGroup(null);
    setGroupModalOpen(true);
  }

  function openEditGroup(group) {
    setEditingGroup(group);
    setGroupModalOpen(true);
  }

  function handleDeleteGroup() {
    deleteContractorGroup(deleteGroupTarget.id);
    showToast('Ensemble deleted');
    setDeleteGroupTarget(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Offerings</h2>
          <p className="text-sm text-slate-500 mt-1">Reusable products or services you can add to any proposal or contract.</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          disabled={!canEdit}
          data-testid="offerings-add-button"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add Offering
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search offerings…" className="w-64" testId="offerings-search-input" />
        <FilterSelect
          value={typeFilter}
          onChange={setTypeFilter}
          allLabel="All Types"
          options={[
            { value: 'general', label: 'General' },
            { value: 'perUnit', label: 'Per Unit' },
          ]}
          testId="offerings-type-filter"
        />
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(''); setTypeFilter(''); }}
            data-testid="offerings-clear-filters-button"
            className="text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOfferings.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                    {offerings.length === 0
                      ? 'No offerings yet. Add one to reuse it across proposals and contracts.'
                      : 'No offerings match your search or filters.'}
                  </td>
                </tr>
              )}
              {filteredOfferings.map((o) => (
                <tr key={o.id} data-testid="offering-row" className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {canEdit ? (
                      <button type="button" onClick={() => openEdit(o)} data-testid="offering-row-name-link" className="hover:text-indigo-600 hover:underline text-left">
                        {o.name}
                      </button>
                    ) : (
                      <span>{o.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{o.type === 'perUnit' ? 'Per Unit' : 'General'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{currency(computeOfferingTotal(o))}</td>
                  <td className="px-4 py-3">
                    {canEdit && (
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(o)}
                          data-testid="offering-row-edit-button"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          aria-label={`Edit ${o.name}`}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(o)}
                          data-testid="offering-row-delete-button"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                          aria-label={`Delete ${o.name}`}
                        >
                          🗑
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mt-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">Ensembles</h3>
            <p className="text-xs text-slate-500 mt-1">
              A saved lineup — like "String Quartet" — you can add to a proposal or contract as a priced line item (shown as a bulleted list of instruments, never names), or bulk-add to an event's roster in one click.
            </p>
          </div>
          <button
            type="button"
            onClick={openAddGroup}
            disabled={!canEdit}
            data-testid="contractor-groups-add-button"
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            + Add Ensemble
          </button>
        </div>
        {contractorGroups.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">No ensembles yet.</p>
        ) : (
          <div className="space-y-2">
            {contractorGroups.map((g) => {
              const members = g.contractorIds.map((id) => contractors.find((c) => c.id === id)).filter(Boolean);
              return (
                <div
                  key={g.id}
                  data-testid="contractor-group-row"
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-slate-100 hover:bg-slate-50/60"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 text-sm">{g.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5 truncate">
                      {members.length > 0 ? members.map((c) => `${c.firstName} ${c.lastName}`).join(', ') : 'No contractors'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold text-slate-600">{currency(computeGroupPrice(g, contractors))}</span>
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditGroup(g)}
                          data-testid="contractor-group-row-edit-button"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          aria-label="Edit ensemble"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteGroupTarget(g)}
                          data-testid="contractor-group-row-delete-button"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                          aria-label="Delete ensemble"
                        >
                          🗑
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <OfferingModal open={modalOpen} onClose={() => setModalOpen(false)} offering={editingOffering} />
      <ContractorGroupModal open={groupModalOpen} onClose={() => setGroupModalOpen(false)} group={editingGroup} />
      <ConfirmDialog
        open={!!deleteGroupTarget}
        onClose={() => setDeleteGroupTarget(null)}
        onConfirm={handleDeleteGroup}
        title="Delete ensemble?"
        description={`This removes "${deleteGroupTarget?.name}" from your saved ensembles. It won't affect events, proposals, or contracts it was already added to.`}
        confirmText={deleteGroupTarget?.name}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete offering?"
        description={`This will remove "${deleteTarget?.name}" from your reusable offerings. Copies already added to proposals or contracts are unaffected.`}
      />
    </div>
  );
}
