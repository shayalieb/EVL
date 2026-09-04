import { icon, illustratedIcon, buildIconMap } from './iconRegistry';

// A subset of icons below (anywhere using `illustratedIcon`) are adapted
// from game-icons.net — real illustrated artwork traced by professional
// icon designers, recolored to this file's category palette, rather than
// hand-authored primitives like everything else here. Licensed CC BY 3.0
// (https://creativecommons.org/licenses/by/3.0/), which requires visible
// attribution — surfaced to users via ICON_CREDITS below, rendered in
// CanvasIconPalette's footer. Keep this list in sync with which icons
// actually use illustratedIcon.
export const ICON_CREDITS = 'Some icons by game-icons.net contributors — delapouite, caro-asercion, lorc, zajkonur — licensed CC BY 3.0.';

// Top-down stage-plot symbols, same convention professional live-sound
// stage plots use (a mic is a circle-on-a-stand seen from above, not a
// side-view illustration of a microphone) — instruments/amps that don't
// have a meaningful top-down silhouette (guitars, keyboards) use the
// simplified stylized-object convention those same real-world stage-plot
// icon sets fall back to.
//
// Colored by category (rather than the shared canvasEngine default of
// uniform slate line-art) so a crowded plot reads at a glance — mics vs.
// amps vs. rhythm section vs. DJ gear are distinguishable by color family
// before you even read a label. Floor Plan is untouched (still calls
// icon(inner) with no color args, via iconRegistry.js's defaults).
const CATEGORY_COLORS = {
  Mics: { fill: '#38bdf8', stroke: '#0369a1' }, // sky
  Amps: { fill: '#fb923c', stroke: '#c2410c' }, // orange
  Drums: { fill: '#f87171', stroke: '#b91c1c' }, // red — rhythm section
  Percussion: { fill: '#f87171', stroke: '#b91c1c' }, // red — same family as Drums
  Keys: { fill: '#a78bfa', stroke: '#6d28d9' }, // violet
  Guitars: { fill: '#4ade80', stroke: '#15803d' }, // green
  Basses: { fill: '#60a5fa', stroke: '#1d4ed8' }, // blue
  Strings: { fill: '#e879f9', stroke: '#a21caf' }, // fuchsia
  'Brass & Woodwind': { fill: '#fbbf24', stroke: '#b45309' }, // amber
  'PA & AV': { fill: '#2dd4bf', stroke: '#0f766e' }, // teal — front-of-house sound + video, distinct from Amps' on-stage backline
  'DJ & Electronic': { fill: '#818cf8', stroke: '#4338ca' }, // indigo — ties to the app's own brand accent
  Lighting: { fill: '#fde047', stroke: '#a16207' }, // yellow
  Staging: { fill: '#cbd5e1', stroke: '#475569' }, // neutral slate — not a literal instrument
  Seating: { fill: '#cbd5e1', stroke: '#475569' },
  Utility: { fill: '#cbd5e1', stroke: '#475569' },
};

function svgFor(category, inner) {
  return icon(inner, CATEGORY_COLORS[category]);
}

// Professional front-view drafting symbols use neutral paper and dark
// linework so their equipment details remain legible in print and exports.
function equipmentSvg(inner) {
  return icon(inner, { stroke: '#111827', fill: '#ffffff' });
}

export const STAGE_PLOT_ICON_LIST = [
  {
    id: 'vocal-mic',
    label: 'Vocal Mic',
    category: 'Mics',
    svg: illustratedIcon('<path d="M388.938 29.47c-23.008 0-46.153 9.4-62.688 25.405 5.74 46.14 21.326 75.594 43.75 94.28 22.25 18.543 52.078 26.88 87.75 28.345 13.432-16.07 21.188-37.085 21.188-58 0-23.467-9.75-47.063-26.344-63.656C436 39.25 412.404 29.47 388.938 29.47zm-76.282 42.374c-8.808 14.244-13.75 30.986-13.75 47.656 0 23.467 9.782 47.063 26.375 63.656 16.595 16.594 40.19 26.375 63.658 26.375 18.678 0 37.44-6.196 52.687-17.093-31.55-3.2-59.626-12.46-81.875-31-23.277-19.397-39.553-48.64-47.094-89.593zm-27.78 67.72l-64.47 83.78c2.898 19.6 10.458 35.1 22.094 46.187 11.692 11.142 27.714 18.118 48.594 19.626l79.312-65.28c-21.2-3.826-41.14-14.11-56.437-29.407-14.927-14.927-25.057-34.286-29.095-54.907zM300 201.468a8 8 0 0 1 .03 0 8 8 0 0 1 .533 0 8 8 0 0 1 5.875 13.374l-34.313 38.78a8.004 8.004 0 1 1-12-10.593l34.313-38.78a8 8 0 0 1 5.562-2.78zM207.594 240L103 375.906c3.487 13.327 7.326 20.944 12.5 26.03 5.03 4.948 12.386 8.46 23.563 12.408l135.312-111.438c-17.067-3.61-31.595-11.003-42.906-21.78-11.346-10.81-19.323-24.827-23.876-41.126zM95.97 402.375c-9.12 5.382-17.37 14.08-23.126 24.406-9.656 17.317-11.52 37.236-2.25 50.47 6.665 4.337 10.566 4.81 13.844 4.344 1.794-.256 3.618-.954 5.624-1.875-3.18-9.575-6.3-20.93-2.5-33.314 3.03-9.87 10.323-19.044 23.47-27.5-2.406-1.65-4.644-3.49-6.75-5.562-3.217-3.163-5.94-6.78-8.313-10.97z"/>', { fill: '#38bdf8' }),
  },
  {
    id: 'instrument-mic',
    label: 'Instrument Mic',
    category: 'Mics',
    svg: svgFor('Mics', '<circle cx="24" cy="20" r="7"/><line x1="28" y1="26" x2="40" y2="50"/><line x1="32" y1="50" x2="48" y2="50"/>'),
  },
  {
    id: 'boom-mic-stand',
    label: 'Mic Stand (Boom)',
    category: 'Mics',
    // No mic head — an empty stand, for plots that place the mic itself
    // separately or just need to mark stand placement/spacing.
    svg: svgFor('Mics', '<line x1="32" y1="50" x2="32" y2="24" stroke-width="3"/><line x1="20" y1="58" x2="32" y2="50" stroke-width="3"/><line x1="44" y1="58" x2="32" y2="50" stroke-width="3"/><line x1="32" y1="58" x2="32" y2="50" stroke-width="3"/><line x1="32" y1="26" x2="48" y2="16" stroke-width="3"/><circle cx="50" cy="14" r="4"/>'),
  },
  {
    id: 'di-box',
    label: 'DI Box',
    category: 'Mics',
    svg: svgFor('Mics', '<rect x="20" y="25" width="24" height="14" rx="2"/><circle cx="27" cy="32" r="2"/><circle cx="37" cy="32" r="2"/>'),
  },
  {
    id: 'wireless-handheld-mic',
    label: 'Wireless Handheld Mic',
    category: 'Mics',
    // No stand — just the capsule/body, for a singer holding it or a plot
    // that only needs to mark the mic itself, not stand placement.
    svg: svgFor('Mics', '<circle cx="32" cy="24" r="8"/><rect x="28" y="30" width="8" height="22" rx="4"/>'),
  },
  {
    id: 'headset-mic',
    label: 'Headset Mic',
    category: 'Mics',
    svg: svgFor('Mics', '<circle cx="28" cy="28" r="10"/><path d="M36 32 L48 42" stroke-width="2.5"/><circle cx="50" cy="44" r="3"/>'),
  },
  {
    id: 'lavalier-mic',
    label: 'Lavalier Mic',
    category: 'Mics',
    svg: svgFor('Mics', '<circle cx="32" cy="22" r="5"/><path d="M32 27 Q32 40 42 50" fill="none" stroke-width="2"/>'),
  },
  {
    id: 'guitar-amp',
    label: 'Guitar Amp',
    category: 'Amps',
    svg: svgFor('Amps', '<rect x="16" y="16" width="32" height="32" rx="3"/><circle cx="32" cy="32" r="10"/>'),
  },
  {
    id: 'bass-amp',
    label: 'Bass Amp',
    category: 'Amps',
    svg: svgFor('Amps', '<rect x="18" y="12" width="28" height="12" rx="2"/><rect x="14" y="28" width="36" height="22" rx="2"/><circle cx="24" cy="39" r="6"/><circle cx="40" cy="39" r="6"/>'),
  },
  {
    id: 'monitor-wedge',
    label: 'Monitor Wedge',
    category: 'Amps',
    svg: equipmentSvg('<path d="M7 53h50L49 22H19L7 53Z"/><path d="M19 22l8 9h22M13 48h41" fill="none"/><ellipse cx="34" cy="40" rx="11" ry="6"/><ellipse cx="34" cy="40" rx="5" ry="3"/><path d="M11 53v4M53 53v4" fill="none"/>'),
  },
  {
    id: 'iem-pack',
    label: 'IEM Pack',
    category: 'Amps',
    svg: illustratedIcon('<path d="M256 51c-54.994 0-107.32 25.053-148.22 66.826l16.525 8.264C163.22 88.012 210.558 65 256 65c45.45 0 92.803 22.997 131.725 61.074l16.496-8.248C363.32 76.053 310.995 51 256 51zM95.178 131.652C54.13 180.022 27.215 246.514 25.195 321h14.022c2.225-70.647 30.325-133.29 69.992-178.906.695-.8 1.403-1.583 2.106-2.373l-16.138-8.068zm321.644 0l-16.107 8.055c.692.778 1.39 1.548 2.076 2.336C442.46 187.646 470.56 250.29 472.784 321h14.022c-2.02-74.486-28.935-140.978-69.983-189.348zM128.042 262.8c-3.485-.013-6.98 1.078-7.042 3.415V458c0 4 14 4 14 0V266c0-2.074-3.473-3.19-6.96-3.2zm255.917 0c-3.487.01-6.96 1.126-6.96 3.2v192c0 4 14 4 14 0V266.215c-.06-2.337-3.557-3.428-7.04-3.416zM103 275.73c-15.623 2.393-25.644 11.16-33.133 24.64C61.022 316.294 57 339 57 362s4.022 45.707 12.867 61.63c7.49 13.48 17.51 22.247 33.133 24.64V275.73zm306 0v172.54c15.623-2.393 25.644-11.16 33.133-24.64C450.978 407.706 455 385 455 362s-4.022-45.707-12.867-61.63c-7.49-13.48-17.51-22.247-33.133-24.64zM25 339v46h14v-46H25zm448 0v46h14v-46h-14z"/>', { fill: '#fb923c' }),
  },
  {
    id: 'pa-speaker',
    label: 'PA Speaker',
    category: 'PA & AV',
    svg: illustratedIcon('<path d="M275.5 96l-96 96h-96v128h96l96 96V96zm51.46 27.668l-4.66 17.387c52.066 13.95 88.2 61.04 88.2 114.945 0 53.904-36.134 100.994-88.2 114.945l4.66 17.387C386.81 372.295 428.5 317.962 428.5 256c0-61.963-41.69-116.295-101.54-132.332zm-12.425 46.365l-4.658 17.387C340.96 195.748 362.5 223.822 362.5 256s-21.54 60.252-52.623 68.58l4.658 17.387C353.402 331.552 380.5 296.237 380.5 256c0-40.238-27.098-75.552-65.965-85.967zm-12.424 46.363l-4.657 17.387C307.55 236.49 314.5 245.547 314.5 256s-6.95 19.51-17.047 22.217l4.658 17.387c17.884-4.792 30.39-21.09 30.39-39.604 0-18.513-12.506-34.812-30.39-39.604z"/>', { fill: '#2dd4bf' }),
  },
  {
    id: 'subwoofer',
    label: 'Subwoofer',
    category: 'PA & AV',
    svg: svgFor('PA & AV', '<rect x="12" y="12" width="40" height="40" rx="3"/><circle cx="32" cy="32" r="14"/><circle cx="32" cy="32" r="4"/>'),
  },
  {
    id: 'line-array',
    label: 'Line Array',
    category: 'PA & AV',
    // A flown cluster of line-array boxes reads as nothing meaningful in
    // strict top-down projection (same reasoning as Mic Stand/Truss below),
    // so this uses the same simplified-silhouette convention: stacked
    // trapezoids narrowing toward the bottom, hung from a single rigging
    // point — the shape every real stage-plot symbol set uses for it.
    svg: svgFor('PA & AV', '<line x1="32" y1="4" x2="32" y2="10" stroke-width="3"/><polygon points="20,10 44,10 42,20 22,20"/><polygon points="21,21 43,21 41,31 23,31"/><polygon points="22,32 42,32 40,42 24,42"/><polygon points="23,43 41,43 39,53 25,53"/>'),
  },
  {
    id: 'speaker-stack',
    label: 'Speaker Stack',
    category: 'PA & AV',
    // Ground-stacked PA — a top box on a pole mount over a subwoofer base —
    // the alternative to Line Array's flown rig, distinct from the single
    // tall PA Speaker column and the plain Subwoofer box above.
    svg: svgFor('PA & AV', '<rect x="12" y="40" width="40" height="16" rx="2"/><circle cx="22" cy="48" r="4"/><circle cx="42" cy="48" r="4"/><line x1="32" y1="40" x2="32" y2="20" stroke-width="3"/><rect x="20" y="8" width="24" height="14" rx="2"/><circle cx="32" cy="15" r="3"/>'),
  },
  {
    id: 'mixing-board',
    label: 'Mixing Board (FOH)',
    category: 'PA & AV',
    // The front-of-house console — wider and with more channel strips than
    // DJ & Electronic's Mixer (a compact 2-deck DJ mixer, a genuinely
    // different piece of gear) plus a trim-knob row for the visual weight a
    // full-size console has on a real plot.
    svg: svgFor('PA & AV', '<rect x="4" y="18" width="56" height="30" rx="2"/><circle cx="12" cy="14" r="2"/><circle cx="28" cy="14" r="2"/><circle cx="44" cy="14" r="2"/><line x1="12" y1="24" x2="12" y2="42"/><line x1="20" y1="24" x2="20" y2="42"/><line x1="28" y1="24" x2="28" y2="42"/><line x1="36" y1="24" x2="36" y2="42"/><line x1="44" y1="24" x2="44" y2="42"/><line x1="52" y1="24" x2="52" y2="42"/>'),
  },
  {
    id: 'amp-rack',
    label: 'Amp Rack',
    category: 'PA & AV',
    svg: illustratedIcon('<path d="M41 25v78h430V25H41zm254 23h18v32h-18V48zm121 0a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zM64 55h48v18H64V55zm80 0h48v18h-48V55zm80 0h48v18h-48V55zm-119 66v30h302v-30H105zm-64 48v78h430v-78H41zm254 23h18v32h-18v-32zm121 0a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm-352 7h48v18H64v-18zm80 0h48v18h-48v-18zm80 0h48v18h-48v-18zm-119 66v30h302v-30H105zm-64 48v78h430v-78H41zm254 23h18v32h-18v-32zm121 0a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm-352 7h48v18H64v-18zm80 0h48v18h-48v-18zm80 0h48v18h-48v-18zm13 66v30h38v-30h-38zM25 457v30h130.2l20-30H25zm171.8 0l-20 30h158.4l-20-30H196.8zm140 0l20 30H487v-30H336.8z"/>', { fill: '#2dd4bf' }),
  },
  {
    id: 'led-wall',
    label: 'LED Wall / Video Screen',
    category: 'PA & AV',
    svg: svgFor('PA & AV', '<rect x="6" y="12" width="52" height="34" rx="1"/><rect x="12" y="18" width="40" height="22" rx="1"/><line x1="6" y1="46" x2="10" y2="56"/><line x1="58" y1="46" x2="54" y2="56"/>'),
  },
  {
    id: 'projector',
    label: 'Projector',
    category: 'PA & AV',
    svg: svgFor('PA & AV', '<rect x="10" y="22" width="30" height="20" rx="3"/><rect x="16" y="16" width="8" height="6" rx="1"/><circle cx="46" cy="32" r="8"/><circle cx="46" cy="32" r="3"/>'),
  },
  {
    id: 'drum-kit',
    label: 'Drum Kit',
    category: 'Drums',
    svg: illustratedIcon('<path d="m111 58.3-87.37.4-.61 8.3L192.4 92.6l1.8-8.1zm310.8 18.8-.3 29.7 5-.8 4.9.8-.3-29.7zM96.33 92.8l-1.81 13-33.17 26.4 1.84 115.6 6.16-40.4 9.55-2.3h.28l-1.03-65 31.95-25.4 2.7-19.4zm330.17 25.9-66.6 10.4.6 8.3h132l.6-8.3zm-66 33.3-.6 8.3 66.6 10.4 66.6-10.4-.6-8.3zm60.3 30.5-.2 20.8c2.8.5 5.6 1.2 8.5 1.8l3.3.8-.2-23.4-5.7.9zm-287.4 30.7c-16.5-.2-33.5 1.9-51.1 6.1l-2.86 18.8c23.26-3.3 75.96-6.9 127.56 14.6 4-1.6 8.2-3.1 12.4-4.3l1.2-8c-26.6-18.2-55.8-26.8-87.2-27.2zm241.2 0c-31.4.4-60.6 9-87.2 27.2l1.2 8c4.2 1.2 8.4 2.7 12.4 4.3 51.6-21.5 104.3-17.9 127.6-14.6l-2.9-18.8c-17.6-4.2-34.6-6.3-51.1-6.1zm-258.1 39c-17.91 0-32.1 1.8-39.69 3.1l-7.05 46.3 72.94 11.1c10.1-20.3 25.5-37.5 44.5-49.6-25.4-8.5-50.4-10.9-70.7-10.9zm275 0c-20.3 0-45.3 2.4-70.7 10.9 19 12.1 34.4 29.3 44.5 49.6l72.9-11.1-7-46.3c-7.6-1.3-21.8-3.1-39.7-3.1zm-137.5 10c-49.9 0-90.4 40.5-90.4 90.4 0 49.9 40.5 90.4 90.4 90.4 49.9 0 90.4-40.5 90.4-90.4 0-49.9-40.5-90.4-90.4-90.4zM64.27 315.5l1.36 85.5-46.73 87h18.94l33.24-62 15.19 62h17.23l-21.19-86-1.33-84zM433.6 317l-14.2 2.2-.8 74.1-24.2 55.7 7.4 25 24.7-57 30.9 71h18.2l-41.2-94.7zm-279.7 11.6c-4.7 12.1-7.2 25.2-7.2 38.9C146.7 427 194.8 475 254 475c59.2 0 107.3-48 107.3-107.5 0-13.7-2.5-26.8-7.2-38.9 1.8 7.7 2.8 15.8 2.8 24C356.9 409 310.8 456 254 456c-56.8 0-102.9-47-102.9-103.4 0-8.2 1-16.3 2.8-24zm-18 77.4-20.2 82h25.7l11.8-48c-7.4-11-13.3-22-17.3-34zm236.2 0c-4 12-9.9 23-17.3 34l11.8 48h25.7z"/>', { fill: '#f87171' }),
  },
  {
    id: 'timpani',
    label: 'Timpani',
    category: 'Percussion',
    // The rock Drum Kit above doesn't cover orchestral percussion at all —
    // a kettle drum reads as a single large bowl (concentric circles) with
    // its tuning-pedal handle, nothing like a multi-drum kit's silhouette.
    // A white head (not same-color) plus rim tuning-rod ticks read as an
    // actual drum surface rather than a flat ring outline.
    svg: svgFor('Percussion', '<circle cx="32" cy="36" r="20"/><circle cx="32" cy="36" r="14" fill="#ffffff"/><line x1="32" y1="16" x2="32" y2="20"/><line x1="32" y1="52" x2="32" y2="56"/><line x1="12" y1="36" x2="16" y2="36"/><line x1="48" y1="36" x2="52" y2="36"/><line x1="32" y1="16" x2="32" y2="6" stroke-width="3"/><circle cx="32" cy="4" r="2.3"/>'),
  },
  {
    id: 'percussion',
    label: 'Percussion',
    category: 'Percussion',
    svg: illustratedIcon('<path d="M25 57v270h78V57H25zm96 16v238h78V73h-78zm-57 7a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm153 9v206h78V89h-78zm-57 7a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm153 9v174h78V105h-78zm-57 7a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm153 9v142h78V121h-78zm-57 7a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm96 16a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm0 64a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm-96 16a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm-96 16a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm-96 16a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm-96 16a16 16 0 0 1 16 16 16 16 0 0 1-16 16 16 16 0 0 1-16-16 16 16 0 0 1 16-16zm352 57c-12.81 0-23 10.19-23 23s10.19 23 23 23 23-10.19 23-23-10.19-23-23-23zm-40.977 23.967l-162.242 40.56L65.117 375.07l-2.234 17.86 101.53 12.691L29.815 439.27l4.368 17.46 179.7-44.925 193.313 24.164a40.592 40.592 0 0 1 2.246-17.857l-147.187-18.4 117.162-29.29a40.58 40.58 0 0 1-4.395-17.455zM448 409c-12.81 0-23 10.19-23 23s10.19 23 23 23 23-10.19 23-23-10.19-23-23-23z"/>', { fill: '#f87171' }),
  },
  {
    id: 'congas',
    label: 'Congas',
    category: 'Percussion',
    // Traced tall tapered-barrel silhouettes (a real conga's shape), not
    // two same-size circles — also the height/taper is what should read as
    // "congas" versus Bongos' short, squat pair below, not just size.
    svg: svgFor('Percussion', '<path d="M8,6 Q8,2 16,2 Q24,2 24,6 L21,52 Q21,60 16,60 Q11,60 11,52 Z"/><ellipse cx="16" cy="3" rx="9" ry="2.5" fill="#ffffff"/><path d="M30,10 Q30,5 40,5 Q50,5 50,10 L47,58 Q47,62 40,62 Q33,62 33,58 Z"/><ellipse cx="40" cy="6" rx="11" ry="3" fill="#ffffff"/>'),
  },
  {
    id: 'bongos',
    label: 'Bongos',
    category: 'Percussion',
    // Short, stubby joined shells with a connecting block between them —
    // real bongos are notably squat next to Congas' tall barrels, a
    // proportion difference that reads even before any fine detail.
    svg: svgFor('Percussion', '<rect x="24" y="34" width="8" height="10"/><path d="M6,26 Q6,20 16,20 Q26,20 26,26 L24,46 Q24,52 16,52 Q8,52 8,46 Z"/><ellipse cx="16" cy="21" rx="10" ry="3" fill="#ffffff"/><path d="M28,22 Q28,15 42,15 Q56,15 56,22 L53,48 Q53,55 42,55 Q31,55 31,48 Z"/><ellipse cx="42" cy="16" rx="14" ry="3.5" fill="#ffffff"/>'),
  },
  {
    id: 'cajon',
    label: 'Cajon',
    category: 'Percussion',
    // Top/bottom seam lines (the plate edges a real cajon box shows) plus
    // a white sound port instead of same-color, so the port actually
    // reads as an opening rather than a solid dot.
    svg: svgFor('Percussion', '<rect x="16" y="10" width="32" height="44" rx="2"/><line x1="16" y1="18" x2="48" y2="18"/><line x1="16" y1="46" x2="48" y2="46"/><circle cx="32" cy="34" r="7" fill="#ffffff"/>'),
  },
  {
    id: 'tambourine',
    label: 'Tambourine',
    category: 'Percussion',
    // White jingle dots (not same-color as the frame) so they read as
    // metal zils set into the rim rather than decorative notches.
    svg: illustratedIcon('<path d="M256 59.5a48 48 0 0 0-41.8 24.55c13.3-2.32 27.2-3.55 41.8-3.55 14.6 0 28.6 1.24 41.9 3.56A48 48 0 0 0 256 59.5zm0 39c-99.4 0-163.7 59.3-186.6 132.3-23 73.2-6.4 160.5 52.3 219v.1l2.6 2.6h3.7c17.8 0 32.9-7.3 50.5-14.7l-3.6-17.9c-15.4 6.1-27.4 11.3-38 13.5l-5.1 1.1-3.5-3.9c-48.4-53.3-62-130.1-41.7-194.4 20.9-66.7 77-119.7 169.4-119.7 92.3 0 148.5 53 169.4 119.7 20.3 64.3 6.7 141.1-41.7 194.4l-3.5 3.9-5.1-1.1c-10.6-2.2-22.6-7.4-38-13.5l-3.6 17.9c17.6 7.4 32.7 14.7 50.5 14.7h3.7l2.6-2.6v-.1c58.7-58.5 75.3-145.8 52.3-219-22.9-73-87.2-132.3-186.6-132.3zm-151 34a48 48 0 0 0-48 48 48 48 0 0 0 4.6 20.4c11.7-25.5 28.5-48.7 49.9-67.9a48 48 0 0 0-6.5-.5zm302 0a48 48 0 0 0-6.5.5c21.4 19.2 38.2 42.4 49.9 67.9a48 48 0 0 0 4.6-20.4 48 48 0 0 0-48-48zm-151 2c-13.3 0-25.7 1.1-37.2 3.2a48 48 0 0 0 37.2 17.8 48 48 0 0 0 37.2-17.7c-11.5-2.2-23.9-3.3-37.2-3.3zm-104.7 33.7c-19.3 16-33.4 36.7-42.7 60.1a48 48 0 0 0 44.4-47.8 48 48 0 0 0-1.7-12.3zm209.3 0a48 48 0 0 0-1.6 12.3 48 48 0 0 0 44.5 47.9c-9.4-23.5-23.5-44.2-42.9-60.2zM95.7 299.4c.5 23.4 5.3 46.9 14.4 68.8a48 48 0 0 0 8.9-27.7 48 48 0 0 0-23.3-41.1zm320.6 0a48 48 0 0 0-23.3 41.1 48 48 0 0 0 8.9 27.8c9.1-22 13.9-45.5 14.4-68.9zm-374.8 3.3A48 48 0 0 0 23 340.5a48 48 0 0 0 35.9 46.4c-11-26.9-16.7-55.6-17.4-84.2zm429.1 0c-.8 28.6-6.5 57.2-17.5 84.2a48 48 0 0 0 35.9-46.4 48 48 0 0 0-18.4-37.8zM256 402.5c-25.6 0-46.5 5-64 11l3.5 17.7c16.8-5.9 36.2-10.7 60.5-10.7 24.3 0 43.7 4.8 60.5 10.7l3.5-17.7c-17.5-6-38.4-11-64-11z"/>', { fill: '#f87171' }),
  },
  {
    id: 'keyboard',
    label: 'Keyboard',
    category: 'Keys',
    svg: illustratedIcon('<path d="M369.1 19.82L19.81 369.1 142.9 492.2l69.3-69.3-79.2-79.2L412.9 63.66zM374 57.3l12.8 12.72-56.5 56.58-12.8-12.8zm51.7 19.1L413 89.12l66.5 66.48 12.7-12.7zm-25.5 25.5l-12.6 12.7 66.5 66.5 12.6-12.7zm-25.4 25.5L362.1 140l66.5 66.5 12.6-12.7zm-25.5 25.4l-12.6 12.7 66.5 66.4 12.6-12.6zm-74.3 3.5l12.8 12.8-11.3 11.3-12.8-12.8zm48.9 22L311.2 191l66.5 66.4 12.6-12.6zm-74.3 3.4l12.8 12.8-11.3 11.3-12.8-12.8zm48.8 22.1l-12.6 12.6 66.4 66.4 12.7-12.6zm-82.8 11.9l12.8 12.8-33.9 33.9-12.8-12.8zm57.4 13.5l-12.7 12.7 66.5 66.4 12.6-12.6zm-25.6 25.5l-12.6 12.6 66.5 66.5 12.6-12.6zm-88.3 17.5l12.8 12.8-34 34-12.8-12.8zm62.9 7.9l-12.6 12.7 66.4 66.4 12.7-12.6zm-25.4 25.5l-12.7 12.6 66.5 66.5 12.7-12.6zM86.27 322.5l35.33 35.3-46.64 46.7-29-29-6.35-6.4zm84.83 8.5l-12.7 12.7 66.5 66.5 12.7-12.7zm-84.83 16.9l-21.22 21.2 9.91 10 21.21-21.3zm38.83 26.2l12.8 12.8-33.9 33.9L91.23 408zm22.7 22.6l12.8 12.8-34 33.9-12.8-12.8zm22.6 22.6l12.8 12.8-33.9 34-12.8-12.8z"/>', { fill: '#a78bfa' }),
  },
  {
    id: 'grand-piano',
    label: 'Grand Piano',
    category: 'Keys',
    // Concert grand's top-down "wing" silhouette — the curved bentside
    // bulging out and tapering to a point at the tail is the one shape
    // detail that makes a grand piano unmistakable from above, unlike the
    // previous wedge which just read as a generic arrow.
    svg: illustratedIcon('<path d="m376.3 30.6-63.3 3L61.43 230.9l261.47-51.5c5.8-4.6 10.9-9 15.4-13.1L302 75.6l15.5-6.2 33.7 84.2c55.1-60.2-20.4-71.1 25.1-123zM357 168l-13.2 11.9 9.6 24.1c-9.1-.4-19.2-.6-30.5-.7L61.43 254.9s.34 2.2.84 5.5c2.36 15.5-7.73 30.2-23.07 33.6-8.93 2-16.61 3.7-16.61 3.7l3.95 21.2 334.16 30.5 126-53.9-.9-43.4c-81.1-8.7-11.4-39.4-114-47L357 168zm-16.2 51.3c7.1.1 13.4.4 19 .7l21.5 53.8-273.6-14.5 209.9-39.9c8.5-.1 16.2-.2 23.2-.1zm37.6 2.4c56.8 7.8 14.9 32.1 65 36.5l-44.9 13.5-20.1-50zM83.78 284.8 358.4 307l-18.1 16.1-280.68-25.9 24.16-12.4zm-1.35 53.6 13.65 97.1-3.47 6.2.36 15.8 17.13 1.6 17.1-6.2v-13.2l-4.8-3.9 9.1-93-49.07-4.4zM184 350.5V426l105.2 9v-75.2l-16.7-1.5V417l-71.8-6v-59l-16.7-1.5zm209.8 2.7-29.4 10.9-24.8-2 15.6 99.4-3.9 5.1.8 18 17.1 1.7 15.9-7.4.3-13.2-3.9-3.9 12.3-108.6zm-208.7 89.6-28.4 9.5 3.1 14.4 102.3 10.1 21-7.4 1.1-18.3-99.1-8.3z"/>', { fill: '#a78bfa' }),
  },
  {
    id: 'synthesizer',
    label: 'Synthesizer',
    category: 'Keys',
    // Same keyboard-body convention as Keyboard above, plus a row of control
    // knobs — the detail that actually distinguishes a synth rig on a real
    // stage plot from a plain stage piano/keyboard.
    svg: svgFor('Keys', '<rect x="10" y="30" width="44" height="14" rx="1"/><circle cx="16" cy="20" r="4"/><circle cx="28" cy="20" r="4"/><circle cx="40" cy="20" r="4"/><circle cx="52" cy="20" r="4"/><line x1="16" y1="30" x2="16" y2="40"/><line x1="24" y1="30" x2="24" y2="40"/><line x1="32" y1="30" x2="32" y2="40"/><line x1="40" y1="30" x2="40" y2="40"/><line x1="48" y1="30" x2="48" y2="40"/>'),
  },
  {
    id: 'organ',
    label: 'Organ',
    category: 'Keys',
    // Two stacked manuals — the shape detail that reads as "organ" rather
    // than a single-tier Keyboard.
    svg: illustratedIcon('<path d="M210.5 46.8v99l12.5-11.5V46.8zm78.5 0v87.5l12.5 11.5v-99zm-196.41 11v275.9l20.81-6.3V57.8zm306.01 0v269.6l20.8 6.3V57.8zm-208.5 3.5v103.1l12.5-11.4V61.3zm119.3 0V153l12.5 11.4V61.3zM168.7 75.8V184l12.5-11.5V75.8zm162.1 0v96.7l12.5 11.5V75.8zm-268.21 12v255.1l20.84-6.4V87.8zm366.01 0v248.7l20.8 6.4V87.8zm-281.3 2.5v113.3l12.5-11.5V90.3zm204.9 0v101.8l12.5 11.5V90.3zM32.59 117.8V352l20.84-6.3V117.8zm426.01 0v227.9l20.8 6.3V117.8zm-213 50v124.8c6.9-.3 13.9-.3 20.8 0V167.8zm-30 30v97.3c6.9-.9 13.9-1.6 20.8-2.1v-95.2zm60 0V293c6.9.5 13.9 1.2 20.8 2.1v-97.3zm-90 30v72.9c6.9-1.7 13.9-3.1 20.8-4.2v-68.7zm120 0v68.7c6.9 1.1 13.9 2.5 20.8 4.1v-72.8zm-141.4 19-32.2 28L142 481h22.2zm183.1 0V481h22.2l10-206.2zm-101.7 62.5v26.4h20.8v-26.5c-7.1-.2-14.1-.1-20.8.1zm-9.2.4c-6.9.5-13.9 1.3-20.8 2.3v23.7h20.8zm39.2 0v26h20.8v-23.8c-6.9-1-13.9-1.7-20.8-2.2zm-69.2 3.7c-6.9 1.2-13.9 2.7-20.8 4.4v17.9h20.8zm99.2 0v22.3h20.8v-17.9c-6.9-1.7-13.9-3.2-20.8-4.4zm-192.2 31.4-20.81 6.3V418h20.81zm285.2 0V418h20.8v-66.9zm-315.17 9.1-20.84 6.4V418h20.84zm345.17 0V418h20.8v-57.7zm-245.5 4.9 2.5 122.2h24.3v-35h92.2v35h24.3l2.5-122.2zm-129.67 4.3-20.84 6.3V418h20.84zm405.17 0V418h20.8v-48.6zm-230.8 8.7h56.4v16.1H296V404h-80v-16.1h11.8zM209.2 417h93.6v16h-93.6zm17.4 46v18h58.8v-18z"/>', { fill: '#a78bfa' }),
  },
  {
    id: 'accordion',
    label: 'Accordion',
    category: 'Keys',
    svg: illustratedIcon('<path d="M343.8 87.8 340.3 403c3.5-1 7.1-1 10.7-2l20.6-310.4c-9.1-.95-19.1-2.31-27.8-2.8zm48.6 4.2-20.5 309h9L419 95.9s-9.8-1.9-26.6-3.9zm-101.1.3L306.4 412c4.1-1 8.4-3 13-4l3.5-313.7zm-110.9 7.6c-8.8 2-17.7 4.2-26.6 6.7l88.2 7.8L269.5 430s6.1-4 16.4-9l-14.8-315.7zm262.4 1.5-42.5 300.1s17.8-6.6 30.1-11.2c7.3-2.8 12.6-9 14.1-16.7 8.5-42.4 36.6-183.7 47.1-236.4 2.4-11.3-4.4-22.5-15.5-25.9-15-4.5-33.3-9.9-33.3-9.9zm-325.6 24.5s-56.64 18.6-84.95 28c-8.87 2.9-14.03 12.1-11.86 21.2C32.62 226.5 70.73 386.6 83.5 440c1.12 5 4.06 9 8.17 11 4.11 3 9.03 4 13.63 2 14-3 31.1-7 31.1-7s26.6 6 47.4 10c15.7 4 32.1 2 46.4-6 8.4-4 16-8 16-8l-30.6-308.5zm-4.8 43.3 51.6 4.4L196.1 419l-45.2-8c18.1-23.2 20.6-74.6 13.1-124.4-7.9-53.2-27.4-104.5-51.5-116.9zm-23.2.5c4.84.2 9.09 3.7 9.96 8.7L140.6 414c1 6-2.8 11-8.5 12-5.6 1-11-2-12-8l-.2-1-18.4 5-3.36-16 18.86-5-1.7-10.4-19.27 5.2-3.43-16.3 19.8-5.4-6.3-35.4-20.87 5.7-3.44-16.3 21.51-5.9-1.9-10.3-21.75 6-3.44-16.3 22.37-6.2-1.86-10.5-22.71 6.2-3.44-16.3 23.26-6.4-6.27-35.7-24.42 6.7-3.44-16.3 24.97-6.9-2.13-12-25.36 6.9-3.43-16.3 25.89-7.1-1-5.7c-1-5.7 2.79-11.1 8.46-12.1.71-.1 1.41-.2 2.1-.2z"/>', { fill: '#a78bfa' }),
  },
  {
    id: 'electric-guitar',
    label: 'Electric Guitar',
    category: 'Guitars',
    // A single traced silhouette (not primitives glued together) with a
    // short horn nub and a longer horn forming the offset double-cutaway,
    // a deep waist pinch, and no soundhole — the shape and the missing
    // soundhole are what actually separate it from Acoustic/Bass at a
    // glance, not just the category color.
    svg: svgFor('Guitars', '<path d="M18,0 L34,4 L32,14 L18,10 Z"/><circle cx="30" cy="3" r="1.2" fill="#ffffff"/><circle cx="29" cy="6" r="1.2" fill="#ffffff"/><circle cx="28" cy="9" r="1.2" fill="#ffffff"/><circle cx="27" cy="12" r="1.2" fill="#ffffff"/><rect x="26" y="4" width="7" height="21"/><path d="M30,25 Q38,23 40,27 Q42,31 38,35 Q43,41 46,48 Q47,58 34,60 Q26,62 18,60 Q8,58 8,48 Q8,40 10,36 Q6,30 6,22 Q7,18 12,19 Q17,21 18,26 Q24,21 30,25 Z"/><rect x="18" y="44" width="20" height="3" rx="1" fill="#ffffff"/><rect x="22" y="54" width="12" height="4" rx="1" fill="#ffffff"/>'),
  },
  {
    id: 'acoustic-guitar',
    label: 'Acoustic Guitar',
    category: 'Guitars',
    // Full hourglass body with a round soundhole and a straight, symmetric
    // 3-and-3 headstock — the soundhole in particular is the single most
    // recognizable "this is acoustic, not electric" cue on a real plot.
    svg: illustratedIcon('<path d="M491.938 18.813l-17.72 2.375-89.374 11.968-6.22.844-1.562 6.094-18.5 72.156-136.187 137.28c-2.094-4.4-4.324-8.708-6.875-12.843-7.317-11.86-18.338-22.357-34.844-25.687-6.457-1.303-12.664-1.702-18.53-1.28-17.602 1.26-32.182 9.775-41.69 22.5-10.95 14.654-15.87 34.054-15.31 54.405-36.16 4.516-66.336 31.382-80.657 64.313-15.608 35.885-11.856 80.956 24.655 111.156 43.28 35.8 88.28 31.622 119.875 11.22 28.593-18.467 47.778-48.14 50.813-74.752 18.615-2.81 38.424-9.03 56.375-17.968 20.474-10.195 38.536-23.433 48.406-40.063l7.625-12.874-14.908-1.22c-34.56-2.818-53.76-12.87-66.406-26.217l146-147.22 18.938 1.375 6.156.438 2.813-5.5 6.125-11.907 25.03 11.906L464 132.438l-24.53-11.656 7.655-14.874 25.844 12.28 8.03-16.874-25.313-12.03L464 73.155 491.03 86l8.033-16.875L472.53 56.53l11.22-21.81 8.188-15.907zm-124.532 111l13.22 13.093-200.22 201.875c-1.556-1.983-3.227-3.898-5.062-5.717-2.65-2.628-5.493-4.96-8.47-7l200.532-202.25zm-235.47 210.093c10.914-.046 21.837 4.094 30.25 12.438 16.834 16.69 16.938 43.576.25 60.406-16.685 16.83-43.573 16.94-60.405.25-16.83-16.69-16.936-43.576-.25-60.406 8.345-8.415 19.245-12.64 30.157-12.688z"/>', { fill: '#4ade80' }),
  },
  {
    id: 'bass-guitar',
    label: 'Bass Guitar',
    category: 'Basses',
    // A single traced silhouette with one long pointed horn (not two) and
    // a rounded club headstock with only 4 tuners — a genuinely different
    // shape from Electric Guitar's short-horn/long-horn pair above, not
    // just a recolor, plus fewer strings means fewer tuning pegs.
    svg: svgFor('Basses', '<path d="M18,1 C26,0 32,3 31,8 C30,13 22,14 16,11 C11,9 12,2 18,1 Z"/><rect x="25" y="10" width="7" height="19"/><path d="M32,28 Q42,29 44,32 Q46,36 40,40 Q44,44 46,50 Q47,58 34,60 Q26,62 18,60 Q8,58 8,48 Q8,40 10,36 Q6,30 6,22 Q7,18 12,19 Q17,21 18,26 Q26,23 32,28 Z"/><circle cx="14" cy="3" r="1.3" fill="#ffffff"/><circle cx="12" cy="6" r="1.3" fill="#ffffff"/><circle cx="12" cy="9" r="1.3" fill="#ffffff"/><circle cx="14" cy="12" r="1.3" fill="#ffffff"/><rect x="20" y="42" width="10" height="4" rx="1" fill="#ffffff"/><rect x="16" y="52" width="14" height="7" rx="1" fill="#ffffff"/>'),
  },
  {
    id: 'upright-bass',
    label: 'Upright Bass',
    category: 'Basses',
    // A single traced hourglass body with a real waist pinch, not two
    // separate circles touching — matches the fretted family's silhouette
    // treatment above.
    svg: svgFor('Basses', '<rect x="19" y="2" width="10" height="6" rx="1"/><rect x="21" y="4" width="6" height="32" rx="2"/><path d="M24,22 Q34,22 35,29 Q36,35 29,40 Q36,46 37,53 Q37,60 24,61 Q11,60 11,53 Q12,46 19,40 Q12,35 13,29 Q14,22 24,22 Z"/>'),
  },
  {
    id: 'violin',
    label: 'Violin',
    category: 'Strings',
    // A single hourglass body with a real C-bout waist plus f-holes, not
    // two circles touching — the shape and the f-holes are what actually
    // read as "violin family" rather than a generic small lute body.
    svg: illustratedIcon('<path d="M470.9 26l-23 7.69-.1 12.66 17.8 17.81 12.7-.1 7.7-23.04zm-32.5 37l-227 210.5 27.2 27L449 73.57zm-39.6-19.33L385.7 56.7l15.6 15.5 13.5-12.53zm53.5 53.59l-12.5 13.54 15.5 15.4 13.1-13zm-79.6-27.52l-13 13.02 14.6 14.61 13.5-12.58zm54.5 54.46l-12.5 13.6 14.5 14.5 13.1-13.1zm-124 39.2c-28.7-17.5-72-25.4-116.3 47.8l-7.2-1.4-7.3 13c3.8 1 13.5 8.2 12.4 12.1-3.5 11.3-48.2 64.3-70.6 44.5-2.9-2.6-5.8-5.7-8-9.6l-14.35 7.9c1.23 10-1.95 13.8-6.38 15.8-82.975 36.6-64.15 78.6-33.01 126.9l3.11-3c22.09-22.2 43.62-54.6 62.73-82.7l6.1-9.3 13 13 10.1-10.1-10.8-10.9 18.8-7.3 5.1 5.2 33.3-33.4c-2.9-3-5.9-6-8.9-8.9zm45.5 45.5L239 327l-8.9-8.9-33.3 33.3 5 5.1-7.1 18.9-10.9-11-10.1 10.2 12.8 12.9-9.2 6.3c-27.6 18.9-60.6 40.6-82.61 62.7l-3.14 3c48.45 31.2 90.45 50 127.05-33 2-4.4 5.7-7.6 15.8-6.4l7.8-14.3c-3.8-2.3-7-5-9.6-8-19.8-22.4 33.2-67.2 44.5-70.7 3.9-1.1 11 8.6 12.1 12.4l13-7.1-1.4-7.2c73.2-44.3 65.4-87.7 47.9-116.3zM206.9 295l-33.2 33.3 10.1 10.1 33.3-33.3zm-46.3 46.3l-10.2 10.1 10.2 10.1 10.1-10.1zm-33.4 13c-16.4 24.2-34.63 51-54.84 72l2.97 10.3 10.36 3c21.11-20.1 48.01-38.4 72.11-54.8z"/>', { fill: '#e879f9' }),
  },
  {
    id: 'viola',
    label: 'Viola',
    category: 'Strings',
    // Same silhouette as Violin, sized up slightly — violin/viola read as
    // near-identical shapes in real stage-plot symbol sets too, distinguished
    // by size and label since visually they're the same instrument family.
    svg: svgFor('Strings', '<rect x="27" y="8" width="10" height="6" rx="1"/><rect x="29" y="12" width="6" height="24" rx="2"/><path d="M32,25 Q39,25 40,31 Q41,36 36,40 Q41,45 41,50 Q41,57 32,58 Q23,57 23,50 Q23,45 28,40 Q23,36 24,31 Q25,25 32,25 Z"/><line x1="27" y1="38" x2="29" y2="44" stroke-width="1"/><line x1="37" y1="38" x2="35" y2="44" stroke-width="1"/>'),
  },
  {
    id: 'cello',
    label: 'Cello',
    category: 'Strings',
    svg: svgFor('Strings', '<rect x="27" y="2" width="10" height="6" rx="1"/><rect x="29" y="6" width="6" height="26" rx="2"/><path d="M32,20 Q40,20 41,27 Q42,33 36,38 Q42,44 43,51 Q43,59 32,61 Q21,59 21,51 Q22,44 28,38 Q22,33 23,27 Q24,20 32,20 Z"/><line x1="26" y1="36" x2="28" y2="42" stroke-width="1"/><line x1="38" y1="36" x2="36" y2="42" stroke-width="1"/><line x1="32" y1="61" x2="32" y2="64"/>'),
  },
  {
    id: 'harp',
    label: 'Harp',
    category: 'Strings',
    svg: illustratedIcon('<path d="M120.7 27.53l-28.93 8.56C112.1 187.8 125.6 321.9 183.9 455H228c-40-140.6-84.2-280.4-107.3-427.47zm19.9 10.36c2.6 16.05 5.5 32.03 8.7 47.95 9.8 2.67 19.9 6.9 30.1 11.85 18.3 8.71 37.3 19.81 56.1 29.51 18.8 9.7 37.3 17.9 53.6 21.1 16.4 3.2 29.8 1.7 41.6-7 22.2-16.4 38.4-26.2 51.3-31.4 12.8-5.2 23.3-5.9 31.6-1.8 7.8 4 11.5 11.1 14.2 17.1l5.1-11.3c-7.3-12.9-18.1-21.38-32.9-23.26-16.2-2.05-38.4 4.06-66 25.66-14.4 11.3-33 9.7-50.6 2.8-17.5-6.9-35.7-18.9-54.2-31.64-18.6-12.74-37.3-26.21-54.8-35.98-12.3-6.86-23.8-11.66-33.8-13.59zm12.8 68.31c4.8 23 10 45.9 15.6 68.7v-62.2c-5.4-2.6-10.6-4.8-15.6-6.5zM404.8 124c-27 110.6-55.1 223.8-97.7 331h38.6c34.5-94.4 51-203.5 70.3-311.3-1.8-3.8-3-7.4-4.3-10.4-2.3-5.3-4.3-8.1-6.3-9.1-.2-.1-.4-.2-.6-.2zM199 128.1v160.4c5.9 21.1 11.9 42.1 18 63.1V137.8c-6.1-3.2-12.1-6.5-18-9.7zM361 142c-5.4 3.6-11.4 7.8-18 12.6V288h1c5.9-20.9 11.5-41.8 17-62.8V142zm-114 10.8V455h18V160.2c-6-2.2-12-4.7-18-7.4zm66 14.3c-5.9.7-11.9.8-18 .2v269.8c6.3-16.4 12.3-32.9 18-49.6V167.1zM163.9 473l-15.1 16h214.4l-15.1-16H163.9z"/>', { fill: '#e879f9' }),
  },
  {
    id: 'mandolin',
    label: 'Mandolin',
    category: 'Strings',
    // A soundhole (round-back mandolins have an oval or round port, not a
    // guitar-style f-hole) is the missing detail that separates it from a
    // plain oval-bodied lute at a glance.
    svg: svgFor('Strings', '<rect x="25" y="2" width="10" height="6" rx="1"/><rect x="27" y="6" width="6" height="26" rx="2"/><ellipse cx="30" cy="38" rx="11" ry="14"/><ellipse cx="30" cy="38" rx="4" ry="5" fill="#ffffff"/>'),
  },
  {
    id: 'banjo',
    label: 'Banjo',
    category: 'Strings',
    // A round drum-head body (not a guitar's figure-8) is the one detail
    // that actually reads as "banjo" at a glance — the tension hoop and
    // bracket hardware around the rim reinforce it further.
    svg: illustratedIcon('<path d="M375.2 23.61l-12.7 12.7 24.5 24.5c.5-1.2 1-2.3 1.5-3.5 2.4-6.6 4.1-12.4 4.9-15.5zm33.3 30.5c-.9 3-1.9 5.9-3.3 9.6-4 10.8-9.1 23.4-20.2 30.4-4 2.4-8.1 2.6-11.2 2.3-3.1-.3-5.6-1.1-7.5-1.6-1.7-.4-2.6-.6-3.2-.7-.6.9-1.2 2.2-1.6 4.5-.8 3.19-1 7.49-.8 11.59.1 6 .7 10.5 1.2 13.1l26.8 26.8c2.6.4 7.1 1 13 1.2 7.5.1 14.3-1.8 16-2.7-.1-.8-.2-1.4-.6-2.9-.5-2-1.3-4.5-1.7-7.6-.3-3.1 0-7.3 2.3-11.2 7-11.1 19.6-16.2 30.5-20.3 3.6-1.4 6.6-2.2 9.6-3.1l-16.4-32.89zm-67.2 3.4l-12.7 12.7 17.4 17.5c1.3-2.9 3-5.6 5.6-7.9 2.5-2.2 5.6-3.3 8.3-3.7zm128.9 60.99c-3.2.8-9.1 2.4-15.7 5-1.1.4-2.2.8-3.4 1.3l24.6 24.6 12.7-12.7zm-120.7 17.9L217.4 262.3l9.8 9.8 129-129zm86.3 15.5c-.4 2.8-1.5 6-3.8 8.5s-4.8 4.3-7.5 5.6l17.3 17.3 12.7-12.7zm-66.9 3.9L240 284.9l9.7 9.6 125.9-132zm-226.3 94.5c-30.4 0-60.87 11.6-84.13 34.9-46.53 46.5-46.53 121.7 0 168.3C105 500 180.2 500 226.8 453.5c35.8-35.9 43.9-88.5 24.7-132.2L156.8 416l14.9 14.9-12.8 12.7-90.46-90.5 12.73-12.7 14.75 14.7 94.78-94.7c-15.3-6.8-31.7-10.1-48.1-10.1zm60.6 23.2l-94.5 94.4 11.3 11.3 94.5-94.4zm24 24L132.7 392l11.2 11.2 94.6-94.4z"/>', { fill: '#e879f9' }),
  },
  {
    id: 'ukulele',
    label: 'Ukulele',
    category: 'Strings',
    // Same figure-8 convention as Acoustic Guitar, sized down — reads as
    // "small guitar family" the same way Violin/Viola read as a size pair.
    svg: svgFor('Strings', '<rect x="19" y="10" width="10" height="6" rx="1"/><rect x="21" y="14" width="6" height="24" rx="2"/><path d="M24,29 Q30,29 31,34 Q32,38 27,42 Q32,46 32,50 Q32,56 24,57 Q16,56 16,50 Q16,46 21,42 Q16,38 17,34 Q18,29 24,29 Z"/>'),
  },
  {
    id: 'pedal-steel',
    label: 'Pedal Steel Guitar',
    category: 'Strings',
    // Flat tabletop instrument on legs, seen from above — a real shape gap
    // next to the body-and-neck convention every other string instrument
    // here uses.
    svg: svgFor('Strings', '<rect x="8" y="24" width="48" height="16" rx="2"/><circle cx="16" cy="32" r="2"/><circle cx="24" cy="32" r="2"/><circle cx="32" cy="32" r="2"/><circle cx="40" cy="32" r="2"/><circle cx="48" cy="32" r="2"/>'),
  },
  {
    id: 'trumpet',
    label: 'Trumpet',
    category: 'Brass & Woodwind',
    svg: illustratedIcon('<path d="M385.853 21.083c-2.876-.097-4.956.287-6.693 1.058 4.438 38.628-3.264 69.792-21.635 99.469-19.234 31.07-49.316 60.967-88.852 100.502l-3.586 3.722 21.079 21.079 3.722-3.586c28.35-28.35 51.736-51.808 74.16-69.922a50.053 50.053 0 0 1 7.662-.918 47.688 47.688 0 0 1 2.582-.033c12.806.18 23.989 5.554 32.149 13.714 16.225 16.225 21.424 44.398-3.31 73.522-8.9-7.421-17.504-10.952-25.503-10.69a24.831 24.831 0 0 0-4.064.47c-10.692 2.138-17.328 9.532-22.984 15.189l-23.334 23.334 12.726 12.728 23.336-23.336c5.657-5.657 10.335-9.575 13.785-10.265a9.39 9.39 0 0 1 2.133-.188c2.622.075 6.14 1.307 11.451 5.711l-39.39 39.39 12.728 12.73 45.961-45.962c36.549-36.548 33.505-81.048 9.193-105.36-8.559-8.558-19.627-14.465-31.962-16.952 1.06-.683 2.12-1.356 3.183-2.014 29.677-18.371 60.841-26.073 99.469-21.635.771-1.737 1.155-3.817 1.058-6.693-.16-4.804-1.931-11.321-5.304-18.549-6.746-14.455-19.647-31.608-34.625-46.586-14.978-14.978-32.131-27.88-46.586-34.625-7.228-3.373-13.745-5.143-18.549-5.304zM217.492 202.584l-15.557 15.557 12.729 12.727 15.556-15.555-12.728-12.729zm23.486 24.596l-14.143 14.143 111.723 111.722 14.143-14.14L240.978 227.18zm-50.309 2.227l-15.556 15.556 12.728 12.727 15.557-15.555-12.729-12.728zm23.438 24.644l-14.143 14.143L311.69 379.916l14.14-14.142L214.108 254.05zm-50.203 2.121l-15.557 15.557 12.729 12.729L176.63 268.9l-12.726-12.729zm23.334 24.748l-14.143 14.143 111.723 111.723 14.142-14.141L187.238 280.92zm-13.75 39.99L51.355 447.683l12.963 12.963 39.988-38.525c.004.092.001.186.006.279.877 17.378 8.833 33.331 20.701 45.2 11.868 11.867 27.822 19.822 45.2 20.698 17.377.877 35.967-5.7 51.673-21.406l48.791-48.79-12.728-12.73-42.414 42.415c-7.028-7.302-6.922-10.348-6-13.532.964-3.332 5.28-8.376 10.937-14.033l26.162-26.162-12.726-12.728-26.164 26.164c-5.657 5.656-12.655 11.926-15.5 21.755-2.715 9.379.623 20.584 10.172 30.83-10.453 7.99-21.092 10.756-31.297 10.24-12.41-.625-24.387-6.459-33.38-15.45-8.99-8.992-14.824-20.968-15.45-33.377-.334-6.622.726-13.428 3.681-20.246l65.117-62.735-17.6-17.601zM33.796 455.578l-12.728 12.728 22.627 22.627 12.728-12.728-22.627-22.627z"/>', { fill: '#fbbf24' }),
  },
  {
    id: 'trombone',
    label: 'Trombone',
    category: 'Brass & Woodwind',
    svg: illustratedIcon('<path d="M92.2 34.29h-2.29c-15.74.37-31.19 7.48-41.51 20.73-8.73 11.3-13.05 25.74-11.34 40.04 1.7 14.34 9.3 27.44 20.43 36.24l118.81 94.3-10.5 13.1-11.1-9-14.7 19.4s34.9 27.7 52.3 41.4l15.4-19.7-28.8-21.8 10.5-13.1 28.7 21.7 15.5-19.6L73.28 111.7c-6.61-4.8-10.48-11.85-11.4-19.58-.92-7.72 1.18-15.49 6.48-21.67 9.87-12.71 28.34-14.92 41.04-4.9l58.2 45.85c.3.2 70.3 55.3 106.4 102.4 7.2 9.4 13 18.3 16.4 26.3 2.1 5.3 3.7 9.8 2.1 13.5-2.4 5.8-.2 12.5 5.2 15.7 5.3 3.1 12.2 1.8 16.1-3.1l54.1-68.8c3.9-4.9 3.5-11.9-.9-16.4-4.3-4.5-11.4-5.1-16.4-1.3-3.2 2.4-7.9 1.9-13.5 1.1-8.6-1.4-18.7-4.9-29.5-9.7-54.2-24.1-124.2-79.18-124.7-79.45l-58.1-45.74a54.34 54.34 0 0 0-32.6-11.62zM110 76.64 84.01 109.7 97.12 120l25.98-33.06zm32 24.06-25.9 33.1 13 10.3L155 111zm55.4 43.7-26 33 13 10.4 26-33.1zm-75.1 55.8L104 223.5l23.5 13.5 13.5-17.2zm124.3 48.1-41.2 52.5 215.8 169.8c14.5 11.4 35.5 8.9 47-5.6 11.3-14.5 8.8-35.5-5.6-46.8zm-.7 32.5 201.2 157c3.6 2.8 4.3 8.1 1.4 11.8-2.9 3.6-8.2 4.3-11.8 1.4L235.6 294z"/>', { fill: '#fbbf24' }),
  },
  {
    id: 'saxophone',
    label: 'Saxophone',
    category: 'Brass & Woodwind',
    svg: illustratedIcon('<path d="M151.21 26.775c-18.385 2.518-37.75 18.106-48.784 28.028l15.607 18.527c17.103-12.17 32.453-18.857 36.975-5.98 43.955 125.186 102.805 440.16 214.205 416.636 90.158-25.674 42.966-127.593 56.11-188.435 2.508-10.346 8.965-23.229 21.237-22.842 11.477.362 6.472-5.97 2.8-7.682-35.743-19.406-80.315-25.59-117.909-38.12-11.833-3.945-8.18 4.162-5.371 10.28 4.217 9.188 2.88 41.07 5.293 54.526a32.625 32.625 0 0 1 15.105-3.707c18.12 0 33 14.881 33 33 0 6.41-1.87 12.412-5.08 17.496 10.623 5.506 17.947 16.611 17.947 29.318 0 18.12-14.88 33-33 33-1.186 0-2.358-.067-3.513-.191-.511 4.767-2.01 8.147-4.81 9.693-10.326 3.204-45.397-73.375-83.014-161.382-6.54 3.924-12.608 5.998-19.31 5.212 17.077 46.103 35.722 91.756 58.396 136.98l-16.09 8.067c-45.888-91.528-75.273-184.003-107.725-277.195l16.998-5.92c2.355 6.764 4.67 13.496 6.996 20.24a27.134 27.134 0 0 1 10.82-5.945c-14.584-34.816-28.005-66.631-38.576-90.332-5.286-7.657-17.624-13.574-28.306-13.272zM89.522 67.424C77.28 80.24 66.187 94.324 58.33 106.93l7.474 8.806c8.001-5.403 22.698-19.026 37.948-31.418zm135.737 79.97c-5.1 0-9.041 3.942-9.041 9.042s3.941 9.04 9.04 9.04c5.1 0 9.042-3.94 9.042-9.04s-3.942-9.041-9.041-9.041zm12.707 34.122c-5.1 0-9.041 3.941-9.041 9.04 0 5.1 3.941 9.042 9.04 9.042 5.1 0 9.04-3.942 9.04-9.041 0-5.1-3.94-9.041-9.04-9.041zm13.904 36.752c-5.1 0-9.041 3.94-9.041 9.039 0 5.1 3.941 9.04 9.04 9.04 5.1 0 9.042-3.94 9.042-9.04s-3.942-9.04-9.041-9.04zm94.61 87.738c-8.392 0-15 6.609-15 15 0 8.39 6.608 15 15 15 8.39 0 15-6.61 15-15 0-8.391-6.61-15-15-15zm12.866 46.814c-8.39 0-15 6.61-15 15 0 8.391 6.61 15 15 15 8.391 0 15-6.609 15-15 0-8.39-6.609-15-15-15z"/>', { fill: '#fbbf24' }),
  },
  {
    id: 'clarinet',
    label: 'Clarinet',
    category: 'Brass & Woodwind',
    svg: illustratedIcon('<path d="M37.1 28.45c-.27 29.1 9.07 46.67 25.07 67.1l9.66-9.6 14.73 14.75-11.46 11.4 9.81 12.6 31.19-31.25-12.2-10.1-7.83 7.8-14.74-14.7 6.37-6.4zm92.2 78.25L98.11 138l14.09 14.1 31.3-31.2zm25.7 25.7-31 31 10 10c10-4 22-1 30 7 15 14 37 37 37 37l29-11zm12 20c3 2 3 7 0 10s-7 3-10 0-3-8 0-10c3.2-2.8 7.3-2.6 10 0zm22 21c3 3 3 8 0 11-3 2-8 2-11 0-3-3-3-8 0-11 3.4-2.8 8.1-2.8 11 0zM141.3 184c-2.9 0-5.5.5-7.9 1.3l76.8 76.7 53.2-17.2s28.4 27.6 44 42.7c6 5.9 14.9 7.7 22.8 4.8-27.1-26.8-55.3-54-82.8-80.9l-53 17.1s-24.2-24.2-38.2-38.1c-4-4.1-9.3-6.3-14.9-6.4zm68.7 10.4c3 3 3 8 0 11s-8 3-11 0c-2-3-2-8 0-11 3.4-2.8 8.1-2.8 11 0zm34.2 31.3 9.5 9.3-40.2 12.6-9.3-9.3zm14.8 31.7-30 11 9 9 73 79 38-37-18-16-1 1c-11 3-22 0-31-7-15-16-40-40-40-40zm3 13c3 3 3 8 0 11s-8 3-11 0-3-8 0-11c4.3-2.7 7.1-2 11 0zm22 22c3 3 3 8 0 11s-7 3-10 0-3-8 0-11c3.3-1.9 7.1-1.9 10 0zm23 23c3 3 3 8 0 11-3 2-8 2-11 0-3-3-3-8 0-11 3.4-2.8 8.1-2.8 11 0zm52.7 15.5-37.3 37.3 14.1 14.1 37.3-37.2zm26.2 26.3-37.3 37.3c19.2 19.2 14.6 55.7 14.6 55.7s11.6-17.5 35.7-41.5l.5-.6c24.5-24.5 42.2-36.2 42.2-36.2s-36.5 4.5-55.7-14.7zm85.5 14.5c-9.4 0-35.6 19.4-62.3 46.1-30.4 30.4-50.7 59.5-45.2 64.9 5.4 5.5 34.5-14.8 64.9-45.2 30.4-30.4 50.7-59.5 45.2-64.9-.6-.6-1.4-.9-2.6-.9z"/>', { fill: '#fbbf24' }),
  },
  {
    id: 'flute',
    label: 'Flute',
    category: 'Brass & Woodwind',
    svg: illustratedIcon('<path d="M449.4 26.29c-5.4 2.56-14.6 7-27.2 14.14-17.6 9.98-37.7 23.64-45.9 34.27-1.8 2.33-5 10.39-6.8 17.25-1.2 4.49-1.4 6.02-1.8 8.25l44 44c2.2-.4 3.8-.6 8.3-1.8 6.9-1.8 15-5 17.3-6.8 10.6-8.2 24.3-28.2 34.2-45.79 7.2-12.62 11.6-21.81 14.2-27.24zM435 54.32l22.7 22.63-12.8 12.74-22.7-22.63zm-77.1 61.48L42.49 431.3c7.86 3 15.66 8.3 22.77 15.4 7.09 7.1 12.37 14.9 15.42 22.7L396.1 154zm-8.3 30.7a16 16 0 0 1 .1 0 16 16 0 0 1 11.1 4.7 16 16 0 0 1 0 22.6 16 16 0 0 1-22.7 0 16 16 0 0 1 0-22.6 16 16 0 0 1 11.5-4.7zm-45.1 45.3a16 16 0 0 1 11 4.6 16 16 0 0 1 0 22.7 16 16 0 0 1-22.6 0 16 16 0 0 1 0-22.7 16 16 0 0 1 11.6-4.6zM259.2 237a16 16 0 0 1 11.1 4.7 16 16 0 0 1 0 22.6 16 16 0 0 1-22.6 0 16 16 0 0 1 0-22.6 16 16 0 0 1 11.5-4.7zm-45.3 45.3a16 16 0 0 1 .1 0 16 16 0 0 1 11 4.7 16 16 0 0 1 0 22.6 16 16 0 0 1-22.6 0 16 16 0 0 1 0-22.6 16 16 0 0 1 11.5-4.7zm-45.2 45.3a16 16 0 0 1 11.1 4.6 16 16 0 0 1 0 22.7 16 16 0 0 1-22.7 0 16 16 0 0 1 0-22.7 16 16 0 0 1 11.6-4.6zM29.04 446.5c-1.44 0-2.13.4-2.25.5-.21.2-1.2 2.3.43 7.5 1.7 5.2 5.87 12.1 12.02 18.2 6.15 6.2 13.01 10.4 18.24 12.1 5.16 1.6 7.29.6 7.5.4.21-.2 1.2-2.4-.43-7.5-1.69-5.2-5.87-12.1-12.02-18.3-6.15-6.1-13.01-10.3-18.24-12-1.93-.6-3.44-.8-4.58-.9z"/>', { fill: '#fbbf24' }),
  },
  {
    id: 'french-horn',
    label: 'French Horn',
    category: 'Brass & Woodwind',
    svg: illustratedIcon('<path d="m423.9 27.22-34.7 9.42 20.5 35.86 15.8-4.1zm6.9 55.84-16.1 4.3 14.1 52.54c9.4 8.8 17.9 18.7 25.1 29.4zM323.2 113.5c-34.7 0-66.8 11.7-92.4 31.5 2.9-.5 5.8-.8 8.9-.8 15.3 0 25.2 1.9 33.1 4.8 15.5-6.8 32.5-10.5 50.4-10.5 18.6 0 36.2 4 52.1 11.2 5.4 4.2 9.4 9.4 11.5 15.4 2.5 7.6 1.9 16.4-2.4 26.4 4.4.1 8.6 1.1 12.3 3 4.5-11.3 5.1-21.5 2.8-30.4 13 9.8 24.1 22.2 32.6 36.3h9.8c11.5 0 20.9 9.3 20.9 20.8 0 9.5-6.4 17.6-15.2 20 .4 1.8.7 3.6 1 5.4 8.2 2.8 14.2 10.6 14.2 19.8 0 9.3-6.2 17.2-14.7 19.9-.3 1.7-.7 3.4-1.1 5.1 9.1 2.3 15.8 10.4 15.8 20.2 0 11.5-9.4 20.8-20.9 20.8h-11.3c-4.6 7.4-10 14.2-16 20.5l-2.5 2.5c.3 1.6.4 3.3.4 5 0 15.7-12.7 28.5-28.5 28.5-6.9 0-13.2-2.5-18.2-6.6-6.2 2.1-12.6 3.7-19.2 5-1.5.3-3.1.6-4.6.8-1.3 2.2-2.9 4.3-4.7 6.3-10.5 11.8-31.5 24.8-64.6 24.8-48.7 0-74.7-25.1-82.2-51.8-1.9-.7-3.9-1.5-5.8-2.3-3.3-2.1-6.6-4.2-9.8-6.4-34.2-23.5-62.5-53.6-57.4-91.8.8-6.6-3.5-12.7-9.9-14-6.5-1.2-12.84 2.7-14.54 9.1L37.49 469.2c-1.71 7 1.82 13 8.07 15 6.24 2 13.05-1 15.56-7 14.7-35 54.28-47 95.58-51 21.9-1 44.4 0 64.8 2 34.6 1 65 1 91.6-1v-1c73.6-5 131.8-31.1 155.3-116.9 4.2-14 6.5-28.8 6.5-44.1 0-83.7-68-151.7-151.7-151.7zm-83.5 44.3c-15.6 0-28.9 9.7-34.9 22.2-4.1 8.6-4.8 18.5-.6 27.5 6.2 13.5 24.1 25.9 61.4 25.9h93.2c-1.9-3.8-3.1-8-3.3-12.5h-89.9c-29.9 0-45.1-7.8-50.1-18.6-2.5-5.5-2-11.6.6-16.9 4-8.5 13-15.1 23.6-15.1 7.9 0 13.3 1.1 17.3 3.2 6 3.2 8.7 8.4 12.5 13.3 7.9 10.5 18.7 21.6 56.4 21.6H358c2.3-5.2 6.1-9.5 10.8-12.5h-42.9c-18.8 0-29.7-2.9-36.8-7.3-6.9-4.3-10-10-13.8-14.9-6.5-8.6-14-15.9-35.6-15.9zm-52.6 40.6c-10 20.1-15.6 42.8-15.6 66.8 0 26 6.6 50.5 18.2 72 2.3-10.2 7.1-20 14.5-28.4-4.9-13.6-7.7-28.3-7.7-43.6 0-12.7 1.9-24.9 5.4-36.5-5.1-4.6-8.6-9.7-10.9-14.6-2.4-5.1-3.7-10.4-3.9-15.7zM384 204c-8.9 0-16.1 7.1-16.1 16s7.2 16 16.1 16c8.9 0 16-7.1 16-16s-7.1-16-16-16zm27.6 8.9c.6 2.2.9 4.6.9 7.1 0 3.3-.5 6.6-1.6 9.5h31c4.6 0 8.4-3.7 8.4-8.3 0-4.6-3.8-8.3-8.4-8.3zM279 246.4c-5 0-9.7 2-13.3 5.5-3.5 3.6-5.4 8.3-5.4 13.3 0 10.4 8.3 18.7 18.7 18.7h83.6c-3.1-3.5-5.3-7.7-6.4-12.5H279c-3.5 0-6.2-2.7-6.2-6.2 0-1.7.6-3.2 1.8-4.4 1.2-1.2 2.7-1.9 4.4-1.9h77.2c1.1-4.7 3.3-8.9 6.4-12.5zm105 2.8c-8.9 0-16.1 7.1-16.1 16s7.2 16 16.1 16c8.9 0 16-7.1 16-16s-7.1-16-16-16zm27.6 8.9c.6 2.2.9 4.6.9 7.1 0 3.3-.5 6.5-1.6 9.5h31c4.6 0 8.4-3.7 8.4-8.3 0-4.6-3.8-8.3-8.4-8.3zM384 294.4c-8.9 0-16.1 7.1-16.1 16s7.2 16 16.1 16c8.9 0 16-7.1 16-16s-7.1-16-16-16zm-116 3.7c-43.6 0-65.5 27-65.2 53.1.3 26 22.5 53 69.9 53 33.2 0 52.1-13.9 58.2-26.1 3.4-6.9 3.3-13.6.4-18.7-2.6-4.6-7.4-8.2-14.8-9.3-8.6-1.3-21.3.9-38 9.8-16.4 8.7-28.5 3.9-30.2-5.1-.8-4 .8-8.3 5-11.7 5.5-4.6 14.7-7.5 28.1-7.5h89.4c-5.3-2.7-9.6-7.1-12.3-12.5h-77.1c-36.9 0-48.2 19.9-45.4 34.1 2.9 14.8 21.5 28 48.4 13.7 11.3-6 20.3-8.6 27-8.7 4.5 0 7.7.9 9 3.3 1.6 2.9.1 6.7-3 10.6-6.8 8.4-21.8 15.6-44.7 15.6-38 0-57.2-19.8-57.4-40.6-.3-20.7 18.2-40.5 52.7-40.5h87.5v-.2c0-4.4 1-8.5 2.8-12.3zm143.6 5.2c.6 2.2.9 4.6.9 7.1 0 3.3-.5 6.5-1.6 9.5h31c4.6 0 8.4-3.7 8.4-8.3 0-4.6-3.8-8.3-8.4-8.3zM384 344.4c-8.9 0-16.1 7.1-16.1 16s7.2 16 16.1 16c8.9 0 16-7.1 16-16s-7.1-16-16-16z"/>', { fill: '#fbbf24' }),
  },
  {
    id: 'oboe',
    label: 'Oboe',
    category: 'Brass & Woodwind',
    svg: svgFor('Brass & Woodwind', '<path d="M30 6 L34 6 L38 50 L26 50 Z"/><path d="M27 50 L37 50 L33 60 L31 60 Z"/><line x1="29" y1="18" x2="35" y2="18"/><line x1="28.5" y1="28" x2="35.5" y2="28"/><line x1="28" y1="38" x2="36" y2="38"/>'),
  },
  {
    id: 'bassoon',
    label: 'Bassoon',
    category: 'Brass & Woodwind',
    svg: illustratedIcon('<path d="M440.6 37.16c-4 4.07-4.1 10.64 0 14.71l28.3 28.28c4.1 4.12 10.7 4.16 14.8.1 4-4.07 4-10.72-.1-14.79l-28.3-28.3c-4.4-4.08-10.9-3.59-14.7 0zm-10.8 25.16c-24 14.9-44.7 34.7-60.5 58.18l30.7 30.6c23.5-15.8 43.3-36.4 58.2-60.48zM185.4 132.9l38.6 17.5 7.2-17.2s-.2 0-.5-.1c-15.9-5.8-29.1-3.3-45.3-.2zm80.4-.1c-7.1 2.1-15.3 5.8-25.6 4.2l-5.5 16.2c11.4 2.5 20.9.2 29.3-2.4 5-1 11.3-4.7 15.8-2.9 1.3.5 2.5 1.7 3.7 3.4 3.5 4.5 2.2 10-.9 16.4-7 14.3-23.5 31.8-44.7 52.9l11.8 11.8c22.8-22.8 40.3-41.9 47.8-57.3 6.5-13.3 6.3-24.6-.6-33.9-4-5.2-8.1-7.9-12.3-9.3-6.3-2-13.2-.7-18.8.9zm92.9.6-11.3 11.4 28.3 28.3 11.4-11.4zm-23.1 23.2-17.3 17.3c-1.1 3.1-2.4 6.2-3.9 9.4-8.2 16.7-26.7 37.7-51.4 62.4l20.1 20 80.8-80.8zm-110 74.5-9.4 9.4 13 13.1 9.4-9.4zm-21.2 21.2-9.2 9.2 13 13 9.2-9.2zm43.2.9-72.3 72.2 24.1 24.1 72.2-72.3zm-64.2 20.1-9.2 9.2 13 13 9.2-9.2zm-21 21-9.1 9.1 13 13 9.1-9.1zM137.7 319l-9.2 9.2 9.8 23c1.4 3.1.7 6.8-1.7 9.2l-32.4 32.4c-3.3 3.2-8.57 3.2-11.77 0-3.3-3.3-3.3-8.5 0-11.8l28.37-28.4-5-11.7-53.97 54 46.07 46 75.9-75.9zm-91.4 91.7-21.01 35.6 31.48 31.4 35.56-21z"/>', { fill: '#fbbf24' }),
  },
  {
    id: 'tuba',
    label: 'Tuba',
    category: 'Brass & Woodwind',
    // Largest bell of the brass family — a single big concentric-circle
    // bell, distinct from French Horn's smaller offset bell + tubing.
    svg: illustratedIcon('<path d="M207.1 35.3c-6.5 0-12 5-12.5 11.5s4 12.3 10.4 13.4c32.2 5.3 52.9 35.2 67.7 72.9 10 25.3 17.1 54.2 22.1 83.2 24.7-5.7 47.1-5.7 64.5-4 4.9-27.6 11.8-55.1 21.4-79.2 14.8-37.7 35.5-67.6 67.7-72.9 6.4-1.1 10.9-6.9 10.4-13.4s-6-11.5-12.5-11.5H207.1zm-6 68.5c-54.3.4-109.52 32.8-109.52 99.5v159.6C91.58 443 155.2 484 219.6 484c58.3 0 116.1-34 126.3-99.7.5-1.4.7-2.7.6-4.2v-.1c.7-5.5 1-11.2 1-17.1v-41.7c.9-17.5 2.3-37.9 4.7-59.4-13.5-1.1-31.1-.8-50.5 4.4 2.1 20.2 3.4 39.3 4.2 55.8v40.9c0 53.1-43.5 79.1-86.3 79.1s-86.3-26-86.3-79.1V203.3c0-47.9 48.6-63.4 86.3-56.2 20.4 3.9 39.1 14.5 42.8 33.4V227c6.2-2.7 12.4-5 18.5-6.9-2.5-13.1-5.4-26.3-8.8-39.1-7-26.2-16-50.9-28.2-70.5-5.3-1.8-10.8-3.2-16.5-4.3-8.6-1.6-17.4-2.4-26.3-2.4zm-20.4 87.1c-4.5 0-8.3 3.7-8.3 8.3v4.2c0 4.6 3.8 8.4 8.3 8.4 4.6 0 8.4-3.8 8.4-8.4v-4.2c0-4.6-3.8-8.3-8.4-8.3zm25.5 0c-4.5 0-8.3 3.7-8.3 8.3v4.2c0 4.6 3.8 8.4 8.3 8.4 4.6 0 8.4-3.8 8.4-8.4v-4.2c0-4.6-3.8-8.3-8.4-8.3zm25.6 0c-4.5 0-8.3 3.7-8.3 8.3v4.2c0 4.6 3.8 8.4 8.3 8.4 4.6 0 8.4-3.8 8.4-8.4v-4.2c0-4.6-3.8-8.3-8.4-8.3zM180.7 224c-4.5 0-8.3 3.7-8.3 8.2v41.2c0 4.6 3.8 8.3 8.3 8.3 4.6 0 8.4-3.7 8.4-8.3v-41.2c0-4.5-3.8-8.2-8.4-8.2zm25.5 0c-4.5 0-8.3 3.7-8.3 8.2v41.2c0 4.6 3.8 8.3 8.3 8.3 4.6 0 8.4-3.7 8.4-8.3v-41.2c0-4.5-3.8-8.2-8.4-8.2zm25.6 0c-4.5 0-8.3 3.7-8.3 8.2v41.2c0 4.6 3.8 8.3 8.3 8.3 4.6 0 8.4-3.7 8.4-8.3v-41.2c0-4.5-3.8-8.2-8.4-8.2zm108.5 4c-23.3-.1-52.8 4.2-83.4 20v19c52-30 101.8-22 119.9-18l4.7-16c-8.5-2.2-23-4.9-41.2-5zm56.5 8-5.2 19 20.5 9.1 8.5-24.4-23.8-3.7zm-241 6.1c-4 8-6.4 18.8-6.4 33.9v84.1c0 40.9 34.2 62.9 69 62.9s69-22 69-62.9v-89.3c-8.2 3.2-16.6 7.2-25 12.4v76.9c0 25.6-22.4 37.6-44 37.6s-44-12-44-37.6v-62.6c-10.7-2.8-18.6-12.6-18.6-24.2v-31.2zm95.9 48.3c-.9.7-1.8 1.4-2.8 2.1-2.3 1.8-4.9 3.1-7.6 4l-1.2.4-.9.3v53.4c0 10.9-8.7 16.2-17.2 16.2-11.8 0-25.3-.1-25.3-.1 5.5 8.3 15.4 12.6 25.3 12.6 14.9 0 29.7-9.7 29.7-28.7v-60.2zm-64.8 7.9v33.6c0 5.2 2.1 10.3 5.9 14.1 3.7 3.7 8.8 5.8 14.1 5.8 5.3 0 10.3-2.1 14.1-5.8 3.7-3.8 5.8-8.9 5.8-14.1v-33.6h-12.5v33.6c0 1.9-.8 3.8-2.2 5.2-1.4 1.4-3.2 2.2-5.2 2.2s-3.9-.8-5.3-2.2c-1.4-1.4-2.2-3.3-2.2-5.2v-33.6h-12.5z"/>', { fill: '#fbbf24' }),
  },
  {
    id: 'euphonium',
    label: 'Euphonium',
    category: 'Brass & Woodwind',
    svg: svgFor('Brass & Woodwind', '<circle cx="24" cy="32" r="16"/><circle cx="24" cy="32" r="8"/><rect x="38" y="26" width="4" height="12" rx="1"/><rect x="44" y="26" width="4" height="12" rx="1"/><rect x="50" y="26" width="4" height="12" rx="1"/>'),
  },
  {
    id: 'piccolo',
    label: 'Piccolo',
    category: 'Brass & Woodwind',
    // Same convention as Flute, shorter/thinner — the family-pair
    // relationship mirrors Violin/Viola elsewhere in the set.
    svg: svgFor('Brass & Woodwind', '<rect x="16" y="29" width="34" height="5" rx="2.5"/><circle cx="22" cy="31.5" r="1.2" fill="#78350f"/><circle cx="28" cy="31.5" r="1.2" fill="#78350f"/><circle cx="34" cy="31.5" r="1.2" fill="#78350f"/>'),
  },
  {
    id: 'bass-clarinet',
    label: 'Bass Clarinet',
    category: 'Brass & Woodwind',
    // Clarinet's straight-tube convention, plus the curved neck and
    // upturned bell that actually distinguish the bass horn's silhouette.
    svg: svgFor('Brass & Woodwind', '<rect x="28" y="14" width="8" height="38" rx="2"/><path d="M28 10 Q22 10 22 16 L28 18Z"/><path d="M26 52 Q26 60 36 58 Q40 56 38 50Z"/><line x1="28" y1="24" x2="36" y2="24"/><line x1="28" y1="32" x2="36" y2="32"/><line x1="28" y1="40" x2="36" y2="40"/>'),
  },
  {
    id: 'dj-controller',
    label: 'DJ Controller',
    category: 'DJ & Electronic',
    svg: svgFor('DJ & Electronic', '<rect x="6" y="20" width="52" height="24" rx="3"/><circle cx="18" cy="32" r="9"/><circle cx="46" cy="32" r="9"/><rect x="29" y="24" width="6" height="16" rx="1"/>'),
  },
  {
    id: 'turntable',
    label: 'Turntable',
    category: 'DJ & Electronic',
    svg: svgFor('DJ & Electronic', '<circle cx="28" cy="34" r="20"/><circle cx="28" cy="34" r="3"/><path d="M42 20 L52 10" stroke-width="3"/><circle cx="52" cy="10" r="3"/>'),
  },
  {
    id: 'cdj',
    label: 'CDJ',
    category: 'DJ & Electronic',
    // A single deck/jog wheel (no tonearm, no second wheel) — distinct from
    // both Turntable and the two-wheel DJ Controller.
    svg: svgFor('DJ & Electronic', '<rect x="10" y="10" width="44" height="44" rx="3"/><circle cx="32" cy="32" r="16"/><circle cx="32" cy="32" r="4"/>'),
  },
  {
    id: 'mixer',
    label: 'Mixer',
    category: 'DJ & Electronic',
    svg: svgFor('DJ & Electronic', '<rect x="10" y="18" width="44" height="28" rx="2"/><circle cx="20" cy="24" r="2.5"/><circle cx="32" cy="24" r="2.5"/><circle cx="44" cy="24" r="2.5"/><line x1="20" y1="30" x2="20" y2="42"/><line x1="32" y1="30" x2="32" y2="42"/><line x1="44" y1="30" x2="44" y2="42"/>'),
  },
  {
    id: 'laptop',
    label: 'Laptop',
    category: 'DJ & Electronic',
    svg: svgFor('DJ & Electronic', '<rect x="14" y="10" width="36" height="24" rx="2"/><rect x="10" y="34" width="44" height="16" rx="2"/><line x1="10" y1="34" x2="54" y2="34"/>'),
  },
  {
    id: 'par-light',
    label: 'Par Light',
    category: 'Lighting',
    svg: svgFor('Lighting', '<rect x="26" y="6" width="12" height="9" rx="2"/><circle cx="32" cy="34" r="14"/><circle cx="32" cy="34" r="6"/><line x1="32" y1="16" x2="32" y2="10"/><line x1="14" y1="34" x2="8" y2="34"/><line x1="50" y1="34" x2="56" y2="34"/><line x1="20.6" y1="22.6" x2="16.2" y2="18.2"/><line x1="43.4" y1="22.6" x2="47.8" y2="18.2"/>'),
  },
  {
    id: 'moving-head',
    label: 'Moving Head',
    category: 'Lighting',
    // Par Light's yoke-mounted-fixture convention, plus a directional beam
    // line — the detail that reads as "aimable" rather than fixed.
    svg: svgFor('Lighting', '<rect x="26" y="8" width="12" height="8" rx="2"/><circle cx="32" cy="34" r="15"/><circle cx="32" cy="34" r="7"/><path d="M32 34 L44 22" stroke-width="2"/>'),
  },
  {
    id: 'haze-machine',
    label: 'Haze Machine',
    category: 'Lighting',
    svg: svgFor('Lighting', '<rect x="14" y="20" width="36" height="24" rx="3"/><path d="M20 14 Q24 10 28 14 Q32 18 36 14 Q40 10 44 14" fill="none" stroke-width="2"/>'),
  },
  {
    id: 'music-stand',
    label: 'Music Stand',
    category: 'Staging',
    svg: svgFor('Staging', '<path d="M18 20 L46 20 L40 28 L24 28 Z"/><line x1="32" y1="28" x2="32" y2="50"/><line x1="18" y1="50" x2="46" y2="50"/>'),
  },
  {
    id: 'riser',
    label: 'Riser',
    category: 'Staging',
    svg: svgFor('Staging', '<rect x="12" y="12" width="40" height="40" rx="2" stroke-dasharray="5,4"/>'),
  },
  {
    id: 'conductor-podium',
    label: 'Conductor Podium',
    category: 'Staging',
    // Reuses Riser's dashed-outline "elevated platform" convention, plus a
    // small stand-on-top detail so it's still distinguishable from a plain
    // Riser or a player's own Music Stand at a glance.
    svg: svgFor('Staging', '<rect x="16" y="16" width="32" height="32" rx="2" stroke-dasharray="4,3"/><path d="M24 24 L40 24 L36 30 L28 30 Z"/><line x1="32" y1="30" x2="32" y2="40"/>'),
  },
  {
    id: 'lectern',
    label: 'Lectern',
    category: 'Staging',
    // MC/speaker's reading lectern — no riser platform, just the angled
    // reading-surface silhouette, distinct from the Conductor Podium above.
    svg: svgFor('Staging', '<path d="M20 46 L44 46 L40 20 L24 20 Z"/><line x1="32" y1="20" x2="32" y2="12"/>'),
  },
  {
    id: 'drape',
    label: 'Drape / Backdrop',
    category: 'Staging',
    // Runs the length of a truss/pipe-and-drape line, not a fixed panel —
    // see the `linearKind` comment on Cable Ramp below for why this gets a
    // real on-canvas length instead of a fixed-size raster icon.
    linearKind: 'drape',
    svg: illustratedIcon('<path d="M18 18v94.275c28.382-12.57 52.994-35.202 71.39-59.734-4.662-3.466-8.973-7.064-12.865-10.79C68.903 34.452 62.723 26.51 58.973 18zm61.754 0c2.378 3.508 5.41 7.103 9.22 10.75 10.73 10.274 26.505 20.414 44.88 29.117C170.602 75.274 217.8 87 256 87s85.398-11.726 122.146-29.133c18.375-8.703 34.15-18.843 44.88-29.117 3.81-3.647 6.842-7.242 9.22-10.75zm373.273 0c-3.75 8.51-9.93 16.452-17.552 23.75-3.892 3.726-8.203 7.324-12.864 10.79 18.396 24.533 43.008 47.166 71.39 59.735V18zm-82.554 16.734C354.78 52.937 308.428 65.326 256 65.33c-52.242-.023-98.44-12.343-114.236-30.463C168.982 45.655 211.206 51.987 256 52c44.953-.022 87.294-6.408 114.473-17.266zM104.785 62.78C83.37 91.92 53.765 118.415 18 131.788v174.035c2.116.805 4.112 1.178 6 1.178 8.312-.646 12.295-5.132 18.324-9.984 29.568-24.024 49.255-66.27 65.053-119.094 9.187-30.72 17.136-64.91 25.34-100.78-2.216-.986-4.41-1.986-6.57-3.01-7.512-3.557-14.67-7.346-21.362-11.35zm302.43 0c-6.693 4.006-13.85 7.795-21.36 11.353-2.162 1.023-4.356 2.023-6.572 3.008 8.204 35.872 16.153 70.062 25.34 100.782 15.798 52.825 35.485 95.07 65.053 119.094 5.414 4.648 11.22 9.89 18.324 9.984 1.888 0 3.884-.373 6-1.178V131.787c-35.764-13.373-65.37-39.87-86.785-69.006zM46.13 317.34C39.233 322.193 31.793 325 24 325c-2.025 0-4.026-.197-6-.564v123.2c6.273 2.01 14.098 3.364 22 3.364 12.41 0 24.637-3.336 30.94-7.316-.04-43.556-.973-88.042-24.81-126.344zm419.74 0c-23.837 38.302-24.77 82.788-24.81 126.344 6.303 3.98 18.53 7.316 30.94 7.316 7.902 0 15.727-1.353 22-3.363v-123.2c-1.974.366-3.975.563-6 .563-7.792 0-15.232-2.807-22.13-7.66zM88.39 409c.6 13.277.61 26.37.61 39v3.73l-2.637 2.633C75.18 465.545 57.5 469 40 469c-7.475 0-14.98-.636-22-2.232V487h476v-20.232c-7.02 1.596-14.525 2.232-22 2.232-17.5 0-35.18-3.455-46.363-14.637L423 451.73V448c0-12.63.01-25.723.61-39z"/>', { fill: '#cbd5e1' }),
  },
  {
    id: 'truss',
    label: 'Truss',
    category: 'Staging',
    linearKind: 'truss',
    svg: svgFor('Staging', '<rect x="12" y="26" width="40" height="12" rx="1"/><line x1="12" y1="26" x2="52" y2="38"/><line x1="12" y1="38" x2="52" y2="26"/>'),
  },
  {
    id: 'chair',
    label: 'Chair',
    category: 'Seating',
    // Same shape as Floor Plan's Chair icon — orchestra stage plots
    // routinely show string-section chair placement, a gap this fills.
    svg: svgFor('Seating', '<rect x="20" y="24" width="24" height="22" rx="2"/><line x1="20" y1="24" x2="44" y2="24" stroke-width="5"/>'),
  },
  {
    id: 'stool',
    label: 'Stool',
    category: 'Seating',
    svg: svgFor('Seating', '<circle cx="32" cy="32" r="14"/><circle cx="32" cy="32" r="4"/>'),
  },
  {
    id: 'power-strip',
    label: 'Power Strip',
    category: 'Utility',
    svg: svgFor('Utility', '<rect x="12" y="24" width="40" height="16" rx="4"/><circle cx="20" cy="32" r="2"/><circle cx="30" cy="32" r="2"/><circle cx="40" cy="32" r="2"/><circle cx="48" cy="32" r="2"/>'),
  },
  {
    id: 'stage-box',
    label: 'Stage Box',
    category: 'Utility',
    svg: svgFor('Utility', '<rect x="18" y="18" width="28" height="20" rx="3"/><circle cx="25" cy="28" r="2"/><circle cx="32" cy="28" r="2"/><circle cx="39" cy="28" r="2"/><line x1="32" y1="38" x2="32" y2="54"/>'),
  },
  {
    id: 'cable-ramp',
    label: 'Cable Ramp',
    category: 'Utility',
    // Cable ramp, drape, and truss runs are frequently 20-50+ ft, nothing
    // like this 64x64 symbol's own proportions — stretching the *raster*
    // icon to match would smear/distort its linework instead of just
    // getting longer. `linearKind` tells CanvasStage.jsx to render these
    // three procedurally from the element's own `width` (regenerating the
    // repeating tick/fold/cross-brace pattern to fit) instead of scaling
    // this fixed thumbnail — this svg is still what the palette shows.
    linearKind: 'cable-ramp',
    svg: svgFor('Utility', '<rect x="10" y="24" width="44" height="16" rx="2"/><line x1="16" y1="24" x2="22" y2="40"/><line x1="26" y1="24" x2="32" y2="40"/><line x1="36" y1="24" x2="42" y2="40"/><line x1="46" y1="24" x2="52" y2="40"/>'),
  },
];

export const STAGE_PLOT_ICONS = buildIconMap(STAGE_PLOT_ICON_LIST);
