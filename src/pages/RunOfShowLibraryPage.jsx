import { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import RunOfShowLibraryModal from '../components/RunOfShowLibraryModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Tooltip from '../components/ui/Tooltip';
import Pagination from '../components/ui/Pagination';
import SearchInput from '../components/ui/SearchInput';
import { useToast } from '../components/ui/Toast';
import { matchesSearch } from '../lib/search';
import { formatEventDate } from '../lib/format';
import { queryRunOfShowLibrary } from '../lib/runOfShowLibrary';
import { useServerList } from '../lib/useServerList';

// Resources-section ListView for reusable run-of-show templates (band/
// orchestra only — gated at the nav item in AppLayout.jsx and the route in
// App.jsx). Editing one here never touches copies already pulled into a
// specific event — see RunOfShowEditorPage.jsx, which deep-clones on pull.
export default function RunOfShowLibraryPage() {
  const { runOfShowLibrary, deleteRunOfShowLibraryItem, events, loadEvent } = useData();
  const { can } = useAuth();
  const { showToast } = useToast();
  const canEdit = can('manageEvents');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const libraryList = useServerList(
    () => queryRunOfShowLibrary({ page, pageSize: 25, search, sort: 'name', direction: 'asc' }),
    [page, search],
  );
  const legacyFiltered = runOfShowLibrary.filter((item) => matchesSearch(search, [
    item.name,
    item.description,
    ...(item.items || []).map((it) => it.name),
  ]));
  const displayedItems = libraryList.error ? legacyFiltered : libraryList.items;
  useEffect(() => { setPage(1); }, [search]);

  useEffect(() => {
    const ids = [...new Set(displayedItems.flatMap((item) => item.eventIds || []))];
    Promise.allSettled(ids.map(loadEvent));
  }, [displayedItems, loadEvent]);

  function openAdd() {
    setEditingItem(null);
    setModalOpen(true);
  }

  function openEdit(item) {
    setEditingItem(item);
    setModalOpen(true);
  }

  async function handleDelete() {
    await deleteRunOfShowLibraryItem(deleteTarget.id);
    libraryList.refresh();
    showToast('Template deleted');
    setDeleteTarget(null);
  }

  function linkedEventsFor(item) {
    return (item.eventIds || []).map((id) => events.find((e) => e.id === id)).filter(Boolean);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Run of Show</h2>
          <p className="text-sm text-slate-500 mt-1">Build reusable show-day timelines once, then copy them into any event. Event copies stay independent from the library original.</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          disabled={!canEdit}
          data-testid="run-of-show-library-add-button"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add Template
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search templates or lines…" className="w-full sm:w-80" testId="run-of-show-library-search-input" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-center">Lines</th>
                <th className="px-4 py-3">Linked Events</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!libraryList.loading && displayedItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    {libraryList.total === 0 && !search ? (
                      <div className="flex flex-col items-center gap-3">
                        <div>
                          <p className="font-semibold text-slate-600">Create your first reusable run of show</p>
                          <p className="text-sm mt-1">Add load-in, soundcheck, doors, and set times, then copy the finished timeline into any event.</p>
                        </div>
                        {canEdit && (
                          <button type="button" onClick={openAdd} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
                            + Add Template
                          </button>
                        )}
                      </div>
                    ) : 'No templates match your search.'}
                  </td>
                </tr>
              )}
              {displayedItems.map((item) => {
                const linked = linkedEventsFor(item);
                return (
                  <tr key={item.id} data-testid="run-of-show-library-row" className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {canEdit ? (
                        <button type="button" onClick={() => openEdit(item)} data-testid="run-of-show-library-row-name-link" className="hover:text-indigo-600 hover:underline text-left">
                          {item.name}
                        </button>
                      ) : (
                        <span>{item.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 max-w-md truncate">{item.description || '—'}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{(item.items || []).length}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {linked.length === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : linked.length === 1 ? (
                        <span data-testid="run-of-show-library-row-linked-event">
                          {linked[0].name || '(untitled event)'}
                          {linked[0].eventDate && <span className="text-slate-400"> — {formatEventDate(linked[0].eventDate)}</span>}
                        </span>
                      ) : (
                        <Tooltip content={
                          <div className="space-y-1">
                            {linked.map((e) => (
                              <div key={e.id}>{e.name || '(untitled event)'}{e.eventDate && ` — ${formatEventDate(e.eventDate)}`}</div>
                            ))}
                          </div>
                        }>
                          <span data-testid="run-of-show-library-row-linked-event" className="underline decoration-dotted cursor-default">
                            {linked.length} events
                          </span>
                        </Tooltip>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canEdit && (
                        <div className="flex justify-end items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            data-testid="run-of-show-library-row-edit-button"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                            aria-label={`Edit ${item.name}`}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            data-testid="run-of-show-library-row-delete-button"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                            aria-label={`Delete ${item.name}`}
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

      {libraryList.error && runOfShowLibrary.length === 0 && <div className="mt-3 text-sm text-red-600">{libraryList.error}</div>}
      {!libraryList.error && <Pagination page={page} pageCount={libraryList.pageCount} onChange={setPage} totalItems={libraryList.total} pageSize={libraryList.pageSize} testId="run-of-show-library-pagination" />}

      <RunOfShowLibraryModal open={modalOpen} onClose={() => setModalOpen(false)} runOfShow={editingItem} onSaved={libraryList.refresh} />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete template?"
        description={`This removes "${deleteTarget?.name}" from your reusable run of show templates. Copies already pulled into a gig are unaffected.`}
      />
    </div>
  );
}
