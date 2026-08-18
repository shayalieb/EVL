import { useEffect, useRef, useState } from 'react';
import RichTextToolbar from './ui/RichTextToolbar';
import { addStagePlotBacklineItem, updateStagePlotBacklineItem, deleteStagePlotBacklineItem } from '../lib/stagePlots';

const PROVIDED_BY_OPTIONS = ['', 'band', 'venue', 'rental'];
const PROVIDED_BY_LABELS = { band: 'Band', venue: 'Venue', rental: 'Rental' };
const cellInputClass = 'w-full px-1.5 py-1 rounded border border-transparent hover:border-slate-200 focus:border-indigo-400 text-xs bg-transparent';

function plainTextPreview(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// The rich-text popup itself — contentEditable isn't a controlled input, so
// its content has to be set imperatively when it opens, same pattern as
// CanvasStage.jsx's icon-notes popup and PrepEmailModal.jsx's body editor.
// Only one of these is ever open at a time (the list tracks a single
// openItemId), so there's no need for each row to carry its own editor ref.
function BacklineNotesPopover({ initialHtml, onCommit, onClose }) {
  const editorRef = useRef(null);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialHtml || '';
    const raf = requestAnimationFrame(() => editorRef.current?.focus());
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RichTextToolbar requires onFormat but this popover has no live preview
  // to refresh — commitAndClose reads editorRef directly when it matters.
  function handleInput() {}

  function commitAndClose() {
    onCommit(editorRef.current?.innerHTML || '');
    onClose();
  }

  return (
    <div
      className="absolute z-20 right-0 mt-1 bg-white rounded-lg border border-slate-300 shadow-lg p-3 w-72"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) commitAndClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') commitAndClose(); }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-slate-500">Notes</span>
        <button type="button" onClick={commitAndClose} data-testid="backline-notes-popover-done-button" className="text-xs font-semibold text-indigo-600">Done</button>
      </div>
      <RichTextToolbar editorRef={editorRef} onFormat={handleInput} />
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-testid="backline-notes-popover-editor"
        className="w-full min-h-[70px] max-h-40 overflow-y-auto px-2 py-1.5 rounded border border-slate-300 text-sm outline-none focus:border-indigo-400"
      />
    </div>
  );
}

// Equipment the venue/production needs on hand (amps, drum kit, risers,
// monitors) — same "own panel next to the canvas, not drawn on it" reasoning
// as StagePlotChannelList's I/O List, per server/src/routes/stagePlots.js's
// StagePlotBacklineItem model. Not linked to canvas icons like a channel can
// be — backline is a rider list, not a specific placed instrument.
export default function StagePlotBacklineList({ eventId, items, onItemsChange }) {
  const [busyId, setBusyId] = useState(null);
  const [openItemId, setOpenItemId] = useState(null);

  async function handleAdd() {
    const item = await addStagePlotBacklineItem(eventId, { item: 'New Item' });
    onItemsChange([...items, item]);
  }

  async function handleFieldChange(item, patch) {
    onItemsChange(items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    setBusyId(item.id);
    try {
      await updateStagePlotBacklineItem(eventId, item.id, patch);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item) {
    setBusyId(item.id);
    try {
      await deleteStagePlotBacklineItem(eventId, item.id);
      onItemsChange(items.filter((i) => i.id !== item.id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="w-full max-w-[36rem] shrink-0 mt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-slate-500">Backline List</div>
        <button type="button" onClick={handleAdd} data-testid="stageplot-add-backline-item-button" className="text-xs font-semibold text-indigo-600">+ Add Item</button>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-xs min-w-[30rem]">
          <thead className="bg-slate-50 text-slate-400">
            <tr>
              <th className="px-2 py-1.5 text-left">Item</th>
              <th className="px-2 py-1.5 text-left w-16">Qty</th>
              <th className="px-2 py-1.5 text-left w-24">Provided By</th>
              <th className="px-2 py-1.5 text-left w-20">Notes</th>
              <th className="px-2 py-1.5 text-right w-8" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-slate-400">No backline items yet.</td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id} data-testid="stageplot-backline-row" className={`border-t border-slate-100 ${busyId === item.id ? 'opacity-50' : ''}`}>
                <td className="px-1 py-1">
                  <input
                    value={item.item}
                    onChange={(e) => handleFieldChange(item, { item: e.target.value })}
                    data-testid="stageplot-backline-item-input"
                    className={cellInputClass}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => handleFieldChange(item, { quantity: e.target.value })}
                    data-testid="stageplot-backline-quantity-input"
                    className={cellInputClass}
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    value={item.providedBy || ''}
                    onChange={(e) => handleFieldChange(item, { providedBy: e.target.value })}
                    data-testid="stageplot-backline-providedby-select"
                    className={cellInputClass}
                  >
                    {PROVIDED_BY_OPTIONS.map((v) => <option key={v} value={v}>{v ? PROVIDED_BY_LABELS[v] : 'TBD'}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1 relative">
                  <button
                    type="button"
                    onClick={() => setOpenItemId(item.id)}
                    data-testid="stageplot-backline-notes-button"
                    className={`block w-full text-left truncate px-1.5 py-1 rounded hover:bg-slate-50 ${item.notesHtml ? 'text-slate-600' : 'text-slate-300'}`}
                    title={plainTextPreview(item.notesHtml) || 'Add notes'}
                  >
                    {plainTextPreview(item.notesHtml) || 'Add notes…'}
                  </button>
                  {openItemId === item.id && (
                    <BacklineNotesPopover
                      initialHtml={item.notesHtml}
                      onCommit={(html) => handleFieldChange(item, { notesHtml: html })}
                      onClose={() => setOpenItemId(null)}
                    />
                  )}
                </td>
                <td className="px-1 py-1 text-right">
                  <button type="button" onClick={() => handleDelete(item)} data-testid="stageplot-backline-delete-button" className="text-slate-300 hover:text-red-500">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
