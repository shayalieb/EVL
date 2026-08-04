import { useCallback, useEffect, useRef, useState } from 'react';
import CanvasStage from '../lib/canvasEngine/CanvasStage';
import { useUndoRedo } from '../lib/canvasEngine/history';
import { createEmptyScene, deleteElement, addLayer, updateLayer } from '../lib/canvasEngine/sceneModel';
import { saveStagePlotPage } from '../lib/stagePlots';

// Placeholder gear list — real icon assets are a separate content-sourcing
// decision (see canvas engine planning notes), not a coding task. Labels
// alone are enough to prove drag-placement/channel-linking end to end.
const STAGE_ICONS = ['Vocal Mic', 'Guitar Amp', 'Bass Amp', 'DI Box', 'Monitor Wedge', 'Drum Kit', 'Keyboard', 'Music Stand', 'Riser'];

const AUTOSAVE_DELAY_MS = 2000;
const toolbarButtonClass = 'px-3 py-1.5 rounded-lg border border-slate-300 text-sm disabled:opacity-40';

// Owns one page's live editing session: undo/redo history, debounced
// autosave, and the toolbar/palette/canvas around it. Mounted fresh (via
// `key={page.id}` in StagePlotEditorPage) on every page switch so each
// page gets its own isolated undo/redo stack, never a shared/bleeding one.
export default function StagePlotPageEditor({ eventId, page, onSaved }) {
  const initialScene = page.scene && Object.keys(page.scene).length > 0 ? page.scene : createEmptyScene();
  const { scene, apply, replaceCurrent, undo, redo, canUndo, canRedo } = useUndoRedo(initialScene);
  const [mode, setMode] = useState('select');
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved');
  const stageRef = useRef(null);
  const saveTimer = useRef(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const persist = useCallback(async () => {
    setSaveStatus('saving');
    try {
      const thumbnailBase64 = stageRef.current ? stageRef.current.toDataURL({ pixelRatio: 1 }) : undefined;
      const saved = await saveStagePlotPage(eventId, page.id, { scene: sceneRef.current, thumbnailBase64 });
      onSaved({ scene: saved.scene, hasThumbnail: saved.hasThumbnail });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('unsaved');
    }
  }, [eventId, page.id, onSaved]);

  useEffect(() => {
    setSaveStatus('unsaved');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(saveTimer.current);
  }, [scene, persist]);

  // Flush on unmount (e.g. switching to another page) instead of losing
  // up to AUTOSAVE_DELAY_MS of edits to a debounce timer that never fires.
  useEffect(() => () => { clearTimeout(saveTimer.current); persist(); }, [persist]);

  function handleDeleteSelected() {
    if (!selectedElementId) return;
    apply((s) => deleteElement(s, selectedElementId));
    setSelectedElementId(null);
  }

  return (
    <div className="flex-1 min-w-0">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" onClick={undo} disabled={!canUndo} data-testid="stageplot-undo-button" className={toolbarButtonClass}>Undo</button>
        <button type="button" onClick={redo} disabled={!canRedo} data-testid="stageplot-redo-button" className={toolbarButtonClass}>Redo</button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button type="button" onClick={() => setMode('select')} className={`${toolbarButtonClass} ${mode === 'select' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Select</button>
        <button type="button" onClick={() => setMode('draw')} className={`${toolbarButtonClass} ${mode === 'draw' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Annotate</button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button type="button" onClick={handleDeleteSelected} disabled={!selectedElementId} data-testid="stageplot-delete-selected-button" className={`${toolbarButtonClass} border-red-300 text-red-600`}>Delete Selected</button>
        <span data-testid="stageplot-save-status" className="text-xs text-slate-400 ml-auto">
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Unsaved changes' : 'Saved'}
        </span>
      </div>

      <div className="flex gap-4">
        <div className="w-44 shrink-0 space-y-4">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2">Gear</div>
            <div className="grid grid-cols-2 gap-1.5">
              {STAGE_ICONS.map((iconId) => (
                <div
                  key={iconId}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/x-canvas-icon', iconId)}
                  data-testid={`stageplot-icon-${iconId.toLowerCase().replace(/\s+/g, '-')}`}
                  className="px-2 py-2 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-center cursor-grab select-none"
                >
                  {iconId}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2">Scale</div>
            <label className="block text-[11px] text-slate-400 mb-1">Pixels per {scene.unit}</label>
            <input
              type="number"
              value={scene.scalePxPerUnit}
              onChange={(e) => replaceCurrent((s) => ({ ...s, scalePxPerUnit: Number(e.target.value) || 1 }))}
              className="w-full px-2 py-1 rounded border border-slate-300 text-sm"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2">Layers</div>
            <div className="space-y-1">
              {scene.layers.map((layer) => (
                <label key={layer.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={layer.visible} onChange={(e) => apply((s) => updateLayer(s, layer.id, { visible: e.target.checked }))} />
                  {layer.name}
                </label>
              ))}
            </div>
            <button type="button" onClick={() => apply((s) => addLayer(s))} className="mt-2 text-xs font-semibold text-indigo-600">+ Add layer</button>
          </div>
        </div>

        <CanvasStage
          scene={scene}
          onMutate={apply}
          onAdjust={replaceCurrent}
          mode={mode}
          selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
          stageRef={stageRef}
          width={820}
          height={580}
        />
      </div>
    </div>
  );
}
