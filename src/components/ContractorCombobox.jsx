import { useState } from 'react';
import { matchesSearch } from '../lib/search';

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

function contractorName(c) {
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || '(unnamed contractor)';
}

// Multi-select search-to-add picker for building a Contractor Group (a
// saved ensemble/lineup) — same shape as EventCombobox, one combobox
// component per entity type rather than a generic one. Already-selected
// contractors are excluded from the dropdown; closes after each pick,
// click back into the input to add another.
export default function ContractorCombobox({ contractors, selectedContractors, onAdd, onRemove, testId }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedIds = new Set(selectedContractors.map((c) => c.id));
  const available = contractors.filter((c) => !selectedIds.has(c.id));
  const filtered = (query.trim() ? available.filter((c) => matchesSearch(query, [c.firstName, c.lastName, c.contractorType1, c.contractorType2])) : available).slice(0, 50);

  return (
    <div>
      {selectedContractors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedContractors.map((c) => (
            <span
              key={c.id}
              data-testid={`${testId}-chip`}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-xs text-indigo-700"
            >
              <span className="font-medium">{contractorName(c)}</span>
              {c.contractorType1 && <span className="text-indigo-400">— {c.contractorType1}</span>}
              <button
                type="button"
                onClick={() => onRemove(c.id)}
                data-testid={`${testId}-chip-remove`}
                aria-label={`Remove ${contractorName(c)}`}
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
          placeholder="Search contractors to add…"
          data-testid={testId}
          className={inputClass}
        />
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white rounded-lg shadow-lg border border-slate-100 z-20">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-400">
                  {available.length === 0 ? 'All matching contractors are already in this group.' : 'No contractors match.'}
                </div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { onAdd(c); setQuery(''); setOpen(false); }}
                    data-testid={`${testId}-option`}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <div className="font-medium text-slate-700">{contractorName(c)}</div>
                    {c.contractorType1 && <div className="text-xs text-slate-400">{c.contractorType1}</div>}
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
