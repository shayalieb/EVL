import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { getOrCreateStagePlot, addStagePlotPage, deleteStagePlotPage } from '../lib/stagePlots';
import { generateStagePlotPdf } from '../lib/stagePlotPdf';
import StagePlotPageEditor from '../components/StagePlotPageEditor';
import StagePlotChannelList from '../components/StagePlotChannelList';

export default function StagePlotEditorPage() {
  const { eventId } = useParams();
  const { currentUser } = useAuth();
  const { events } = useData();
  const event = events.find((e) => e.id === eventId);
  const [plot, setPlot] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [activePageId, setActivePageId] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getOrCreateStagePlot(eventId)
      .then((p) => {
        setPlot(p);
        setActivePageId(p.pages[0]?.id || null);
      })
      .catch((err) => setLoadError(err.message));
  }, [eventId]);

  function handlePageSaved(pageId, patch) {
    setPlot((prev) => (prev ? { ...prev, pages: prev.pages.map((pg) => (pg.id === pageId ? { ...pg, ...patch } : pg)) } : prev));
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

  return (
    <div className="p-6 max-w-[1500px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link to={`/events/${eventId}`} className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; Back to event</Link>
          <h1 className="text-lg font-bold text-slate-800">Stage Plot{event?.name ? ` — ${event.name}` : ''}</h1>
        </div>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={exporting}
          data-testid="stageplot-export-pdf-button"
          className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Download PDF'}
        </button>
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

      <div className="flex gap-4 items-start">
        {activePage && (
          <StagePlotPageEditor
            key={activePage.id}
            eventId={eventId}
            page={activePage}
            onSaved={(patch) => handlePageSaved(activePage.id, patch)}
          />
        )}
        <StagePlotChannelList
          eventId={eventId}
          channels={plot.channels}
          onChannelsChange={(channels) => setPlot((prev) => ({ ...prev, channels }))}
        />
      </div>
    </div>
  );
}
