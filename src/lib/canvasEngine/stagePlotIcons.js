import { icon, buildIconMap } from './iconRegistry';

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

export const STAGE_PLOT_ICON_LIST = [
  {
    id: 'vocal-mic',
    label: 'Vocal Mic',
    category: 'Mics',
    svg: svgFor('Mics', '<circle cx="32" cy="18" r="9"/><line x1="32" y1="27" x2="32" y2="50"/><line x1="18" y1="50" x2="46" y2="50"/>'),
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
    svg: svgFor('Amps', '<polygon points="14,50 50,50 42,20 22,20"/>'),
  },
  {
    id: 'iem-pack',
    label: 'IEM Pack',
    category: 'Amps',
    svg: svgFor('Amps', '<rect x="22" y="24" width="20" height="28" rx="3"/><line x1="32" y1="24" x2="32" y2="10" stroke-width="2.5"/><circle cx="32" cy="8" r="2"/>'),
  },
  {
    id: 'pa-speaker',
    label: 'PA Speaker',
    category: 'PA & AV',
    svg: svgFor('PA & AV', '<rect x="24" y="8" width="16" height="48" rx="2"/><circle cx="32" cy="20" r="5"/><circle cx="32" cy="38" r="6"/>'),
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
    svg: svgFor('PA & AV', '<rect x="16" y="6" width="32" height="52" rx="2"/><line x1="16" y1="18" x2="48" y2="18"/><line x1="16" y1="30" x2="48" y2="30"/><line x1="16" y1="42" x2="48" y2="42"/><circle cx="22" cy="12" r="1.5"/><circle cx="42" cy="12" r="1.5"/>'),
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
    svg: svgFor('Drums', '<circle cx="12" cy="16" r="8" stroke-width="1.5"/><circle cx="52" cy="14" r="8" stroke-width="1.5"/><circle cx="20" cy="22" r="6"/><circle cx="44" cy="20" r="6"/><circle cx="48" cy="38" r="7"/><circle cx="32" cy="44" r="12"/><circle cx="32" cy="27" r="5"/>'),
  },
  {
    id: 'timpani',
    label: 'Timpani',
    category: 'Percussion',
    // The rock Drum Kit above doesn't cover orchestral percussion at all —
    // a kettle drum reads as a single large bowl (concentric circles) with
    // its tuning-pedal handle, nothing like a multi-drum kit's silhouette.
    svg: svgFor('Percussion', '<circle cx="32" cy="34" r="20"/><circle cx="32" cy="34" r="14"/><line x1="32" y1="14" x2="32" y2="6" stroke-width="3"/>'),
  },
  {
    id: 'percussion',
    label: 'Percussion',
    category: 'Percussion',
    svg: svgFor('Percussion', '<rect x="8" y="26" width="6" height="20" rx="1"/><rect x="17" y="24" width="6" height="24" rx="1"/><rect x="26" y="22" width="6" height="28" rx="1"/><rect x="35" y="24" width="6" height="24" rx="1"/><rect x="44" y="26" width="6" height="20" rx="1"/>'),
  },
  {
    id: 'congas',
    label: 'Congas',
    category: 'Percussion',
    svg: svgFor('Percussion', '<circle cx="20" cy="32" r="14"/><circle cx="46" cy="32" r="10"/>'),
  },
  {
    id: 'bongos',
    label: 'Bongos',
    category: 'Percussion',
    svg: svgFor('Percussion', '<circle cx="20" cy="32" r="11"/><circle cx="42" cy="32" r="9"/>'),
  },
  {
    id: 'cajon',
    label: 'Cajon',
    category: 'Percussion',
    svg: svgFor('Percussion', '<rect x="16" y="12" width="32" height="40" rx="2"/><circle cx="32" cy="32" r="6"/>'),
  },
  {
    id: 'tambourine',
    label: 'Tambourine',
    category: 'Percussion',
    svg: svgFor('Percussion', '<circle cx="32" cy="32" r="18"/><circle cx="32" cy="14" r="2"/><circle cx="50" cy="32" r="2"/><circle cx="32" cy="50" r="2"/><circle cx="14" cy="32" r="2"/><circle cx="44.7" cy="19.3" r="2"/><circle cx="44.7" cy="44.7" r="2"/><circle cx="19.3" cy="44.7" r="2"/><circle cx="19.3" cy="19.3" r="2"/>'),
  },
  {
    id: 'keyboard',
    label: 'Keyboard',
    category: 'Keys',
    svg: svgFor('Keys', '<rect x="10" y="26" width="44" height="14" rx="1"/><line x1="16" y1="26" x2="16" y2="35"/><line x1="20.75" y1="26" x2="20.75" y2="35"/><line x1="25.5" y1="26" x2="25.5" y2="35"/><line x1="30.25" y1="26" x2="30.25" y2="35"/><line x1="35" y1="26" x2="35" y2="35"/><line x1="39.75" y1="26" x2="39.75" y2="35"/><line x1="44.5" y1="26" x2="44.5" y2="35"/><line x1="49.25" y1="26" x2="49.25" y2="35"/><line x1="20" y1="40" x2="16" y2="50"/><line x1="44" y1="40" x2="48" y2="50"/>'),
  },
  {
    id: 'grand-piano',
    label: 'Grand Piano',
    category: 'Keys',
    // Concert grand's top-down "wing" silhouette — a genuinely different
    // shape from the portable Keyboard above (a real gap for orchestra use,
    // not just a size variant like Violin/Viola).
    svg: svgFor('Keys', '<path d="M12 20 Q12 12 24 12 L46 12 Q56 16 56 28 L56 38 L28 52 L12 44 Z"/><rect x="14" y="38" width="18" height="8" rx="1"/>'),
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
    svg: svgFor('Keys', '<rect x="10" y="18" width="44" height="12" rx="1"/><rect x="10" y="32" width="44" height="12" rx="1"/><line x1="20" y1="18" x2="20" y2="30"/><line x1="30" y1="18" x2="30" y2="30"/><line x1="40" y1="18" x2="40" y2="30"/><line x1="50" y1="18" x2="50" y2="30"/>'),
  },
  {
    id: 'accordion',
    label: 'Accordion',
    category: 'Keys',
    svg: svgFor('Keys', '<rect x="16" y="10" width="14" height="44" rx="2"/><rect x="34" y="10" width="14" height="44" rx="2"/><line x1="30" y1="16" x2="34" y2="16"/><line x1="30" y1="26" x2="34" y2="26"/><line x1="30" y1="36" x2="34" y2="36"/><line x1="30" y1="46" x2="34" y2="46"/><circle cx="41" cy="18" r="1.5"/><circle cx="41" cy="24" r="1.5"/><circle cx="41" cy="30" r="1.5"/>'),
  },
  {
    id: 'electric-guitar',
    label: 'Electric Guitar',
    category: 'Guitars',
    svg: svgFor('Guitars', '<ellipse cx="26" cy="42" rx="12" ry="9"/><rect x="32" y="14" width="6" height="30" rx="2"/><rect x="30" y="9" width="10" height="6" rx="1"/>'),
  },
  {
    id: 'acoustic-guitar',
    label: 'Acoustic Guitar',
    category: 'Guitars',
    svg: svgFor('Guitars', '<circle cx="22" cy="38" r="8"/><circle cx="22" cy="52" r="10"/><rect x="19" y="8" width="6" height="32" rx="2"/><rect x="17" y="4" width="10" height="6" rx="1"/>'),
  },
  {
    id: 'bass-guitar',
    label: 'Bass Guitar',
    category: 'Basses',
    svg: svgFor('Basses', '<ellipse cx="24" cy="46" rx="13" ry="9"/><rect x="30" y="9" width="6" height="37" rx="2"/><rect x="28" y="5" width="10" height="6" rx="1"/>'),
  },
  {
    id: 'upright-bass',
    label: 'Upright Bass',
    category: 'Basses',
    svg: svgFor('Basses', '<circle cx="24" cy="34" r="9"/><circle cx="24" cy="50" r="12"/><rect x="21" y="4" width="6" height="32" rx="2"/><rect x="19" y="2" width="10" height="6" rx="1"/>'),
  },
  {
    id: 'violin',
    label: 'Violin',
    category: 'Strings',
    svg: svgFor('Strings', '<circle cx="32" cy="34" r="7"/><circle cx="32" cy="48" r="8"/><rect x="29" y="14" width="6" height="22" rx="2"/><rect x="27" y="10" width="10" height="6" rx="1"/>'),
  },
  {
    id: 'viola',
    label: 'Viola',
    category: 'Strings',
    // Same silhouette as Violin, sized up slightly — violin/viola read as
    // near-identical shapes in real stage-plot symbol sets too, distinguished
    // by size and label since visually they're the same instrument family.
    svg: svgFor('Strings', '<circle cx="32" cy="33" r="7.5"/><circle cx="32" cy="48" r="9"/><rect x="29" y="12" width="6" height="24" rx="2"/><rect x="27" y="8" width="10" height="6" rx="1"/>'),
  },
  {
    id: 'cello',
    label: 'Cello',
    category: 'Strings',
    svg: svgFor('Strings', '<circle cx="32" cy="30" r="8"/><circle cx="32" cy="46" r="11"/><rect x="29" y="6" width="6" height="26" rx="2"/><rect x="27" y="2" width="10" height="6" rx="1"/><line x1="32" y1="57" x2="32" y2="62"/>'),
  },
  {
    id: 'harp',
    label: 'Harp',
    category: 'Strings',
    svg: svgFor('Strings', '<path d="M20 8 Q42 10 40 30 L34 58 L22 58 L18 28 Z"/><line x1="24" y1="18" x2="30" y2="54" stroke-width="1.2"/><line x1="28" y1="16" x2="32" y2="48" stroke-width="1.2"/><line x1="32" y1="16" x2="34" y2="42" stroke-width="1.2"/>'),
  },
  {
    id: 'mandolin',
    label: 'Mandolin',
    category: 'Strings',
    svg: svgFor('Strings', '<ellipse cx="30" cy="38" rx="11" ry="14"/><rect x="27" y="6" width="6" height="26" rx="2"/><rect x="25" y="2" width="10" height="6" rx="1"/>'),
  },
  {
    id: 'banjo',
    label: 'Banjo',
    category: 'Strings',
    // A round drum-head body (not a guitar's figure-8) is the one detail
    // that actually reads as "banjo" at a glance.
    svg: svgFor('Strings', '<circle cx="28" cy="42" r="14"/><rect x="25" y="6" width="6" height="30" rx="2"/><rect x="23" y="2" width="10" height="6" rx="1"/>'),
  },
  {
    id: 'ukulele',
    label: 'Ukulele',
    category: 'Strings',
    // Same figure-8 convention as Acoustic Guitar, sized down — reads as
    // "small guitar family" the same way Violin/Viola read as a size pair.
    svg: svgFor('Strings', '<circle cx="24" cy="36" r="7"/><circle cx="24" cy="48" r="8"/><rect x="21" y="14" width="6" height="24" rx="2"/><rect x="19" y="10" width="10" height="6" rx="1"/>'),
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
    svg: svgFor('Brass & Woodwind', '<rect x="12" y="28" width="26" height="6" rx="2"/><path d="M38 24 L52 19 L52 41 L38 36 Z"/><rect x="18" y="21" width="3" height="8"/><rect x="24" y="21" width="3" height="8"/><rect x="30" y="21" width="3" height="8"/>'),
  },
  {
    id: 'trombone',
    label: 'Trombone',
    category: 'Brass & Woodwind',
    svg: svgFor('Brass & Woodwind', '<rect x="8" y="27" width="22" height="5" rx="2"/><rect x="12" y="34" width="22" height="5" rx="2"/><path d="M30 25 L46 20 L46 40 L30 40 Z"/>'),
  },
  {
    id: 'saxophone',
    label: 'Saxophone',
    category: 'Brass & Woodwind',
    svg: svgFor('Brass & Woodwind', '<path d="M26 10 Q40 10 40 26 Q40 40 30 44 Q22 47 24 54" fill="none" stroke-width="4"/><circle cx="26" cy="10" r="4"/><path d="M20 52 L30 58 L22 58 Z"/>'),
  },
  {
    id: 'clarinet',
    label: 'Clarinet',
    category: 'Brass & Woodwind',
    svg: svgFor('Brass & Woodwind', '<rect x="28" y="6" width="8" height="46" rx="2"/><path d="M26 52 L38 52 L34 60 L30 60 Z"/><line x1="28" y1="16" x2="36" y2="16"/><line x1="28" y1="24" x2="36" y2="24"/><line x1="28" y1="32" x2="36" y2="32"/>'),
  },
  {
    id: 'flute',
    label: 'Flute',
    category: 'Brass & Woodwind',
    svg: svgFor('Brass & Woodwind', '<rect x="8" y="28" width="48" height="6" rx="3"/><circle cx="16" cy="31" r="1.5" fill="#78350f"/><circle cx="24" cy="31" r="1.5" fill="#78350f"/><circle cx="32" cy="31" r="1.5" fill="#78350f"/>'),
  },
  {
    id: 'french-horn',
    label: 'French Horn',
    category: 'Brass & Woodwind',
    svg: svgFor('Brass & Woodwind', '<circle cx="26" cy="32" r="16"/><circle cx="26" cy="32" r="9"/><path d="M42 26 L54 20 L54 40 L42 38 Z"/>'),
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
    svg: svgFor('Brass & Woodwind', '<rect x="20" y="6" width="7" height="50" rx="2"/><rect x="35" y="14" width="7" height="42" rx="2"/><path d="M23.5 56 Q23.5 62 38.5 56" fill="none"/>'),
  },
  {
    id: 'tuba',
    label: 'Tuba',
    category: 'Brass & Woodwind',
    // Largest bell of the brass family — a single big concentric-circle
    // bell, distinct from French Horn's smaller offset bell + tubing.
    svg: svgFor('Brass & Woodwind', '<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="13"/><circle cx="32" cy="32" r="5"/>'),
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
    svg: svgFor('Staging', '<rect x="14" y="10" width="36" height="44" rx="1" stroke-dasharray="3,3"/><path d="M20 10 Q24 20 20 30 Q24 40 20 54" fill="none"/><path d="M32 10 Q36 20 32 30 Q36 40 32 54" fill="none"/><path d="M44 10 Q48 20 44 30 Q48 40 44 54" fill="none"/>'),
  },
  {
    id: 'truss',
    label: 'Truss',
    category: 'Staging',
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
    svg: svgFor('Utility', '<rect x="10" y="24" width="44" height="16" rx="2"/><line x1="16" y1="24" x2="22" y2="40"/><line x1="26" y1="24" x2="32" y2="40"/><line x1="36" y1="24" x2="42" y2="40"/><line x1="46" y1="24" x2="52" y2="40"/>'),
  },
];

export const STAGE_PLOT_ICONS = buildIconMap(STAGE_PLOT_ICON_LIST);
