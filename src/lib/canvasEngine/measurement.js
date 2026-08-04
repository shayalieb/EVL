// Pixel <-> real-world-unit conversion + grid/snap helpers shared by every
// canvas tool built on canvasEngine — the editor canvas and the exported PDF
// must both go through these, never raw unscaled pixels, or "scale
// accuracy" silently stops being true the moment one code path forgets to.

export function unitToPx(units, scalePxPerUnit) {
  return units * scalePxPerUnit;
}

export function pxToUnit(px, scalePxPerUnit) {
  return px / scalePxPerUnit;
}

export function snapToPx(value, gridPx) {
  if (!gridPx) return value;
  return Math.round(value / gridPx) * gridPx;
}

export function snapPointToGrid({ x, y }, scalePxPerUnit, gridSpacingUnits) {
  const gridPx = unitToPx(gridSpacingUnits, scalePxPerUnit);
  return { x: snapToPx(x, gridPx), y: snapToPx(y, gridPx) };
}

// Grid line positions (in px, relative to the canvas origin) for a canvas of
// the given pixel dimensions — consumed by CanvasStage.jsx to draw the grid
// overlay at real-world intervals rather than an arbitrary pixel interval.
export function gridLinePositions(widthPx, heightPx, scalePxPerUnit, gridSpacingUnits) {
  const stepPx = unitToPx(gridSpacingUnits, scalePxPerUnit);
  if (!stepPx || stepPx < 1) return { vertical: [], horizontal: [] };
  const vertical = [];
  for (let x = 0; x <= widthPx; x += stepPx) vertical.push(x);
  const horizontal = [];
  for (let y = 0; y <= heightPx; y += stepPx) horizontal.push(y);
  return { vertical, horizontal };
}

// "Set Scale" tool: user clicks two points a known real-world distance
// apart, types that distance in, and this becomes the page's new
// scalePxPerUnit — the standard CAD-tool calibration flow.
export function scaleFromCalibration(pointA, pointB, realWorldDistance) {
  const pxDistance = Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
  if (!(realWorldDistance > 0) || pxDistance === 0) return null;
  return pxDistance / realWorldDistance;
}

export function formatMeasurement(units, unit) {
  const rounded = Math.round(units * 100) / 100;
  return `${rounded}${unit === 'in' ? 'in' : 'ft'}`;
}

// Standard print paper sizes at 72 DPI (matches jsPDF's default unit), used
// for page-setup presets — landscape by default since floor/stage plots are
// wider than they are tall.
export const PAPER_SIZES_PX = {
  letter: { width: 792, height: 612 },
  tabloid: { width: 1224, height: 792 },
  a4: { width: 842, height: 595 },
};
