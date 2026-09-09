import { Fragment, useEffect, useRef, useState } from 'react';
import { stagePlotNotesToPlainText } from '../lib/stagePlotNotes';
import { useToast } from './ui/Toast';

const cellInputClass = 'w-full px-1.5 py-1 rounded border border-transparent hover:border-slate-200 focus:border-indigo-400 text-xs bg-transparent';

function InlineCellInput({ value, onSave, placeholder, testId, ariaLabel }) {
  const savedValue = value || '';
  const [draft, setDraft] = useState(savedValue);

  useEffect(() => {
    setDraft(savedValue);
  }, [savedValue]);

  function save() {
    if (draft !== savedValue) onSave(draft);
  }

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(savedValue);
          event.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
      data-testid={testId}
      aria-label={ariaLabel}
      className={cellInputClass}
    />
  );
}

function InlineProductionNotes({ value, onSave }) {
  const savedValue = stagePlotNotesToPlainText(value);
  const [draft, setDraft] = useState(savedValue);

  useEffect(() => {
    setDraft(savedValue);
  }, [savedValue]);

  function save() {
    const nextValue = draft.trim();
    if (nextValue !== savedValue) onSave(nextValue);
  }

  return (
    <textarea
      value={draft}
      rows={2}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDraft(savedValue);
          event.currentTarget.blur();
        }
      }}
      placeholder="DI, monitor mix, other needs…"
      aria-label="Production item notes"
      data-testid="stageplot-channel-notes-input"
      className="block w-full min-w-48 resize-y rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs leading-4 text-slate-700 placeholder:text-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
    />
  );
}

// Who's playing what, and what they need — kept as its own panel next to
// the canvas (not drawn on it) since it's tabular data a business
// edits/sorts independently of the visual plot, per
// server/src/routes/stagePlots.js's StagePlotChannel model. Each row can
// optionally link to a placed icon on the canvas (elementId), which is what
// puts its running number badge on the plot — everything else about the
// row (musician, instrument, power needs, notes) is general-purpose, not
// tied to any one type of production.
export default function StagePlotChannelList({ api, channels, onChannelsChange, selectedElementId, selectedElement, onSelectElement }) {
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState(null);
  const dragIndex = useRef(null);
  const saveSequence = useRef(new Map());
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [advancedAudio, setAdvancedAudio] = useState(false);
  const isLinked = (elementId) => channels.some((c) => c.elementId === elementId);

  async function handleAdd() {
    const channel = await api.addChannel({ source: 'New Item' });
    onChannelsChange([...channels, channel]);
  }

  async function handleAddForSelected() {
    const channel = await api.addChannel({
      source: selectedElement?.label || selectedElement?.iconId || 'New Item',
      elementId: selectedElementId,
    });
    onChannelsChange([...channels, channel]);
  }

  async function handleFieldChange(channel, patch) {
    const previous = channel;
    const sequence = (saveSequence.current.get(channel.id) || 0) + 1;
    saveSequence.current.set(channel.id, sequence);
    onChannelsChange(channels.map((c) => (c.id === channel.id ? { ...c, ...patch } : c)));
    setBusyId(channel.id);
    try {
      await api.updateChannel(channel.id, patch);
    } catch (err) {
      if (saveSequence.current.get(channel.id) === sequence) {
        onChannelsChange(channels.map((c) => (c.id === channel.id ? previous : c)));
        showToast(err.message || 'Could not save the production item. Your previous value was restored.', 'error');
      }
    } finally {
      if (saveSequence.current.get(channel.id) === sequence) setBusyId(null);
    }
  }

  async function handleDelete(channel) {
    setBusyId(channel.id);
    try {
      await api.deleteChannel(channel.id);
      onChannelsChange(channels.filter((c) => c.id !== channel.id));
    } catch (err) {
      showToast(err.message || 'Could not delete the production item', 'error');
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
      const saved = await api.reorderChannels(reordered.map((c) => c.id));
      onChannelsChange(saved);
    } catch (err) {
      onChannelsChange(previous);
      showToast(err.message || 'Could not reorder the list. The previous order was restored.', 'error');
    }
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-slate-500">Production List</div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAdvancedAudio((value) => !value)}
            aria-pressed={advancedAudio}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${advancedAudio ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}
          >
            Technical details {advancedAudio ? 'shown' : 'hidden'}
          </button>
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
        <table className="w-full text-xs min-w-[48rem]">
          <thead className="bg-slate-50 text-slate-400">
            <tr>
              <th className="px-1 py-1.5 w-5" aria-hidden="true" />
              <th className="px-2 py-1.5 text-left w-8">#</th>
              <th className="px-2 py-1.5 text-left w-28">Musician</th>
              <th className="px-2 py-1.5 text-left w-28">Instrument</th>
              <th className="px-2 py-1.5 text-center w-10" title="Needs 48V phantom power">48V</th>
              <th className="px-2 py-1.5 text-center w-10" title="Needs AC power at this position">Power</th>
              <th className="px-2 py-1.5 text-left w-64">Notes</th>
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
              <Fragment key={channel.id}>
              <tr
                draggable
                onDragStart={() => { dragIndex.current = index; }}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }}
                onDrop={() => handleReorderDrop(index)}
                data-testid="stageplot-channel-row"
                aria-busy={busyId === channel.id}
                className={`border-t ${dragOverIndex === index && dragIndex.current !== index ? 'border-indigo-400' : 'border-slate-100'} ${channel.elementId && channel.elementId === selectedElementId ? 'bg-indigo-50' : ''}`}
              >
                <td className="px-1 py-1 text-center cursor-grab text-slate-300 select-none" data-testid="stageplot-channel-drag-handle" aria-hidden="true">⠿</td>
                <td className="px-2 py-1 text-slate-400">{channel.channelNumber}</td>
                <td className="px-1 py-1">
                  <InlineCellInput
                    value={channel.musicianName || ''}
                    onSave={(musicianName) => handleFieldChange(channel, { musicianName })}
                    placeholder="Who's playing"
                    testId="stageplot-channel-musician-input"
                    ariaLabel="Musician or performer"
                  />
                </td>
                <td className="px-1 py-1">
                  <InlineCellInput
                    value={channel.source}
                    onSave={(source) => handleFieldChange(channel, { source })}
                    testId="stageplot-channel-instrument-input"
                    ariaLabel="Instrument or input source"
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
                <td className="px-1 py-1.5 align-top">
                  <InlineProductionNotes
                    value={channel.monitorNotes}
                    onSave={(monitorNotes) => handleFieldChange(channel, { monitorNotes })}
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
              {advancedAudio && (
                <tr className="border-t border-slate-100 bg-slate-50/70" data-testid="stageplot-channel-advanced-row">
                  <td colSpan={8} className="px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-700">Channel {channel.channelNumber}: {channel.source || 'Unnamed input'}</div>
                        <div className="text-[11px] font-normal text-slate-400">Specify only requirements the engineer needs to prepare or patch this input.</div>
                      </div>
                      <span className="text-[11px] text-slate-400">Optional</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                      <AdvancedSelect label="Input type" value={channel.inputType} onChange={(inputType) => handleFieldChange(channel, { inputType })} options={[['', 'Venue may choose'], ['mic', 'Microphone'], ['di', 'DI box'], ['line', 'Line input'], ['playback', 'Playback'], ['wireless', 'Wireless'], ['other', 'Other']]} />
                      <AdvancedInput label="Preferred mic / DI" value={channel.preferredDevice} placeholder="e.g. SM58, Radial JDI" onSave={(preferredDevice) => handleFieldChange(channel, { preferredDevice })} />
                      <AdvancedInput label="Acceptable substitute" value={channel.substituteDevice} placeholder="e.g. equivalent dynamic" onSave={(substituteDevice) => handleFieldChange(channel, { substituteDevice })} />
                      <AdvancedSelect label="Stand / mount" value={channel.standType} onChange={(standType) => handleFieldChange(channel, { standType })} options={[['', 'Venue may choose'], ['straight', 'Straight'], ['boom', 'Boom'], ['short-boom', 'Short boom'], ['clip', 'Clip / mount'], ['none', 'None']]} />
                      <AdvancedSelect label="Connector" value={channel.connectionType} onChange={(connectionType) => handleFieldChange(channel, { connectionType })} options={[['', 'Not specified'], ['xlr', 'XLR'], ['trs', '¼-inch TRS'], ['ts', '¼-inch TS'], ['usb', 'USB'], ['ethernet', 'Network / Ethernet'], ['other', 'Other']]} />
                      <AdvancedSelect label="Channel format" value={channel.channelFormat || 'mono'} onChange={(channelFormat) => handleFieldChange(channel, { channelFormat })} options={[['mono', 'Mono'], ['stereo-left', 'Stereo left'], ['stereo-right', 'Stereo right'], ['stereo-pair', 'Stereo pair']]} />
                      <AdvancedInput label="Stagebox / location" value={channel.stageboxName} placeholder="e.g. Stage left box" onSave={(stageboxName) => handleFieldChange(channel, { stageboxName })} />
                      <AdvancedInput label="Stagebox input" value={channel.stageboxInput} placeholder="e.g. A-12" onSave={(stageboxInput) => handleFieldChange(channel, { stageboxInput })} />
                      <AdvancedSelect label="Equipment provided by" value={channel.providedBy} onChange={(providedBy) => handleFieldChange(channel, { providedBy })} options={[['', 'Not decided'], ['artist', 'Artist'], ['venue', 'Venue'], ['rental', 'Rental company']]} />
                      <AdvancedInput label="Monitor destination" value={channel.monitorMix} placeholder="e.g. Mix 3 — wedge" onSave={(monitorMix) => handleFieldChange(channel, { monitorMix })} />
                      <AdvancedInput label="Power requirement" value={channel.powerDetails} placeholder="e.g. 2× 120V stage left" onSave={(powerDetails) => handleFieldChange(channel, { powerDetails })} />
                      <AdvancedInput label="Cable requirement" value={channel.cableDetails} placeholder="e.g. 25 ft XLR" onSave={(cableDetails) => handleFieldChange(channel, { cableDetails })} />
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdvancedInput({ label, value, placeholder, onSave }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => setDraft(value || ''), [value]);
  return (
    <label className="block text-[11px] font-semibold text-slate-500">
      {label}
      <input value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (draft !== (value || '')) onSave(draft); }} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-normal text-slate-700 focus:border-indigo-400 focus:outline-none" />
    </label>
  );
}

function AdvancedSelect({ label, value, options, onChange }) {
  return (
    <label className="block text-[11px] font-semibold text-slate-500">
      {label}
      <select value={value || ''} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-normal text-slate-700 focus:border-indigo-400 focus:outline-none">
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}
