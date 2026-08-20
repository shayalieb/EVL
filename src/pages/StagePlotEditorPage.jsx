import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { getOrCreateStagePlot, addStagePlotPage, deleteStagePlotPage, updateStagePlotChannel, addStagePlotChannel, deleteStagePlotChannel } from '../lib/stagePlots';
import { generateStagePlotPdf } from '../lib/stagePlotPdf';
import { getThreadSummaries } from '../lib/email/threads';
import StagePlotPageEditor from '../components/StagePlotPageEditor';
import StagePlotChannelList from '../components/StagePlotChannelList';
import StagePlotBacklineList from '../components/StagePlotBacklineList';
import StagePlotEmailModal from '../components/StagePlotEmailModal';
import EmailThreadModal from '../components/EmailThreadModal';

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
  const { events, contractors } = useData();
  const event = events.find((e) => e.id === eventId);
  const [plot, setPlot] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [activePageId, setActivePageId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [threadSummaries, setThreadSummaries] = useState({});
  const [activeThreadContractorId, setActiveThreadContractorId] = useState(null);
  const pageEditorRef = useRef(null);

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
    getOrCreateStagePlot(eventId)
      .then((p) => {
        setPlot(p);
        setActivePageId(p.pages[0]?.id || null);
      })
      .catch((err) => setLoadError(err.message));
    refreshThreadSummaries();
  }, [eventId, refreshThreadSummaries]);

  // A selected icon only means something on the page it was selected on —
  // clear it whenever the active page changes instead of leaving a stale
  // elementId pointing at an icon on a different page.
  useEffect(() => {
    setSelectedElementId(null);
  }, [activePageId]);

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
    <div className={isModal ? '' : 'p-6 max-w-[1500px] mx-auto'}>
      <div className="flex items-center justify-between mb-4">
        {isModal ? (
          <div />
        ) : (
          <div>
            <Link to={`/events/${eventId}`} className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; Back to event</Link>
            <h1 className="text-lg font-bold text-slate-800">Stage Plot{event?.name ? ` — ${event.name}` : ''}</h1>
          </div>
        )}
        <div className="flex items-center gap-2">
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

      <div className="flex flex-wrap gap-4 items-start">
        {activePage && (
          <StagePlotPageEditor
            ref={pageEditorRef}
            key={activePage.id}
            eventId={eventId}
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
        <div className="flex flex-col">
          <StagePlotChannelList
            eventId={eventId}
            channels={plot.channels}
            onChannelsChange={(channels) => setPlot((prev) => ({ ...prev, channels }))}
            selectedElementId={selectedElementId}
            selectedElement={selectedElement}
            onSelectElement={setSelectedElementId}
          />
          <StagePlotBacklineList
            eventId={eventId}
            items={plot.backlineItems}
            onItemsChange={(backlineItems) => setPlot((prev) => ({ ...prev, backlineItems }))}
          />

          <div className="w-full max-w-[36rem] shrink-0 mt-4">
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
    </div>
  );
}
