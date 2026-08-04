import { useState } from 'react';
import { addStagePlotChannel, updateStagePlotChannel, deleteStagePlotChannel } from '../lib/stagePlots';

const STAND_TYPES = ['', 'tall boom', 'short boom', 'straight', 'none'];
const cellInputClass = 'w-full px-1.5 py-1 rounded border border-transparent hover:border-slate-200 focus:border-indigo-400 text-xs bg-transparent';

// The standard live-sound input list — kept as its own panel next to the
// canvas (not drawn on it) since it's tabular data a business edits/sorts
// independently of the visual plot, per server/src/routes/stagePlots.js's
// StagePlotChannel model.
export default function StagePlotChannelList({ eventId, channels, onChannelsChange }) {
  const [busyId, setBusyId] = useState(null);

  async function handleAdd() {
    const channel = await addStagePlotChannel(eventId, { source: 'New Channel' });
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
    <div className="w-96 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-slate-500">I/O List</div>
        <button type="button" onClick={handleAdd} data-testid="stageplot-add-channel-button" className="text-xs font-semibold text-indigo-600">+ Add Channel</button>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-400">
            <tr>
              <th className="px-2 py-1.5 text-left w-8">#</th>
              <th className="px-2 py-1.5 text-left">Source</th>
              <th className="px-2 py-1.5 text-left">Mic/DI</th>
              <th className="px-2 py-1.5 text-left">Stand</th>
              <th className="px-2 py-1.5 text-center w-10">48V</th>
              <th className="px-2 py-1.5 w-6" />
            </tr>
          </thead>
          <tbody>
            {channels.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-slate-400">No channels yet.</td>
              </tr>
            )}
            {channels.map((channel) => (
              <tr key={channel.id} data-testid="stageplot-channel-row" className={`border-t border-slate-100 ${busyId === channel.id ? 'opacity-50' : ''}`}>
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
                  <button type="button" onClick={() => handleDelete(channel)} data-testid="stageplot-channel-delete-button" className="text-slate-300 hover:text-red-500">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
