import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import ContractorModal from '../components/ContractorModal';
import BulkEmailModal from '../components/BulkEmailModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ScrollShadow from '../components/ui/ScrollShadow';
import Tooltip from '../components/ui/Tooltip';
import SearchInput from '../components/ui/SearchInput';
import FilterSelect from '../components/ui/FilterSelect';
import Pagination from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';
import { formatCurrency as currency, formatEventDate } from '../lib/format';
import { getPricingTiers } from '../lib/pricingTiers';
import { matchesSearch } from '../lib/search';
import { usePagination } from '../lib/usePagination';
import { getRosterSummary } from '../lib/email/threads';

// "Was this contractor inquired with" answered at a glance instead of
// requiring you to already know which event to check — see the
// GET /email/threads/roster-summary endpoint this reads from.
function lastContactLabel(iso) {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return formatEventDate(new Date(iso).toISOString().slice(0, 10));
}

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
  const [roleFilter, setRoleFilter] = useState('');
  const [priceFilter, setPriceFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  // Account-wide, fetched once — same lightweight local-fetch pattern used
  // elsewhere (HomePage.jsx's invoices, BookingsPage.jsx's contracts) for
  // data that isn't otherwise read on this page.
  const [contactSummary, setContactSummary] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    getRosterSummary().then((summaries) => { if (!cancelled) setContactSummary(summaries); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Deep-link support for "?open=<id>" — used by Reminders' related-record
  // links so opening a reminder about a contractor jumps straight to
  // editing them, instead of leaving the user to search the list by hand.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) return;
    const match = contractors.find((c) => c.id === openId);
    if (match) {
      setEditingContractor(match);
      setModalOpen(true);
    }
    setSearchParams((prev) => { prev.delete('open'); return prev; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, contractors]);

  const categoryOptions = [...new Set(contractors.map((c) => c.contractorType1).filter(Boolean))]
    .sort()
    .map((cat) => ({ value: cat, label: cat }));
  const roleOptions = [...new Set(contractors.map((c) => c.contractorType2).filter(Boolean))]
    .sort()
    .map((role) => ({ value: role, label: role }));

  function priceBucket(c) {
    const price = getPricingTiers(c)[0]?.price ?? 0;
    if (price < 500) return 'under-500';
    if (price <= 1500) return '500-1500';
    return '1500-plus';
  }

  const hasFilters = !!(search || categoryFilter || roleFilter || priceFilter);
  const filteredContractors = contractors.filter((c) => {
    if (categoryFilter && c.contractorType1 !== categoryFilter) return false;
    if (roleFilter && c.contractorType2 !== roleFilter) return false;
    if (priceFilter && priceBucket(c) !== priceFilter) return false;
    return matchesSearch(search, [c.firstName, c.middleName, c.lastName, c.email, c.phone, c.contractorType1, c.contractorType2]);
  });
  const { page, setPage, pageCount, pageItems: pagedContractors, pageSize, totalItems } = usePagination(filteredContractors);

  // Selection persists across pages/filters (by id, not by row) so picking
  // a few contractors, then searching for more to add to the same send,
  // doesn't lose what's already checked.
  const allOnPageSelected = pagedContractors.length > 0 && pagedContractors.every((c) => selectedIds.has(c.id));
  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pagedContractors.forEach((c) => next.delete(c.id));
      else pagedContractors.forEach((c) => next.add(c.id));
      return next;
    });
  }
  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const selectedContractors = contractors.filter((c) => selectedIds.has(c.id));

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
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && canEdit && (
            <button
              type="button"
              onClick={() => setBulkEmailOpen(true)}
              data-testid="contractors-bulk-email-button"
              className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
            >
              ✉️ Email Selected ({selectedIds.size})
            </button>
          )}
          <button
            type="button"
            onClick={openAdd}
            disabled={!canEdit}
            data-testid="contractors-add-button"
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add Contractor
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search contractors…" className="w-64" testId="contractors-search-input" />
        <FilterSelect
          value={categoryFilter}
          onChange={setCategoryFilter}
          allLabel="All Categories"
          options={categoryOptions}
          testId="contractors-category-filter"
        />
        <FilterSelect
          value={roleFilter}
          onChange={setRoleFilter}
          allLabel="All Roles"
          options={roleOptions}
          testId="contractors-role-filter"
        />
        <FilterSelect
          value={priceFilter}
          onChange={setPriceFilter}
          allLabel="All Prices"
          options={[
            { value: 'under-500', label: 'Under $500' },
            { value: '500-1500', label: '$500 – $1,500' },
            { value: '1500-plus', label: '$1,500+' },
          ]}
          testId="contractors-price-filter"
        />
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(''); setCategoryFilter(''); setRoleFilter(''); setPriceFilter(''); }}
            data-testid="contractors-clear-filters-button"
            className="text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <ScrollShadow>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 w-10">
                  {canEdit && (
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAllOnPage}
                      data-testid="contractors-select-all-checkbox"
                      aria-label="Select all contractors on this page"
                      className="rounded border-slate-300"
                    />
                  )}
                </th>
                <th className="px-4 py-3">Full Name</th>
                <th className="hidden sm:table-cell px-4 py-3">Email</th>
                <th className="hidden sm:table-cell px-4 py-3">Phone</th>
                <th className="px-4 py-3">Category</th>
                <th className="hidden sm:table-cell px-4 py-3">Role</th>
                <th className="hidden sm:table-cell px-4 py-3">Last Contact</th>
                <th className="px-4 py-3">Price</th>
                <th className="hidden sm:table-cell px-4 py-3 text-center">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredContractors.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                    {contractors.length === 0
                      ? 'No contractors yet. Add your first contractor to build your vendor roster.'
                      : 'No contractors match your search or filters.'}
                  </td>
                </tr>
              )}
              {pagedContractors.map((c) => (
                <tr key={c.id} data-testid="contractor-row" className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    {canEdit && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        data-testid="contractor-row-select-checkbox"
                        aria-label={`Select ${c.firstName} ${c.lastName}`}
                        className="rounded border-slate-300"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        data-testid="contractor-row-name-link"
                        className="hover:text-indigo-600 hover:underline text-left"
                      >
                        {c.firstName} {c.middleName ? `${c.middleName} ` : ''}{c.lastName}
                      </button>
                    ) : (
                      <span>{c.firstName} {c.middleName ? `${c.middleName} ` : ''}{c.lastName}</span>
                    )}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-slate-500">{c.email || '—'}</td>
                  <td className="hidden sm:table-cell px-4 py-3 text-slate-500">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{c.contractorType1}</td>
                  <td className="hidden sm:table-cell px-4 py-3 text-slate-500">{c.contractorType2 || '—'}</td>
                  <td className="hidden sm:table-cell px-4 py-3">
                    {(() => {
                      const summary = contactSummary[c.id];
                      return (
                        <div className="flex items-center gap-1.5">
                          <span className={summary?.lastMessageAt ? 'text-slate-600' : 'text-slate-300'}>
                            {lastContactLabel(summary?.lastMessageAt)}
                          </span>
                          {summary?.unreadCount > 0 && (
                            <Tooltip content={`${summary.unreadCount} unread repl${summary.unreadCount === 1 ? 'y' : 'ies'}`}>
                              <span
                                data-testid="contractor-row-unread-badge"
                                className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold"
                              >
                                {summary.unreadCount}
                              </span>
                            </Tooltip>
                          )}
                        </div>
                      );
                    })()}
                  </td>
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
                  <td className="hidden sm:table-cell px-4 py-3 text-center">
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
                          data-testid="contractor-row-edit-button"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          aria-label="Edit contractor"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(c)}
                          data-testid="contractor-row-delete-button"
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
        </ScrollShadow>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} testId="contractors-pagination" />
      </div>

      <ContractorModal open={modalOpen} onClose={() => setModalOpen(false)} contractor={editingContractor} />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete contractor?"
        description={`This will remove ${deleteTarget?.firstName} ${deleteTarget?.lastName} from your roster and from any events they're booked on.`}
        confirmText={deleteTarget ? `${deleteTarget.firstName} ${deleteTarget.lastName}` : undefined}
      />

      <BulkEmailModal
        open={bulkEmailOpen}
        onClose={() => { setBulkEmailOpen(false); setSelectedIds(new Set()); }}
        contractors={selectedContractors}
      />
    </div>
  );
}
