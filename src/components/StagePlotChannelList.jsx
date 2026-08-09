import { useState } from 'react';
import { addStagePlotChannel, updateStagePlotChannel, deleteStagePlotChannel } from '../lib/stagePlots';

const STAND_TYPES = ['', 'tall boom', 'short boom', 'straight', 'none'];
const cellInputClass = 'w-full px-1.5 py-1 rounded border border-transparent hover:border-slate-200 focus:border-indigo-400 text-xs bg-transparent';

// The standard live-sound input list — kept as its own panel next to the
// canvas (not drawn on it) since it's tabular data a business edits/sorts
// independently of the visual plot, per server/src/routes/stagePlots.js's
// StagePlotChannel model.
export default function StagePlotChannelList({ eventId, channels, onChannelsChange, selectedElementId, selectedElement, onSelectElement }) {
  const [busyId, setBusyId] = useState(null);
  const isLinked = (elementId) => channels.some((c) => c.elementId === elementId);

  async function handleAdd() {
    const channel = await addStagePlotChannel(eventId, { source: 'New Channel' });
    onChannelsChange([...channels, channel]);
  }

  async function handleAddForSelected() {
    const channel = await addStagePlotChannel(eventId, {
      source: selectedElement?.label || selectedElement?.iconId || 'New Channel',
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

  return (
    <div className="w-[36rem] shrink-0">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-slate-500">I/O List</div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAddForSelected}
            disabled={!selectedElementId || isLinked(selectedElementId)}
            data-testid="stageplot-add-channel-for-selected-button"
            className="text-xs font-semibold text-indigo-600 disabled:opacity-40"
            title={!selectedElementId ? 'Select an icon on the canvas first' : isLinked(selectedElementId) ? 'This icon is already linked to a channel' : 'Create a channel linked to the selected icon'}
          >
            + Add Channel for Selected Icon
          </button>
          <button type="button" onClick={handleAdd} data-testid="stageplot-add-channel-button" className="text-xs font-semibold text-indigo-600">+ Add Channel</button>
        </div>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-400">
            <tr>
              <th className="px-2 py-1.5 text-left w-8">#</th>
              <th className="px-2 py-1.5 text-left w-28">Source</th>
              <th className="px-2 py-1.5 text-left w-20">Mic/DI</th>
              <th className="px-2 py-1.5 text-left w-24">Stand</th>
              <th className="px-2 py-1.5 text-center w-10">48V</th>
              <th className="px-2 py-1.5 text-left">Notes</th>
              <th className="px-2 py-1.5 text-right w-16">Icon</th>
            </tr>
          </thead>
          <tbody>
            {channels.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-center text-slate-400">No channels yet.</td>
              </tr>
            )}
            {channels.map((channel) => (
              <tr
                key={channel.id}
                data-testid="stageplot-channel-row"
                className={`border-t border-slate-100 ${busyId === channel.id ? 'opacity-50' : ''} ${channel.elementId && channel.elementId === selectedElementId ? 'bg-indigo-50' : ''}`}
              >
                <td className="px-2 py-1 text-slate-400">{channel.channelNumber}</td>
                <td className="px-1 py-1">
                  <input
                    value={channel.source}
                    onChange={(e) => handleFieldChange(channel, { source: e.target.value })}
                    data-testid="stageplot-channel-source-input"
                    className={cellInputClass}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={channel.micOrDi || ''}
                    onChange={(e) => handleFieldChange(channel, { micOrDi: e.target.value })}
                    className={cellInputClass}
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    value={channel.standType || ''}
                    onChange={(e) => handleFieldChange(channel, { standType: e.target.value })}
                    className={cellInputClass}
                  >
                    {STAND_TYPES.map((t) => <option key={t} value={t}>{t || '—'}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1 text-center">
                  <input
                    type="checkbox"
                    checked={channel.phantomPower}
                    onChange={(e) => handleFieldChange(channel, { phantomPower: e.target.checked })}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={channel.monitorNotes || ''}
                    onChange={(e) => handleFieldChange(channel, { monitorNotes: e.target.value })}
                    placeholder="Monitor mix, cues…"
                    data-testid="stageplot-channel-notes-input"
                    className={cellInputClass}
                  />
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
                        title={selectedElementId ? 'Link the selected icon to this channel' : 'Select an icon on the canvas first'}
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
