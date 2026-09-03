// Shared visual language every hand-authored icon (stagePlotIcons.js,
// floorPlanIcons.js) is built in — simple top-down symbols, the same
// convention real stage-plot/floor-plan software uses (these are diagrams
// read from above, not illustrations), so a consistent stroke weight reads
// as "one system" rather than a grab-bag of clipart.
// Callers only supply the inner shapes; this wraps them into a complete,
// rasterizable SVG document (see useSvgImage.js).
const STROKE = '#475569'; // slate-600 — Floor Plan's default, and Stage Plot's neutral (staging/seating/utility) categories
export const ICON_FILL = '#e2e8f0'; // slate-200, for solid/filled areas (tabletops, tent canopy, etc.)

// `stroke`/`fill` are optional overrides — every existing `icon(inner)` call
// (Floor Plan, and Stage Plot's neutral categories) keeps rendering exactly
// as before (no fill, slate-600 outline); Stage Plot's colorized categories
// pass a category color pair instead. Only the wrapper's paint attributes
// change — the hand-authored inner shapes are untouched either way.
export function icon(inner, { stroke = STROKE, fill = 'none' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="${fill}" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><style>*{vector-effect:non-scaling-stroke}</style>${inner}</svg>`;
}

// Builds a { id, label, category, svg } lookup map (keyed by id) from a flat
// list — the shape both CanvasStage.jsx (rendering) and the icon palette
// UI (drag source + thumbnail) consume.
export function buildIconMap(list) {
  return Object.fromEntries(list.map((entry) => [entry.id, entry]));
}
