import { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

function nameOf(contractor) {
  return [contractor?.firstName, contractor?.lastName].filter(Boolean).join(' ') || contractor?.email || '';
}

export default function ContractorSelect({ value, onChange, testId }) {
  const { contractors, loadContractor, searchContractors } = useData();
  const selected = contractors.find((contractor) => contractor.id === value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (value && !selected) loadContractor(value).catch(() => {});
  }, [value, selected, loadContractor]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      searchContractors(query)
        .then((items) => { if (!cancelled) setResults(items); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, query, searchContractors]);

  return (
    <div className="relative">
      <input
        value={open ? query : nameOf(selected)}
        onFocus={() => { setQuery(''); setOpen(true); }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        placeholder="Search contractors…"
        data-testid={testId}
        className={inputClass}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white rounded-lg shadow-lg border border-slate-100 z-20">
            <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="block w-full text-left px-3 py-2 text-sm text-slate-400 hover:bg-slate-50">No contractor selected</button>
            {loading ? (
              <div className="px-3 py-2 text-sm text-slate-400">Searching…</div>
            ) : results.length ? results.map((contractor) => (
              <button
                key={contractor.id}
                type="button"
                onClick={() => { onChange(contractor.id); setOpen(false); }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
              >
                <div className="font-medium text-slate-700">{nameOf(contractor)}</div>
                {(contractor.contractorType1 || contractor.contractorType2) && <div className="text-xs text-slate-400">{[contractor.contractorType1, contractor.contractorType2].filter(Boolean).join(' · ')}</div>}
              </button>
            )) : <div className="px-3 py-2 text-sm text-slate-400">No contractors match.</div>}
          </div>
        </>
      )}
    </div>
  );
}
