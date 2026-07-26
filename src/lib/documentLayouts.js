import { DEFAULT_ACCENT_COLOR, hexToRgb } from './colorTheme';

// Visual style presets shared by every generated document (Proposal,
// Contract, Invoice — PDF and on-screen). jsPDF only ships Helvetica/Times/
// Courier, so font family + header alignment + rule style + section style +
// table theme + spacing density are the axes that make 8 presets feel
// distinct without embedding custom fonts.
export const DOCUMENT_LAYOUTS = [
  {
    id: 'classic',
    name: 'Classic',
    description: "Today's look — left header, bold rule, filled section bars.",
    font: 'helvetica',
    headerAlign: 'left',
    rule: 'thick',
    sectionStyle: 'filledBar',
    tableTheme: 'striped',
    corner: 'square',
    density: 1,
  },
  {
    id: 'elegant',
    name: 'Elegant',
    description: 'Serif type, centered header, understated double rule.',
    font: 'times',
    headerAlign: 'center',
    rule: 'doubleThin',
    sectionStyle: 'underline',
    tableTheme: 'plain',
    corner: 'square',
    density: 1,
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'No rule, left-border sections, gridded tables.',
    font: 'helvetica',
    headerAlign: 'left',
    rule: 'none',
    sectionStyle: 'leftBorder',
    tableTheme: 'grid',
    corner: 'rounded',
    density: 1,
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Centered header, heavy rule, large filled section bars.',
    font: 'helvetica',
    headerAlign: 'center',
    rule: 'thick',
    sectionStyle: 'filledBarLarge',
    tableTheme: 'gridHeavy',
    corner: 'square',
    density: 1.05,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'No rule, quiet underline sections, lots of whitespace.',
    font: 'helvetica',
    headerAlign: 'left',
    rule: 'none',
    sectionStyle: 'underline',
    tableTheme: 'plain',
    corner: 'square',
    density: 1.15,
  },
  {
    id: 'corporate',
    name: 'Corporate',
    description: 'Traditional B2B look — bold rule, boxed-outline sections.',
    font: 'helvetica',
    headerAlign: 'left',
    rule: 'thick',
    sectionStyle: 'boxedOutline',
    tableTheme: 'grid',
    corner: 'square',
    density: 1,
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Serif type, centered header, magazine-style call-out boxes.',
    font: 'times',
    headerAlign: 'center',
    rule: 'thin',
    sectionStyle: 'boxedOutline',
    tableTheme: 'striped',
    corner: 'rounded',
    density: 1,
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Tight spacing — fits the most content on a page.',
    font: 'helvetica',
    headerAlign: 'left',
    rule: 'thin',
    sectionStyle: 'underline',
    tableTheme: 'plain',
    corner: 'square',
    density: 0.85,
  },
];

export const DEFAULT_LAYOUT_ID = 'classic';
export const DEFAULT_TEXT_SCALE = 1;

export const TEXT_SCALE_STEPS = [
  { label: 'Small', value: 0.9 },
  { label: 'Medium', value: 1 },
  { label: 'Large', value: 1.15 },
  { label: 'X-Large', value: 1.3 },
];

export function getLayout(layoutId) {
  return DOCUMENT_LAYOUTS.find((l) => l.id === layoutId) || DOCUMENT_LAYOUTS[0];
}

// Single entry point every PDF builder calls once at the top — bundles the
// layout preset, the resolved text scale, and the accent color's RGB triplet
// so callers don't each re-derive fallbacks for missing/legacy businessInfo.
export function getDocumentStyle(businessInfo) {
  const layout = getLayout(businessInfo?.documentLayout);
  const scale = typeof businessInfo?.documentTextScale === 'number' ? businessInfo.documentTextScale : DEFAULT_TEXT_SCALE;
  const accentRgb = hexToRgb(businessInfo?.accentColor || DEFAULT_ACCENT_COLOR);
  return { layout, scale, accentRgb };
}

// Tailwind fragments for the on-screen (JSX) views — kept alongside the PDF
// tokens above so a layout's on-screen "character" (serif vs sans, centered
// vs left header) is described once and read by both InvoiceDocument.jsx and
// ContractDocument.jsx.
export function getLayoutClasses(layoutId) {
  const layout = getLayout(layoutId);
  return {
    fontClass: layout.font === 'times' ? 'font-serif' : 'font-sans',
    headerAlignClass: layout.headerAlign === 'center' ? 'items-center text-center' : 'items-start text-left',
    roundedClass: layout.corner === 'rounded' ? 'rounded-xl' : 'rounded-none',
  };
}
