// Screen pixels, not scene units — converted per-call via /zoom so the snap
// feels the same size on screen regardless of how zoomed in/out the canvas
// currently is.
export const SNAP_THRESHOLD_PX = 8;

// Once engaged, a guide needs roughly twice the normal distance to let go —
// without this, a raw mouse position that happens to hover exactly on a
// threshold boundary (completely normal given real pointer input is never
// perfectly still) flips the snap on and off every other frame, which reads
// as the guide line (and the icon snapped to it) visibly flickering.
// Engaging a *different* candidate than the one already active still uses
// the normal threshold, so hysteresis only makes leaving harder, never
// makes grabbing a new guide easier.
const RELEASE_MULTIPLIER = 2;

function nearestWithin(value, candidates, threshold, stickyCandidate) {
  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = Math.abs(value - c);
    const effectiveThreshold = stickyCandidate != null && c === stickyCandidate ? threshold * RELEASE_MULTIPLIER : threshold;
    if (dist <= effectiveThreshold && dist < bestDist) { bestDist = dist; best = c; }
  }
  return best;
}

// Where a dragged icon's center (already in scene units) should actually
// land, and which guide line(s) to show for it — snapping independently
// per axis against the stage's own center and every other icon's center,
// whichever candidate is nearest and within the threshold. An icon dropped
// right next to center lands exactly on it; dropped further away, nothing
// snaps and it stays wherever it was actually placed. `previousGuides` (the
// same shape this function returns, from the prior call in the same drag
// gesture) is what the hysteresis above keys off of — pass
// `{ vertical: null, horizontal: null }` for a fresh drag.
export function computeDragSnap({ x, y }, otherElements, stageCenter, thresholdScene, previousGuides = { vertical: null, horizontal: null }) {
  const xCandidates = [stageCenter.x, ...otherElements.map((e) => e.x)];
  const yCandidates = [stageCenter.y, ...otherElements.map((e) => e.y)];
  const snappedX = nearestWithin(x, xCandidates, thresholdScene, previousGuides.vertical);
  const snappedY = nearestWithin(y, yCandidates, thresholdScene, previousGuides.horizontal);
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

// A gap this big between two consecutive icons (already sorted along one
// axis) means "these are two different things," not "these are the same
// row/cluster placed a little unevenly" — e.g. a monitor wedge at stage
// left and one at stage right, with the performer's own footprint empty
// between them. Below it, two icons count as neighbors in the same cluster.
// Expressed as a multiple of icon size (rather than a fixed scene-unit
// number) so it scales sensibly if ICON_SIZE(the caller's own icon
// footprint) is ever tuned.
const ROW_GAP_ICON_MULTIPLE = 1.35;
const CLUSTER_GAP_ICON_MULTIPLE = 3;
// The floor on center-to-center spacing after redistribution — a little
// more than exact edge-to-edge touching (icons are ICON_SIZE square) so
// leveled/spaced icons read as separate symbols instead of visually
// overlapping. This is what actually prevents the "extreme" overlap a pure
// endpoints-stay redistribution could produce: cramming several icons into
// whatever (possibly narrow) span they happened to already occupy.
const MIN_SPACING_ICON_MULTIPLE = 1.2;

// Greedy 1D clustering along one axis: sort by that axis, then start a new
// cluster whenever the gap to the previous item exceeds threshold — the
// same "gap means different group" idea used for both passes below (rows
// by Y, then left/right sub-groups within a row by X), just parameterized
// by axis and threshold so one function serves both.
function clusterByGap(items, axis, threshold) {
  const sorted = items.slice().sort((a, b) => a[axis] - b[axis]);
  const clusters = [];
  let current = [];
  for (const item of sorted) {
    if (current.length && item[axis] - current[current.length - 1][axis] > threshold) {
      clusters.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length) clusters.push(current);
  return clusters;
}

// Levels a cluster to one shared Y (its own average) and spaces its members
// along X — centered on where they already were, but never closer together
// than minSpacing. A cluster whose members were already spread out further
// than that keeps its original spacing exactly (this only ever pulls icons
// apart to fix overlap/crowding, never pushes an already-comfortable
// cluster wider). Handles 2 and 3+ uniformly: with 2, there's one gap and
// this either leaves it alone or opens it up to minSpacing; the "no
// redistribution under 3" rule that manual distributeElements documents
// doesn't apply here, since auto-align's whole job is readability, not
// preserving a user's own deliberate two-point spacing.
function levelAndSpaceCluster(cluster, minSpacing) {
  const avgY = cluster.reduce((sum, e) => sum + e.y, 0) / cluster.length;
  const sorted = cluster.slice().sort((a, b) => a.x - b.x);
  const first = sorted[0].x;
  const last = sorted[sorted.length - 1].x;
  const naturalStep = (last - first) / (sorted.length - 1);
  const step = Math.max(naturalStep, minSpacing);
  const newFirst = (first + last) / 2 - (step * (sorted.length - 1)) / 2;
  return sorted.map((e, i) => ({ id: e.id, x: newFirst + step * i, y: avgY }));
}

// The one-click "neaten everything up" pass: only ever aligns icons of the
// same type with each other — a row of monitor wedges shouldn't snap to a
// nearby mic or line array just because it's spatially close, since mixing
// unrelated gear into one "row" is exactly what reads as illegible instead
// of tidy. Within each type, icons are grouped into rows by how close their
// Y positions already are, then each row split into left/right (or however
// many) sub-groups wherever there's a real gap along X, so two clusters of
// the same icon that happen to sit at a similar stage depth (monitor
// wedges flanking either side of the stage, say) don't get merged into one
// long row spanning the dead space between them. Each resulting cluster of
// 2+ gets leveled and spaced — see levelAndSpaceCluster above.
//
// `iconSize` is the caller's fixed on-screen icon footprint (in scene
// units) — every threshold below scales off it so this reads sensibly
// whether the canvas is a tight cluster of small icons or a sparse plot of
// bigger ones. `isLinear(element)` excludes runs (cable ramp, truss, drape)
// that have their own length/width semantics — moving their x/y like a
// point icon would silently displace one end of a real physical run.
export function autoAlignAll(elements, iconSize, isLinear) {
  const candidates = elements.filter((e) => !isLinear?.(e));
  if (candidates.length < 2) return elements;

  const byType = new Map();
  for (const e of candidates) {
    if (!byType.has(e.iconId)) byType.set(e.iconId, []);
    byType.get(e.iconId).push(e);
  }

  const updates = new Map();
  for (const group of byType.values()) {
    if (group.length < 2) continue;
    const rows = clusterByGap(group, 'y', iconSize * ROW_GAP_ICON_MULTIPLE);
    for (const row of rows) {
      if (row.length < 2) continue;
      const subClusters = clusterByGap(row, 'x', iconSize * CLUSTER_GAP_ICON_MULTIPLE);
      for (const cluster of subClusters) {
        if (cluster.length < 2) continue;
        for (const placed of levelAndSpaceCluster(cluster, iconSize * MIN_SPACING_ICON_MULTIPLE)) {
          updates.set(placed.id, { x: placed.x, y: placed.y });
        }
      }
    }
  }
  if (!updates.size) return elements;
  return elements.map((e) => (updates.has(e.id) ? { ...e, ...updates.get(e.id) } : e));
}
