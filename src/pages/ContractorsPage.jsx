import { useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import ContractorModal from '../components/ContractorModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Tooltip from '../components/ui/Tooltip';
import SearchInput from '../components/ui/SearchInput';
import FilterSelect from '../components/ui/FilterSelect';
import { useToast } from '../components/ui/Toast';
import { formatCurrency as currency } from '../lib/format';
import { getPricingTiers } from '../lib/pricingTiers';
import { matchesSearch } from '../lib/search';

export default function ContractorsPage() {
  const { contractors, deleteContractor } = useData();
  const { can } = useAuth();
  const canEdit = can('manageContractors');
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContractor, setEditingContractor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const categoryOptions = [...new Set(contractors.map((c) => c.contractorType1).filter(Boolean))]
    .sort()
    .map((cat) => ({ value: cat, label: cat }));

  const hasFilters = !!(search || categoryFilter);
  const filteredContractors = contractors.filter((c) => {
    if (categoryFilter && c.contractorType1 !== categoryFilter) return false;
    return matchesSearch(search, [c.firstName, c.middleName, c.lastName, c.email, c.phone, c.contractorType1, c.contractorType2]);
  });

  function openAdd() {
    setEditingContractor(null);
    setModalOpen(true);
  }

  function openEdit(contractor) {
    setEditingContractor(contractor);
    setModalOpen(true);
  }

  function handleDelete() {
    deleteContractor(deleteTarget.id);
    showToast('Contractor deleted');
    setDeleteTarget(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-slate-800">Contractors</h2>
        <button
          type="button"
          onClick={openAdd}
          disabled={!canEdit}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add Contractor
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search contractors…" className="w-64" />
        <FilterSelect
          value={categoryFilter}
          onChange={setCategoryFilter}
          allLabel="All Categories"
          options={categoryOptions}
        />
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(''); setCategoryFilter(''); }}
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
                <th className="px-4 py-3">Full Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3 text-center">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredContractors.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    {contractors.length === 0
                      ? 'No contractors yet. Add your first contractor to build your vendor roster.'
                      : 'No contractors match your search or filters.'}
                  </td>
                </tr>
              )}
              {filteredContractors.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="hover:text-indigo-600 hover:underline text-left"
                      >
                        {c.firstName} {c.middleName ? `${c.middleName} ` : ''}{c.lastName}
                      </button>
                    ) : (
                      <span>{c.firstName} {c.middleName ? `${c.middleName} ` : ''}{c.lastName}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{c.contractorType1}</td>
                  <td className="px-4 py-3 text-slate-500">{c.contractorType2 || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {(() => {
                      const tiers = getPricingTiers(c);
                      return (
                        <div className="flex items-center gap-1.5">
                          <span>{currency(tiers[0]?.price)}</span>
                          {tiers.length > 1 && (
                            <Tooltip content={tiers.map((t) => `${t.name}: ${currency(t.price)}`).join(' · ')}>
                              <span className="text-xs text-slate-400 cursor-default">+{tiers.length - 1}</span>
                            </Tooltip>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.priceNotes ? (
                      <Tooltip content={c.priceNotes}>
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold cursor-default">
                          1
                        </span>
                      </Tooltip>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {canEdit && (
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          aria-label="Edit contractor"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(c)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                          aria-label="Delete contractor"
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

      <ContractorModal open={modalOpen} onClose={() => setModalOpen(false)} contractor={editingContractor} />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete contractor?"
        description={`This will remove ${deleteTarget?.firstName} ${deleteTarget?.lastName} from your roster and from any events they're booked on.`}
      />
    </div>
  );
}
