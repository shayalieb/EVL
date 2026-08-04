import { useRef, useState } from 'react';
import CanvasStage from '../../lib/canvasEngine/CanvasStage';
import { useUndoRedo } from '../../lib/canvasEngine/history';
import { createEmptyScene, deleteElement, addLayer, updateLayer } from '../../lib/canvasEngine/sceneModel';
import { formatMeasurement } from '../../lib/canvasEngine/measurement';

// Internal-only validation page for the shared canvas engine
// (src/lib/canvasEngine/) — not linked in nav, gated to platform admins in
// App.jsx. Exists purely to prove drag-from-palette placement, pan/zoom,
// select/move/resize/rotate, freehand drawing, layers, scale, undo/redo,
// and PNG export all work together before either Stage Plot or Floor Plan
// builds real UI on top of this engine. Placeholder icon set — real
// gear/furniture icons are a separate, later content decision.
const DEMO_ICONS = ['Table', 'Chair', 'Mic', 'Amp', 'Monitor', 'Tent'];

export default function CanvasEngineDemoPage() {
  const { scene, apply, replaceCurrent, undo, redo, canUndo, canRedo } = useUndoRedo(createEmptyScene());
  const [mode, setMode] = useState('select');
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [exportedPngUrl, setExportedPngUrl] = useState(null);
  const stageRef = useRef(null);

  function handleExportPng() {
    const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 });
    setExportedPngUrl(dataUrl);
  }

  function handleDeleteSelected() {
    if (!selectedElementId) return;
    apply((s) => deleteElement(s, selectedElementId));
    setSelectedElementId(null);
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <h1 className="text-lg font-bold text-slate-800 mb-1">Canvas Engine Demo (internal)</h1>
      <p className="text-sm text-slate-500 mb-4">
        Drag an icon onto the canvas, then click it to resize/rotate via the transform handles. Not a real product page.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" onClick={undo} disabled={!canUndo} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm disabled:opacity-40">Undo</button>
        <button type="button" onClick={redo} disabled={!canRedo} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm disabled:opacity-40">Redo</button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button type="button" onClick={() => setMode('select')} className={`px-3 py-1.5 rounded-lg border text-sm ${mode === 'select' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300'}`}>Select</button>
        <button type="button" onClick={() => setMode('draw')} className={`px-3 py-1.5 rounded-lg border text-sm ${mode === 'draw' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300'}`}>Freehand Draw</button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button type="button" onClick={handleDeleteSelected} disabled={!selectedElementId} className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 text-sm disabled:opacity-40">Delete Selected</button>
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button type="button" onClick={handleExportPng} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm">Export PNG</button>
      </div>

      <div className="flex gap-4">
        <div className="w-48 shrink-0 space-y-4">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2">Icon Palette</div>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO_ICONS.map((iconId) => (
                <div
                  key={iconId}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/x-canvas-icon', iconId)}
                  className="px-2 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs text-center cursor-grab select-none"
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
              className="w-full px-2 py-1 rounded border border-slate-300 text-sm mb-2"
            />
            <label className="block text-[11px] text-slate-400 mb-1">Grid spacing ({scene.unit})</label>
            <input
              type="number"
              value={scene.gridSpacing}
              onChange={(e) => replaceCurrent((s) => ({ ...s, gridSpacing: Number(e.target.value) || 1 }))}
              className="w-full px-2 py-1 rounded border border-slate-300 text-sm"
            />
            <div className="text-[11px] text-slate-400 mt-1">Grid line = {formatMeasurement(scene.gridSpacing, scene.unit)}</div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2">Layers</div>
            <div className="space-y-1">
              {scene.layers.map((layer) => (
                <label key={layer.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={layer.visible}
                    onChange={(e) => apply((s) => updateLayer(s, layer.id, { visible: e.target.checked }))}
                  />
                  {layer.name}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => apply((s) => addLayer(s))}
              className="mt-2 text-xs font-semibold text-indigo-600"
            >
              + Add layer
            </button>
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
        />
      </div>

      {exportedPngUrl && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-slate-500 mb-2">Exported PNG</div>
          <img src={exportedPngUrl} alt="Exported canvas" className="border border-slate-200 rounded-lg max-w-full" />
        </div>
      )}
    </div>
  );
}
