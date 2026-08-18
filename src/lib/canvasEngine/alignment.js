// Screen pixels, not scene units — converted per-call via /zoom so the snap
// feels the same size on screen regardless of how zoomed in/out the canvas
// currently is.
export const SNAP_THRESHOLD_PX = 8;

function nearestWithin(value, candidates, threshold) {
  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = Math.abs(value - c);
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  return best !== null && bestDist <= threshold ? best : null;
}

// Where a dragged icon's center (already in scene units) should actually
// land, and which guide line(s) to show for it — snapping independently
// per axis against the stage's own center and every other icon's center,
// whichever candidate is nearest and within the threshold. An icon dropped
// right next to center lands exactly on it; dropped further away, nothing
// snaps and it stays wherever it was actually placed.
export function computeDragSnap({ x, y }, otherElements, stageCenter, thresholdScene) {
  const xCandidates = [stageCenter.x, ...otherElements.map((e) => e.x)];
  const yCandidates = [stageCenter.y, ...otherElements.map((e) => e.y)];
  const snappedX = nearestWithin(x, xCandidates, thresholdScene);
  const snappedY = nearestWithin(y, yCandidates, thresholdScene);
  return {
    pos: { x: snappedX ?? x, y: snappedY ?? y },
    guides: { vertical: snappedX, horizontal: snappedY },
  };
}

function selectionBounds(elements, idSet) {
  const selected = elements.filter((e) => idSet.has(e.id));
  const xs = selected.map((e) => e.x);
  const ys = selected.map((e) => e.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// Every icon on this canvas shares the same fixed on-screen size (no true
// per-icon bounding box to speak of beyond scale, which isn't exposed as a
// toolbar control) — so "align" here means center-to-center, the same unit
// smart-guide snapping already aligns by, rather than true edge alignment.
export function alignElementsCenter(elements, ids, axis) {
  const idSet = new Set(ids);
  const { minX, maxX, minY, maxY } = selectionBounds(elements, idSet);
  const target = axis === 'x' ? (minX + maxX) / 2 : (minY + maxY) / 2;
  return elements.map((e) => (idSet.has(e.id) ? { ...e, [axis]: target } : e));
}

// Spaces the selected icons evenly between whichever of them is already
// furthest in each direction — the two endpoints stay put, everything
// between gets an equal gap. Meaningless (a no-op) under three icons, since
// there's nothing to redistribute between two fixed endpoints.
export function distributeElements(elements, ids, axis) {
  const idSet = new Set(ids);
  const selected = elements.filter((e) => idSet.has(e.id)).slice().sort((a, b) => a[axis] - b[axis]);
  if (selected.length < 3) return elements;
  const first = selected[0][axis];
  const last = selected[selected.length - 1][axis];
  const step = (last - first) / (selected.length - 1);
  const targets = new Map(selected.map((e, i) => [e.id, first + step * i]));
  return elements.map((e) => (targets.has(e.id) ? { ...e, [axis]: targets.get(e.id) } : e));
}

// Shifts the whole selection by one delta so its bounding-box center lands
// on the stage's center — a single selected icon lands exactly on center
// (its own position IS the bounding box), while a multi-selection keeps its
// relative arrangement and just moves the group into the middle, rather
// than collapsing every icon on top of each other at one point.
export function centerElementsOnStage(elements, ids, stageCenter) {
  const idSet = new Set(ids);
  const { minX, maxX, minY, maxY } = selectionBounds(elements, idSet);
  const dx = stageCenter.x - (minX + maxX) / 2;
  const dy = stageCenter.y - (minY + maxY) / 2;
  return elements.map((e) => (idSet.has(e.id) ? { ...e, x: e.x + dx, y: e.y + dy } : e));
}
