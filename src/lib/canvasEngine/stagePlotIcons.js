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
    svg: equipmentSvg('<ellipse cx="35" cy="10" rx="6" ry="8"/><path d="M30 7h10M29 11h12M31 15h8M34 18l-3 7M31 25L18 43M18 43v13M18 56L8 62M18 56l10 6M18 56v7M31 25h5" fill="none"/>'),
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
    svg: equipmentSvg('<ellipse cx="11" cy="9" rx="10" ry="4"/><ellipse cx="53" cy="8" rx="10" ry="4"/><path d="M11 13v35M53 12v37M11 48L4 58M11 48l7 10M53 49l-7 9M53 49l7 9" fill="none"/><path d="M15 20h15v22H15zM38 20h15v22H38z"/><path d="M15 24h15M15 38h15M38 24h15M38 38h15M20 18V8M48 18V7M27 16h4v8M37 16h-4v8" fill="none"/><circle cx="34" cy="46" r="16"/><circle cx="34" cy="46" r="13"/><path d="M18 17h32" fill="none"/>'),
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
    svg: equipmentSvg('<path d="M4 18h56l-4 24H8L4 18Z"/><path d="M9 27h46v11H9zM15 27v11M21 27v11M27 27v11M33 27v11M39 27v11M45 27v11M51 27v11M13 22h19M38 22h4M46 22h4M54 22h2M13 42L6 61M51 42l7 19M18 42l28 19M46 42L18 61" fill="none"/>'),
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
    svg: svgFor('Guitars', '<path d="M32,18 C40,18 44,22 43,26 C41,31 36,31 37,35 C38,40 47,43 47,49 C47,56 42,62 32,62 C22,62 17,56 17,49 C17,43 26,40 27,35 C28,31 23,31 21,26 C20,22 24,18 32,18 Z"/><circle cx="32" cy="41" r="5.5" fill="#ffffff"/><rect x="29" y="4" width="6" height="16"/><rect x="21" y="0" width="22" height="7" rx="2"/><circle cx="25" cy="1.8" r="1.4" fill="#ffffff"/><circle cx="25" cy="5.2" r="1.4" fill="#ffffff"/><circle cx="32" cy="1.8" r="1.4" fill="#ffffff"/><circle cx="32" cy="5.2" r="1.4" fill="#ffffff"/><circle cx="39" cy="1.8" r="1.4" fill="#ffffff"/><circle cx="39" cy="5.2" r="1.4" fill="#ffffff"/>'),
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
    svg: equipmentSvg('<path d="M5 34h37L57 23v22L42 34"/><path d="M11 30v8M17 22v12M23 21v13M29 22v12M17 22h4M23 21h4M29 22h4M20 34v10h22M27 34v10M34 34v10M57 23c7 2 7 20 0 22" fill="none"/><circle cx="7" cy="34" r="2"/>'),
  },
  {
    id: 'trombone',
    label: 'Trombone',
    category: 'Brass & Woodwind',
    svg: equipmentSvg('<path d="M5 24h35L55 14v20L40 24"/><path d="M12 24v28h34M18 30h25M43 30v16M46 52c8 0 10-6 10-12M55 14c7 2 7 18 0 20" fill="none"/><circle cx="7" cy="24" r="2"/>'),
  },
  {
    id: 'saxophone',
    label: 'Saxophone',
    category: 'Brass & Woodwind',
    svg: equipmentSvg('<path d="M27 5c14 1 20 10 16 21l-6 16c-3 8 3 14 11 9 6-4 7-12 4-18l10-4c7 15-1 31-16 35-16 4-29-11-24-26l6-18c2-6-1-9-6-10l5-5Z"/><path d="M24 15c7 1 11 5 10 11M31 27l7 3M28 35l7 3M26 43l7 3M52 33c7 4 10 11 8 18" fill="none"/><circle cx="35" cy="29" r="1.5"/><circle cx="32" cy="37" r="1.5"/><circle cx="30" cy="45" r="1.5"/>'),
  },
  {
    id: 'clarinet',
    label: 'Clarinet',
    category: 'Brass & Woodwind',
    svg: equipmentSvg('<path d="m29 4 7 4-2 7 5 39-4 7-8-7 4-39-3-7 1-4Z"/><path d="M30 22h6M29 30h8M28 38h10M27 46h12" fill="none"/><circle cx="33" cy="25" r="1.3"/><circle cx="33" cy="33" r="1.3"/><circle cx="33" cy="41" r="1.3"/>'),
  },
  {
    id: 'flute',
    label: 'Flute',
    category: 'Brass & Woodwind',
    svg: equipmentSvg('<path d="M4 30h56v6H4z"/><path d="m4 27 8 6-8 6M60 27v12M18 30v6M27 30v6M36 30v6M45 30v6M54 30v6" fill="none"/><circle cx="18" cy="33" r="1.5"/><circle cx="27" cy="33" r="1.5"/><circle cx="36" cy="33" r="1.5"/><circle cx="45" cy="33" r="1.5"/>'),
  },
  {
    id: 'french-horn',
    label: 'French Horn',
    category: 'Brass & Woodwind',
    svg: equipmentSvg('<path d="M31 59C12 56 8 33 22 22c10-8 25-2 27 10 2 9-5 17-14 15-7-1-9-9-4-14 4-3 9-1 9 4"/><path d="M22 22 12 10l6-6 14 14M12 10 5 5M30 33c5 1 8 5 8 10M48 29l11-7v20l-11-7" fill="none"/><circle cx="35" cy="38" r="2"/>'),
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
    // Runs the length of a truss/pipe-and-drape line, not a fixed panel —
    // see the `linearKind` comment on Cable Ramp below for why this gets a
    // real on-canvas length instead of a fixed-size raster icon.
    linearKind: 'drape',
    svg: svgFor('Staging', '<rect x="14" y="10" width="36" height="44" rx="1" stroke-dasharray="3,3"/><path d="M20 10 Q24 20 20 30 Q24 40 20 54" fill="none"/><path d="M32 10 Q36 20 32 30 Q36 40 32 54" fill="none"/><path d="M44 10 Q48 20 44 30 Q48 40 44 54" fill="none"/>'),
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
