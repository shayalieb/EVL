import { useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import ClientModal from '../components/ClientModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Tooltip from '../components/ui/Tooltip';
import SearchInput from '../components/ui/SearchInput';
import FilterSelect from '../components/ui/FilterSelect';
import { useToast } from '../components/ui/Toast';
import { matchesSearch } from '../lib/search';

const ENGAGEMENT_OPTIONS = [
  { value: 'has-confirmed', label: 'Has Confirmed Events' },
  { value: 'has-pending', label: 'Has Pending Events' },
  { value: 'no-events', label: 'No Events' },
];

export default function ClientsPage() {
  const { clients, deleteClient, computeClientEventCounts } = useData();
  const { can } = useAuth();
  const canEdit = can('manageClients');
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [engagementFilter, setEngagementFilter] = useState('');

  const hasFilters = !!(search || engagementFilter);
  const filteredClients = clients.filter((c) => {
    if (engagementFilter) {
      const counts = computeClientEventCounts(c.id);
      if (engagementFilter === 'has-confirmed' && !(counts.confirmed > 0)) return false;
      if (engagementFilter === 'has-pending' && !(counts.pending > 0)) return false;
      if (engagementFilter === 'no-events' && (counts.confirmed > 0 || counts.pending > 0 || counts.declined > 0)) return false;
    }
    return matchesSearch(search, [c.firstName, c.lastName, c.phone, c.email, c.notes]);
  });

  function openAdd() {
    setEditingClient(null);
    setModalOpen(true);
  }

  function openEdit(client) {
    setEditingClient(client);
    setModalOpen(true);
  }

  function handleDelete() {
    deleteClient(deleteTarget.id);
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
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add Client
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search clients by name, phone, or email…" className="w-full sm:w-80" />
        <FilterSelect
          value={engagementFilter}
          onChange={setEngagementFilter}
          allLabel="All Clients"
          options={ENGAGEMENT_OPTIONS}
        />
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(''); setEngagementFilter(''); }}
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
                <th className="px-4 py-3">Client Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3 text-center">Pending Events</th>
                <th className="px-4 py-3 text-center">Confirmed Events</th>
                <th className="px-4 py-3 text-center">Declined Events</th>
                <th className="px-4 py-3 text-center">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    {clients.length === 0
                      ? 'No clients yet. Add your first client to start tracking their events.'
                      : 'No clients match your search.'}
                  </td>
                </tr>
              )}
              {filteredClients.map((c) => {
                const counts = computeClientEventCounts(c.id);
                return (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="hover:text-indigo-600 hover:underline text-left"
                        >
                          {c.firstName} {c.lastName}
                        </button>
                      ) : (
                        <span>{c.firstName} {c.lastName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{counts.pending}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{counts.confirmed}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{counts.declined}</td>
                    <td className="px-4 py-3 text-center">
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
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                            aria-label="Edit client"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(c)}
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
        </div>
      </div>

      <ClientModal open={modalOpen} onClose={() => setModalOpen(false)} client={editingClient} />
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
