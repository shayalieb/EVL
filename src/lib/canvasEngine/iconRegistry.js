// Shared visual language every hand-authored icon (stagePlotIcons.js,
// floorPlanIcons.js) is built in — simple top-down line-art symbols, the
// same convention real stage-plot/floor-plan software uses (these are
// diagrams read from above, not illustrations), so a consistent stroke
// weight/color reads as "one system" rather than a grab-bag of clipart.
// Callers only supply the inner shapes; this wraps them into a complete,
// rasterizable SVG document (see useSvgImage.js).
const STROKE = '#475569'; // slate-600
export const ICON_FILL = '#e2e8f0'; // slate-200, for solid/filled areas (tabletops, tent canopy, etc.)

export function icon(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="${STROKE}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

// Builds a { id, label, category, svg } lookup map (keyed by id) from a flat
// list — the shape both CanvasStage.jsx (rendering) and the icon palette
// UI (drag source + thumbnail) consume.
export function buildIconMap(list) {
  return Object.fromEntries(list.map((entry) => [entry.id, entry]));
}
