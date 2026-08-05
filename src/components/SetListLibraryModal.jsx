import { useEffect, useRef, useState } from 'react';
import Modal from './ui/Modal';
import DocumentPreviewModal from './DocumentPreviewModal';
import { useData } from '../context/DataContext';
import { useToast } from './ui/Toast';
import { uid } from '../lib/storage';
import { uploadDocument, deleteDocument } from '../lib/documents';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

function emptySong() {
  return { id: uid('song'), songTitle: '', description: '', link: '', documentId: null, documentName: null, documentContentType: null };
}

// Add/edit modal for a reusable Set List Library entry — same song fields
// as an event's own set list items (SetListsEditorPage.jsx), including
// sheet music: uploadDocument/documents.js now accepts an omitted eventId
// for account-level attachments not tied to any event (see
// server/prisma/schema.prisma's EventDocument.eventId). When a set list is
// later pulled into a real gig, its songs' PDFs are server-side COPIED
// (copyDocument), not referenced — see SetListsEditorPage.jsx's
// pullFromLibrary — so deleting the gig's copy or the library original
// never affects the other.
export default function SetListLibraryModal({ open, onClose, setList, onSaved }) {
  const { addSetListLibraryItem, updateSetListLibraryItem } = useData();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [uploadingItemId, setUploadingItemId] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  useEffect(() => {
    if (open) {
      setName(setList?.name || '');
      setDescription(setList?.description || '');
      setItems(setList?.items?.length ? setList.items : [emptySong()]);
      setError('');
    }
  }, [open, setList]);

  function updateItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptySong()]);
  }

  function removeItem(id) {
    const item = items.find((it) => it.id === id);
    setItems((prev) => prev.filter((it) => it.id !== id));
    if (item?.documentId) deleteDocument(item.documentId).catch(() => {});
  }

  async function handleUploadPdf(itemId, file) {
    if (!file) return;
    setUploadingItemId(itemId);
    try {
      const item = items.find((it) => it.id === itemId);
      if (item?.documentId) await deleteDocument(item.documentId).catch(() => {});
      const doc = await uploadDocument(null, file);
      updateItem(itemId, { documentId: doc.id, documentName: doc.filename, documentContentType: doc.contentType });
    } catch (err) {
      showToast(err.message || 'Failed to upload PDF', 'error');
    } finally {
      setUploadingItemId(null);
    }
  }

  function handleRemovePdf(itemId) {
    const item = items.find((it) => it.id === itemId);
    updateItem(itemId, { documentId: null, documentName: null, documentContentType: null });
    if (item?.documentId) deleteDocument(item.documentId).catch(() => {});
  }

  function handleDrop(targetIndex) {
    const sourceIndex = dragIndex.current;
    dragIndex.current = null;
    setDragOverIndex(null);
    if (sourceIndex === null || sourceIndex === targetIndex) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Set list name is required.');
      return;
    }
    const payload = { name: name.trim(), description: description.trim(), items: items.filter((it) => it.songTitle.trim()) };
    const record = setList ? { ...setList, ...payload } : addSetListLibraryItem(payload);
    if (setList) updateSetListLibraryItem(setList.id, payload);
    onSaved?.(record);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={setList ? 'Edit Set List' : 'Add Set List'} widthClass="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div data-testid="setlist-library-modal-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div>
          <label className={labelClass}>Set List Name *</label>
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} data-testid="setlist-library-modal-name-input" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea
            rows={2}
            placeholder="e.g. Cocktail hour jazz standards, low volume, ~45 min"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-testid="setlist-library-modal-description-textarea"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Songs</label>
          <div className="space-y-1.5">
            {items.map((item, i) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => { dragIndex.current = i; }}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                onDrop={() => handleDrop(i)}
                data-testid="setlist-library-modal-item-row"
                className={`flex items-center gap-2 border border-slate-200 rounded-lg px-2 py-1.5 ${dragOverIndex === i && dragIndex.current !== i ? 'border-indigo-400 bg-indigo-50/40' : ''}`}
              >
                <span className="cursor-grab text-slate-300 select-none shrink-0" aria-hidden="true">⠿</span>
                <span className="text-slate-400 text-sm w-5 shrink-0 text-right">{i + 1}.</span>
                <input
                  placeholder="Song title"
                  value={item.songTitle}
                  onChange={(e) => updateItem(item.id, { songTitle: e.target.value })}
                  data-testid="setlist-library-modal-item-title-input"
                  className={`${inputClass} flex-[2] min-w-0`}
                />
                <input
                  placeholder="Description / notes"
                  value={item.description}
                  onChange={(e) => updateItem(item.id, { description: e.target.value })}
                  data-testid="setlist-library-modal-item-description-input"
                  className={`${inputClass} flex-[2] min-w-0`}
                />
                <input
                  placeholder="Link"
                  value={item.link}
                  onChange={(e) => updateItem(item.id, { link: e.target.value })}
                  data-testid="setlist-library-modal-item-link-input"
                  className={`${inputClass} flex-1 min-w-0`}
                />
                <div className="flex items-center gap-1 shrink-0">
                  {item.documentId ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setPreviewDocument({ id: item.documentId, filename: item.documentName, contentType: item.documentContentType })}
                        title={`Preview ${item.documentName}`}
                        data-testid="setlist-library-modal-item-preview-button"
                        className="w-7 h-7 flex items-center justify-center rounded text-indigo-600 hover:bg-indigo-50"
                      >
                        📄
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePdf(item.id)}
                        title="Remove PDF"
                        data-testid="setlist-library-modal-item-remove-pdf-button"
                        className="w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-red-600 text-xs"
                        aria-label="Remove PDF"
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <label title="Attach PDF" className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer">
                      {uploadingItemId === item.id ? '…' : '📎'}
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        onChange={(e) => handleUploadPdf(item.id, e.target.files?.[0])}
                        disabled={uploadingItemId === item.id}
                        data-testid="setlist-library-modal-item-upload-input"
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  data-testid="setlist-library-modal-item-remove-button"
                  className="w-6 h-6 shrink-0 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                  aria-label="Remove song"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addItem} data-testid="setlist-library-modal-add-item-button" className="mt-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
            + Add Song
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} data-testid="setlist-library-modal-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" data-testid="setlist-library-modal-save-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
            {setList ? 'Save Changes' : 'Add Set List'}
          </button>
        </div>
      </form>

      <DocumentPreviewModal document={previewDocument} onClose={() => setPreviewDocument(null)} />
    </Modal>
  );
}
