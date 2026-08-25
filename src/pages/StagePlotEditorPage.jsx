import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
  getOrCreateStagePlot, addStagePlotPage, deleteStagePlotPage, saveStagePlotPage,
  updateStagePlotChannel, addStagePlotChannel, deleteStagePlotChannel, reorderStagePlotChannels,
  addStagePlotBacklineItem, updateStagePlotBacklineItem, deleteStagePlotBacklineItem,
  applyStagePlotLibraryItem,
} from '../lib/stagePlots';
import { generateStagePlotPdf } from '../lib/stagePlotPdf';
import { getThreadSummaries } from '../lib/email/threads';
import StagePlotPageEditor from '../components/StagePlotPageEditor';
import StagePlotChannelList from '../components/StagePlotChannelList';
import StagePlotBacklineList from '../components/StagePlotBacklineList';
import StagePlotEmailModal from '../components/StagePlotEmailModal';
import EmailThreadModal from '../components/EmailThreadModal';
import Modal from '../components/ui/Modal';
import SearchInput from '../components/ui/SearchInput';
import { useToast } from '../components/ui/Toast';
import { matchesSearch } from '../lib/search';
import { getEvent } from '../lib/events';
import { useContractorHydration } from '../lib/useContractorHydration';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

function formatTimeAgo(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

// onClose is only passed when this is rendered inside EventFormPage's
// "Stage Plot" popup (see EventFormPage.jsx) rather than at its own route —
// useParams() still resolves eventId correctly either way, since this
// component sits inside the /events/:eventId route tree in both cases.
export default function StagePlotEditorPage({ onClose } = {}) {
  const { eventId } = useParams();
  const isModal = !!onClose;
  const { currentUser } = useAuth();
  const { contractors, stagePlotLibrary, refreshStagePlotLibrary, saveStagePlotToLibrary } = useData();
  const { showToast } = useToast();
  const [event, setEvent] = useState(null);
  const [plot, setPlot] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [activePageId, setActivePageId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [threadSummaries, setThreadSummaries] = useState({});
  const [activeThreadContractorId, setActiveThreadContractorId] = useState(null);
  const [saveLibraryModalOpen, setSaveLibraryModalOpen] = useState(false);
  const [saveLibraryName, setSaveLibraryName] = useState('');
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [applyingLibraryId, setApplyingLibraryId] = useState(null);
  const [libraryImportMode, setLibraryImportMode] = useState('append');
  const [libraryImportInclude, setLibraryImportInclude] = useState({ pages: true, channels: true, backlineItems: true });
  const pageEditorRef = useRef(null);

  useContractorHydration([
    ...(event?.contractorBookings || []).map((booking) => booking.contractorId),
    ...Object.keys(threadSummaries),
  ]);

  // Same "own by contractor, event-scoped" thread system used everywhere
  // else contractor email lives (see EventFormPage.jsx) — a Stage Plot
  // email and a prep-sheet email to the same contractor about the same
  // event land in one shared conversation, not separate silos.
  const refreshThreadSummaries = useCallback(async () => {
    try {
      setThreadSummaries(await getThreadSummaries(eventId));
    } catch {
      // best-effort — the ledger just shows nothing if this fails
    }
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    getEvent(eventId).then((record) => { if (!cancelled) setEvent(record); }).catch(() => {});
    getOrCreateStagePlot(eventId)
      .then((p) => {
        setPlot(p);
        setActivePageId(p.pages[0]?.id || null);
      })
      .catch((err) => setLoadError(err.message));
    refreshThreadSummaries();
    return () => { cancelled = true; };
  }, [eventId, refreshThreadSummaries]);

  // A selected icon only means something on the page it was selected on —
  // clear it whenever the active page changes instead of leaving a stale
  // elementId pointing at an icon on a different page.
  useEffect(() => {
    setSelectedElementId(null);
  }, [activePageId]);

  useEffect(() => {
    if (!libraryPickerOpen) return undefined;
    const timer = setTimeout(() => refreshStagePlotLibrary(librarySearch).catch(() => {}), 250);
    return () => clearTimeout(timer);
  }, [libraryPickerOpen, librarySearch, refreshStagePlotLibrary]);

  function handlePageSaved(pageId, patch) {
    setPlot((prev) => (prev ? { ...prev, pages: prev.pages.map((pg) => (pg.id === pageId ? { ...pg, ...patch } : pg)) } : prev));
  }

  // Placing an icon on the canvas no longer auto-creates a linked Production
  // List row for it — an icon only ends up on the list once someone
  // deliberately adds it there (the canvas double-click popup's "+ Add to
  // Production List", or this list's own "+ Add Item for Selected Icon"),
  // so the list stays exactly what the account actually wants tracked
  // rather than every prop placed on the plot. Deleting an icon that IS
  // linked still cleans up its row, though, so a deliberately-added row
  // never gets left dangling after its icon is gone.
  async function handleElementDeleted(elementId) {
    const channel = plot.channels.find((c) => c.elementId === elementId);
    if (!channel) return;
    await deleteStagePlotChannel(eventId, channel.id);
    setPlot((prev) => ({ ...prev, channels: prev.channels.filter((c) => c.id !== channel.id) }));
  }

  // Backs the canvas double-click popup (CanvasStage.jsx) — "Name" and
  // "Description" map onto the same source/monitorNotes fields the
  // Production List already edits, so both are just two views onto the same channel
  // row. Creating a channel this way (an icon with no linked channel yet)
  // auto-assigns its channelNumber server-side, same as the list's own
  // "+ Add Channel for Selected Icon" button — using the popup is what
  // makes an icon show up in the Production List, not a separate step.
  async function handleUpdateElementContent(elementId, { name, description }) {
    const channel = plot.channels.find((c) => c.elementId === elementId);
    if (channel) {
      const updated = await updateStagePlotChannel(eventId, channel.id, { source: name, monitorNotes: description });
      setPlot((prev) => ({ ...prev, channels: prev.channels.map((c) => (c.id === updated.id ? updated : c)) }));
    } else {
      const created = await addStagePlotChannel(eventId, { source: name, monitorNotes: description, elementId });
      setPlot((prev) => ({ ...prev, channels: [...prev.channels, created] }));
    }
  }

  async function handleAddPage() {
    const page = await addStagePlotPage(eventId);
    setPlot((prev) => ({ ...prev, pages: [...prev.pages, page] }));
    setActivePageId(page.id);
  }

  async function handleDeletePage(pageId) {
    if (!plot || plot.pages.length <= 1) return;
    // The server's orphaned-channel cleanup (stagePlots.js) reads this
    // page's *saved* scene — flush any pending debounced autosave first, or
    // an icon placed just before hitting "Delete Page" could still be
    // unsaved server-side and get missed, leaving its channel orphaned.
    if (pageId === activePageId) {
      await pageEditorRef.current?.flush();
    }
    // The server also deletes any production-list channels linked to icons
    // that only existed on this page (see stagePlots.js's DELETE
    // /pages/:pageId) — deletedChannelIds lets local state drop them too,
    // instead of the Production List showing rows for a page that no longer exists.
    const { deletedChannelIds } = await deleteStagePlotPage(eventId, pageId);
    const removed = new Set(deletedChannelIds || []);
    setPlot((prev) => ({
      ...prev,
      pages: prev.pages.filter((p) => p.id !== pageId),
      channels: prev.channels.filter((c) => !removed.has(c.id)),
    }));
    setActivePageId((prev) => (prev === pageId ? plot.pages.find((p) => p.id !== pageId)?.id || null : prev));
  }

  async function handleExportPdf() {
    setExporting(true);
    try {
      await generateStagePlotPdf({ eventId, eventName: event?.name, stagePlot: plot, businessInfo: currentUser?.businessInfo });
    } finally {
      setExporting(false);
    }
  }

  function openSaveToLibrary() {
    setSaveLibraryName(`${event?.name || 'Untitled'} Stage Plot`);
    setSaveLibraryModalOpen(true);
  }

  async function handleSaveToLibrary(e) {
    e.preventDefault();
    const name = saveLibraryName.trim();
    if (!name) return;
    setSavingToLibrary(true);
    try {
      await saveStagePlotToLibrary(eventId, name);
      showToast(`Saved "${name}" to your stage plot library`);
      setSaveLibraryModalOpen(false);
    } catch (err) {
      showToast(err.message || 'Failed to save to library', 'error');
    } finally {
      setSavingToLibrary(false);
    }
  }

  // Server does the actual clone-and-remap (stagePlots.js's apply-library
  // route) — this just swaps local state to the merged result and jumps to
  // the first newly-added page tab so the addition is immediately visible.
  async function handleAddFromLibrary(item) {
    setApplyingLibraryId(item.id);
    try {
      const existingPageIds = new Set(plot.pages.map((p) => p.id));
      const merged = await applyStagePlotLibraryItem(eventId, item.id, { mode: libraryImportMode, include: libraryImportInclude });
      setPlot(merged);
      const firstNewPage = merged.pages.slice().sort((a, b) => a.order - b.order).find((p) => !existingPageIds.has(p.id));
      if (firstNewPage) setActivePageId(firstNewPage.id);
      showToast(libraryImportMode === 'replace' ? `Replaced selected sections with "${item.name}"` : `Added "${item.name}"`);
      setLibraryPickerOpen(false);
    } catch (err) {
      showToast(err.message || 'Failed to add from library', 'error');
    } finally {
      setApplyingLibraryId(null);
    }
  }

  if (loadError) return <div data-testid="stageplot-load-error" className="p-6 text-sm text-red-600">{loadError}</div>;
  if (!plot) return <div className="p-6 text-sm text-slate-500">Loading…</div>;

  const sortedPages = plot.pages.slice().sort((a, b) => a.order - b.order);
  const activePage = sortedPages.find((p) => p.id === activePageId);
  const elementNumbers = Object.fromEntries(
    plot.channels.filter((c) => c.elementId).map((c) => [c.elementId, c.channelNumber])
  );
  const elementContent = Object.fromEntries(
    plot.channels.filter((c) => c.elementId).map((c) => [c.elementId, { name: c.source, description: c.monitorNotes }])
  );
  const selectedElement = selectedElementId ? activePage?.scene?.elements?.find((e) => e.id === selectedElementId) : null;
  // Bound closures over eventId — StagePlotChannelList/BacklineList take
  // this generic `api` shape so they're not hardwired to event-scoped
  // persistence (StagePlotLibraryEditorPage.jsx passes library-scoped
  // closures to the exact same components instead).
  const channelApi = {
    addChannel: (patch) => addStagePlotChannel(eventId, patch),
    updateChannel: (channelId, patch) => updateStagePlotChannel(eventId, channelId, patch),
    deleteChannel: (channelId) => deleteStagePlotChannel(eventId, channelId),
    reorderChannels: (orderedIds) => reorderStagePlotChannels(eventId, orderedIds),
  };
  const backlineApi = {
    addItem: (patch) => addStagePlotBacklineItem(eventId, patch),
    updateItem: (itemId, patch) => updateStagePlotBacklineItem(eventId, itemId, patch),
    deleteItem: (itemId) => deleteStagePlotBacklineItem(eventId, itemId),
  };
  const rosterContractors = (event?.contractorBookings || [])
    .map((b) => contractors.find((c) => c.id === b.contractorId))
    .filter((c) => c?.email);
  const fromName = currentUser.businessInfo?.name || `${currentUser.firstName} ${currentUser.lastName}`;
  // Every thread for this event, not just current roster members — removing
  // someone from the roster shouldn't erase their email history here, since
  // getThreadSummaries (server/src/routes/stagePlots.js) already returns
  // threads keyed by contractorId regardless of roster status.
  const contractorsWithThreads = Object.keys(threadSummaries)
    .filter((id) => threadSummaries[id]?.hasThread)
    .map((id) => contractors.find((c) => c.id === id))
    .filter(Boolean);
  const activeThreadContractor = activeThreadContractorId ? contractors.find((c) => c.id === activeThreadContractorId) : null;

  return (
    <div className={isModal ? 'w-full' : 'p-6 w-full'}>
      <div className="flex items-center justify-between mb-4">
        {isModal ? (
          <div />
        ) : (
          <div>
            <Link to={`/events/${eventId}`} className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; Back to event</Link>
            <div className="mt-1 text-xs font-bold uppercase tracking-wide text-indigo-600">Gig stage plot</div>
            <h1 className="text-lg font-bold text-slate-800">Stage Plot{event?.name ? ` — ${event.name}` : ''}</h1>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLibraryPickerOpen(true)}
            data-testid="stageplot-add-from-library-button"
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold"
          >
            + Add from Library
          </button>
          <button
            type="button"
            onClick={openSaveToLibrary}
            data-testid="stageplot-save-to-library-button"
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold"
          >
            Save to Library
          </button>
          <button
            type="button"
            onClick={() => setEmailModalOpen(true)}
            data-testid="stageplot-email-button"
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold"
          >
            Email
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exporting}
            data-testid="stageplot-export-pdf-button"
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Download PDF'}
          </button>
          {isModal && (
            <button
              type="button"
              onClick={onClose}
              data-testid="stageplot-modal-done-button"
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
            >
              Done
            </button>
          )}
        </div>
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
            onSavePage={(pageId, patch) => saveStagePlotPage(eventId, pageId, patch)}
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
            channels={plot.channels}
            onChannelsChange={(channels) => setPlot((prev) => ({ ...prev, channels }))}
            selectedElementId={selectedElementId}
            selectedElement={selectedElement}
            onSelectElement={setSelectedElementId}
          />
          <StagePlotBacklineList
            api={backlineApi}
            items={plot.backlineItems}
            onItemsChange={(backlineItems) => setPlot((prev) => ({ ...prev, backlineItems }))}
          />

          <div className="w-full mt-4">
            <div className="text-xs font-semibold text-slate-500 mb-2">Sent Emails</div>
            {contractorsWithThreads.length === 0 ? (
              <p className="text-sm text-slate-400">No emails sent from here yet.</p>
            ) : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                {contractorsWithThreads.map((c) => {
                  const summary = threadSummaries[c.id];
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setActiveThreadContractorId(c.id)}
                      data-testid="stageplot-email-ledger-row"
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="text-sm font-medium text-slate-700">{c.firstName} {c.lastName}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-400">{formatTimeAgo(summary.lastMessageAt)}</span>
                        {summary.unreadCount > 0 && (
                          <span
                            data-testid="stageplot-email-ledger-unread-badge"
                            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold"
                          >
                            {summary.unreadCount}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <StagePlotEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        eventId={eventId}
        eventName={event?.name}
        eventDate={event?.eventDate}
        stagePlot={plot}
        rosterContractors={rosterContractors}
        businessInfo={currentUser?.businessInfo}
        fromName={fromName}
        onSent={refreshThreadSummaries}
      />
      <EmailThreadModal
        open={!!activeThreadContractorId}
        onClose={() => setActiveThreadContractorId(null)}
        eventId={eventId}
        contractorId={activeThreadContractorId}
        contractorEmail={activeThreadContractor?.email}
        contractorLabel={activeThreadContractor ? `${activeThreadContractor.firstName} ${activeThreadContractor.lastName}` : ''}
        fromName={fromName}
        onChanged={refreshThreadSummaries}
      />

      <Modal open={saveLibraryModalOpen} onClose={() => setSaveLibraryModalOpen(false)} title="Save to Stage Plot Library" widthClass="max-w-sm">
        <form onSubmit={handleSaveToLibrary}>
          <p className="text-sm text-slate-500 mb-3">Saves a copy of this event's current stage plot — pages, channel list, and backline — to your library for reuse on other events.</p>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Name</label>
          <input
            autoFocus
            value={saveLibraryName}
            onChange={(e) => setSaveLibraryName(e.target.value)}
            data-testid="stageplot-save-to-library-name-input"
            className={inputClass}
          />
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setSaveLibraryModalOpen(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button
              type="submit"
              disabled={savingToLibrary}
              data-testid="stageplot-save-to-library-confirm-button"
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingToLibrary ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={libraryPickerOpen} onClose={() => setLibraryPickerOpen(false)} title="Add from Stage Plot Library" widthClass="max-w-xl">
        <p className="text-sm text-slate-500 mb-3">
          Choose whether to add the template alongside the current gig or replace selected sections. Either way, this creates an independent copy: later edits here will not alter the library original, and later template edits will not change this gig.
        </p>
        <fieldset className="mb-3 rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">How to apply it</legend>
          <label className="mr-5 inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="stage-plot-import-mode" checked={libraryImportMode === 'append'} onChange={() => setLibraryImportMode('append')} />
            Add alongside current work
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="stage-plot-import-mode" checked={libraryImportMode === 'replace'} onChange={() => setLibraryImportMode('replace')} />
            Replace selected sections
          </label>
          {libraryImportMode === 'replace' && <p className="mt-2 text-xs font-semibold text-red-600">The selected sections already on this gig will be permanently replaced.</p>}
          <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-3">
            {[['pages', 'Canvas pages'], ['channels', 'Production list'], ['backlineItems', 'Backline list']].map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={libraryImportInclude[key]} onChange={(e) => setLibraryImportInclude((current) => ({ ...current, [key]: e.target.checked }))} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <SearchInput value={librarySearch} onChange={setLibrarySearch} placeholder="Search saved stage plots…" className="w-full mb-3" testId="stageplot-library-picker-search-input" />
        <div className="max-h-80 overflow-y-auto space-y-1.5">
          {stagePlotLibrary.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No saved stage plots yet — use "Save to Library" on any event's Stage Plot to start one.</div>}
          {stagePlotLibrary.length > 0 && stagePlotLibrary.filter((item) => matchesSearch(librarySearch, [item.name])).length === 0 && (
            <div className="text-sm text-slate-400 text-center py-6">No saved stage plots match your search.</div>
          )}
          {stagePlotLibrary.filter((item) => matchesSearch(librarySearch, [item.name])).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleAddFromLibrary(item)}
              disabled={applyingLibraryId === item.id || !Object.values(libraryImportInclude).some(Boolean)}
              data-testid="stageplot-library-picker-item"
              className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 flex items-center justify-between disabled:opacity-50"
            >
              <span className="font-medium text-slate-700">{item.name}</span>
              <span className="text-xs text-slate-400 shrink-0 ml-2">
                {applyingLibraryId === item.id ? 'Applying…' : `${item.pageCount} page${item.pageCount === 1 ? '' : 's'} · ${item.channelCount} channel${item.channelCount === 1 ? '' : 's'} · ${item.backlineCount || 0} backline`}
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
