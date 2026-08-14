import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../components/ui/Toast';
import { uid } from '../lib/storage';
import { normalizeUrl, formatEventDate } from '../lib/format';
import { uploadDocument, deleteDocument, copyDocument } from '../lib/documents';
import { getEvent } from '../lib/events';
import { generateSetListPdf } from '../lib/setListPdf';
import { renderSetListEmail, sendSetListEmail } from '../lib/setList';
import DocumentPreviewModal from '../components/DocumentPreviewModal';
import SetListEmailModal from '../components/SetListEmailModal';
import Modal from '../components/ui/Modal';
import Tooltip from '../components/ui/Tooltip';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

function emptySetList(name) {
  return { id: uid('setlist'), name, items: [] };
}

function emptySetListItem() {
  return { id: uid('song'), songTitle: '', description: '', link: '', documentId: null, documentName: null, documentContentType: null, documentShareToken: null };
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
  const { events, updateEvent, contractors, setListLibrary } = useData();
  const { showToast } = useToast();
  // events (from context) is the list-lite shape — setLists is edit-only
  // content excluded from it (see server/src/routes/events.js), so this
  // page fetches its own full record, same pattern as EventFormPage.jsx.
  const eventLite = events.find((e) => e.id === eventId);
  const [event, setEvent] = useState(null);

  useEffect(() => {
    if (!eventLite) { setEvent(null); return; }
    let cancelled = false;
    getEvent(eventLite.id).then((full) => { if (!cancelled) setEvent(full); }).catch(() => { if (!cancelled) setEvent(null); });
    return () => { cancelled = true; };
  }, [eventLite?.id]);

  const [setLists, setSetLists] = useState([]);
  const [activeSetListId, setActiveSetListId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingItemId, setUploadingItemId] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const hydratedRef = useRef(null);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [pullingLibraryId, setPullingLibraryId] = useState(null);

  useEffect(() => {
    if (!event || hydratedRef.current === event.id) return;
    hydratedRef.current = event.id;
    const lists = event.setLists || [];
    setSetLists(lists);
    setActiveSetListId(lists[0]?.id || null);
  }, [event]);

  const dirty = JSON.stringify(setLists) !== JSON.stringify(event?.setLists || []);
  const activeSetList = setLists.find((s) => s.id === activeSetListId);

  // Whoever's booked on this event, not just prep-group members (unlike
  // PrepEmailModal's recipient pool) — a set list is relevant to whoever's
  // playing, regardless of which prep groups they were added under.
  const allBooked = (event?.contractorBookings || [])
    .map((b) => contractors.find((c) => c.id === b.contractorId))
    .filter(Boolean);
  const bandMembers = allBooked.filter((c) => c?.email);
  const excludedCount = allBooked.length - bandMembers.length;
  const hasSongs = !!activeSetList?.items?.some((it) => it.songTitle?.trim());

  function addSetList() {
    const list = emptySetList(`Set List ${setLists.length + 1}`);
    setSetLists((prev) => [...prev, list]);
    setActiveSetListId(list.id);
  }

  // Deep-clones a saved library set list into this event's own setLists —
  // fresh ids on the list AND every item, so editing this gig's copy never
  // touches the reusable original in Resources > Set Lists. See
  // src/context/DataContext.jsx's addSetListLibraryItem for where that
  // original lives. A song's PDF (if any) is server-side COPIED, not
  // referenced — copyDocument duplicates the storage bytes and creates a
  // brand-new document row, so deleting this gig's attachment (or the
  // library original) never affects the other.
  async function pullFromLibrary(libraryEntry) {
    setPullingLibraryId(libraryEntry.id);
    try {
      const items = await Promise.all(libraryEntry.items.map(async (it) => {
        let doc = { documentId: null, documentName: null, documentContentType: null, documentShareToken: null };
        if (it.documentId) {
          try {
            const copied = await copyDocument(it.documentId, eventId);
            doc = { documentId: copied.id, documentName: copied.filename, documentContentType: copied.contentType, documentShareToken: copied.shareToken };
          } catch {
            // Copy failed (e.g. a pre-storage-migration document with no
            // storageKey) — pull the song in without its attachment rather
            // than blocking the whole set list.
          }
        }
        return { id: uid('song'), songTitle: it.songTitle, description: it.description, link: it.link, ...doc };
      }));
      const list = { id: uid('setlist'), name: libraryEntry.name, items };
      setSetLists((prev) => [...prev, list]);
      setActiveSetListId(list.id);
      setLibraryPickerOpen(false);
    } catch (err) {
      showToast(err.message || 'Failed to pull set list from library', 'error');
    } finally {
      setPullingLibraryId(null);
    }
  }

  function renameSetList(id, name) {
    setSetLists((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }

  function deleteSetList(id) {
    const removed = setLists.find((s) => s.id === id);
    setSetLists((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeSetListId === id) setActiveSetListId(next[0]?.id || null);
      return next;
    });
    // Deleting individual songs already cleans up their attachment (see
    // removeItem below) — deleting the whole list at once needs the same
    // cleanup, or every song's PDF/image would silently orphan in storage.
    removed?.items.forEach((item) => {
      if (item.documentId) deleteDocument(item.documentId).catch(() => {});
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
      updateItem(itemId, { documentId: doc.id, documentName: doc.filename, documentContentType: doc.contentType, documentShareToken: doc.shareToken });
    } catch (err) {
      showToast(err.message || 'Failed to upload sheet music', 'error');
    } finally {
      setUploadingItemId(null);
    }
  }

  function handleRemoveSheetMusic(itemId) {
    const item = activeSetList.items.find((it) => it.id === itemId);
    updateItem(itemId, { documentId: null, documentName: null, documentContentType: null, documentShareToken: null });
    if (item?.documentId) deleteDocument(item.documentId).catch(() => {});
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateEvent(eventId, { setLists });
      // `event` here is this page's own full-detail fetch (see the effect
      // above), not the live context array — it won't pick up the save on
      // its own, so `dirty` (which compares against event.setLists) would
      // otherwise stay true forever after a successful save.
      setEvent((prev) => (prev ? { ...prev, setLists } : prev));
      showToast('Set lists saved');
    } catch (err) {
      showToast(err.message || 'Failed to save set lists', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleExportPdf() {
    await generateSetListPdf({ eventName: event?.name, eventDate: event?.eventDate, setLists, businessInfo: currentUser?.businessInfo });
  }

  async function handleSendEmail({ subject, body, recipientIds }) {
    setSendingEmail(true);
    try {
      const fromName = currentUser.businessInfo?.name || `${currentUser.firstName} ${currentUser.lastName}`;
      // Scoped to just the active set list, not the whole book — same
      // reasoning as why Email is a per-set-list action while Download PDF
      // exports every set list at once.
      const { successCount, total } = await sendSetListEmail({
        eventId, eventName: event?.name, eventDate: event?.eventDate, setList: activeSetList,
        recipientIds, contractors, subject, body, fromName, businessInfo: currentUser?.businessInfo,
      });
      if (successCount === total) {
        showToast(`Sent to ${successCount} band member${successCount === 1 ? '' : 's'}`);
      } else {
        showToast(`Sent ${successCount} of ${total} emails — some failed`, 'error');
      }
      // Persists whatever's currently in the form (same content the email
      // was just built from), plus a "last sent" marker on this one set
      // list — so a send never leaves the page claiming "Unsaved changes"
      // for content that's already gone out, and the next visit can show
      // when this was last emailed.
      const updatedLists = setLists.map((s) => (
        s.id === activeSetList.id ? { ...s, lastSentAt: new Date().toISOString(), lastSentCount: successCount } : s
      ));
      setSetLists(updatedLists);
      await updateEvent(eventId, { setLists: updatedLists });
      setEvent((prev) => (prev ? { ...prev, setLists: updatedLists } : prev));
      setEmailModalOpen(false);
    } catch (err) {
      showToast(err.message || 'Failed to send set list email', 'error');
    } finally {
      setSendingEmail(false);
    }
  }

  if (!event) return <div className="p-6 text-sm text-slate-500">Loading…</div>;

  const emailDraft = activeSetList ? renderSetListEmail(event.name, event.eventDate, activeSetList, currentUser?.businessInfo) : null;
  // Download PDF exports every set list in the book at once (unlike Email,
  // scoped to just the active one) — gated on any of them having a song,
  // not just the active tab.
  const anySongsAnywhere = setLists.some((s) => s.items.some((it) => it.songTitle?.trim()));
  const pdfDisabledReason = !anySongsAnywhere ? 'Add at least one song before exporting a PDF' : null;
  const emailDisabledReason = !activeSetList ? null : !hasSongs ? 'Add at least one song before emailing this set list' : null;

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link to={`/events/${eventId}`} className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; Back to event</Link>
          <h1 className="text-lg font-bold text-slate-800">Set Lists{event.name ? ` — ${event.name}` : ''}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span data-testid="setlist-save-status" className="text-xs text-slate-400">{dirty ? 'Unsaved changes' : 'Saved'}</span>
          {pdfDisabledReason ? (
            <Tooltip content={pdfDisabledReason}>
              <span className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-300 cursor-default">
                Download PDF
              </span>
            </Tooltip>
          ) : (
            <button type="button" onClick={handleExportPdf} data-testid="setlist-export-pdf-button" className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold">
              Download PDF
            </button>
          )}
          {emailDisabledReason ? (
            <Tooltip content={emailDisabledReason}>
              <span className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-300 cursor-default">
                Email Set List
              </span>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={() => setEmailModalOpen(true)}
              disabled={!activeSetList}
              data-testid="setlist-email-button"
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold disabled:opacity-50"
            >
              Email Set List
            </button>
          )}
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
      {activeSetList?.lastSentAt && (
        <p data-testid="setlist-last-sent" className="text-xs text-slate-400 -mt-2 mb-4 text-right">
          Last sent {formatEventDate(activeSetList.lastSentAt.slice(0, 10))} to {activeSetList.lastSentCount} band member{activeSetList.lastSentCount === 1 ? '' : 's'}
        </p>
      )}

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
        <button type="button" onClick={() => setLibraryPickerOpen(true)} data-testid="setlist-from-library-button" className="px-3 py-2 text-sm text-indigo-600 font-semibold">
          + From Library
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
            <div className="space-y-1.5">
              {activeSetList.items.map((item, i) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => { dragIndex.current = i; }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                  onDrop={() => handleDrop(i)}
                  data-testid="setlist-item-row"
                  className={`flex items-center gap-2 border border-slate-200 rounded-lg px-2 py-1.5 ${dragOverIndex === i && dragIndex.current !== i ? 'border-indigo-400 bg-indigo-50/40' : ''}`}
                >
                  <span className="cursor-grab text-slate-300 select-none shrink-0" aria-hidden="true">⠿</span>
                  <span className="text-slate-400 text-sm w-5 shrink-0 text-right">{i + 1}.</span>
                  <input
                    placeholder="Song title"
                    value={item.songTitle}
                    onChange={(e) => updateItem(item.id, { songTitle: e.target.value })}
                    data-testid="setlist-item-title-input"
                    className={`${inputClass} flex-[2] min-w-0`}
                  />
                  <input
                    placeholder="Description / notes"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, { description: e.target.value })}
                    data-testid="setlist-item-description-input"
                    className={`${inputClass} flex-[2] min-w-0`}
                  />
                  <input
                    placeholder="Link"
                    value={item.link}
                    onChange={(e) => updateItem(item.id, { link: e.target.value })}
                    onBlur={(e) => updateItem(item.id, { link: normalizeUrl(e.target.value) })}
                    data-testid="setlist-item-link-input"
                    className={`${inputClass} flex-1 min-w-0`}
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    {item.documentId ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setPreviewDocument({ id: item.documentId, filename: item.documentName, contentType: item.documentContentType })}
                          title={`Preview ${item.documentName}`}
                          data-testid="setlist-item-preview-button"
                          className="w-7 h-7 flex items-center justify-center rounded text-indigo-600 hover:bg-indigo-50"
                        >
                          📄
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveSheetMusic(item.id)}
                          title="Remove sheet music"
                          data-testid="setlist-item-remove-sheet-button"
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-red-600 text-xs"
                          aria-label="Remove sheet music"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <label title="Upload sheet music" className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer">
                        {uploadingItemId === item.id ? '…' : '📎'}
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
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    data-testid="setlist-item-remove-button"
                    className="w-6 h-6 shrink-0 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                    aria-label="Remove song"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <button type="button" onClick={addItem} data-testid="setlist-add-item-button" className="mt-3 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
            + Add Song
          </button>
        </div>
      )}

      <Modal open={libraryPickerOpen} onClose={() => setLibraryPickerOpen(false)} title="Pull From Library">
        {setListLibrary.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-6">
            No saved set lists yet.
            <br />
            Add one under <Link to="/set-lists" className="text-indigo-600 font-semibold hover:underline">Resources &gt; Set Lists</Link> to reuse it across gigs.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {setListLibrary.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pullFromLibrary(s)}
                disabled={!!pullingLibraryId}
                data-testid="setlist-library-picker-item"
                className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 flex items-center justify-between disabled:opacity-50 disabled:cursor-wait"
              >
                <span>
                  <span className="font-medium text-slate-700 block">{s.name}</span>
                  {s.description && <span className="text-xs text-slate-400">{s.description}</span>}
                </span>
                <span className="text-xs text-slate-400 shrink-0 ml-2">
                  {pullingLibraryId === s.id ? 'Pulling…' : `${s.items?.length || 0} song${s.items?.length === 1 ? '' : 's'}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      <DocumentPreviewModal document={previewDocument} onClose={() => setPreviewDocument(null)} />

      <SetListEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        bandMembers={bandMembers}
        excludedCount={excludedCount}
        initialSubject={emailDraft?.subject}
        initialBody={emailDraft?.body}
        sending={sendingEmail}
        onConfirm={handleSendEmail}
      />
    </div>
  );
}
