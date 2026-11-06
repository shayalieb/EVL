import { useCallback, useEffect, useState } from 'react';
import { PRESET_CLIENT_VIEWS, createClientView, deleteClientView, listClientViews } from '../lib/clients';

// Pick a ready-made or saved set of filters, or save the current ones.
export default function ClientViewsMenu({ filters, hasFilters, canEdit, onApply }) {
  const [views, setViews] = useState([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => { listClientViews().then(setViews).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    try {
      await createClientView(name, filters);
      setNaming(false); setName(''); setError('');
      load();
    } catch (err) { setError(err.message); }
  }

  async function remove(view) {
    try { await deleteClientView(view.id); load(); } catch (err) { setError(err.message); }
  }

  function apply(event) {
    const id = event.target.value;
    event.target.value = '';
    const view = [...PRESET_CLIENT_VIEWS, ...views].find((v) => v.id === id);
    if (view) onApply(view.filters);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select defaultValue="" onChange={apply} aria-label="Views" data-testid="clients-views-select" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
        <option value="" disabled>Views…</option>
        <optgroup label="Ready-made">
          {PRESET_CLIENT_VIEWS.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </optgroup>
        {views.length > 0 && (
          <optgroup label="Saved">
            {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </optgroup>
        )}
      </select>
      {canEdit && hasFilters && !naming && (
        <button type="button" onClick={() => setNaming(true)} data-testid="clients-save-view-button" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">Save view</button>
      )}
      {naming && (
        <form onSubmit={save} className="flex items-center gap-2">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="View name" aria-label="View name" data-testid="clients-view-name-input" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" disabled={!name.trim()} data-testid="clients-view-save-confirm" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Save</button>
          <button type="button" onClick={() => { setNaming(false); setError(''); }} className="text-sm font-semibold text-slate-500">Cancel</button>
        </form>
      )}
      {canEdit && views.length > 0 && (
        <details className="relative text-sm">
          <summary className="cursor-pointer list-none text-xs font-semibold text-slate-400 hover:text-slate-600">Manage</summary>
          <ul className="absolute z-10 mt-1 w-60 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            {views.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 py-1">
                <span className="truncate text-slate-700">{v.name}</span>
                <button type="button" onClick={() => remove(v)} aria-label={`Delete view ${v.name}`} className="text-xs font-semibold text-slate-400 hover:text-red-600">Delete</button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
