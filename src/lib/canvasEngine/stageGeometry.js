export const DEFAULT_STAGE = {
  width: 40,
  depth: 24,
  x: 48,
  y: 58,
  shape: 'rectangle',
  audienceEdge: 'bottom',
  showGrid: true,
  showCenterLine: true,
  showSafeArea: true,
  safeArea: 2,
};

export const STAGE_PRESETS = [
  { id: 'club', label: 'Small club', width: 24, depth: 16 },
  { id: 'ballroom', label: 'Ballroom', width: 32, depth: 20 },
  { id: 'festival', label: 'Festival', width: 40, depth: 32 },
  { id: 'theater', label: 'Theater', width: 48, depth: 32 },
];

export function stageDefinition(scene) {
  return { ...DEFAULT_STAGE, ...(scene?.stage || {}) };
}

export function stagePixelGeometry(scene) {
  const stage = stageDefinition(scene);
  const scale = Math.max(1, Number(scene?.scalePxPerUnit) || 20);
  return { ...stage, widthPx: stage.width * scale, depthPx: stage.depth * scale, scale };
}

export function convertStageUnits(scene, nextUnit) {
  if (!scene || scene.unit === nextUnit) return scene;
  const metersPerUnit = { in: 0.0254, ft: 0.3048, m: 1 };
  const factor = (metersPerUnit[scene.unit] || 0.3048) / (metersPerUnit[nextUnit] || 0.3048);
  const stage = stageDefinition(scene);
  return {
    ...scene,
    unit: nextUnit,
    scalePxPerUnit: scene.scalePxPerUnit / factor,
    gridSpacing: Math.max(0.25, scene.gridSpacing * factor),
    stage: {
      ...stage,
      width: Math.round(stage.width * factor * 100) / 100,
      depth: Math.round(stage.depth * factor * 100) / 100,
      safeArea: Math.round(stage.safeArea * factor * 100) / 100,
    },
    zones: (scene.zones || []).map((zone) => ({
      ...zone,
      width: Math.round(zone.width * factor * 100) / 100,
      depth: Math.round(zone.depth * factor * 100) / 100,
    })),
  };
}
