import { useState } from 'react';
import { matchesSearch } from '../lib/search';
import { formatEventDate } from '../lib/format';

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

// Multi-select search-to-add picker for linking a Set List library entry to
// any number of real events — unlike VenueCombobox, there's no free-text
// fallback: a match has to be an existing event, so adding always fires
// onAdd with a real event object (never just a typed name). Already-linked
// events are excluded from the dropdown (no point re-adding one). Closes
// after each pick (same as VenueCombobox) rather than staying open for
// rapid multi-add — its click-outside overlay is a full-viewport div, and
// leaving it up would block clicks on anything else in the same modal
// (e.g. Save) until it's dismissed. Click back into the input to add another.
export default function EventCombobox({ events, selectedEvents, onAdd, onRemove, testId }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedIds = new Set(selectedEvents.map((e) => e.id));
  const available = events.filter((e) => !selectedIds.has(e.id));
  const filtered = (query.trim() ? available.filter((e) => matchesSearch(query, [e.name, e.eventType])) : available).slice(0, 50);

  return (
    <div>
      {selectedEvents.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedEvents.map((e) => (
            <span
              key={e.id}
              data-testid={`${testId}-chip`}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-xs text-indigo-700"
            >
              <span className="font-medium">{e.name || '(untitled event)'}</span>
              {e.eventDate && <span className="text-indigo-400">— {formatEventDate(e.eventDate)}</span>}
              <button
                type="button"
                onClick={() => onRemove(e.id)}
                data-testid={`${testId}-chip-remove`}
                aria-label={`Unlink ${e.name || 'event'}`}
                className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-indigo-200 text-indigo-500"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search events to link…"
          data-testid={testId}
          className={inputClass}
        />
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white rounded-lg shadow-lg border border-slate-100 z-20">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-400">
                  {available.length === 0 ? 'All matching events are already linked.' : 'No events match.'}
                </div>
              ) : (
                filtered.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => { onAdd(e); setQuery(''); setOpen(false); }}
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
    </div>
  );
}
