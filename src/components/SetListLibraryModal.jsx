import { useEffect, useRef, useState } from 'react';
import Modal from './ui/Modal';
import { useData } from '../context/DataContext';
import { uid } from '../lib/storage';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

function emptySong() {
  return { id: uid('song'), songTitle: '', description: '', link: '' };
}

// Add/edit modal for a reusable Set List Library entry — same song fields
// as an event's own set list items (SetListsEditorPage.jsx) minus sheet
// music, since a library entry isn't tied to any event and document
// uploads require one. Sheet music still gets attached once a set list is
// pulled into an actual gig.
export default function SetListLibraryModal({ open, onClose, setList, onSaved }) {
  const { addSetListLibraryItem, updateSetListLibraryItem } = useData();
  const [name, setName] = useState('');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  useEffect(() => {
    if (open) {
      setName(setList?.name || '');
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
    setItems((prev) => prev.filter((it) => it.id !== id));
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
    const payload = { name: name.trim(), items: items.filter((it) => it.songTitle.trim()) };
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
    </Modal>
  );
}
