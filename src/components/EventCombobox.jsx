import { useState } from 'react';
import { matchesSearch } from '../lib/search';
import { formatEventDate } from '../lib/format';

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

// Search-to-select picker for linking a Set List library entry to one real
// event — unlike VenueCombobox, there's no free-text fallback: a match has
// to be an existing event, so selecting always fires onSelect with a real
// event object (never just a typed name).
export default function EventCombobox({ events, selectedEvent, onSelect, onClear, testId }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = (query.trim() ? events.filter((e) => matchesSearch(query, [e.name, e.eventType])) : events).slice(0, 50);

  if (selectedEvent && !open) {
    return (
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border border-slate-300 bg-slate-50 text-sm">
        <button
          type="button"
          onClick={() => { setQuery(''); setOpen(true); }}
          data-testid={`${testId}-change`}
          className="text-left min-w-0"
        >
          <div className="font-medium text-slate-700 truncate">{selectedEvent.name || '(untitled event)'}</div>
          {selectedEvent.eventDate && <div className="text-xs text-slate-400">{formatEventDate(selectedEvent.eventDate)}</div>}
        </button>
        <button
          type="button"
          onClick={onClear}
          data-testid={`${testId}-clear`}
          className="shrink-0 text-xs font-semibold text-slate-400 hover:text-red-600"
        >
          Unlink
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Search events by name…"
        data-testid={testId}
        className={inputClass}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white rounded-lg shadow-lg border border-slate-100 z-20">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-400">No events match.</div>
            ) : (
              filtered.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => { onSelect(e); setOpen(false); }}
                  data-testid={`${testId}-option`}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <div className="font-medium text-slate-700">{e.name || '(untitled event)'}</div>
                  {e.eventDate && <div className="text-xs text-slate-400">{formatEventDate(e.eventDate)}</div>}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
