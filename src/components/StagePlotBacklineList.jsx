import { useState } from 'react';
import CanvasNotesPopover from './CanvasNotesPopover';
import { stagePlotNotesToPlainText } from '../lib/stagePlotNotes';

const PROVIDED_BY_OPTIONS = ['', 'band', 'venue', 'rental'];
const PROVIDED_BY_LABELS = { band: 'Band', venue: 'Venue', rental: 'Rental' };
const cellInputClass = 'w-full px-1.5 py-1 rounded border border-transparent hover:border-slate-200 focus:border-indigo-400 text-xs bg-transparent';

// Equipment the venue/production needs on hand (amps, drum kit, risers,
// monitors) — same "own panel next to the canvas, not drawn on it" reasoning
// as StagePlotChannelList's Production List, per server/src/routes/stagePlots.js's
// StagePlotBacklineItem model. Not linked to canvas icons like a channel can
// be — backline is a rider list, not a specific placed instrument.
export default function StagePlotBacklineList({ api, items, onItemsChange }) {
  const [busyId, setBusyId] = useState(null);
  const [openItemId, setOpenItemId] = useState(null);

  async function handleAdd() {
    const item = await api.addItem({ item: 'New Item' });
    onItemsChange([...items, item]);
  }

  async function handleFieldChange(item, patch) {
    onItemsChange(items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    setBusyId(item.id);
    try {
      await api.updateItem(item.id, patch);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item) {
    setBusyId(item.id);
    try {
      await api.deleteItem(item.id);
      onItemsChange(items.filter((i) => i.id !== item.id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="w-full mt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-slate-500">Backline List</div>
        <button type="button" onClick={handleAdd} data-testid="stageplot-add-backline-item-button" className="text-xs font-semibold text-indigo-600">+ Add Item</button>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-xs min-w-[42rem]">
          <thead className="bg-slate-50 text-slate-400">
            <tr>
              <th className="px-2 py-1.5 text-left">Item</th>
              <th className="px-2 py-1.5 text-left w-16">Qty</th>
              <th className="px-2 py-1.5 text-left w-24">Provided By</th>
              <th className="px-2 py-1.5 text-left w-64">Notes</th>
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
                    title={stagePlotNotesToPlainText(item.notesHtml) || 'Add notes'}
                  >
                    {stagePlotNotesToPlainText(item.notesHtml) || 'Add notes…'}
                  </button>
                  {openItemId === item.id && (
                    <CanvasNotesPopover
                      initialHtml={item.notesHtml}
                      onCommit={(html) => handleFieldChange(item, { notesHtml: html })}
                      onClose={() => setOpenItemId(null)}
                      testIdPrefix="backline-notes-popover"
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
