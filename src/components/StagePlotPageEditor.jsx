import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import CanvasStage from '../lib/canvasEngine/CanvasStage';
import { useUndoRedo } from '../lib/canvasEngine/history';
import { createEmptyScene, deleteElement, deleteAnnotation, deleteStroke, addLayer, updateLayer } from '../lib/canvasEngine/sceneModel';
import { scaleFromCalibration } from '../lib/canvasEngine/measurement';
import { STAGE_PLOT_ICON_LIST, STAGE_PLOT_ICONS } from '../lib/canvasEngine/stagePlotIcons';
import { saveStagePlotPage } from '../lib/stagePlots';
import CanvasIconPalette from './CanvasIconPalette';

const AUTOSAVE_DELAY_MS = 2000;
const toolbarButtonClass = 'px-3 py-1.5 rounded-lg border border-slate-300 text-sm disabled:opacity-40';

// The saved thumbnail (shown on the page tab AND embedded in the exported
// PDF) has to be the whole stage plot, not whatever's in the viewport when
// autosave happens to fire — the zoom controls make it easy to be zoomed
// in on a detail at that moment. Snapping the Konva stage back to its
// default view, capturing, then restoring is synchronous (no await between
// reset and restore), so the on-screen view never visibly jumps for the
// person still editing.
function captureCleanThumbnail(stage) {
  const originalScale = stage.scale();
  const originalPosition = stage.position();
  stage.scale({ x: 1, y: 1 });
  stage.position({ x: 0, y: 0 });
  stage.batchDraw();
  const dataUrl = stage.toDataURL({ pixelRatio: 1 });
  stage.scale(originalScale);
  stage.position(originalPosition);
  stage.batchDraw();
  return dataUrl;
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

// Owns one page's live editing session: undo/redo history, debounced
// autosave, and the toolbar/palette/canvas around it. Mounted fresh (via
// `key={page.id}` in StagePlotEditorPage) on every page switch so each
// page gets its own isolated undo/redo stack, never a shared/bleeding one.
//
// forwardRef + a `flush()` handle exist for exactly one caller: deleting
// this page. The server's orphaned-channel cleanup on page delete
// (stagePlots.js) reads the page's *saved* scene to find which elements
// lived on it — but autosave is debounced up to 2s behind the live edit,
// so deleting a page right after placing an icon on it could race a save
// that hasn't landed yet, leaving that icon's channel un-cleaned. Flushing
// on demand before the delete request closes that window.
const StagePlotPageEditor = forwardRef(function StagePlotPageEditor({ eventId, page, onSaved, selectedElementId, onSelectElement, onElementDeleted, onElementAdded, elementNumbers, elementContent, onUpdateElementContent }, ref) {
  const initialScene = page.scene && Object.keys(page.scene).length > 0 ? page.scene : createEmptyScene();
  const { scene, apply, replaceCurrent, undo, redo, canUndo, canRedo } = useUndoRedo(initialScene);
  const [mode, setMode] = useState('select');
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);
  const [selectedStrokeId, setSelectedStrokeId] = useState(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState(() => new Set());
  const [pendingIconId, setPendingIconId] = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved');
  const stageRef = useRef(null);
  const canvasApiRef = useRef(null);
  const saveTimer = useRef(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const persist = useCallback(async () => {
    setSaveStatus('saving');
    try {
      const thumbnailBase64 = stageRef.current ? captureCleanThumbnail(stageRef.current) : undefined;
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

  useImperativeHandle(ref, () => ({
    flush: () => { clearTimeout(saveTimer.current); return persistRef.current(); },
  }), []);

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

  // Wraps the raw onSelectElement prop with shift-click multi-select:
  // shift+click toggles an icon in/out of multiSelectedIds (also making it
  // the "primary" selection, so the single-node Transformer and the ⟲/⟳
  // buttons still target it); a plain click clears any multi-selection and
  // behaves exactly as before.
  //
  // The first shift-click after a plain click seeds the set with whatever
  // was already the lone selection — otherwise "click A, then shift-click
  // B, then shift-click C" would only ever bulk-act on {B, C}, silently
  // dropping A even though it's still visibly selected.
  function handleSelectElement(id, shiftKey) {
    if (shiftKey && id) {
      setMultiSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.size === 0 && selectedElementId && selectedElementId !== id) next.add(selectedElementId);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      onSelectElement(id);
      return;
    }
    setMultiSelectedIds(new Set());
    onSelectElement(id);
  }

  function handleDeleteSelected() {
    if (multiSelectedIds.size > 0) {
      const ids = [...multiSelectedIds];
      for (const id of ids) onElementDeleted?.(id);
      apply((s) => ids.reduce((acc, id) => deleteElement(acc, id), s));
      setMultiSelectedIds(new Set());
      onSelectElement(null);
      return;
    }
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
    const ids = multiSelectedIds.size > 0 ? [...multiSelectedIds] : selectedElementId ? [selectedElementId] : [];
    if (!ids.length) return;
    const idSet = new Set(ids);
    apply((s) => ({
      ...s,
      elements: s.elements.map((e) => (idSet.has(e.id) ? { ...e, rotation: (e.rotation + delta + 360) % 360 } : e)),
    }));
  }

  // Clones whichever selection is active (multi, or the single selected
  // icon) with a small offset so the copies land visibly apart from their
  // originals rather than stacked exactly on top of them, then arms the new
  // copies as the selection — ready to be dragged into place immediately.
  //
  // onElementAdded calls are awaited one at a time, not fired in parallel —
  // the server assigns each new channel's number as "current max + 1" from
  // a fresh read, so overlapping requests can both read the same max and
  // then collide on the same number (a 409 the server's create route
  // doesn't even catch, so it surfaced as a raw 500). Sequential awaits
  // guarantee each request sees the previous one's channel already
  // committed.
  async function handleDuplicateSelected() {
    const ids = multiSelectedIds.size > 0 ? [...multiSelectedIds] : selectedElementId ? [selectedElementId] : [];
    if (!ids.length) return;
    const idSet = new Set(ids);
    // Clones are computed here, outside apply()'s updater, and only
    // written into the scene below — apply()'s updater must stay a pure
    // function of its input with no outside side effects, since StrictMode
    // deliberately invokes it twice in development to catch exactly this
    // (an earlier version pushed into `newElements` from inside the
    // updater, silently doubling every duplicate).
    const clones = scene.elements.filter((e) => idSet.has(e.id)).map((e, i) => ({
      ...e,
      id: `el_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6)}_${i}`,
      x: e.x + 24,
      y: e.y + 24,
    }));
    apply((s) => ({ ...s, elements: [...s.elements, ...clones] }));
    for (const el of clones) {
      // eslint-disable-next-line no-await-in-loop
      await onElementAdded?.(el);
    }
    setMultiSelectedIds(new Set(clones.map((e) => e.id)));
    onSelectElement(clones[clones.length - 1]?.id || null);
  }

  // Tapping a palette icon arms it for click-to-place — the touch-friendly
  // alternative to dragging, since native HTML5 drag-and-drop (the only
  // other way to place an icon) doesn't exist on touch devices at all.
  function handleIconTap(iconId) {
    setPendingIconId(iconId);
    setMode('place-icon');
  }

  // CanvasStage reports the two calibration points + the real-world
  // distance the user typed; scaleFromCalibration (measurement.js) turns
  // that into a pixels-per-unit value, same math a "click two points, tell
  // me the distance" CAD tool uses. Scene-setting change, not an
  // undo-worthy edit — same as the plain "Pixels per ft" input below.
  function handleCalibrate(pointA, pointB, distance) {
    const newScale = scaleFromCalibration(pointA, pointB, distance);
    if (newScale) replaceCurrent((s) => ({ ...s, scalePxPerUnit: newScale }));
    setMode('select');
  }

  // Delete/Backspace deletes whatever's selected; Cmd/Ctrl+Z undoes;
  // Cmd/Ctrl+Shift+Z (or Cmd/Ctrl+Y) redoes; Escape backs out of
  // place-icon/calibrate mode and clears any multi-selection. Skipped
  // entirely while focus is in a text field — otherwise deleting a
  // character in the Scale input or the channel Notes textarea would also
  // delete the selected icon.
  useEffect(() => {
    function handleKeyDown(e) {
      if (isTypingTarget(e.target)) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (multiSelectedIds.size > 0 || selectedElementId || selectedAnnotationId || selectedStrokeId) {
          e.preventDefault();
          handleDeleteSelected();
        }
        return;
      }
      if (e.key === 'Escape') {
        setMode('select');
        setPendingIconId(null);
        setMultiSelectedIds(new Set());
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementId, selectedAnnotationId, selectedStrokeId, multiSelectedIds, undo, redo]);

  return (
    // No flex-1/min-w-0 here on purpose: those let this shrink below the
    // palette+canvas row's own natural width, which squeezed the canvas
    // into wrapping below the (now much taller) palette instead of the
    // *intended* reflow — the I/O List (StagePlotEditorPage.jsx's own
    // flex-wrap row) dropping to its own line first. Leaving this as a
    // plain block keeps its default min-width:auto, so the browser wraps
    // the I/O List away before it ever squeezes this.
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3 overflow-x-auto">
        <button type="button" onClick={undo} disabled={!canUndo} data-testid="stageplot-undo-button" className={toolbarButtonClass}>Undo</button>
        <button type="button" onClick={redo} disabled={!canRedo} data-testid="stageplot-redo-button" className={toolbarButtonClass}>Redo</button>
        <button
          type="button"
          onClick={() => canvasApiRef.current?.fitToContent()}
          data-testid="stageplot-center-all-button"
          title="Zoom and pan to fit everything on the page in view"
          className={toolbarButtonClass}
        >
          Center All
        </button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button type="button" onClick={() => setMode('select')} className={`${toolbarButtonClass} ${mode === 'select' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Select</button>
        <button type="button" onClick={() => setMode('draw')} className={`${toolbarButtonClass} ${mode === 'draw' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Draw</button>
        <button type="button" onClick={() => setMode('arrow')} data-testid="stageplot-arrow-button" className={`${toolbarButtonClass} ${mode === 'arrow' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Arrow</button>
        <button type="button" onClick={() => setMode('note')} data-testid="stageplot-note-button" className={`${toolbarButtonClass} ${mode === 'note' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Add Note</button>
        <button type="button" onClick={() => setMode('text')} data-testid="stageplot-text-button" className={`${toolbarButtonClass} ${mode === 'text' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Add Text</button>
        <button type="button" onClick={() => setMode('calibrate')} data-testid="stageplot-calibrate-button" title="Click two points a known distance apart to set the scale" className={`${toolbarButtonClass} ${mode === 'calibrate' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Set Scale</button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button type="button" onClick={() => rotateSelected(-15)} disabled={!selectedElementId && multiSelectedIds.size === 0} data-testid="stageplot-rotate-left-button" className={toolbarButtonClass} title="Rotate left 15°">⟲</button>
        <button type="button" onClick={() => rotateSelected(15)} disabled={!selectedElementId && multiSelectedIds.size === 0} data-testid="stageplot-rotate-right-button" className={toolbarButtonClass} title="Rotate right 15°">⟳</button>
        <button type="button" onClick={handleDuplicateSelected} disabled={!selectedElementId && multiSelectedIds.size === 0} data-testid="stageplot-duplicate-button" className={toolbarButtonClass} title="Duplicate selected (Cmd/Ctrl+Z to undo)">Duplicate</button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button
          type="button"
          onClick={handleDeleteSelected}
          disabled={multiSelectedIds.size === 0 && !selectedElementId && !selectedAnnotationId && !selectedStrokeId}
          data-testid="stageplot-delete-selected-button"
          className={`${toolbarButtonClass} border-red-300 text-red-600`}
        >
          Delete Selected{multiSelectedIds.size > 1 ? ` (${multiSelectedIds.size})` : ''}
        </button>
        <span data-testid="stageplot-save-status" className="text-xs text-slate-400 ml-auto">
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Unsaved changes' : 'Saved'}
        </span>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="w-44 shrink-0 space-y-4">
          <CanvasIconPalette
            icons={STAGE_PLOT_ICON_LIST}
            title="Gear"
            testIdPrefix="stageplot-icon"
            onIconTap={handleIconTap}
            activeIconId={mode === 'place-icon' ? pendingIconId : null}
          />

          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2">Scale</div>
            <label className="block text-[11px] text-slate-400 mb-1">Pixels per {scene.unit}</label>
            <input
              type="number"
              value={scene.scalePxPerUnit}
              onChange={(e) => replaceCurrent((s) => ({ ...s, scalePxPerUnit: Number(e.target.value) || 1 }))}
              className="w-full px-2 py-1 rounded border border-slate-300 text-sm"
            />
            <p className="text-[11px] text-slate-400 mt-1">Or use "Set Scale" above to calibrate from two points.</p>
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

        <div className="overflow-x-auto max-w-full">
          <CanvasStage
            ref={canvasApiRef}
            scene={scene}
            onMutate={apply}
            onAdjust={replaceCurrent}
            mode={mode}
            selectedElementId={selectedElementId}
            onSelectElement={handleSelectElement}
            multiSelectedIds={multiSelectedIds}
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
            pendingIconId={pendingIconId}
            onCalibrate={handleCalibrate}
          />
        </div>
      </div>
    </div>
  );
});

export default StagePlotPageEditor;
