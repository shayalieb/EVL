import { useEffect, useRef, useState } from 'react';
import Modal from './ui/Modal';
import EventCombobox from './EventCombobox';
import { useData } from '../context/DataContext';
import { uid } from '../lib/storage';
import { RUN_OF_SHOW_TYPES } from '../lib/runOfShow';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

function emptyLine() {
  return { id: uid('ros'), type: 'other', time: '', name: '', details: '' };
}

// Add/edit modal for a reusable Run of Show Library entry — same fields as
// an event's own schedule items (RunOfShowEditorPage.jsx). No document
// attachments here (unlike Set List Library), since a run-of-show line has
// nothing to attach.
export default function RunOfShowLibraryModal({ open, onClose, runOfShow, onSaved }) {
  const { addRunOfShowLibraryItem, updateRunOfShowLibraryItem, events, loadEvent } = useData();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState([]);
  const [eventIds, setEventIds] = useState([]);
  const [error, setError] = useState('');
  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(runOfShow?.name || '');
      setDescription(runOfShow?.description || '');
      setItems(runOfShow?.items?.length ? runOfShow.items : [emptyLine()]);
      const linkedIds = runOfShow?.eventIds || [];
      setEventIds(linkedIds);
      Promise.allSettled(linkedIds.map(loadEvent));
      setError('');
      setSaving(false);
    }
  }, [open, runOfShow, loadEvent]);

  const selectedEvents = eventIds.map((id) => events.find((e) => e.id === id)).filter(Boolean);

  function addEvent(event) {
    setEventIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]));
  }

  function removeEvent(eventId) {
    setEventIds((prev) => prev.filter((id) => id !== eventId));
  }

  function updateItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyLine()]);
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function moveItem(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((prev) => {
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
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Template name is required.');
      return;
    }
    const keptItems = items.filter((it) => it.name.trim());
    const payload = { name: name.trim(), description: description.trim(), items: keptItems, eventIds, ...(runOfShow?.updatedAt ? { expectedUpdatedAt: runOfShow.updatedAt } : {}) };
    setSaving(true);
    setError('');
    try {
      const record = runOfShow ? await updateRunOfShowLibraryItem(runOfShow.id, payload) : await addRunOfShowLibraryItem(payload);
      onSaved?.(record);
      onClose();
    } catch (err) {
      setError(err.message || 'Unable to save this template.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} title={runOfShow ? 'Edit Run of Show Template' : 'Add Run of Show Template'} widthClass="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div data-testid="run-of-show-library-modal-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div>
          <label className={labelClass}>Template Name *</label>
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} data-testid="run-of-show-library-modal-name-input" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea
            rows={2}
            placeholder="e.g. Standard wedding reception timeline"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-testid="run-of-show-library-modal-description-textarea"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Linked Events</label>
          <EventCombobox
            events={events}
            selectedEvents={selectedEvents}
            onAdd={addEvent}
            onRemove={removeEvent}
            testId="run-of-show-library-modal-event-picker"
          />
          <p className="text-xs text-slate-400 mt-1">
            Optional. This does not add the template to the event; use “Add from Library” inside the event's Run of Show editor to create its working copy.
          </p>
        </div>

        <div>
          <label className={labelClass}>Schedule Lines</label>
          <div className="space-y-1.5">
            {items.map((item, i) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => { dragIndex.current = i; }}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                onDrop={() => handleDrop(i)}
                data-testid="run-of-show-library-modal-item-row"
                className={`flex flex-wrap items-center gap-2 border border-slate-200 rounded-lg p-2 ${dragOverIndex === i && dragIndex.current !== i ? 'border-indigo-400 bg-indigo-50/40' : ''}`}
              >
                <span className="cursor-grab text-slate-300 select-none shrink-0" aria-hidden="true">⠿</span>
                <select
                  aria-label={`Line ${i + 1} type`}
                  value={item.type || 'other'}
                  onChange={(e) => updateItem(item.id, { type: e.target.value })}
                  data-testid="run-of-show-library-modal-item-type-select"
                  className={`${inputClass} max-w-[10rem] shrink-0`}
                >
                  {RUN_OF_SHOW_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
                <input
                  aria-label={`Line ${i + 1} time`}
                  type="time"
                  value={item.time || ''}
                  onChange={(e) => updateItem(item.id, { time: e.target.value })}
                  data-testid="run-of-show-library-modal-item-time-input"
                  className={`${inputClass} max-w-[7rem] shrink-0`}
                />
                <input
                  aria-label={`Line ${i + 1} name`}
                  placeholder="Name"
                  value={item.name || ''}
                  onChange={(e) => updateItem(item.id, { name: e.target.value })}
                  data-testid="run-of-show-library-modal-item-name-input"
                  className={`${inputClass} flex-1 min-w-[8rem]`}
                />
                <input
                  aria-label={`Line ${i + 1} details`}
                  placeholder="Details…"
                  value={item.details || ''}
                  onChange={(e) => updateItem(item.id, { details: e.target.value })}
                  data-testid="run-of-show-library-modal-item-details-input"
                  className={`${inputClass} flex-[2] min-w-[10rem]`}
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => moveItem(i, -1)} disabled={i === 0} className="w-7 h-7 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20" aria-label={`Move line ${i + 1} up`}>↑</button>
                  <button type="button" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1} className="w-7 h-7 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20" aria-label={`Move line ${i + 1} down`}>↓</button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    data-testid="run-of-show-library-modal-item-remove-button"
                    className="w-7 h-7 shrink-0 flex items-center justify-center rounded text-slate-300 hover:text-red-600 hover:bg-red-50"
                    aria-label={`Remove line ${i + 1}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addItem} data-testid="run-of-show-library-modal-add-item-button" className="mt-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
            + Add Line
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={saving} data-testid="run-of-show-library-modal-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving} data-testid="run-of-show-library-modal-save-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving…' : runOfShow ? 'Save Changes' : 'Add Template'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
