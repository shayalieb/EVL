import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import {
  getStagePlotLibraryItemDetail, saveStagePlotLibraryPage, addStagePlotLibraryPage, deleteStagePlotLibraryPage,
  addStagePlotLibraryChannel, updateStagePlotLibraryChannel, deleteStagePlotLibraryChannel, reorderStagePlotLibraryChannels,
  addStagePlotLibraryBacklineItem, updateStagePlotLibraryBacklineItem, deleteStagePlotLibraryBacklineItem,
} from '../lib/stagePlotLibrary';
import StagePlotPageEditor from '../components/StagePlotPageEditor';
import StagePlotChannelList from '../components/StagePlotChannelList';
import StagePlotBacklineList from '../components/StagePlotBacklineList';

const inputClass = 'px-2 py-1 rounded-lg border border-slate-300 text-lg font-bold text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

// Builds/edits a Stage Plot Library template directly — no event behind it
// at all. Reuses the exact same canvas/channel-list/backline-list
// components the per-event editor (StagePlotEditorPage.jsx) uses; the two
// pages differ only in which persistence closures they hand those
// components (event-scoped there, library-scoped here) and in dropping
// what only makes sense with a real event (Email, Download PDF, roster).
export default function StagePlotLibraryEditorPage() {
  const { libraryItemId } = useParams();
  const { renameStagePlotLibraryItem } = useData();
  const [item, setItem] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [activePageId, setActivePageId] = useState(null);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const pageEditorRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getStagePlotLibraryItemDetail(libraryItemId)
      .then((detail) => {
        if (cancelled) return;
        setItem(detail);
        setActivePageId(detail.pages[0]?.id || null);
      })
      .catch((err) => setLoadError(err.message));
    return () => { cancelled = true; };
  }, [libraryItemId]);

  useEffect(() => {
    setSelectedElementId(null);
  }, [activePageId]);

  function handlePageSaved(pageId, patch) {
    setItem((prev) => (prev ? { ...prev, pages: prev.pages.map((pg) => (pg.id === pageId ? { ...pg, ...patch } : pg)) } : prev));
  }

  async function handleElementDeleted(elementId) {
    const channel = item.channels.find((c) => c.elementId === elementId);
    if (!channel) return;
    await deleteStagePlotLibraryChannel(libraryItemId, channel.id);
    setItem((prev) => ({ ...prev, channels: prev.channels.filter((c) => c.id !== channel.id) }));
  }

  async function handleUpdateElementContent(elementId, { name, description }) {
    const channel = item.channels.find((c) => c.elementId === elementId);
    if (channel) {
      const updated = await updateStagePlotLibraryChannel(libraryItemId, channel.id, { source: name, monitorNotes: description });
      setItem((prev) => ({ ...prev, channels: prev.channels.map((c) => (c.id === updated.id ? updated : c)) }));
    } else {
      const created = await addStagePlotLibraryChannel(libraryItemId, { source: name, monitorNotes: description, elementId });
      setItem((prev) => ({ ...prev, channels: [...prev.channels, created] }));
    }
  }

  async function handleAddPage() {
    const page = await addStagePlotLibraryPage(libraryItemId);
    setItem((prev) => ({ ...prev, pages: [...prev.pages, page] }));
    setActivePageId(page.id);
  }

  async function handleDeletePage(pageId) {
    if (!item || item.pages.length <= 1) return;
    if (pageId === activePageId) {
      await pageEditorRef.current?.flush();
    }
    const { deletedChannelIds } = await deleteStagePlotLibraryPage(libraryItemId, pageId);
    const removed = new Set(deletedChannelIds || []);
    setItem((prev) => ({
      ...prev,
      pages: prev.pages.filter((p) => p.id !== pageId),
      channels: prev.channels.filter((c) => !removed.has(c.id)),
    }));
    setActivePageId((prev) => (prev === pageId ? item.pages.find((p) => p.id !== pageId)?.id || null : prev));
  }

  function openRenameName() {
    setNameDraft(item.name);
    setEditingName(true);
  }

  async function handleRenameSubmit(e) {
    e.preventDefault();
    const name = nameDraft.trim();
    if (!name) return;
    const updated = await renameStagePlotLibraryItem(libraryItemId, name);
    setItem((prev) => ({ ...prev, name: updated.name }));
    setEditingName(false);
  }

  if (loadError) return <div data-testid="stageplot-library-editor-load-error" className="p-6 text-sm text-red-600">{loadError}</div>;
  if (!item) return <div className="p-6 text-sm text-slate-500">Loading…</div>;

  const sortedPages = item.pages.slice().sort((a, b) => a.order - b.order);
  const activePage = sortedPages.find((p) => p.id === activePageId);
  const elementNumbers = Object.fromEntries(
    item.channels.filter((c) => c.elementId).map((c) => [c.elementId, c.channelNumber])
  );
  const elementContent = Object.fromEntries(
    item.channels.filter((c) => c.elementId).map((c) => [c.elementId, { name: c.source, description: c.monitorNotes }])
  );
  const selectedElement = selectedElementId ? activePage?.scene?.elements?.find((e) => e.id === selectedElementId) : null;
  const channelApi = {
    addChannel: (patch) => addStagePlotLibraryChannel(libraryItemId, patch),
    updateChannel: (channelId, patch) => updateStagePlotLibraryChannel(libraryItemId, channelId, patch),
    deleteChannel: (channelId) => deleteStagePlotLibraryChannel(libraryItemId, channelId),
    reorderChannels: (orderedIds) => reorderStagePlotLibraryChannels(libraryItemId, orderedIds),
  };
  const backlineApi = {
    addItem: (patch) => addStagePlotLibraryBacklineItem(libraryItemId, patch),
    updateItem: (itemId, patch) => updateStagePlotLibraryBacklineItem(libraryItemId, itemId, patch),
    deleteItem: (itemId) => deleteStagePlotLibraryBacklineItem(libraryItemId, itemId),
  };

  return (
    <div className="p-6 w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link to="/stage-plot-library" className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; Back to Stage Plot Library</Link>
          <div className="mt-1 text-xs font-bold uppercase tracking-wide text-indigo-600">Reusable template</div>
          {editingName ? (
            <form onSubmit={handleRenameSubmit} className="mt-0.5">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={handleRenameSubmit}
                data-testid="stageplot-library-editor-name-input"
                className={inputClass}
              />
            </form>
          ) : (
            <button type="button" onClick={openRenameName} data-testid="stageplot-library-editor-name-button" className="block text-lg font-bold text-slate-800 hover:text-indigo-600 text-left">
              {item.name}
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
        Changes here affect future copies only. Stage plots already added to gigs remain independent and will not change.
      </div>

      <div className="flex items-center gap-1 mb-3 border-b border-slate-200 overflow-x-auto">
        {sortedPages.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActivePageId(p.id)}
            data-testid="stageplot-page-tab"
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${
              p.id === activePageId ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {p.name}
          </button>
        ))}
        <button type="button" onClick={handleAddPage} data-testid="stageplot-add-page-button" className="px-3 py-2 text-sm text-indigo-600 font-semibold">
          + Page
        </button>
        {sortedPages.length > 1 && activePage && (
          <button
            type="button"
            onClick={() => handleDeletePage(activePage.id)}
            data-testid="stageplot-delete-page-button"
            className="ml-auto px-3 py-2 text-xs font-semibold text-red-500"
          >
            Delete Page
          </button>
        )}
      </div>

      <div className="w-full min-w-0">
        {activePage && (
          <StagePlotPageEditor
            ref={pageEditorRef}
            key={activePage.id}
            onSavePage={(pageId, patch) => saveStagePlotLibraryPage(libraryItemId, pageId, patch)}
            page={activePage}
            onSaved={(patch) => handlePageSaved(activePage.id, patch)}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
            onElementDeleted={handleElementDeleted}
            elementNumbers={elementNumbers}
            elementContent={elementContent}
            onUpdateElementContent={handleUpdateElementContent}
          />
        )}
        <div className="w-full lg:w-4/5 mx-auto mt-6">
          <StagePlotChannelList
            api={channelApi}
            channels={item.channels}
            onChannelsChange={(channels) => setItem((prev) => ({ ...prev, channels }))}
            selectedElementId={selectedElementId}
            selectedElement={selectedElement}
            onSelectElement={setSelectedElementId}
          />
          <StagePlotBacklineList
            api={backlineApi}
            items={item.backlineItems}
            onItemsChange={(backlineItems) => setItem((prev) => ({ ...prev, backlineItems }))}
          />
        </div>
      </div>
    </div>
  );
}
