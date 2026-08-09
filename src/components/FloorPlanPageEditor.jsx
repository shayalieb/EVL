import { useCallback, useEffect, useRef, useState } from 'react';
import CanvasStage from '../lib/canvasEngine/CanvasStage';
import { useUndoRedo } from '../lib/canvasEngine/history';
import { createEmptyScene, deleteElement, deleteAnnotation, deleteStroke, addLayer, updateLayer, updateElement } from '../lib/canvasEngine/sceneModel';
import { FLOOR_PLAN_ICON_LIST, FLOOR_PLAN_ICONS } from '../lib/canvasEngine/floorPlanIcons';
import { saveFloorPlanPage } from '../lib/floorPlans';
import FloorPlanItemList, { SEATABLE_TABLE_IDS } from './FloorPlanItemList';
import FloorPlanNumberList from './FloorPlanNumberList';

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
    if (selectedElementId) {
      apply((s) => deleteElement(s, selectedElementId));
      setSelectedElementId(null);
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

  const selectedElement = selectedElementId ? scene.elements.find((e) => e.id === selectedElementId) : null;

  function updateSelectedSeats(seats) {
    if (!selectedElementId) return;
    apply((s) => ({
      ...s,
      elements: s.elements.map((e) => (e.id === selectedElementId ? { ...e, seats } : e)),
    }));
  }

  const elementNumbers = Object.fromEntries(
    scene.elements.filter((e) => e.number != null).map((e) => [e.id, e.number])
  );

  function assignNumber(elementId) {
    if (!elementId) return;
    const nextNumber = Math.max(0, ...scene.elements.map((e) => e.number || 0)) + 1;
    apply((s) => updateElement(s, elementId, { number: nextNumber }));
  }

  function updateElementFields(elementId, patch) {
    apply((s) => updateElement(s, elementId, patch));
  }

  function clearNumber(elementId) {
    apply((s) => updateElement(s, elementId, { number: undefined, name: undefined, description: undefined }));
  }

  // Backs the canvas double-click popup (CanvasStage.jsx) — same
  // name/description fields the Item Notes list already edits, so both
  // are just two views onto the same element. Auto-assigns the next
  // number in the same apply() call (one undo step) if this element
  // didn't have one yet, exactly like using the list's own "+ Add Note
  // for Selected Item" button does — using the popup is what makes an
  // item show up in the list, not a separate step.
  const elementContent = Object.fromEntries(
    scene.elements.filter((e) => e.name || e.description).map((e) => [e.id, { name: e.name, description: e.description }])
  );

  function updateElementContent(elementId, { name, description }) {
    apply((s) => {
      const el = s.elements.find((e) => e.id === elementId);
      const patch = { name, description };
      if (el && el.number == null) patch.number = Math.max(0, ...s.elements.map((e) => e.number || 0)) + 1;
      return updateElement(s, elementId, patch);
    });
  }

  return (
    <div className="flex-1 min-w-0">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" onClick={undo} disabled={!canUndo} data-testid="floorplan-undo-button" className={toolbarButtonClass}>Undo</button>
        <button type="button" onClick={redo} disabled={!canRedo} data-testid="floorplan-redo-button" className={toolbarButtonClass}>Redo</button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button type="button" onClick={() => setMode('select')} className={`${toolbarButtonClass} ${mode === 'select' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Select</button>
        <button type="button" onClick={() => setMode('draw')} className={`${toolbarButtonClass} ${mode === 'draw' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Draw</button>
        <button type="button" onClick={() => setMode('arrow')} data-testid="floorplan-arrow-button" className={`${toolbarButtonClass} ${mode === 'arrow' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Arrow</button>
        <button type="button" onClick={() => setMode('note')} data-testid="floorplan-note-button" className={`${toolbarButtonClass} ${mode === 'note' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Add Note</button>
        <button type="button" onClick={() => setMode('text')} data-testid="floorplan-text-button" className={`${toolbarButtonClass} ${mode === 'text' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Add Text</button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button type="button" onClick={() => rotateSelected(-15)} disabled={!selectedElementId} data-testid="floorplan-rotate-left-button" className={toolbarButtonClass} title="Rotate left 15°">⟲</button>
        <button type="button" onClick={() => rotateSelected(15)} disabled={!selectedElementId} data-testid="floorplan-rotate-right-button" className={toolbarButtonClass} title="Rotate right 15°">⟳</button>
        {selectedElement && SEATABLE_TABLE_IDS.has(selectedElement.iconId) && (
          <>
            <div className="w-px h-6 bg-slate-200 mx-1" />
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              Seats
              <input
                type="number"
                min="0"
                value={selectedElement.seats ?? ''}
                onChange={(e) => updateSelectedSeats(e.target.value === '' ? undefined : Number(e.target.value))}
                data-testid="floorplan-seats-input"
                className="w-16 px-2 py-1 rounded border border-slate-300 text-sm"
              />
            </label>
          </>
        )}
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button type="button" onClick={handleDeleteSelected} disabled={!selectedElementId && !selectedAnnotationId && !selectedStrokeId} data-testid="floorplan-delete-selected-button" className={`${toolbarButtonClass} border-red-300 text-red-600`}>Delete Selected</button>
        <span data-testid="floorplan-save-status" className="text-xs text-slate-400 ml-auto">
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Unsaved changes' : 'Saved'}
        </span>
      </div>

      <div className="flex flex-wrap gap-4">
        {/* Palette+canvas kept together with a min-width matching their
            fixed-size content (Konva's Stage canvas doesn't shrink below
            its own width={820}) so the number list below wraps to its own
            row instead of squeezing/overlapping the canvas on narrower
            viewports. */}
        <div className="flex gap-4 min-w-[1028px]">
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

            <FloorPlanItemList elements={scene.elements} />
          </div>

          <CanvasStage
            scene={scene}
            onMutate={apply}
            onAdjust={replaceCurrent}
            mode={mode}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
            selectedAnnotationId={selectedAnnotationId}
            onSelectAnnotation={setSelectedAnnotationId}
            selectedStrokeId={selectedStrokeId}
            onSelectStroke={setSelectedStrokeId}
            stageRef={stageRef}
            width={820}
            height={580}
            iconRegistry={FLOOR_PLAN_ICONS}
            elementNumbers={elementNumbers}
            elementContent={elementContent}
            onUpdateElementContent={updateElementContent}
          />
        </div>

        <FloorPlanNumberList
          elements={scene.elements}
          selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
          onAssignNumber={assignNumber}
          onUpdateElement={updateElementFields}
          onClearNumber={clearNumber}
        />
      </div>
    </div>
  );
}
