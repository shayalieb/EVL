import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { CLIENT_STAGES, ensureClientCompany, listClientCompanies, listClientTags, stageInfo, updateClientClassification } from '../lib/clients';

// Stage override + tag editor for one client, saved immediately on change.
export default function ClientClassification({ client, company, effectiveStage, canEdit, onSaved }) {
  const [tags, setTags] = useState(client.tags || []);
  const [stage, setStage] = useState(client.stage || '');
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState('');
  const [companyDraft, setCompanyDraft] = useState('');
  const [companyOptions, setCompanyOptions] = useState([]);
  const listId = useId();
  const companyListId = useId();

  useEffect(() => { setTags(client.tags || []); setStage(client.stage || ''); }, [client.id, client.tags, client.stage]);
  useEffect(() => { listClientTags().then(setSuggestions).catch(() => {}); }, [client.id]);
  useEffect(() => { if (canEdit) listClientCompanies().then(setCompanyOptions).catch(() => {}); }, [client.id, canEdit]);

  async function save(patch) {
    try {
      const updated = await updateClientClassification(client.id, patch);
      setTags(updated.tags); setStage(updated.stage || ''); setError('');
      onSaved?.(updated);
    } catch (err) {
      setError(err.message || 'Could not save.');
    }
  }

  function addTag(e) {
    e.preventDefault();
    const tag = draft.trim().toLowerCase();
    setDraft('');
    if (!tag || tags.includes(tag)) return;
    save({ tags: [...tags, tag] });
  }

  async function setCompany(e) {
    e.preventDefault();
    const name = companyDraft.trim();
    if (!name) return;
    setCompanyDraft('');
    try {
      const found = await ensureClientCompany(name);
      await save({ companyId: found.id });
    } catch (err) {
      setError(err.message || 'Could not set the company.');
    }
  }

  const shown = stageInfo(stage || effectiveStage);
  return (
    <div data-testid="client-classification" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        Stage
        {canEdit ? (
          <select value={stage} onChange={(e) => save({ stage: e.target.value || null })} data-testid="client-stage-select" className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-medium text-slate-700">
            <option value="">Automatic ({stageInfo(effectiveStage).label})</option>
            {CLIENT_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        ) : <span className="text-sm font-medium" style={{ color: shown.color }}>{shown.label}</span>}
      </label>
      <div data-testid="client-company-field" className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        Company
        {company ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
            <Link to={`/clients/company/${company.id}`} data-testid="client-company-link" className="hover:underline">{company.name}</Link>
            {canEdit && <button type="button" aria-label="Remove company" onClick={() => save({ companyId: null })} className="text-indigo-300 hover:text-red-600">×</button>}
          </span>
        ) : canEdit ? (
          <form onSubmit={setCompany}>
            <input value={companyDraft} onChange={(e) => setCompanyDraft(e.target.value)} list={companyListId} maxLength={120} placeholder="+ Add company" aria-label="Company" data-testid="client-company-input" className="w-36 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs font-normal focus:border-indigo-500 focus:outline-none" />
            <datalist id={companyListId}>{companyOptions.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </form>
        ) : <span className="font-normal text-slate-400">—</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span key={tag} data-testid="client-tag" className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {tag}
            {canEdit && <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => save({ tags: tags.filter((t) => t !== tag) })} className="text-slate-400 hover:text-red-600">×</button>}
          </span>
        ))}
        {canEdit && (
          <form onSubmit={addTag}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} list={listId} maxLength={30} placeholder="+ Add tag" aria-label="Add tag" data-testid="client-tag-input" className="w-28 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs focus:border-indigo-500 focus:outline-none" />
            <datalist id={listId}>{suggestions.filter((t) => !tags.includes(t)).map((t) => <option key={t} value={t} />)}</datalist>
          </form>
        )}
      </div>
    </div>
  );
}
