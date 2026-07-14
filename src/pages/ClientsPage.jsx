import { useState } from 'react';
import { useData } from '../context/DataContext';
import ClientModal from '../components/ClientModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Tooltip from '../components/ui/Tooltip';
import { useToast } from '../components/ui/Toast';

export default function ClientsPage() {
  const { clients, deleteClient, computeClientEventCounts } = useData();
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

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
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
        >
          + Add Client
        </button>
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
              {clients.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    No clients yet. Add your first client to start tracking their events.
                  </td>
                </tr>
              )}
              {clients.map((c) => {
                const counts = computeClientEventCounts(c.id);
                return (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="hover:text-indigo-600 hover:underline text-left"
                      >
                        {c.firstName} {c.lastName}
                      </button>
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
