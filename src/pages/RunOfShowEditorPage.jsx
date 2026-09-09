import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useToast } from '../components/ui/Toast';
import { uid } from '../lib/storage';
import { getEvent, updateEventApi } from '../lib/events';
import { RUN_OF_SHOW_TYPES } from '../lib/runOfShow';
import RunOfShowShareModal from '../components/RunOfShowShareModal';
import Modal from '../components/ui/Modal';
import SearchInput from '../components/ui/SearchInput';
import { matchesSearch } from '../lib/search';

const inputClass = 'px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

function emptyScheduleItem() {
  return { id: uid('ros'), type: 'other', time: '', name: '', details: '' };
}

// Postgres reorders a JSONB column's object keys alphabetically on
// round-trip, so a freshly-created item (inserted in insertion order,
// client-side) never matches the same item read back after a save if
// compared with plain JSON.stringify — the dirty flag would stay stuck on
// "Unsaved changes" forever. Sorting keys before comparing makes the check
// order-independent instead.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

// Event.schedule lives in the same low-write-frequency JSON-blob convention
// as Set List (see SetListsEditorPage.jsx's own header comment) — explicit
// Save Changes, not autosave, since a show-day timeline is edited in bursts,
// not keystroke-by-keystroke like a canvas.
// onClose is only passed when this is rendered inside EventFormPage's Run of
// Show side panel rather than its own route — see StagePlotEditorPage.jsx's
// header comment for why useParams() still resolves eventId correctly
// either way (both sit inside the /events/:eventId route tree).
export default function RunOfShowEditorPage({ onClose } = {}) {
  const isModal = !!onClose;
  const { eventId } = useParams();
  const { runOfShowLibrary, runOfShowLibraryLoading, addRunOfShowLibraryItem } = useData();
  const { showToast } = useToast();
  const [event, setEvent] = useState(null);
  const [eventLoading, setEventLoading] = useState(true);
  const [eventError, setEventError] = useState('');

  useEffect(() => {
    if (!eventId) { setEvent(null); setEventLoading(false); setEventError('Event not found.'); return; }
    let cancelled = false;
    setEventLoading(true);
    setEventError('');
    getEvent(eventId).then((full) => { if (!cancelled) setEvent(full); }).catch((error) => { if (!cancelled) { setEvent(null); setEventError(error.message || 'Unable to load this event.'); } }).finally(() => { if (!cancelled) setEventLoading(false); });
    return () => { cancelled = true; };
  }, [eventId]);

  const [schedule, setSchedule] = useState([]);
  const [saving, setSaving] = useState(false);
  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const hydratedRef = useRef(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [pullingLibraryId, setPullingLibraryId] = useState(null);
  const [librarySearch, setLibrarySearch] = useState('');
  const [saveToLibraryOpen, setSaveToLibraryOpen] = useState(false);
  const [libraryName, setLibraryName] = useState('');
  const [savingToLibrary, setSavingToLibrary] = useState(false);

  useEffect(() => {
    if (!event || hydratedRef.current === event.id) return;
    hydratedRef.current = event.id;
    setSchedule(event.schedule || []);
  }, [event]);

  const dirty = JSON.stringify(canonicalize(schedule)) !== JSON.stringify(canonicalize(event?.schedule || []));
  // No in-app navigation blocker here — react-router's useBlocker requires a
  // data router (createBrowserRouter/RouterProvider), and this app renders a
  // plain <BrowserRouter> (App.jsx), so it throws at render time. The
  // beforeunload guard below still covers tab-close/refresh; in-app
  // navigation away from unsaved changes isn't intercepted.
  const filteredLibrary = runOfShowLibrary.filter((item) => matchesSearch(librarySearch, [
    item.name,
    item.description,
    ...(item.items || []).map((it) => it.name),
  ]));

  useEffect(() => {
    if (!dirty) return undefined;
    const warnBeforeUnload = (browserEvent) => {
      browserEvent.preventDefault();
      browserEvent.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  function addLine() {
    setSchedule((prev) => [...prev, emptyScheduleItem()]);
  }

  function updateLine(id, patch) {
    setSchedule((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function duplicateLine(id) {
    const index = schedule.findIndex((item) => item.id === id);
    if (index === -1) return;
    const copy = { ...schedule[index], id: uid('ros') };
    setSchedule((prev) => [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)]);
  }

  function removeLine(id) {
    setSchedule((prev) => prev.filter((item) => item.id !== id));
  }

  function moveLine(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= schedule.length) return;
    setSchedule((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleDrop(targetIndex) {
    const sourceIndex = dragIndex.current;
    dragIndex.current = null;
    setDragOverIndex(null);
    if (sourceIndex === null || sourceIndex === targetIndex) return;
    setSchedule((prev) => {
      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  // Deep-clones a saved library template into this event's own schedule —
  // fresh ids on every item, same "independent from this point on"
  // guarantee as Set List's pullFromLibrary (SetListsEditorPage.jsx).
  function pullFromLibrary(libraryItem) {
    setPullingLibraryId(libraryItem.id);
    const items = (libraryItem.items || []).map((it) => ({ ...it, id: uid('ros') }));
    setSchedule((prev) => [...prev, ...items]);
    setLibraryPickerOpen(false);
    setLibrarySearch('');
    setPullingLibraryId(null);
    showToast(`Added "${libraryItem.name}." Save changes to keep it on this event.`);
  }

  async function handleSaveToLibrary(e) {
    e.preventDefault();
    if (!libraryName.trim()) return;
    setSavingToLibrary(true);
    try {
      await addRunOfShowLibraryItem({ name: libraryName.trim(), items: schedule, eventIds: [eventId] });
      showToast(`Saved as "${libraryName.trim()}" in your Run of Show library`);
      setSaveToLibraryOpen(false);
      setLibraryName('');
    } catch (err) {
      showToast(err.message || 'Failed to save to library', 'error');
    } finally {
      setSavingToLibrary(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const savedEvent = await updateEventApi(eventId, { schedule, expectedUpdatedAt: event.updatedAt });
      setEvent(savedEvent);
      showToast('Run of show saved');
      return true;
    } catch (err) {
      showToast(err.message || 'Failed to save run of show', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleDone() {
    if (dirty && !window.confirm('You have unsaved run of show changes. Leave without saving?')) return;
    onClose?.();
  }

  if (eventLoading) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (!event) return <div className="mx-auto max-w-xl p-6 text-center"><p className="font-semibold text-slate-700">Run of Show could not be opened</p><p className="mt-1 text-sm text-slate-500">{eventError}</p><Link to="/events" className="mt-4 inline-block text-sm font-semibold text-indigo-600 hover:underline">Back to Events</Link></div>;

  return (
    <div className={isModal ? 'w-full' : 'p-6 max-w-[1100px] mx-auto'}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        {isModal ? (
          <div />
        ) : (
          <div>
            <Link to={`/events/${eventId}`} className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; Back to event</Link>
            <h1 className="text-lg font-bold text-slate-800">Run of Show{event.name ? ` — ${event.name}` : ''}</h1>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span data-testid="run-of-show-save-status" className="text-xs text-slate-400">{dirty ? 'Unsaved changes' : 'Saved'}</span>
          <button type="button" onClick={() => setShareModalOpen(true)} data-testid="run-of-show-share-button" className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold">
            Share
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            data-testid="run-of-show-save-button"
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {isModal && (
            <button
              type="button"
              onClick={handleDone}
              data-testid="run-of-show-modal-done-button"
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold"
            >
              Done
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button type="button" onClick={() => setLibraryPickerOpen(true)} data-testid="run-of-show-from-library-button" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          + Add from Library
        </button>
        <button type="button" onClick={() => setSaveToLibraryOpen(true)} disabled={schedule.length === 0} data-testid="run-of-show-save-to-library-button" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-40">
          Save to Library
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        {schedule.length === 0 ? (
          <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-8 text-center">
            <p className="font-semibold text-slate-600">No schedule lines yet</p>
            <p className="mt-1">Add a blank line or copy a reusable timeline from your library.</p>
            <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
              <button type="button" onClick={addLine} className="px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 font-semibold hover:bg-indigo-50">+ Add Line</button>
              <button type="button" onClick={() => setLibraryPickerOpen(true)} className="px-3 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700">+ Add from Library</button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {schedule.map((item, i) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => { dragIndex.current = i; }}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                onDrop={() => handleDrop(i)}
                data-testid="run-of-show-item-row"
                className={`flex flex-wrap items-center gap-2 border border-slate-200 rounded-lg px-2 py-1.5 ${dragOverIndex === i && dragIndex.current !== i ? 'border-indigo-400 bg-indigo-50/40' : ''}`}
              >
                <span className="cursor-grab text-slate-300 select-none shrink-0" aria-hidden="true">⠿</span>
                <select
                  value={item.type || 'other'}
                  onChange={(e) => updateLine(item.id, { type: e.target.value })}
                  data-testid="run-of-show-item-type-select"
                  className={`${inputClass} shrink-0`}
                >
                  {RUN_OF_SHOW_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
                <input
                  type="time"
                  value={item.time || ''}
                  onChange={(e) => updateLine(item.id, { time: e.target.value })}
                  data-testid="run-of-show-item-time-input"
                  className={`${inputClass} w-full sm:w-32 shrink-0`}
                />
                <input
                  placeholder="Name"
                  value={item.name || ''}
                  onChange={(e) => updateLine(item.id, { name: e.target.value })}
                  data-testid="run-of-show-item-name-input"
                  className={`${inputClass} flex-1 min-w-[8rem]`}
                />
                <input
                  placeholder="Details…"
                  value={item.details || ''}
                  onChange={(e) => updateLine(item.id, { details: e.target.value })}
                  data-testid="run-of-show-item-details-input"
                  className={`${inputClass} flex-[2] min-w-[10rem]`}
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => moveLine(i, -1)} disabled={i === 0} className="w-7 h-7 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20" aria-label={`Move line ${i + 1} up`}>↑</button>
                  <button type="button" onClick={() => moveLine(i, 1)} disabled={i === schedule.length - 1} className="w-7 h-7 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20" aria-label={`Move line ${i + 1} down`}>↓</button>
                  <button type="button" onClick={() => duplicateLine(item.id)} title="Duplicate" data-testid="run-of-show-item-duplicate-button" className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">⧉</button>
                  <button type="button" onClick={() => removeLine(item.id)} data-testid="run-of-show-item-remove-button" className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-600" aria-label={`Remove line ${i + 1}`}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button type="button" onClick={addLine} data-testid="run-of-show-add-line-button" className="mt-3 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          + Add Line
        </button>
      </div>

      <Modal open={libraryPickerOpen} onClose={() => setLibraryPickerOpen(false)} title="Add from Run of Show Library" widthClass="max-w-xl">
        <div className="text-sm text-slate-500 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-3">
          This creates an independent event copy. Changes here will not alter the library original, and later library edits will not change this event.
        </div>
        {runOfShowLibraryLoading ? (
          <div className="text-sm text-slate-400 text-center py-6">Loading your run of show library…</div>
        ) : runOfShowLibrary.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-6">
            No saved templates yet.
            <br />
            Add one under <Link to="/run-of-show-library" className="text-indigo-600 font-semibold hover:underline">Resources &gt; Run of Show</Link> to reuse it across gigs.
          </div>
        ) : (
          <div>
            <SearchInput value={librarySearch} onChange={setLibrarySearch} placeholder="Search templates or lines…" className="w-full mb-3" testId="run-of-show-library-picker-search-input" />
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {filteredLibrary.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No library templates match your search.</div>}
              {filteredLibrary.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pullFromLibrary(item)}
                  disabled={!!pullingLibraryId}
                  data-testid="run-of-show-library-picker-item"
                  className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 flex items-center justify-between disabled:opacity-50 disabled:cursor-wait"
                >
                  <span>
                    <span className="font-medium text-slate-700 block">{item.name}</span>
                    {item.description && <span className="text-xs text-slate-400">{item.description}</span>}
                  </span>
                  <span className="text-xs text-slate-400 shrink-0 ml-2">
                    {pullingLibraryId === item.id ? 'Adding…' : `${item.items?.length || 0} line${item.items?.length === 1 ? '' : 's'}`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={saveToLibraryOpen} onClose={() => setSaveToLibraryOpen(false)} title="Save to Run of Show Library" widthClass="max-w-sm">
        <form onSubmit={handleSaveToLibrary} className="space-y-3">
          <label className="block text-xs font-semibold text-slate-500">
            Template name
            <input
              required
              autoFocus
              value={libraryName}
              onChange={(e) => setLibraryName(e.target.value)}
              placeholder="e.g. Standard wedding reception timeline"
              data-testid="run-of-show-save-to-library-name-input"
              className={`${inputClass} mt-1 w-full`}
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setSaveToLibraryOpen(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={savingToLibrary} data-testid="run-of-show-save-to-library-submit-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {savingToLibrary ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      <RunOfShowShareModal open={shareModalOpen} onClose={() => setShareModalOpen(false)} eventId={eventId} />
    </div>
  );
}
