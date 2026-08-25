import { useRef, useState } from 'react';
import CanvasNotesPopover from './CanvasNotesPopover';
import { addStagePlotChannel, updateStagePlotChannel, deleteStagePlotChannel, reorderStagePlotChannels } from '../lib/stagePlots';
import { useToast } from './ui/Toast';

const cellInputClass = 'w-full px-1.5 py-1 rounded border border-transparent hover:border-slate-200 focus:border-indigo-400 text-xs bg-transparent';

function plainTextPreview(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Who's playing what, and what they need — kept as its own panel next to
// the canvas (not drawn on it) since it's tabular data a business
// edits/sorts independently of the visual plot, per
// server/src/routes/stagePlots.js's StagePlotChannel model. Each row can
// optionally link to a placed icon on the canvas (elementId), which is what
// puts its running number badge on the plot — everything else about the
// row (musician, instrument, power needs, notes) is general-purpose, not
// tied to any one type of production.
export default function StagePlotChannelList({ eventId, channels, onChannelsChange, selectedElementId, selectedElement, onSelectElement }) {
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState(null);
  const [openChannelId, setOpenChannelId] = useState(null);
  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const isLinked = (elementId) => channels.some((c) => c.elementId === elementId);

  async function handleAdd() {
    const channel = await addStagePlotChannel(eventId, { source: 'New Item' });
    onChannelsChange([...channels, channel]);
  }

  async function handleAddForSelected() {
    const channel = await addStagePlotChannel(eventId, {
      source: selectedElement?.label || selectedElement?.iconId || 'New Item',
      elementId: selectedElementId,
    });
    onChannelsChange([...channels, channel]);
  }

  async function handleFieldChange(channel, patch) {
    onChannelsChange(channels.map((c) => (c.id === channel.id ? { ...c, ...patch } : c)));
    setBusyId(channel.id);
    try {
      await updateStagePlotChannel(eventId, channel.id, patch);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(channel) {
    setBusyId(channel.id);
    try {
      await deleteStagePlotChannel(eventId, channel.id);
      onChannelsChange(channels.filter((c) => c.id !== channel.id));
    } finally {
      setBusyId(null);
    }
  }

  // channelNumber is the only sort field there is — reordering means
  // renumbering every row 1..N to match the new order. Applied optimistically
  // (the drag itself should feel instant) and reconciled with whatever the
  // server actually persisted; a failed request reverts to the pre-drag
  // order rather than leaving the list showing an order that didn't save.
  async function handleReorderDrop(targetIndex) {
    const sourceIndex = dragIndex.current;
    dragIndex.current = null;
    setDragOverIndex(null);
    if (sourceIndex === null || sourceIndex === targetIndex) return;

    const previous = channels;
    const reordered = channels.slice();
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    onChannelsChange(reordered.map((c, i) => ({ ...c, channelNumber: i + 1 })));

    try {
      const saved = await reorderStagePlotChannels(eventId, reordered.map((c) => c.id));
      onChannelsChange(saved);
    } catch {
      onChannelsChange(previous);
      showToast('Failed to reorder the list', 'error');
    }
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-slate-500">Production List</div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAddForSelected}
            disabled={!selectedElementId || isLinked(selectedElementId)}
            data-testid="stageplot-add-channel-for-selected-button"
            className="text-xs font-semibold text-indigo-600 disabled:opacity-40"
            title={!selectedElementId ? 'Select an icon on the canvas first' : isLinked(selectedElementId) ? 'This icon is already linked to an item' : 'Create an item linked to the selected icon'}
          >
            + Add Item for Selected Icon
          </button>
          <button type="button" onClick={handleAdd} data-testid="stageplot-add-channel-button" className="text-xs font-semibold text-indigo-600">+ Add Item</button>
        </div>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-xs min-w-[40rem]">
          <thead className="bg-slate-50 text-slate-400">
            <tr>
              <th className="px-1 py-1.5 w-5" aria-hidden="true" />
              <th className="px-2 py-1.5 text-left w-8">#</th>
              <th className="px-2 py-1.5 text-left w-28">Musician</th>
              <th className="px-2 py-1.5 text-left w-28">Instrument</th>
              <th className="px-2 py-1.5 text-center w-10" title="Needs 48V phantom power">48V</th>
              <th className="px-2 py-1.5 text-center w-10" title="Needs AC power at this position">Power</th>
              <th className="px-2 py-1.5 text-left">Notes</th>
              <th className="px-2 py-1.5 text-right w-16">Icon</th>
            </tr>
          </thead>
          <tbody>
            {channels.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-4 text-center text-slate-400">No items yet.</td>
              </tr>
            )}
            {channels.map((channel, index) => (
              <tr
                key={channel.id}
                draggable
                onDragStart={() => { dragIndex.current = index; }}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }}
                onDrop={() => handleReorderDrop(index)}
                data-testid="stageplot-channel-row"
                className={`border-t ${dragOverIndex === index && dragIndex.current !== index ? 'border-indigo-400' : 'border-slate-100'} ${busyId === channel.id ? 'opacity-50' : ''} ${channel.elementId && channel.elementId === selectedElementId ? 'bg-indigo-50' : ''}`}
              >
                <td className="px-1 py-1 text-center cursor-grab text-slate-300 select-none" data-testid="stageplot-channel-drag-handle" aria-hidden="true">⠿</td>
                <td className="px-2 py-1 text-slate-400">{channel.channelNumber}</td>
                <td className="px-1 py-1">
                  <input
                    value={channel.musicianName || ''}
                    onChange={(e) => handleFieldChange(channel, { musicianName: e.target.value })}
                    placeholder="Who's playing"
                    data-testid="stageplot-channel-musician-input"
                    className={cellInputClass}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={channel.source}
                    onChange={(e) => handleFieldChange(channel, { source: e.target.value })}
                    data-testid="stageplot-channel-instrument-input"
                    className={cellInputClass}
                  />
                </td>
                <td className="px-1 py-1 text-center">
                  <input
                    type="checkbox"
                    checked={channel.phantomPower}
                    onChange={(e) => handleFieldChange(channel, { phantomPower: e.target.checked })}
                    data-testid="stageplot-channel-48v-checkbox"
                  />
                </td>
                <td className="px-1 py-1 text-center">
                  <input
                    type="checkbox"
                    checked={channel.powerNeeded}
                    onChange={(e) => handleFieldChange(channel, { powerNeeded: e.target.checked })}
                    data-testid="stageplot-channel-power-checkbox"
                  />
                </td>
                <td className="px-1 py-1 relative">
                  {/* Rich text — a linked icon's notes can also be opened via
                      its double-click popup on the canvas (CanvasStage.jsx);
                      both write the same monitorNotes field, so either place
                      works. Uses the same safe popover as the Backline
                      List's Notes column so formatting round-trips intact
                      instead of being stripped on every edit. */}
                  <button
                    type="button"
                    onClick={() => setOpenChannelId(channel.id)}
                    data-testid="stageplot-channel-notes-button"
                    className={`block w-full text-left truncate px-1.5 py-1 rounded hover:bg-slate-50 ${channel.monitorNotes ? 'text-slate-600' : 'text-slate-300'}`}
                    title={plainTextPreview(channel.monitorNotes) || 'Add notes'}
                  >
                    {plainTextPreview(channel.monitorNotes) || 'DI, monitor mix, other needs…'}
                  </button>
                  {openChannelId === channel.id && (
                    <CanvasNotesPopover
                      initialHtml={channel.monitorNotes}
                      onCommit={(html) => handleFieldChange(channel, { monitorNotes: html })}
                      onClose={() => setOpenChannelId(null)}
                      testIdPrefix="stageplot-channel-notes-popover"
                    />
                  )}
                </td>
                <td className="px-1 py-1">
                  <div className="flex items-center justify-end gap-1.5">
                    {channel.elementId ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onSelectElement?.(channel.elementId)}
                          title="Select this icon on the canvas"
                          data-testid="stageplot-channel-select-icon-button"
                          className="text-indigo-600 hover:text-indigo-800"
                        >
                          ●
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFieldChange(channel, { elementId: null })}
                          title="Unlink from canvas icon"
                          data-testid="stageplot-channel-unlink-button"
                          className="text-slate-300 hover:text-amber-500"
                        >
                          ⊘
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleFieldChange(channel, { elementId: selectedElementId })}
                        disabled={!selectedElementId}
                        title={selectedElementId ? 'Link the selected icon to this item' : 'Select an icon on the canvas first'}
                        data-testid="stageplot-channel-link-button"
                        className="text-slate-300 hover:text-indigo-600 disabled:opacity-40"
                      >
                        🔗
                      </button>
                    )}
                    <button type="button" onClick={() => handleDelete(channel)} data-testid="stageplot-channel-delete-button" className="text-slate-300 hover:text-red-500">×</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
