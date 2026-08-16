import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { getOrCreateStagePlot, addStagePlotPage, deleteStagePlotPage, updateStagePlotChannel, addStagePlotChannel, deleteStagePlotChannel } from '../lib/stagePlots';
import { generateStagePlotPdf } from '../lib/stagePlotPdf';
import StagePlotPageEditor from '../components/StagePlotPageEditor';
import StagePlotChannelList from '../components/StagePlotChannelList';

// onClose is only passed when this is rendered inside EventFormPage's
// "Stage Plot" popup (see EventFormPage.jsx) rather than at its own route —
// useParams() still resolves eventId correctly either way, since this
// component sits inside the /events/:eventId route tree in both cases.
export default function StagePlotEditorPage({ onClose } = {}) {
  const { eventId } = useParams();
  const isModal = !!onClose;
  const { currentUser } = useAuth();
  const { events } = useData();
  const event = events.find((e) => e.id === eventId);
  const [plot, setPlot] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [activePageId, setActivePageId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState(null);

  useEffect(() => {
    getOrCreateStagePlot(eventId)
      .then((p) => {
        setPlot(p);
        setActivePageId(p.pages[0]?.id || null);
      })
      .catch((err) => setLoadError(err.message));
  }, [eventId]);

  // A selected icon only means something on the page it was selected on —
  // clear it whenever the active page changes instead of leaving a stale
  // elementId pointing at an icon on a different page.
  useEffect(() => {
    setSelectedElementId(null);
  }, [activePageId]);

  function handlePageSaved(pageId, patch) {
    setPlot((prev) => (prev ? { ...prev, pages: prev.pages.map((pg) => (pg.id === pageId ? { ...pg, ...patch } : pg)) } : prev));
  }

  // The I/O List is now auto-generated from what's actually placed on the
  // canvas (see handleElementAdded below) — so removing an icon removes its
  // row too, keeping the list a live mirror of the plot instead of
  // accumulating orphaned "New Channel" rows every time someone deletes a
  // placed instrument. Manually-added rows (never linked to an icon) are
  // untouched, since this only ever finds a channel by elementId.
  async function handleElementDeleted(elementId) {
    const channel = plot.channels.find((c) => c.elementId === elementId);
    if (!channel) return;
    await deleteStagePlotChannel(eventId, channel.id);
    setPlot((prev) => ({ ...prev, channels: prev.channels.filter((c) => c.id !== channel.id) }));
  }

  // Fired the moment an icon is dropped onto the canvas (CanvasStage.jsx's
  // handleDrop) — auto-creates its linked I/O/backline row immediately,
  // rather than waiting for someone to open the icon's notes popup or click
  // "+ Add Channel for Selected Icon". `source` starts as the icon's default
  // label (e.g. "Vocal Mic"); still freely editable afterward.
  async function handleElementAdded(element) {
    const created = await addStagePlotChannel(eventId, { source: element.label, elementId: element.id });
    setPlot((prev) => ({ ...prev, channels: [...prev.channels, created] }));
  }

  // Backs the canvas double-click popup (CanvasStage.jsx) — "Name" and
  // "Description" map onto the same source/monitorNotes fields the I/O
  // List already edits, so both are just two views onto the same channel
  // row. Creating a channel this way (an icon with no linked channel yet)
  // auto-assigns its channelNumber server-side, same as the list's own
  // "+ Add Channel for Selected Icon" button — using the popup is what
  // makes an icon show up in the I/O List, not a separate step.
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
    await deleteStagePlotPage(eventId, pageId);
    setPlot((prev) => ({ ...prev, pages: prev.pages.filter((p) => p.id !== pageId) }));
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

      <div className="flex items-center gap-1 mb-3 border-b border-slate-200">
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
            key={activePage.id}
            eventId={eventId}
            page={activePage}
            onSaved={(patch) => handlePageSaved(activePage.id, patch)}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
            onElementDeleted={handleElementDeleted}
            onElementAdded={handleElementAdded}
            elementNumbers={elementNumbers}
            elementContent={elementContent}
            onUpdateElementContent={handleUpdateElementContent}
          />
        )}
        <StagePlotChannelList
          eventId={eventId}
          channels={plot.channels}
          onChannelsChange={(channels) => setPlot((prev) => ({ ...prev, channels }))}
          selectedElementId={selectedElementId}
          selectedElement={selectedElement}
          onSelectElement={setSelectedElementId}
        />
      </div>
    </div>
  );
}
