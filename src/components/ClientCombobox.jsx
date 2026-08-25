import { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export default function ClientCombobox({ value, onChange, testId = 'client-combobox' }) {
  const { clients, searchClients, loadClient } = useData();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const selected = clients.find((client) => client.id === value);

  useEffect(() => {
    if (value && !selected) loadClient(value).catch(() => {});
  }, [value, selected, loadClient]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      searchClients(query)
        .then((items) => { if (!cancelled) setResults(items); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, query, searchClients]);

  return (
    <div className="relative">
      <input
        value={open ? query : (selected ? `${selected.firstName} ${selected.lastName}` : '')}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => { setQuery(''); setOpen(true); }}
        placeholder="Search clients…"
        data-testid={`${testId}-input`}
        role="combobox"
        aria-expanded={open}
        className={inputClass}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setQuery(''); }} />
          <div className="absolute left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white rounded-lg shadow-lg border border-slate-100 z-20">
            <button
              type="button"
              onClick={() => { onChange(''); setQuery(''); setOpen(false); }}
              className="block w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
            >
              No client linked
            </button>
            {loading && <div className="px-3 py-3 text-xs text-slate-400">Searching…</div>}
            {!loading && results.length === 0 && <div className="px-3 py-3 text-xs text-slate-400">No clients found.</div>}
            {results.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => { onChange(client.id); setQuery(''); setOpen(false); }}
                data-testid={`${testId}-option`}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
              >
                <div className="font-medium text-slate-700">{client.firstName} {client.lastName}</div>
                {(client.email || client.phone) && <div className="text-xs text-slate-400">{[client.email, client.phone].filter(Boolean).join(' · ')}</div>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
