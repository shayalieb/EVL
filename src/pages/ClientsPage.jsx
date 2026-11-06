import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import ClientModal from '../components/ClientModal';
import ClientViewsMenu from '../components/ClientViewsMenu';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ScrollShadow from '../components/ui/ScrollShadow';
import Tooltip from '../components/ui/Tooltip';
import SearchInput from '../components/ui/SearchInput';
import FilterSelect from '../components/ui/FilterSelect';
import Pagination from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';
import { CLIENT_STAGES, listClientTags, queryClients, stageInfo } from '../lib/clients';
import { formatCurrency } from '../lib/format';
import { useServerList } from '../lib/useServerList';

const ENGAGEMENT_OPTIONS = [
  { value: 'has-confirmed', label: 'Has Confirmed Events' },
  { value: 'has-pending', label: 'Has Pending Events' },
  { value: 'no-events', label: 'No Events' },
];
const NO_CONTACT_OPTIONS = [30, 60, 90, 180].map((days) => ({ value: String(days), label: `No contact in ${days} days` }));

const shortDate = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function ClientsPage() {
  const { loadClient, deleteClient, computeClientEventCounts } = useData();
  const { can } = useAuth();
  const canEdit = can('manageClients');
  const canSeeMoney = can('viewBookings');
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [engagementFilter, setEngagementFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [owes, setOwes] = useState(false);
  const [followUp, setFollowUp] = useState('');
  const [noContactDays, setNoContactDays] = useState('');
  const [tagOptions, setTagOptions] = useState([]);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('lastName');
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link support for "?open=<id>" — kept for older links; the client page
  // at /clients/:id is the normal destination now.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) return;
    loadClient(openId).then((match) => { setEditingClient(match); setModalOpen(true); }).catch(() => {});
    setSearchParams((prev) => { prev.delete('open'); return prev; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loadClient]);

  useEffect(() => { listClientTags().then(setTagOptions).catch(() => {}); }, []);

  const filters = {
    search, engagement: engagementFilter, stage: stageFilter, tag: tagFilter, owes,
    followUp, noContactDays: noContactDays ? Number(noContactDays) : '',
  };
  const hasFilters = !!(search || engagementFilter || stageFilter || tagFilter || owes || followUp || noContactDays);
  const { items: pagedClients, pageCount, pageSize, total: totalItems, loading, error, refresh } = useServerList(
    () => queryClients({ page, pageSize: 25, ...filters, owes: owes ? 1 : '', sort, direction: sort === 'createdAt' || sort === 'updatedAt' ? 'desc' : 'asc' }),
    [page, search, engagementFilter, stageFilter, tagFilter, owes, followUp, noContactDays, sort],
  );
  useEffect(() => { setPage(1); }, [search, engagementFilter, stageFilter, tagFilter, owes, followUp, noContactDays]);

  function clearFilters() {
    setSearch(''); setEngagementFilter(''); setStageFilter(''); setTagFilter('');
    setOwes(false); setFollowUp(''); setNoContactDays('');
  }

  function applyView(view) {
    clearFilters();
    setSearch(view.search || '');
    setEngagementFilter(view.engagement || '');
    setStageFilter(view.stage || '');
    setTagFilter(view.tag || '');
    setOwes(!!view.owes);
    setFollowUp(view.followUp || '');
    setNoContactDays(view.noContactDays ? String(view.noContactDays) : '');
    if (view.sort) setSort(view.sort);
  }

  function openAdd() {
    setEditingClient(null);
    setModalOpen(true);
  }

  function openEdit(client) {
    setEditingClient(client);
    setModalOpen(true);
  }

  async function handleDelete() {
    try {
      await deleteClient(deleteTarget.id);
      refresh();
      showToast('Client deleted');
      setDeleteTarget(null);
    } catch (err) {
      showToast(err.message || 'Failed to delete client', 'error');
    }
  }

  const colCount = canSeeMoney ? 10 : 8;

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
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, phone, email, notes…" className="w-full sm:w-80" testId="clients-search-input" />
        <FilterSelect value={stageFilter} onChange={setStageFilter} allLabel="Any stage" options={CLIENT_STAGES} testId="clients-stage-filter" />
        {tagOptions.length > 0 && (
          <FilterSelect value={tagFilter} onChange={setTagFilter} allLabel="Any tag" options={tagOptions.map((t) => ({ value: t, label: t }))} testId="clients-tag-filter" />
        )}
        <FilterSelect value={engagementFilter} onChange={setEngagementFilter} allLabel="All Clients" options={ENGAGEMENT_OPTIONS} testId="clients-engagement-filter" />
        {canSeeMoney && (
          <FilterSelect value={owes ? 'owes' : ''} onChange={(v) => setOwes(v === 'owes')} allLabel="Any balance" options={[{ value: 'owes', label: 'Owes money' }]} testId="clients-owes-filter" />
        )}
        <FilterSelect value={followUp} onChange={setFollowUp} allLabel="Any follow-up" options={[{ value: 'overdue', label: 'Follow-up overdue' }]} testId="clients-followup-filter" />
        <FilterSelect value={noContactDays} onChange={setNoContactDays} allLabel="Any last contact" options={NO_CONTACT_OPTIONS} testId="clients-nocontact-filter" />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort clients" className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-600">
          <option value="lastName">Last name</option>
          <option value="firstName">First name</option>
          <option value="createdAt">Newest added</option>
          <option value="updatedAt">Recently updated</option>
        </select>
        {hasFilters && (
          <button type="button" onClick={clearFilters} data-testid="clients-clear-filters-button" className="text-sm font-semibold text-slate-500 hover:text-slate-700">
            Clear
          </button>
        )}
        <ClientViewsMenu filters={filters} hasFilters={hasFilters} canEdit={canEdit} onApply={applyView} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <ScrollShadow>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Phone</th>
                <th className="hidden lg:table-cell px-4 py-3">Email</th>
                <th className="hidden sm:table-cell px-4 py-3">Events</th>
                {canSeeMoney && <th className="hidden md:table-cell px-4 py-3 text-right">Paid</th>}
                {canSeeMoney && <th className="hidden md:table-cell px-4 py-3 text-right">Balance</th>}
                <th className="hidden lg:table-cell px-4 py-3">Last Contact</th>
                <th className="hidden sm:table-cell px-4 py-3">Next Follow-up</th>
                <th className="hidden sm:table-cell px-4 py-3 text-center">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && pagedClients.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-10 text-center text-slate-400">
                    {error || (totalItems === 0 && !hasFilters ? (
                      <div className="flex flex-col items-center gap-3">
                        <div>
                          <p className="font-semibold text-slate-600">Add your first client</p>
                          <p className="text-sm mt-1">Keep their contact details ready for future bookings and events.</p>
                        </div>
                        {canEdit && <button type="button" onClick={openAdd} className="min-h-11 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">+ Add Client</button>}
                      </div>
                    ) : 'No clients match your search.')}
                  </td>
                </tr>
              )}
              {pagedClients.map((c) => {
                const counts = c.eventCounts || computeClientEventCounts(c.id);
                const stage = stageInfo(c.effectiveStage);
                const followOverdue = c.nextFollowUpAt && new Date(c.nextFollowUpAt) < new Date();
                return (
                  <tr key={c.id} data-testid="client-row" className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      <Link to={`/clients/${c.id}`} data-testid="client-row-name-link" className="inline-block py-1 text-left hover:text-indigo-600 hover:underline">
                        {c.firstName} {c.lastName}
                      </Link>
                      {c.company && <Link to={`/clients/company/${c.company.id}`} data-testid="client-row-company" className="block text-xs font-normal text-slate-400 hover:text-indigo-600 hover:underline">{c.company.name}</Link>}
                      <div className="flex flex-wrap items-center gap-1">
                        {c.effectiveStage && c.effectiveStage !== 'active' && (
                          <span data-testid="client-row-stage" className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${stage.color}1f`, color: stage.color }}>{stage.label}</span>
                        )}
                        {(c.tags || []).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{tag}</span>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{c.phone || '—'}</td>
                    <td className="hidden lg:table-cell px-4 py-3 text-slate-500">{c.email || '—'}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-slate-600 whitespace-nowrap">
                      {counts.confirmed + counts.pending + counts.declined === 0 ? <span className="text-slate-300">—</span> : (
                        <>
                          {counts.confirmed > 0 && <span>{counts.confirmed} confirmed</span>}
                          {counts.confirmed > 0 && counts.pending > 0 && ' · '}
                          {counts.pending > 0 && <span>{counts.pending} pending</span>}
                          {counts.confirmed + counts.pending === 0 && <span className="text-slate-400">{counts.declined} declined</span>}
                        </>
                      )}
                    </td>
                    {canSeeMoney && <td data-testid="client-row-paid" className="hidden md:table-cell px-4 py-3 text-right text-slate-600">{c.money?.paid ? formatCurrency(c.money.paid) : <span className="text-slate-300">—</span>}</td>}
                    {canSeeMoney && (
                      <td data-testid="client-row-balance" className={`hidden md:table-cell px-4 py-3 text-right ${c.money?.overdue > 0 ? 'font-semibold text-rose-600' : 'text-slate-600'}`}>
                        {c.money?.outstanding ? formatCurrency(c.money.outstanding) : <span className="text-slate-300">—</span>}
                      </td>
                    )}
                    <td className="hidden lg:table-cell px-4 py-3 text-slate-500 whitespace-nowrap">{c.lastContactAt ? shortDate(c.lastContactAt) : <span className="text-slate-300">—</span>}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-slate-500 whitespace-nowrap">
                      {c.nextFollowUpAt ? (
                        <span data-testid="client-row-followup" className={followOverdue ? 'font-semibold text-rose-600' : ''}>
                          {shortDate(c.nextFollowUpAt)}{followOverdue ? ' · overdue' : ''}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-center">
                      {c.noteCount > 0 ? (
                        <Tooltip content={c.pinnedNote ? `📌 ${c.pinnedNote}` : `${c.noteCount} note${c.noteCount === 1 ? '' : 's'}`}>
                          <span className={`inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-xs font-bold cursor-default ${c.pinnedNote ? 'bg-amber-200 text-amber-800' : 'bg-amber-100 text-amber-700'}`}>
                            {c.noteCount}
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
                            className="p-2 min-w-9 min-h-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                            aria-label="Edit client"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(c)}
                            data-testid="client-row-delete-button"
                            className="p-2 min-w-9 min-h-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50"
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
        description={`This permanently removes ${deleteTarget?.firstName} ${deleteTarget?.lastName}. Clients linked to bookings or events cannot be deleted until those records are reassigned.`}
      />
    </div>
  );
}
