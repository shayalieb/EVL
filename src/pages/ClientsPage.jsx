import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import ClientModal from '../components/ClientModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ScrollShadow from '../components/ui/ScrollShadow';
import Tooltip from '../components/ui/Tooltip';
import SearchInput from '../components/ui/SearchInput';
import FilterSelect from '../components/ui/FilterSelect';
import Pagination from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';
import { queryClients } from '../lib/clients';
import { useServerList } from '../lib/useServerList';

const ENGAGEMENT_OPTIONS = [
  { value: 'has-confirmed', label: 'Has Confirmed Events' },
  { value: 'has-pending', label: 'Has Pending Events' },
  { value: 'no-events', label: 'No Events' },
];

export default function ClientsPage() {
  const { loadClient, deleteClient, computeClientEventCounts } = useData();
  const { can } = useAuth();
  const canEdit = can('manageClients');
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [engagementFilter, setEngagementFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('lastName');
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link support for "?open=<id>" — used by Reminders' related-record
  // links so opening a reminder about a client jumps straight to editing
  // them, instead of leaving the user to search the list by hand.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) return;
    loadClient(openId).then((match) => { setEditingClient(match); setModalOpen(true); }).catch(() => {});
    setSearchParams((prev) => { prev.delete('open'); return prev; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loadClient]);

  const hasFilters = !!(search || engagementFilter);
  const { items: pagedClients, pageCount, pageSize, total: totalItems, loading, error, refresh } = useServerList(
    () => queryClients({ page, pageSize: 25, search, engagement: engagementFilter, sort, direction: sort === 'createdAt' || sort === 'updatedAt' ? 'desc' : 'asc' }),
    [page, search, engagementFilter, sort],
  );
  useEffect(() => { setPage(1); }, [search, engagementFilter]);

  function openAdd() {
    setEditingClient(null);
    setModalOpen(true);
  }

  function openEdit(client) {
    setEditingClient(client);
    setModalOpen(true);
  }

  async function handleDelete() {
    await deleteClient(deleteTarget.id);
    refresh();
    showToast('Client deleted');
    setDeleteTarget(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-slate-800">Clients</h2>
        <button
          type="button"
          onClick={openAdd}
          disabled={!canEdit}
          data-testid="clients-add-button"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add Client
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search clients by name, phone, or email…" className="w-full sm:w-80" testId="clients-search-input" />
        <FilterSelect
          value={engagementFilter}
          onChange={setEngagementFilter}
          allLabel="All Clients"
          options={ENGAGEMENT_OPTIONS}
          testId="clients-engagement-filter"
        />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort clients" className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-600">
          <option value="lastName">Last name</option>
          <option value="firstName">First name</option>
          <option value="createdAt">Newest added</option>
          <option value="updatedAt">Recently updated</option>
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(''); setEngagementFilter(''); }}
            data-testid="clients-clear-filters-button"
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
                <th className="px-4 py-3">Client Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="hidden sm:table-cell px-4 py-3">Email</th>
                <th className="hidden sm:table-cell px-4 py-3 text-center">Pending Events</th>
                <th className="hidden sm:table-cell px-4 py-3 text-center">Confirmed Events</th>
                <th className="hidden sm:table-cell px-4 py-3 text-center">Declined Events</th>
                <th className="hidden sm:table-cell px-4 py-3 text-center">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && pagedClients.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    {error || (totalItems === 0 && !hasFilters
                      ? 'No clients yet. Add your first client to start tracking their events.'
                      : 'No clients match your search.')}
                  </td>
                </tr>
              )}
              {pagedClients.map((c) => {
                const counts = c.eventCounts || computeClientEventCounts(c.id);
                return (
                  <tr key={c.id} data-testid="client-row" className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          data-testid="client-row-name-link"
                          className="hover:text-indigo-600 hover:underline text-left"
                        >
                          {c.firstName} {c.lastName}
                        </button>
                      ) : (
                        <span>{c.firstName} {c.lastName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{c.phone || '—'}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-slate-500">{c.email || '—'}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-center text-slate-600">{counts.pending}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-center text-slate-600">{counts.confirmed}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-center text-slate-600">{counts.declined}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-center">
                      {c.notes ? (
                        <Tooltip content={c.notes}>
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
                            data-testid="client-row-edit-button"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                            aria-label="Edit client"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(c)}
                            data-testid="client-row-delete-button"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                            aria-label="Delete client"
                          >
                            🗑
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollShadow>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} testId="clients-pagination" />
      </div>

      <ClientModal open={modalOpen} onClose={() => { setModalOpen(false); refresh(); }} client={editingClient} />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete client?"
        description={`This will remove ${deleteTarget?.firstName} ${deleteTarget?.lastName} and unlink them from any events.`}
      />
    </div>
  );
}
