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
    id: 'keyboard',
    label: 'Keyboard',
    category: 'Instruments',
    svg: icon('<rect x="10" y="26" width="44" height="14" rx="1"/><line x1="16" y1="26" x2="16" y2="35"/><line x1="20.75" y1="26" x2="20.75" y2="35"/><line x1="25.5" y1="26" x2="25.5" y2="35"/><line x1="30.25" y1="26" x2="30.25" y2="35"/><line x1="35" y1="26" x2="35" y2="35"/><line x1="39.75" y1="26" x2="39.75" y2="35"/><line x1="44.5" y1="26" x2="44.5" y2="35"/><line x1="49.25" y1="26" x2="49.25" y2="35"/><line x1="20" y1="40" x2="16" y2="50"/><line x1="44" y1="40" x2="48" y2="50"/>'),
  },
  {
    id: 'electric-guitar',
    label: 'Electric Guitar',
    category: 'Instruments',
    svg: icon('<ellipse cx="26" cy="42" rx="12" ry="9"/><rect x="32" y="14" width="6" height="30" rx="2"/><rect x="30" y="9" width="10" height="6" rx="1"/>'),
  },
  {
    id: 'bass-guitar',
    label: 'Bass Guitar',
    category: 'Instruments',
    svg: icon('<ellipse cx="24" cy="46" rx="13" ry="9"/><rect x="30" y="9" width="6" height="37" rx="2"/><rect x="28" y="5" width="10" height="6" rx="1"/>'),
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
