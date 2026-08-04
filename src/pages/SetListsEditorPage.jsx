import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../components/ui/Toast';
import { uid } from '../lib/storage';
import { uploadDocument, deleteDocument, documentDownloadUrl } from '../lib/documents';
import { generateSetListPdf } from '../lib/setListPdf';
import DocumentPreviewModal from '../components/DocumentPreviewModal';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

function emptySetList(name) {
  return { id: uid('setlist'), name, items: [] };
}

function emptySetListItem() {
  return { id: uid('song'), songTitle: '', description: '', link: '', documentId: null, documentName: null, documentContentType: null };
}

// Event.setLists lives in the same low-write-frequency JSON-blob convention
// as Requests/Shot List (see EventFormPage.jsx) — typing song titles and
// reordering a few dozen items is nowhere near the write volume that forced
// Stage Plot/Floor Plan onto real Prisma tables. Persistence is explicit
// (Save Changes), not autosaved-per-keystroke, matching how the rest of the
// Event object already works — updateEvent() rewrites the whole account
// blob on every call, so firing it on every keystroke would be wasteful and
// would spam the event's history log with an entry per keystroke.
export default function SetListsEditorPage() {
  const { eventId } = useParams();
  const { currentUser } = useAuth();
  const { events, updateEvent } = useData();
  const { showToast } = useToast();
  const event = events.find((e) => e.id === eventId);

  const [setLists, setSetLists] = useState([]);
  const [activeSetListId, setActiveSetListId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingItemId, setUploadingItemId] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const hydratedRef = useRef(null);

  useEffect(() => {
    if (!event || hydratedRef.current === event.id) return;
    hydratedRef.current = event.id;
    const lists = event.setLists || [];
    setSetLists(lists);
    setActiveSetListId(lists[0]?.id || null);
  }, [event]);

  const dirty = JSON.stringify(setLists) !== JSON.stringify(event?.setLists || []);
  const activeSetList = setLists.find((s) => s.id === activeSetListId);

  function addSetList() {
    const list = emptySetList(`Set List ${setLists.length + 1}`);
    setSetLists((prev) => [...prev, list]);
    setActiveSetListId(list.id);
  }

  function renameSetList(id, name) {
    setSetLists((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }

  function deleteSetList(id) {
    setSetLists((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeSetListId === id) setActiveSetListId(next[0]?.id || null);
      return next;
    });
  }

  function updateActiveItems(updater) {
    setSetLists((prev) => prev.map((s) => (s.id === activeSetListId ? { ...s, items: updater(s.items) } : s)));
  }

  function addItem() {
    updateActiveItems((items) => [...items, emptySetListItem()]);
  }

  function updateItem(id, patch) {
    updateActiveItems((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id) {
    const item = activeSetList?.items.find((it) => it.id === id);
    updateActiveItems((items) => items.filter((it) => it.id !== id));
    if (item?.documentId) deleteDocument(item.documentId).catch(() => {});
  }

  function handleDrop(targetIndex) {
    const sourceIndex = dragIndex.current;
    dragIndex.current = null;
    setDragOverIndex(null);
    if (sourceIndex === null || sourceIndex === targetIndex) return;
    updateActiveItems((items) => {
      const next = [...items];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  async function handleUploadSheetMusic(itemId, file) {
    if (!file) return;
    setUploadingItemId(itemId);
    try {
      const item = activeSetList.items.find((it) => it.id === itemId);
      if (item?.documentId) await deleteDocument(item.documentId).catch(() => {});
      const doc = await uploadDocument(eventId, file);
      updateItem(itemId, { documentId: doc.id, documentName: doc.filename, documentContentType: doc.contentType });
    } catch (err) {
      showToast(err.message || 'Failed to upload sheet music', 'error');
    } finally {
      setUploadingItemId(null);
    }
  }

  function handleRemoveSheetMusic(itemId) {
    const item = activeSetList.items.find((it) => it.id === itemId);
    updateItem(itemId, { documentId: null, documentName: null, documentContentType: null });
    if (item?.documentId) deleteDocument(item.documentId).catch(() => {});
  }

  async function handleSave() {
    setSaving(true);
    try {
      // updateEvent updates currentUser.events synchronously/optimistically
      // (the network PUT happens in the background) — `dirty` re-derives
      // from that on the next render, no manual re-sync needed here.
      updateEvent(eventId, { setLists });
      showToast('Set lists saved');
    } finally {
      setSaving(false);
    }
  }

  async function handleExportPdf() {
    await generateSetListPdf({ eventName: event?.name, setLists, businessInfo: currentUser?.businessInfo });
  }

  if (!event) return <div className="p-6 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link to={`/events/${eventId}`} className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; Back to event</Link>
          <h1 className="text-lg font-bold text-slate-800">Set Lists{event.name ? ` — ${event.name}` : ''}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span data-testid="setlist-save-status" className="text-xs text-slate-400">{dirty ? 'Unsaved changes' : 'Saved'}</span>
          <button type="button" onClick={handleExportPdf} data-testid="setlist-export-pdf-button" className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold">
            Download PDF
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            data-testid="setlist-save-button"
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-slate-200 flex-wrap">
        {setLists.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveSetListId(s.id)}
            data-testid="setlist-tab"
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${
              s.id === activeSetListId ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {s.name}
          </button>
        ))}
        <button type="button" onClick={addSetList} data-testid="setlist-add-button" className="px-3 py-2 text-sm text-indigo-600 font-semibold">
          + Add Set List
        </button>
      </div>

      {!activeSetList ? (
        <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-8 text-center">
          No set lists yet — click "+ Add Set List" to start one.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <input
              value={activeSetList.name}
              onChange={(e) => renameSetList(activeSetList.id, e.target.value)}
              data-testid="setlist-name-input"
              className={`${inputClass} max-w-xs font-semibold`}
            />
            {setLists.length > 1 && (
              <button type="button" onClick={() => deleteSetList(activeSetList.id)} data-testid="setlist-delete-button" className="text-xs font-semibold text-red-500">
                Delete Set List
              </button>
            )}
          </div>

          {activeSetList.items.length === 0 ? (
            <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-6 text-center">
              No songs added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {activeSetList.items.map((item, i) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => { dragIndex.current = i; }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                  onDrop={() => handleDrop(i)}
                  data-testid="setlist-item-row"
                  className={`border border-slate-200 rounded-lg p-3 space-y-2 ${dragOverIndex === i && dragIndex.current !== i ? 'border-indigo-400 bg-indigo-50/40' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="cursor-grab text-slate-300 select-none mt-2" aria-hidden="true">⠿</span>
                    <span className="text-slate-400 text-sm mt-2 w-5 shrink-0">{i + 1}.</span>
                    <div className="flex-1 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          placeholder="Song title"
                          value={item.songTitle}
                          onChange={(e) => updateItem(item.id, { songTitle: e.target.value })}
                          data-testid="setlist-item-title-input"
                          className={inputClass}
                        />
                        <input
                          placeholder="Link (Spotify, YouTube, etc.)"
                          value={item.link}
                          onChange={(e) => updateItem(item.id, { link: e.target.value })}
                          data-testid="setlist-item-link-input"
                          className={inputClass}
                        />
                      </div>
                      <textarea
                        rows={2}
                        placeholder="Description / notes (key, tempo, arrangement notes…)"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, { description: e.target.value })}
                        data-testid="setlist-item-description-textarea"
                        className={inputClass}
                      />
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        {item.documentId ? (
                          <div className="flex items-center gap-3 text-xs">
                            <button
                              type="button"
                              onClick={() => setPreviewDocument({ id: item.documentId, filename: item.documentName, contentType: item.documentContentType })}
                              data-testid="setlist-item-preview-button"
                              className="text-indigo-600 font-semibold hover:underline"
                            >
                              Preview {item.documentName}
                            </button>
                            <a href={documentDownloadUrl(item.documentId)} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-600">
                              Download
                            </a>
                            <button type="button" onClick={() => handleRemoveSheetMusic(item.id)} data-testid="setlist-item-remove-sheet-button" className="text-slate-400 hover:text-red-600">
                              Remove
                            </button>
                          </div>
                        ) : (
                          <label className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer">
                            {uploadingItemId === item.id ? 'Uploading…' : '+ Upload sheet music'}
                            <input
                              type="file"
                              accept="application/pdf,image/*"
                              onChange={(e) => handleUploadSheetMusic(item.id, e.target.files?.[0])}
                              disabled={uploadingItemId === item.id}
                              data-testid="setlist-item-upload-input"
                              className="hidden"
                            />
                          </label>
                        )}
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          data-testid="setlist-item-remove-button"
                          className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                          aria-label="Remove song"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button type="button" onClick={addItem} data-testid="setlist-add-item-button" className="mt-3 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
            + Add Song
          </button>
        </div>
      )}

      <DocumentPreviewModal document={previewDocument} onClose={() => setPreviewDocument(null)} />
    </div>
  );
}
