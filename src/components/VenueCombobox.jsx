import { useState } from 'react';
import { matchesSearch } from '../lib/search';

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

// Free-text venue name field with autocomplete suggestions from the saved
// venues list — unlike ClientCombobox, there's no requirement to pick an
// existing one; typing a name that doesn't match anything just stays as
// plain text (a new venue gets auto-saved once the booking/event itself is
// saved — see DataContext's ensureVenueSaved). Picking a suggestion instead
// fires onSelectVenue with the full record so the caller can autofill every
// other venue field (address, contact, notes) in one shot.
export default function VenueCombobox({ venues, value, onChangeName, onSelectVenue, testId }) {
  const [open, setOpen] = useState(false);
  const filtered = value.trim() ? venues.filter((v) => matchesSearch(value, [v.name])) : venues;

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => { onChangeName(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Start typing or pick a saved venue…"
        data-testid={testId}
        className={inputClass}
      />
      {open && filtered.length > 0 && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white rounded-lg shadow-lg border border-slate-100 z-20">
            {filtered.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => { onSelectVenue(v); setOpen(false); }}
                data-testid={`${testId}-option`}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
              >
                <div className="font-medium text-slate-700">{v.name}</div>
                {(v.address1 || v.city) && (
                  <div className="text-xs text-slate-400">{[v.address1, v.city, v.state].filter(Boolean).join(', ')}</div>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
