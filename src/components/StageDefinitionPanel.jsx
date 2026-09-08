import { useState } from 'react';
import { STAGE_PRESETS, convertStageUnits, stageDefinition } from '../lib/canvasEngine/stageGeometry';

const fieldClass = 'w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700';

function positive(value, fallback = 1) {
  return Math.max(0.25, Number(value) || fallback);
}

export default function StageDefinitionPanel({ scene, onChange }) {
  const [backgroundError, setBackgroundError] = useState('');
  const stage = stageDefinition(scene);
  const zones = scene.zones || [];

  function patchStage(patch) {
    onChange((current) => ({ ...current, stage: { ...stageDefinition(current), ...patch } }));
  }

  function addZone() {
    onChange((current) => ({
      ...current,
      zones: [...(current.zones || []), {
        id: `zone_${Date.now().toString(36)}`,
        name: 'New zone', x: 2, y: 2, width: 8, depth: 6, color: '#c7d2fe',
      }],
    }));
  }

  function patchZone(id, patch) {
    onChange((current) => ({ ...current, zones: (current.zones || []).map((zone) => (zone.id === id ? { ...zone, ...patch } : zone)) }));
  }

  function removeZone(id) {
    onChange((current) => ({ ...current, zones: (current.zones || []).filter((zone) => zone.id !== id) }));
  }

  function loadBackground(file) {
    if (!file) return;
    setBackgroundError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setBackgroundError('Choose a PNG, JPG or WebP image.'); return; }
    if (file.size > 5_000_000) { setBackgroundError('The venue plan must be smaller than 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        let dataUrl = canvas.toDataURL('image/webp', 0.55);
        if (dataUrl.length > 85_000) dataUrl = canvas.toDataURL('image/jpeg', 0.42);
        if (dataUrl.length > 95_000) { setBackgroundError('This plan remains too detailed after optimization. Try a simpler or smaller image.'); return; }
        onChange((current) => ({ ...current, backgroundPlan: { name: file.name, dataUrl, opacity: 0.3 } }));
      };
      image.onerror = () => setBackgroundError('This image could not be read.');
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-4" data-testid="stage-definition-panel">
      <div>
        <div className="text-xs font-semibold text-slate-600 mb-2">Stage</div>
        <select
          value=""
          onChange={(event) => {
            const preset = STAGE_PRESETS.find((item) => item.id === event.target.value);
            if (preset) patchStage({ width: preset.width, depth: preset.depth });
          }}
          className={fieldClass}
          data-testid="stage-preset-select"
        >
          <option value="">Size preset…</option>
          {STAGE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label} — {preset.width}×{preset.depth} ft</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <label className="text-[11px] text-slate-400">Width
            <input type="number" min="1" value={stage.width} onChange={(e) => patchStage({ width: positive(e.target.value, 40) })} className={fieldClass} data-testid="stage-width-input" />
          </label>
          <label className="text-[11px] text-slate-400">Depth
            <input type="number" min="1" value={stage.depth} onChange={(e) => patchStage({ depth: positive(e.target.value, 24) })} className={fieldClass} data-testid="stage-depth-input" />
          </label>
        </div>
        <label className="block text-[11px] text-slate-400 mt-2">Units
          <select value={scene.unit} onChange={(e) => onChange((current) => convertStageUnits(current, e.target.value))} className={fieldClass} data-testid="stage-unit-select">
            {scene.unit === 'in' && <option value="in">Inches</option>}
            <option value="ft">Feet</option>
            <option value="m">Meters</option>
          </select>
        </label>
        <label className="block text-[11px] text-slate-400 mt-2">Stage shape
          <select value={stage.shape} onChange={(e) => patchStage({ shape: e.target.value })} className={fieldClass}>
            <option value="rectangle">Rectangle</option>
            <option value="rounded">Rounded</option>
            <option value="thrust">Thrust stage</option>
          </select>
        </label>
        <label className="block text-[11px] text-slate-400 mt-2">Audience edge
          <select value={stage.audienceEdge} onChange={(e) => patchStage({ audienceEdge: e.target.value })} className={fieldClass} data-testid="stage-audience-edge-select">
            <option value="bottom">Bottom</option><option value="top">Top</option><option value="left">Left</option><option value="right">Right</option>
          </select>
        </label>
        <div className="mt-2 space-y-1 text-xs text-slate-600">
          <label className="flex gap-2"><input type="checkbox" checked={stage.showGrid} onChange={(e) => patchStage({ showGrid: e.target.checked })} /> Measurement grid</label>
          <label className="flex gap-2"><input type="checkbox" checked={stage.showCenterLine} onChange={(e) => patchStage({ showCenterLine: e.target.checked })} /> Center line</label>
          <label className="flex gap-2"><input type="checkbox" checked={stage.showSafeArea} onChange={(e) => patchStage({ showSafeArea: e.target.checked })} /> Print-safe edge</label>
        </div>
        {stage.showSafeArea && <label className="block text-[11px] text-slate-400 mt-2">Safe inset ({scene.unit})
          <input type="number" min="0" step="0.25" value={stage.safeArea} onChange={(e) => patchStage({ safeArea: Math.max(0, Number(e.target.value) || 0) })} className={fieldClass} />
        </label>}
      </div>

      <div>
        <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-600">Zones</span><button type="button" onClick={addZone} className="text-xs font-semibold text-indigo-600">+ Zone</button></div>
        <div className="space-y-2 mt-2">
          {zones.map((zone) => (
            <div key={zone.id} className="rounded border border-slate-200 p-2">
              <div className="flex gap-1"><input value={zone.name} onChange={(e) => patchZone(zone.id, { name: e.target.value })} className={fieldClass} aria-label="Zone name" /><button type="button" onClick={() => removeZone(zone.id)} className="text-red-400" aria-label={`Delete ${zone.name}`}>×</button></div>
              <div className="grid grid-cols-2 gap-1 mt-1">
                <label className="text-[10px] text-slate-400">Width<input type="number" min="0.25" value={zone.width} onChange={(e) => patchZone(zone.id, { width: positive(e.target.value) })} className={fieldClass} aria-label="Zone width" /></label>
                <label className="text-[10px] text-slate-400">Depth<input type="number" min="0.25" value={zone.depth} onChange={(e) => patchZone(zone.id, { depth: positive(e.target.value) })} className={fieldClass} aria-label="Zone depth" /></label>
                <label className="text-[10px] text-slate-400">From left<input type="number" min="0" value={zone.x} onChange={(e) => patchZone(zone.id, { x: Math.max(0, Number(e.target.value) || 0) })} className={fieldClass} aria-label="Zone left position" /></label>
                <label className="text-[10px] text-slate-400">From upstage<input type="number" min="0" value={zone.y} onChange={(e) => patchZone(zone.id, { y: Math.max(0, Number(e.target.value) || 0) })} className={fieldClass} aria-label="Zone upstage position" /></label>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-600 mb-1">Venue plan</div>
        {scene.backgroundPlan ? (
          <>
            <p className="truncate text-[11px] text-slate-500">{scene.backgroundPlan.name}</p>
            <label className="block text-[11px] text-slate-400 mt-1">Opacity
              <input type="range" min="0.05" max="0.8" step="0.05" value={scene.backgroundPlan.opacity || 0.3} onChange={(e) => onChange((current) => ({ ...current, backgroundPlan: { ...current.backgroundPlan, opacity: Number(e.target.value) } }))} className="w-full" />
            </label>
            <button type="button" onClick={() => onChange((current) => ({ ...current, backgroundPlan: null }))} className="text-xs font-semibold text-red-500">Remove plan</button>
          </>
        ) : (
          <label className="block cursor-pointer rounded border border-dashed border-slate-300 p-2 text-center text-[11px] text-slate-500 hover:border-indigo-400">
            Upload image
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => loadBackground(e.target.files?.[0])} className="hidden" data-testid="stage-background-input" />
          </label>
        )}
        <p className="text-[10px] text-slate-400 mt-1">PNG, JPG or WebP up to 5 MB; optimized automatically.</p>
        {backgroundError && <p className="text-[10px] text-red-500 mt-1">{backgroundError}</p>}
      </div>
    </div>
  );
}
