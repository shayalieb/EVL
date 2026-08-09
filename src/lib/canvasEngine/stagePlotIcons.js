import { icon, buildIconMap } from './iconRegistry';

// Top-down stage-plot symbols, same convention professional live-sound
// stage plots use (a mic is a circle-on-a-stand seen from above, not a
// side-view illustration of a microphone) — instruments/amps that don't
// have a meaningful top-down silhouette (guitars, keyboards) use the
// simplified stylized-object convention those same real-world stage-plot
// icon sets fall back to.
export const STAGE_PLOT_ICON_LIST = [
  {
    id: 'vocal-mic',
    label: 'Vocal Mic',
    category: 'Mics',
    svg: icon('<circle cx="32" cy="18" r="9"/><line x1="32" y1="27" x2="32" y2="50"/><line x1="18" y1="50" x2="46" y2="50"/>'),
  },
  {
    id: 'instrument-mic',
    label: 'Instrument Mic',
    category: 'Mics',
    svg: icon('<circle cx="24" cy="20" r="7"/><line x1="28" y1="26" x2="40" y2="50"/><line x1="32" y1="50" x2="48" y2="50"/>'),
  },
  {
    id: 'di-box',
    label: 'DI Box',
    category: 'Mics',
    svg: icon('<rect x="20" y="25" width="24" height="14" rx="2"/><circle cx="27" cy="32" r="2"/><circle cx="37" cy="32" r="2"/>'),
  },
  {
    id: 'guitar-amp',
    label: 'Guitar Amp',
    category: 'Amps',
    svg: icon('<rect x="16" y="16" width="32" height="32" rx="3"/><circle cx="32" cy="32" r="10"/>'),
  },
  {
    id: 'bass-amp',
    label: 'Bass Amp',
    category: 'Amps',
    svg: icon('<rect x="18" y="12" width="28" height="12" rx="2"/><rect x="14" y="28" width="36" height="22" rx="2"/><circle cx="24" cy="39" r="6"/><circle cx="40" cy="39" r="6"/>'),
  },
  {
    id: 'monitor-wedge',
    label: 'Monitor Wedge',
    category: 'Amps',
    svg: icon('<polygon points="14,50 50,50 42,20 22,20"/>'),
  },
  {
    id: 'pa-speaker',
    label: 'PA Speaker',
    category: 'Amps',
    svg: icon('<rect x="24" y="8" width="16" height="48" rx="2"/><circle cx="32" cy="20" r="5"/><circle cx="32" cy="38" r="6"/>'),
  },
  {
    id: 'drum-kit',
    label: 'Drum Kit',
    category: 'Drums',
    svg: icon('<circle cx="12" cy="16" r="8" stroke-width="1.5"/><circle cx="52" cy="14" r="8" stroke-width="1.5"/><circle cx="20" cy="22" r="6"/><circle cx="44" cy="20" r="6"/><circle cx="48" cy="38" r="7"/><circle cx="32" cy="44" r="12"/><circle cx="32" cy="27" r="5"/>'),
  },
  {
    id: 'timpani',
    label: 'Timpani',
    category: 'Percussion',
    // The rock Drum Kit above doesn't cover orchestral percussion at all —
    // a kettle drum reads as a single large bowl (concentric circles) with
    // its tuning-pedal handle, nothing like a multi-drum kit's silhouette.
    svg: icon('<circle cx="32" cy="34" r="20"/><circle cx="32" cy="34" r="14"/><line x1="32" y1="14" x2="32" y2="6" stroke-width="3"/>'),
  },
  {
    id: 'percussion',
    label: 'Percussion',
    category: 'Percussion',
    svg: icon('<rect x="8" y="26" width="6" height="20" rx="1"/><rect x="17" y="24" width="6" height="24" rx="1"/><rect x="26" y="22" width="6" height="28" rx="1"/><rect x="35" y="24" width="6" height="24" rx="1"/><rect x="44" y="26" width="6" height="20" rx="1"/>'),
  },
  {
    id: 'keyboard',
    label: 'Keyboard',
    category: 'Keys',
    svg: icon('<rect x="10" y="26" width="44" height="14" rx="1"/><line x1="16" y1="26" x2="16" y2="35"/><line x1="20.75" y1="26" x2="20.75" y2="35"/><line x1="25.5" y1="26" x2="25.5" y2="35"/><line x1="30.25" y1="26" x2="30.25" y2="35"/><line x1="35" y1="26" x2="35" y2="35"/><line x1="39.75" y1="26" x2="39.75" y2="35"/><line x1="44.5" y1="26" x2="44.5" y2="35"/><line x1="49.25" y1="26" x2="49.25" y2="35"/><line x1="20" y1="40" x2="16" y2="50"/><line x1="44" y1="40" x2="48" y2="50"/>'),
  },
  {
    id: 'grand-piano',
    label: 'Grand Piano',
    category: 'Keys',
    // Concert grand's top-down "wing" silhouette — a genuinely different
    // shape from the portable Keyboard above (a real gap for orchestra use,
    // not just a size variant like Violin/Viola).
    svg: icon('<path d="M12 20 Q12 12 24 12 L46 12 Q56 16 56 28 L56 38 L28 52 L12 44 Z"/><rect x="14" y="38" width="18" height="8" rx="1"/>'),
  },
  {
    id: 'electric-guitar',
    label: 'Electric Guitar',
    category: 'Guitars',
    svg: icon('<ellipse cx="26" cy="42" rx="12" ry="9"/><rect x="32" y="14" width="6" height="30" rx="2"/><rect x="30" y="9" width="10" height="6" rx="1"/>'),
  },
  {
    id: 'acoustic-guitar',
    label: 'Acoustic Guitar',
    category: 'Guitars',
    svg: icon('<circle cx="22" cy="38" r="8"/><circle cx="22" cy="52" r="10"/><rect x="19" y="8" width="6" height="32" rx="2"/><rect x="17" y="4" width="10" height="6" rx="1"/>'),
  },
  {
    id: 'bass-guitar',
    label: 'Bass Guitar',
    category: 'Basses',
    svg: icon('<ellipse cx="24" cy="46" rx="13" ry="9"/><rect x="30" y="9" width="6" height="37" rx="2"/><rect x="28" y="5" width="10" height="6" rx="1"/>'),
  },
  {
    id: 'upright-bass',
    label: 'Upright Bass',
    category: 'Basses',
    svg: icon('<circle cx="24" cy="34" r="9"/><circle cx="24" cy="50" r="12"/><rect x="21" y="4" width="6" height="32" rx="2"/><rect x="19" y="2" width="10" height="6" rx="1"/>'),
  },
  {
    id: 'violin',
    label: 'Violin',
    category: 'Strings',
    svg: icon('<circle cx="32" cy="34" r="7"/><circle cx="32" cy="48" r="8"/><rect x="29" y="14" width="6" height="22" rx="2"/><rect x="27" y="10" width="10" height="6" rx="1"/>'),
  },
  {
    id: 'viola',
    label: 'Viola',
    category: 'Strings',
    // Same silhouette as Violin, sized up slightly — violin/viola read as
    // near-identical shapes in real stage-plot symbol sets too, distinguished
    // by size and label since visually they're the same instrument family.
    svg: icon('<circle cx="32" cy="33" r="7.5"/><circle cx="32" cy="48" r="9"/><rect x="29" y="12" width="6" height="24" rx="2"/><rect x="27" y="8" width="10" height="6" rx="1"/>'),
  },
  {
    id: 'cello',
    label: 'Cello',
    category: 'Strings',
    svg: icon('<circle cx="32" cy="30" r="8"/><circle cx="32" cy="46" r="11"/><rect x="29" y="6" width="6" height="26" rx="2"/><rect x="27" y="2" width="10" height="6" rx="1"/><line x1="32" y1="57" x2="32" y2="62"/>'),
  },
  {
    id: 'harp',
    label: 'Harp',
    category: 'Strings',
    svg: icon('<path d="M20 8 Q42 10 40 30 L34 58 L22 58 L18 28 Z"/><line x1="24" y1="18" x2="30" y2="54" stroke-width="1.2"/><line x1="28" y1="16" x2="32" y2="48" stroke-width="1.2"/><line x1="32" y1="16" x2="34" y2="42" stroke-width="1.2"/>'),
  },
  {
    id: 'trumpet',
    label: 'Trumpet',
    category: 'Brass & Woodwind',
    svg: icon('<rect x="12" y="28" width="26" height="6" rx="2"/><path d="M38 24 L52 19 L52 41 L38 36 Z"/><rect x="18" y="21" width="3" height="8"/><rect x="24" y="21" width="3" height="8"/><rect x="30" y="21" width="3" height="8"/>'),
  },
  {
    id: 'trombone',
    label: 'Trombone',
    category: 'Brass & Woodwind',
    svg: icon('<rect x="8" y="27" width="22" height="5" rx="2"/><rect x="12" y="34" width="22" height="5" rx="2"/><path d="M30 25 L46 20 L46 40 L30 40 Z"/>'),
  },
  {
    id: 'saxophone',
    label: 'Saxophone',
    category: 'Brass & Woodwind',
    svg: icon('<path d="M26 10 Q40 10 40 26 Q40 40 30 44 Q22 47 24 54" fill="none" stroke-width="4"/><circle cx="26" cy="10" r="4"/><path d="M20 52 L30 58 L22 58 Z"/>'),
  },
  {
    id: 'clarinet',
    label: 'Clarinet',
    category: 'Brass & Woodwind',
    svg: icon('<rect x="28" y="6" width="8" height="46" rx="2"/><path d="M26 52 L38 52 L34 60 L30 60 Z"/><line x1="28" y1="16" x2="36" y2="16"/><line x1="28" y1="24" x2="36" y2="24"/><line x1="28" y1="32" x2="36" y2="32"/>'),
  },
  {
    id: 'flute',
    label: 'Flute',
    category: 'Brass & Woodwind',
    svg: icon('<rect x="8" y="28" width="48" height="6" rx="3"/><circle cx="16" cy="31" r="1.5" fill="#475569"/><circle cx="24" cy="31" r="1.5" fill="#475569"/><circle cx="32" cy="31" r="1.5" fill="#475569"/>'),
  },
  {
    id: 'french-horn',
    label: 'French Horn',
    category: 'Brass & Woodwind',
    svg: icon('<circle cx="26" cy="32" r="16"/><circle cx="26" cy="32" r="9"/><path d="M42 26 L54 20 L54 40 L42 38 Z"/>'),
  },
  {
    id: 'oboe',
    label: 'Oboe',
    category: 'Brass & Woodwind',
    svg: icon('<path d="M30 6 L34 6 L38 50 L26 50 Z"/><path d="M27 50 L37 50 L33 60 L31 60 Z"/><line x1="29" y1="18" x2="35" y2="18"/><line x1="28.5" y1="28" x2="35.5" y2="28"/><line x1="28" y1="38" x2="36" y2="38"/>'),
  },
  {
    id: 'bassoon',
    label: 'Bassoon',
    category: 'Brass & Woodwind',
    svg: icon('<rect x="20" y="6" width="7" height="50" rx="2"/><rect x="35" y="14" width="7" height="42" rx="2"/><path d="M23.5 56 Q23.5 62 38.5 56" fill="none"/>'),
  },
  {
    id: 'music-stand',
    label: 'Music Stand',
    category: 'Staging',
    svg: icon('<path d="M18 20 L46 20 L40 28 L24 28 Z"/><line x1="32" y1="28" x2="32" y2="50"/><line x1="18" y1="50" x2="46" y2="50"/>'),
  },
  {
    id: 'riser',
    label: 'Riser',
    category: 'Staging',
    svg: icon('<rect x="12" y="12" width="40" height="40" rx="2" stroke-dasharray="5,4"/>'),
  },
  {
    id: 'conductor-podium',
    label: 'Conductor Podium',
    category: 'Staging',
    // Reuses Riser's dashed-outline "elevated platform" convention, plus a
    // small stand-on-top detail so it's still distinguishable from a plain
    // Riser or a player's own Music Stand at a glance.
    svg: icon('<rect x="16" y="16" width="32" height="32" rx="2" stroke-dasharray="4,3"/><path d="M24 24 L40 24 L36 30 L28 30 Z"/><line x1="32" y1="30" x2="32" y2="40"/>'),
  },
  {
    id: 'chair',
    label: 'Chair',
    category: 'Seating',
    // Same shape as Floor Plan's Chair icon — orchestra stage plots
    // routinely show string-section chair placement, a gap this fills.
    svg: icon('<rect x="20" y="24" width="24" height="22" rx="2"/><line x1="20" y1="24" x2="44" y2="24" stroke-width="5"/>'),
  },
  {
    id: 'power-strip',
    label: 'Power Strip',
    category: 'Utility',
    svg: icon('<rect x="12" y="24" width="40" height="16" rx="4"/><circle cx="20" cy="32" r="2"/><circle cx="30" cy="32" r="2"/><circle cx="40" cy="32" r="2"/><circle cx="48" cy="32" r="2"/>'),
  },
  {
    id: 'stage-box',
    label: 'Stage Box',
    category: 'Utility',
    svg: icon('<rect x="18" y="18" width="28" height="20" rx="3"/><circle cx="25" cy="28" r="2"/><circle cx="32" cy="28" r="2"/><circle cx="39" cy="28" r="2"/><line x1="32" y1="38" x2="32" y2="54"/>'),
  },
];

export const STAGE_PLOT_ICONS = buildIconMap(STAGE_PLOT_ICON_LIST);
