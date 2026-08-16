import { useCallback, useEffect, useRef, useState } from 'react';
import CanvasStage from '../lib/canvasEngine/CanvasStage';
import { useUndoRedo } from '../lib/canvasEngine/history';
import { createEmptyScene, deleteElement, deleteAnnotation, deleteStroke, addLayer, updateLayer } from '../lib/canvasEngine/sceneModel';
import { STAGE_PLOT_ICON_LIST, STAGE_PLOT_ICONS } from '../lib/canvasEngine/stagePlotIcons';
import { saveStagePlotPage } from '../lib/stagePlots';
import CanvasIconPalette from './CanvasIconPalette';

const AUTOSAVE_DELAY_MS = 2000;
const toolbarButtonClass = 'px-3 py-1.5 rounded-lg border border-slate-300 text-sm disabled:opacity-40';

// Owns one page's live editing session: undo/redo history, debounced
// autosave, and the toolbar/palette/canvas around it. Mounted fresh (via
// `key={page.id}` in StagePlotEditorPage) on every page switch so each
// page gets its own isolated undo/redo stack, never a shared/bleeding one.
export default function StagePlotPageEditor({ eventId, page, onSaved, selectedElementId, onSelectElement, onElementDeleted, onElementAdded, elementNumbers, elementContent, onUpdateElementContent }) {
  const initialScene = page.scene && Object.keys(page.scene).length > 0 ? page.scene : createEmptyScene();
  const { scene, apply, replaceCurrent, undo, redo, canUndo, canRedo } = useUndoRedo(initialScene);
  const [mode, setMode] = useState('select');
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);
  const [selectedStrokeId, setSelectedStrokeId] = useState(null);
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
    if (selectedElementId) {
      onElementDeleted?.(selectedElementId);
      apply((s) => deleteElement(s, selectedElementId));
      onSelectElement(null);
    } else if (selectedAnnotationId) {
      apply((s) => deleteAnnotation(s, selectedAnnotationId));
      setSelectedAnnotationId(null);
    } else if (selectedStrokeId) {
      apply((s) => deleteStroke(s, selectedStrokeId));
      setSelectedStrokeId(null);
    }
  }

  function rotateSelected(delta) {
    if (!selectedElementId) return;
    apply((s) => ({
      ...s,
      elements: s.elements.map((e) => (e.id === selectedElementId ? { ...e, rotation: (e.rotation + delta + 360) % 360 } : e)),
    }));
  }

  return (
    // min-w matches the palette (176px) + canvas (fixed width={820}) + gap —
    // Konva's Stage canvas doesn't shrink below its own pixel width, so
    // without this the parent's flex-wrap row (see StagePlotEditorPage.jsx)
    // never triggers and the I/O List squeezes into/overlaps the canvas
    // instead of wrapping to its own row on narrower viewports.
    <div className="flex-1 min-w-[1020px]">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" onClick={undo} disabled={!canUndo} data-testid="stageplot-undo-button" className={toolbarButtonClass}>Undo</button>
        <button type="button" onClick={redo} disabled={!canRedo} data-testid="stageplot-redo-button" className={toolbarButtonClass}>Redo</button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button type="button" onClick={() => setMode('select')} className={`${toolbarButtonClass} ${mode === 'select' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Select</button>
        <button type="button" onClick={() => setMode('draw')} className={`${toolbarButtonClass} ${mode === 'draw' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Draw</button>
        <button type="button" onClick={() => setMode('arrow')} data-testid="stageplot-arrow-button" className={`${toolbarButtonClass} ${mode === 'arrow' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Arrow</button>
        <button type="button" onClick={() => setMode('note')} data-testid="stageplot-note-button" className={`${toolbarButtonClass} ${mode === 'note' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Add Note</button>
        <button type="button" onClick={() => setMode('text')} data-testid="stageplot-text-button" className={`${toolbarButtonClass} ${mode === 'text' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Add Text</button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button type="button" onClick={() => rotateSelected(-15)} disabled={!selectedElementId} data-testid="stageplot-rotate-left-button" className={toolbarButtonClass} title="Rotate left 15°">⟲</button>
        <button type="button" onClick={() => rotateSelected(15)} disabled={!selectedElementId} data-testid="stageplot-rotate-right-button" className={toolbarButtonClass} title="Rotate right 15°">⟳</button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button type="button" onClick={handleDeleteSelected} disabled={!selectedElementId && !selectedAnnotationId && !selectedStrokeId} data-testid="stageplot-delete-selected-button" className={`${toolbarButtonClass} border-red-300 text-red-600`}>Delete Selected</button>
        <span data-testid="stageplot-save-status" className="text-xs text-slate-400 ml-auto">
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Unsaved changes' : 'Saved'}
        </span>
      </div>

      <div className="flex gap-4">
        <div className="w-44 shrink-0 space-y-4">
          <CanvasIconPalette icons={STAGE_PLOT_ICON_LIST} title="Gear" testIdPrefix="stageplot-icon" />

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
          onSelectElement={onSelectElement}
          selectedAnnotationId={selectedAnnotationId}
          onSelectAnnotation={setSelectedAnnotationId}
          selectedStrokeId={selectedStrokeId}
          onSelectStroke={setSelectedStrokeId}
          stageRef={stageRef}
          width={820}
          height={580}
          showGrid={false}
          iconRegistry={STAGE_PLOT_ICONS}
          elementNumbers={elementNumbers}
          elementContent={elementContent}
          onUpdateElementContent={onUpdateElementContent}
          onElementAdded={onElementAdded}
        />
      </div>
    </div>
  );
}
