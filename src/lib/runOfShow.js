// Shared between RunOfShowEditorPage, RunOfShowLibraryModal, and
// PublicRunOfShowPage so the type list, labels, and colors can never drift
// apart between the editor and the public day sheet. Kept in sync with
// SCHEDULE_ITEM_TYPES in server/src/routes/events.js.
export const RUN_OF_SHOW_TYPES = [
  { value: 'load_in', label: 'Load In', icon: '🚚', color: 'slate' },
  { value: 'setup', label: 'Setup', icon: '🔧', color: 'slate' },
  { value: 'soundcheck', label: 'Soundcheck', icon: '🎚️', color: 'indigo' },
  { value: 'doors', label: 'Doors', icon: '🚪', color: 'amber' },
  { value: 'ceremony', label: 'Ceremony', icon: '💍', color: 'rose' },
  { value: 'cocktail_hour', label: 'Cocktail Hour', icon: '🍸', color: 'amber' },
  { value: 'dinner', label: 'Dinner', icon: '🍽️', color: 'amber' },
  { value: 'set', label: 'Set', icon: '🎵', color: 'indigo' },
  { value: 'break', label: 'Break', icon: '☕', color: 'slate' },
  { value: 'load_out', label: 'Load Out', icon: '🚛', color: 'slate' },
  { value: 'other', label: 'Other', icon: '📋', color: 'slate' },
];

const TYPE_BY_VALUE = new Map(RUN_OF_SHOW_TYPES.map((t) => [t.value, t]));

export function runOfShowTypeInfo(type) {
  return TYPE_BY_VALUE.get(type) || TYPE_BY_VALUE.get('other');
}

export const RUN_OF_SHOW_TYPE_BADGE_CLASSES = {
  slate: 'bg-slate-100 text-slate-600',
  indigo: 'bg-indigo-100 text-indigo-700',
  amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700',
};
