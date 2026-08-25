import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import SearchInput from '../components/ui/SearchInput';
import { useToast } from '../components/ui/Toast';
import { matchesSearch } from '../lib/search';
import { formatEventDate } from '../lib/format';
import { fetchStagePlotLibraryThumbnail } from '../lib/stagePlotLibrary';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

function Thumbnail({ item }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (item.hasThumbnail) fetchStagePlotLibraryThumbnail(item.id).then((url) => { if (!cancelled) setSrc(url); });
    return () => { cancelled = true; };
  }, [item.id, item.hasThumbnail]);

  if (!src) {
    return <div className="w-14 h-10 rounded-md bg-slate-100 flex items-center justify-center text-slate-300 text-lg shrink-0">🎛️</div>;
  }
  return <img src={src} alt="" className="w-14 h-10 rounded-md border border-slate-200 object-contain bg-white shrink-0" />;
}

// Resources-section ListView for reusable stage plots (band/orchestra only —
// gated at the nav item in AppLayout.jsx and the route in App.jsx). Items
// come from two sources: "Save to Library" on an event's Stage Plot page
// (snapshots what's already built there), or "+ Add Stage Plot" below
// (builds a template from scratch, no event involved — StagePlotLibrary
// EditorPage.jsx). Either way, adding one to an event (StagePlotEditorPage.
// jsx's "+ Add from Library") deep-clones it server-side (see stagePlots.
// js's apply-library route), so editing one side never touches the other.
export default function StagePlotLibraryPage() {
  const { stagePlotLibrary, stagePlotLibraryLoading, addBlankStagePlotLibraryItem, renameStagePlotLibraryItem, deleteStagePlotLibraryItem } = useData();
  const { can } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const canEdit = can('manageEvents');
  const [search, setSearch] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addName, setAddName] = useState('Stage Plot');
  const [creating, setCreating] = useState(false);

  const filtered = stagePlotLibrary.filter((item) => matchesSearch(search, [item.name]));

  function openRename(item) {
    setRenaming(item);
    setRenameValue(item.name);
  }

  async function handleRename(e) {
    e.preventDefault();
    if (!renameValue.trim()) return;
    try {
      await renameStagePlotLibraryItem(renaming.id, renameValue.trim());
      showToast('Stage plot renamed');
      setRenaming(null);
    } catch (err) {
      showToast(err.message || 'Failed to rename stage plot', 'error');
    }
  }

  async function handleDelete() {
    try {
      await deleteStagePlotLibraryItem(deleteTarget.id);
      showToast('Stage plot deleted');
    } catch (err) {
      showToast(err.message || 'Failed to delete stage plot', 'error');
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleAddBlank(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const record = await addBlankStagePlotLibraryItem(addName.trim() || 'Stage Plot');
      setAddModalOpen(false);
      navigate(`/stage-plot-library/${record.id}`);
    } catch (err) {
      showToast(err.message || 'Failed to create stage plot', 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Stage Plots</h2>
          <p className="text-sm text-slate-500 mt-1">Saved stage plots, ready to reuse for a similar event — same venue, same lineup. Save one from any event's Stage Plot page, or build one from scratch here; copies added to an event stay independent of the saved original.</p>
        </div>
        <button
          type="button"
          onClick={() => { setAddName('Stage Plot'); setAddModalOpen(true); }}
          disabled={!canEdit}
          data-testid="stageplot-library-add-button"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add Stage Plot
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search stage plots…" className="w-full sm:w-80" testId="stageplot-library-search-input" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3" colSpan={2}>Name</th>
                <th className="px-4 py-3 text-center">Pages</th>
                <th className="px-4 py-3 text-center">Channels</th>
                <th className="px-4 py-3 text-center">Backline</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!stagePlotLibraryLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    {stagePlotLibrary.length === 0 && !search ? (
                      <div className="flex flex-col items-center gap-3">
                        <div>
                          <p className="font-semibold text-slate-600">No saved stage plots yet</p>
                          <p className="text-sm mt-1">Click "+ Add Stage Plot" to build one from scratch, or open any event's Stage Plot page and click "Save to Library."</p>
                        </div>
                        {canEdit && (
                          <button type="button" onClick={() => { setAddName('Stage Plot'); setAddModalOpen(true); }} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
                            + Add Stage Plot
                          </button>
                        )}
                      </div>
                    ) : 'No stage plots match your search.'}
                  </td>
                </tr>
              )}
              {filtered.map((item) => (
                <tr key={item.id} data-testid="stageplot-library-row" className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="pl-4 py-3"><Thumbnail item={item} /></td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {canEdit ? (
                      <Link to={`/stage-plot-library/${item.id}`} data-testid="stageplot-library-row-name-link" className="hover:text-indigo-600 hover:underline">
                        {item.name}
                      </Link>
                    ) : (
                      <span>{item.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600">{item.pageCount}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{item.channelCount}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{item.backlineCount}</td>
                  <td className="px-4 py-3 text-slate-500">{formatEventDate(item.updatedAt.slice(0, 10))}</td>
                  <td className="px-4 py-3">
                    {canEdit && (
                      <div className="flex justify-end items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openRename(item)}
                          data-testid="stageplot-library-row-edit-button"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          aria-label={`Rename ${item.name}`}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          data-testid="stageplot-library-row-delete-button"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                          aria-label={`Delete ${item.name}`}
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

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename stage plot" widthClass="max-w-sm">
        <form onSubmit={handleRename}>
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            data-testid="stageplot-library-rename-input"
            className={inputClass}
          />
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setRenaming(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" data-testid="stageplot-library-rename-save-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Save</button>
          </div>
        </form>
      </Modal>

      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="New stage plot" widthClass="max-w-sm">
        <form onSubmit={handleAddBlank}>
          <p className="text-sm text-slate-500 mb-3">Builds a blank template you can drag icons onto, add channels, and add backline items for — with no event attached. Add it to any event later from that event's Stage Plot page.</p>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Name</label>
          <input
            autoFocus
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            data-testid="stageplot-library-add-name-input"
            className={inputClass}
          />
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setAddModalOpen(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button
              type="submit"
              disabled={creating}
              data-testid="stageplot-library-add-confirm-button"
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create & Open'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete stage plot?"
        description={`This removes "${deleteTarget?.name}" from your saved stage plots. Copies already added to an event are unaffected.`}
      />
    </div>
  );
}
