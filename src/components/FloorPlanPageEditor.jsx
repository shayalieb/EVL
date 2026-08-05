import { useCallback, useEffect, useRef, useState } from 'react';
import CanvasStage from '../lib/canvasEngine/CanvasStage';
import { useUndoRedo } from '../lib/canvasEngine/history';
import { createEmptyScene, deleteElement, addLayer, updateLayer } from '../lib/canvasEngine/sceneModel';
import { FLOOR_PLAN_ICON_LIST, FLOOR_PLAN_ICONS } from '../lib/canvasEngine/floorPlanIcons';
import { saveFloorPlanPage } from '../lib/floorPlans';

const AUTOSAVE_DELAY_MS = 2000;
const toolbarButtonClass = 'px-3 py-1.5 rounded-lg border border-slate-300 text-sm disabled:opacity-40';

// Owns one page's live editing session: undo/redo history, debounced
// autosave, and the toolbar/palette/canvas around it. Mirrors
// StagePlotPageEditor.jsx's structure exactly (same shared canvasEngine
// underneath) but is otherwise fully independent — different icon set, no
// channel list, its own Prisma models/routes. Mounted fresh (key={page.id})
// on every page switch so each page gets an isolated undo/redo stack.
export default function FloorPlanPageEditor({ eventId, page, onSaved }) {
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
      const saved = await saveFloorPlanPage(eventId, page.id, { scene: sceneRef.current, thumbnailBase64 });
      onSaved({ scene: saved.scene, hasThumbnail: saved.hasThumbnail });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('unsaved');
    }
  }, [eventId, page.id, onSaved]);

  // persist's identity changes on every save (onSaved is a fresh closure
  // from the parent each render) — a ref lets the debounce/unmount-flush
  // effects below always call the latest persist without needing it in
  // their dep arrays. Depending on [persist] directly here previously
  // caused a runaway autosave loop: each completed save produced a new
  // persist identity, which retriggered the debounce effect (and the old
  // unmount-flush effect's cleanup), which saved again, forever — hammering
  // the API continuously instead of only after real edits.
  const persistRef = useRef(persist);
  persistRef.current = persist;

  useEffect(() => {
    setSaveStatus('unsaved');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persistRef.current(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(saveTimer.current);
  }, [scene]);

  // Flush on true unmount only (e.g. switching to another page) instead of
  // losing up to AUTOSAVE_DELAY_MS of edits to a debounce timer that never
  // fires. Empty deps — this must run its cleanup exactly once, on unmount,
  // not on every persist() identity change (see persistRef comment above).
  useEffect(() => () => { clearTimeout(saveTimer.current); persistRef.current(); }, []);

  function handleDeleteSelected() {
    if (!selectedElementId) return;
    apply((s) => deleteElement(s, selectedElementId));
    setSelectedElementId(null);
  }

  return (
    <div className="flex-1 min-w-0">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" onClick={undo} disabled={!canUndo} data-testid="floorplan-undo-button" className={toolbarButtonClass}>Undo</button>
        <button type="button" onClick={redo} disabled={!canRedo} data-testid="floorplan-redo-button" className={toolbarButtonClass}>Redo</button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button type="button" onClick={() => setMode('select')} className={`${toolbarButtonClass} ${mode === 'select' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Select</button>
        <button type="button" onClick={() => setMode('draw')} className={`${toolbarButtonClass} ${mode === 'draw' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Annotate</button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button type="button" onClick={handleDeleteSelected} disabled={!selectedElementId} data-testid="floorplan-delete-selected-button" className={`${toolbarButtonClass} border-red-300 text-red-600`}>Delete Selected</button>
        <span data-testid="floorplan-save-status" className="text-xs text-slate-400 ml-auto">
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Unsaved changes' : 'Saved'}
        </span>
      </div>

      <div className="flex gap-4">
        <div className="w-48 shrink-0 space-y-4">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2">Furniture &amp; Decor</div>
            <div className="grid grid-cols-2 gap-1.5">
              {FLOOR_PLAN_ICON_LIST.map((iconDef) => (
                <div
                  key={iconDef.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/x-canvas-icon', iconDef.id)}
                  data-testid={`floorplan-icon-${iconDef.id}`}
                  title={iconDef.label}
                  className="flex flex-col items-center gap-1 px-1.5 py-2 rounded-lg border border-slate-200 bg-slate-50 cursor-grab select-none hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <span className="w-7 h-7" dangerouslySetInnerHTML={{ __html: iconDef.svg }} />
                  <span className="text-[10px] text-center leading-tight text-slate-600">{iconDef.label}</span>
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
          iconRegistry={FLOOR_PLAN_ICONS}
        />
      </div>
    </div>
  );
}
