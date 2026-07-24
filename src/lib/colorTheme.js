// Shared brand-color helpers — used everywhere a document (PDF or on-screen)
// needs to tint itself to an account's businessInfo.accentColor. Pulled out
// of contractPdf.js (the first document type this was built for) so
// proposalPdf.js/prepSheetPdf.js/prepSheet.js/InvoiceDocument.jsx can reuse
// the exact same math instead of each keeping their own copy.
export const DEFAULT_ACCENT_COLOR = '#4f46e5';

export function hexToRgb(hex) {
  const clean = (hex || '').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num) || full.length !== 6) return [79, 70, 229];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

// Blends a color most of the way to white — used for subtle row highlights
// (e.g. a Grand Total line) that should tint with the chosen accent color
// rather than always being the same fixed light-indigo.
export function lightenRgb([r, g, b], amount = 0.9) {
  return [r, g, b].map((c) => Math.round(c + (255 - c) * amount));
}
