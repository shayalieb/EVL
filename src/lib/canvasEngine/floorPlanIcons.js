import { icon, buildIconMap } from './iconRegistry';

// Top-down floor-plan symbols — the same bird's-eye convention real venue/
// event floor-plan software uses (a round table is a circle with chair
// dots around it, seen from above), since these diagrams are read as room
// layouts, not illustrations.
export const FLOOR_PLAN_ICON_LIST = [
  {
    id: 'round-table',
    label: 'Round Table',
    category: 'Tables',
    svg: icon('<circle cx="32" cy="32" r="14"/><circle cx="54" cy="32" r="3"/><circle cx="47.6" cy="47.6" r="3"/><circle cx="32" cy="54" r="3"/><circle cx="16.4" cy="47.6" r="3"/><circle cx="10" cy="32" r="3"/><circle cx="16.4" cy="16.4" r="3"/><circle cx="32" cy="10" r="3"/><circle cx="47.6" cy="16.4" r="3"/>'),
  },
  {
    id: 'rect-table',
    label: 'Rectangular Table',
    category: 'Tables',
    svg: icon('<rect x="14" y="22" width="36" height="20" rx="1"/><circle cx="20" cy="16" r="3"/><circle cx="32" cy="16" r="3"/><circle cx="44" cy="16" r="3"/><circle cx="20" cy="48" r="3"/><circle cx="32" cy="48" r="3"/><circle cx="44" cy="48" r="3"/>'),
  },
  {
    id: 'cocktail-table',
    label: 'Cocktail Table',
    category: 'Tables',
    svg: icon('<circle cx="32" cy="32" r="9"/>'),
  },
  {
    id: 'buffet-table',
    label: 'Buffet Table',
    category: 'Tables',
    svg: icon('<rect x="8" y="26" width="48" height="14" rx="1"/><ellipse cx="18" cy="33" rx="4" ry="3"/><ellipse cx="32" cy="33" rx="4" ry="3"/><ellipse cx="46" cy="33" rx="4" ry="3"/>'),
  },
  {
    id: 'cake-table',
    label: 'Cake Table',
    category: 'Tables',
    svg: icon('<circle cx="32" cy="32" r="14"/><circle cx="32" cy="32" r="8"/><circle cx="32" cy="32" r="3"/>'),
  },
  {
    id: 'gift-table',
    label: 'Gift Table',
    category: 'Tables',
    svg: icon('<rect x="16" y="18" width="32" height="28" rx="2"/><path d="M20 26 L32 38 L44 26"/>'),
  },
  {
    id: 'chair',
    label: 'Chair',
    category: 'Seating',
    svg: icon('<rect x="20" y="24" width="24" height="22" rx="2"/><line x1="20" y1="24" x2="44" y2="24" stroke-width="5"/>'),
  },
  {
    id: 'lounge-seating',
    label: 'Lounge Seating',
    category: 'Seating',
    svg: icon('<rect x="14" y="24" width="36" height="18" rx="4"/><rect x="10" y="20" width="8" height="26" rx="3"/><rect x="46" y="20" width="8" height="26" rx="3"/>'),
  },
  {
    id: 'tent',
    label: 'Tent',
    category: 'Structures',
    svg: icon('<rect x="10" y="10" width="44" height="44"/><line x1="10" y1="10" x2="32" y2="32"/><line x1="54" y1="10" x2="32" y2="32"/><line x1="10" y1="54" x2="32" y2="32"/><line x1="54" y1="54" x2="32" y2="32"/>'),
  },
  {
    id: 'stage',
    label: 'Stage',
    category: 'Structures',
    svg: icon('<rect x="8" y="14" width="48" height="36" rx="2" stroke-width="3"/><line x1="24" y1="50" x2="24" y2="56"/><line x1="40" y1="50" x2="40" y2="56"/>'),
  },
  {
    id: 'dance-floor',
    label: 'Dance Floor',
    category: 'Structures',
    svg: icon('<rect x="10" y="10" width="44" height="44"/><line x1="10" y1="10" x2="54" y2="54"/><line x1="54" y1="10" x2="10" y2="54"/>'),
  },
  {
    id: 'arch',
    label: 'Ceremony Arch',
    category: 'Structures',
    svg: icon('<path d="M16 50 L16 30 A16 16 0 0 1 48 30 L48 50"/>'),
  },
  {
    id: 'bar',
    label: 'Bar',
    category: 'Service',
    svg: icon('<rect x="10" y="24" width="44" height="16" rx="2"/><line x1="10" y1="30" x2="54" y2="30"/>'),
  },
  {
    id: 'dj-booth',
    label: 'DJ Booth',
    category: 'Service',
    svg: icon('<rect x="10" y="20" width="44" height="24" rx="2"/><circle cx="22" cy="32" r="7"/><circle cx="42" cy="32" r="7"/><rect x="29" y="28" width="6" height="8" rx="1"/>'),
  },
  {
    id: 'photo-booth',
    label: 'Photo Booth',
    category: 'Service',
    svg: icon('<rect x="12" y="12" width="40" height="40" rx="3"/><rect x="24" y="26" width="16" height="12" rx="2"/><circle cx="32" cy="32" r="4"/><rect x="28" y="22" width="6" height="4" rx="1"/>'),
  },
  {
    id: 'restroom',
    label: 'Restrooms',
    category: 'Service',
    svg: icon('<circle cx="24" cy="18" r="6"/><path d="M16 46 L16 30 Q16 24 24 24 Q32 24 32 30 L32 46"/><circle cx="42" cy="18" r="6"/><path d="M34 46 L34 30 Q34 24 42 24 Q50 24 50 30 L50 46"/>'),
  },
  {
    id: 'registration-table',
    label: 'Registration Table',
    category: 'Service',
    // Same table-rect base as Buffet Table, with a clipboard/list on top
    // instead of dishes — a check-in table is a distinct, common need at
    // corporate events/galas that a wedding-focused set doesn't cover.
    svg: icon('<rect x="10" y="24" width="44" height="16" rx="1"/><rect x="26" y="14" width="12" height="16" rx="1"/><line x1="29" y1="19" x2="35" y2="19" stroke-width="1.2"/><line x1="29" y1="23" x2="35" y2="23" stroke-width="1.2"/>'),
  },
  {
    id: 'coat-check',
    label: 'Coat Check',
    category: 'Service',
    svg: icon('<line x1="10" y1="12" x2="54" y2="12" stroke-width="2.5"/><path d="M18 12 L18 16 L12 24 L24 24 Z"/><path d="M32 12 L32 16 L26 24 L38 24 Z"/><path d="M46 12 L46 16 L40 24 L52 24 Z"/>'),
  },
  {
    id: 'photo-backdrop',
    label: 'Photo Backdrop',
    category: 'Service',
    // Distinct from the enclosed Photo Booth above — a step-and-repeat/
    // backdrop wall, drawn as a flat panel on two support feet.
    svg: icon('<rect x="8" y="28" width="48" height="8" rx="1"/><rect x="14" y="36" width="4" height="10"/><rect x="46" y="36" width="4" height="10"/>'),
  },
  {
    id: 'generator',
    label: 'Generator / Power',
    category: 'Utility',
    // Floor Plan had no power/utility icon at all despite outdoor tented
    // events routinely needing one — Stage Plot already has this category
    // (Power Strip), Floor Plan didn't.
    svg: icon('<rect x="10" y="16" width="44" height="32" rx="3"/><path d="M34 20 L24 34 L31 34 L28 44 L40 28 L33 28 Z"/>'),
  },
  {
    id: 'entrance',
    label: 'Entrance',
    category: 'Wayfinding',
    svg: icon('<line x1="18" y1="8" x2="18" y2="56"/><path d="M18 8 Q46 8 46 36"/><line x1="28" y1="36" x2="50" y2="36"/><path d="M44 30 L50 36 L44 42"/>'),
  },
  {
    id: 'fire-exit',
    label: 'Fire Exit',
    category: 'Wayfinding',
    svg: icon('<rect x="24" y="10" width="16" height="44" rx="1"/><line x1="10" y1="32" x2="30" y2="32"/><path d="M22 24 L10 32 L22 40"/>'),
  },
  {
    id: 'first-aid',
    label: 'First Aid Station',
    category: 'Wayfinding',
    svg: icon('<rect x="10" y="10" width="44" height="44" rx="4"/><rect x="27" y="18" width="10" height="28" rx="2"/><rect x="18" y="27" width="28" height="10" rx="2"/>'),
  },
];

export const FLOOR_PLAN_ICONS = buildIconMap(FLOOR_PLAN_ICON_LIST);
