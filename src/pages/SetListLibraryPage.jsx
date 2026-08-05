import { useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import SetListLibraryModal from '../components/SetListLibraryModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SearchInput from '../components/ui/SearchInput';
import { matchesSearch } from '../lib/search';

// Resources-section ListView for reusable set lists (band/orchestra only —
// gated at the nav item in AppLayout.jsx and the route in App.jsx). Editing
// one here never touches copies already pulled into a specific event — see
// SetListsEditorPage.jsx, which deep-clones on pull.
export default function SetListLibraryPage() {
  const { setListLibrary, deleteSetListLibraryItem } = useData();
  const { can } = useAuth();
  const canEdit = can('manageEvents');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSetList, setEditingSetList] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');

  const filteredSetLists = setListLibrary.filter((s) => matchesSearch(search, [s.name]));

  function openAdd() {
    setEditingSetList(null);
    setModalOpen(true);
  }

  function openEdit(setList) {
    setEditingSetList(setList);
    setModalOpen(true);
  }

  function handleDelete() {
    deleteSetListLibraryItem(deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Set Lists</h2>
          <p className="text-sm text-slate-500 mt-1">Reusable set lists you can pull into any gig without rebuilding them from scratch.</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          disabled={!canEdit}
          data-testid="setlist-library-add-button"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add Set List
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search set lists…" className="w-64" testId="setlist-library-search-input" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSetLists.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-slate-400">
                    {setListLibrary.length === 0
                      ? 'No set lists yet. Add one to reuse it across gigs.'
                      : 'No set lists match your search.'}
                  </td>
                </tr>
              )}
              {filteredSetLists.map((s) => (
                <tr key={s.id} data-testid="setlist-library-row" className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {canEdit ? (
                      <button type="button" onClick={() => openEdit(s)} data-testid="setlist-library-row-name-link" className="hover:text-indigo-600 hover:underline text-left">
                        {s.name}
                      </button>
                    ) : (
                      <span>{s.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-md truncate">{s.description || '—'}</td>
                  <td className="px-4 py-3">
                    {canEdit && (
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          data-testid="setlist-library-row-edit-button"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          aria-label={`Edit ${s.name}`}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(s)}
                          data-testid="setlist-library-row-delete-button"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                          aria-label={`Delete ${s.name}`}
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

      <SetListLibraryModal open={modalOpen} onClose={() => setModalOpen(false)} setList={editingSetList} />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete set list?"
        description={`This removes "${deleteTarget?.name}" from your reusable set lists. Copies already pulled into a gig are unaffected.`}
      />
    </div>
  );
}
