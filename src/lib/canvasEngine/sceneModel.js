// The portable, app-owned scene shape both Stage Plot and Floor Plan pages
// build on — deliberately NOT Konva's own node/serialization format (which
// carries a lot of Konva-internal shape config we don't want persisted or
// diffed). CanvasStage.jsx renders this shape into react-konva components;
// it never flows the other direction.
//
// A scene is one page's worth of content:
// {
//   paperSize: 'letter' | 'tabloid' | 'a4',
//   unit: 'ft' | 'in',
//   scalePxPerUnit: number,   // how many on-screen px = one `unit`
//   gridSpacing: number,      // grid line interval, in `unit`
//   layers: [{ id, name, visible, locked }],
//   elements: [{ id, layerId, iconId, x, y, rotation, scaleX, scaleY, label }],
//   strokes: [{ id, layerId, points: [x, y, x, y, ...], color, strokeWidth }],
//   annotations: [{ id, layerId, x, y, text }],
// }

let counter = 0;
// Timestamp+counter rather than crypto.randomUUID() — this only needs to be
// unique within one open editor session (scenes aren't merged across
// sessions), and stays trivially readable in devtools while debugging.
function sceneId(prefix) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

const DEFAULT_LAYER_ID = 'layer_default';

export function createEmptyScene({ unit = 'ft', paperSize = 'letter', scalePxPerUnit = 20, gridSpacing = 5 } = {}) {
  return {
    paperSize,
    unit,
    scalePxPerUnit,
    gridSpacing,
    layers: [{ id: DEFAULT_LAYER_ID, name: 'Layer 1', visible: true, locked: false }],
    elements: [],
    strokes: [],
    annotations: [],
  };
}

export function addElement(scene, { iconId, x, y, rotation = 0, scaleX = 1, scaleY = 1, label = '', layerId }) {
  const element = {
    id: sceneId('el'),
    layerId: layerId || scene.layers[0]?.id || DEFAULT_LAYER_ID,
    iconId, x, y, rotation, scaleX, scaleY, label,
  };
  return { ...scene, elements: [...scene.elements, element] };
}

export function updateElement(scene, id, patch) {
  return { ...scene, elements: scene.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)) };
}

export function moveElement(scene, id, { x, y }) {
  return updateElement(scene, id, { x, y });
}

export function deleteElement(scene, id) {
  return { ...scene, elements: scene.elements.filter((el) => el.id !== id) };
}

export function addStroke(scene, { points, color = '#1e293b', strokeWidth = 2, layerId }) {
  const stroke = { id: sceneId('stroke'), layerId: layerId || scene.layers[0]?.id || DEFAULT_LAYER_ID, points, color, strokeWidth };
  return { ...scene, strokes: [...scene.strokes, stroke] };
}

export function deleteStroke(scene, id) {
  return { ...scene, strokes: scene.strokes.filter((s) => s.id !== id) };
}

export function addAnnotation(scene, { x, y, text = '', layerId }) {
  const annotation = { id: sceneId('note'), layerId: layerId || scene.layers[0]?.id || DEFAULT_LAYER_ID, x, y, text };
  return { ...scene, annotations: [...scene.annotations, annotation] };
}

export function updateAnnotation(scene, id, patch) {
  return { ...scene, annotations: scene.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)) };
}

export function deleteAnnotation(scene, id) {
  return { ...scene, annotations: scene.annotations.filter((a) => a.id !== id) };
}

export function addLayer(scene, name) {
  const layer = { id: sceneId('layer'), name: name || `Layer ${scene.layers.length + 1}`, visible: true, locked: false };
  return { ...scene, layers: [...scene.layers, layer] };
}

export function updateLayer(scene, id, patch) {
  return { ...scene, layers: scene.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

// Deleting a layer reassigns its contents to the first remaining layer
// rather than deleting them — losing placed elements as a side effect of a
// layer cleanup would be a nasty surprise, and every scene always has at
// least one layer (the default), so there's always somewhere for them to go.
export function deleteLayer(scene, id) {
  const remaining = scene.layers.filter((l) => l.id !== id);
  if (remaining.length === scene.layers.length || remaining.length === 0) return scene;
  const fallbackId = remaining[0].id;
  const reassign = (item) => (item.layerId === id ? { ...item, layerId: fallbackId } : item);
  return {
    ...scene,
    layers: remaining,
    elements: scene.elements.map(reassign),
    strokes: scene.strokes.map(reassign),
    annotations: scene.annotations.map(reassign),
  };
}

export function serializeScene(scene) {
  return JSON.stringify(scene);
}

export function deserializeScene(json) {
  return JSON.parse(json);
}
