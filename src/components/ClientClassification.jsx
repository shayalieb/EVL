import { useEffect, useId, useState } from 'react';
import { CLIENT_STAGES, listClientTags, stageInfo, updateClientClassification } from '../lib/clients';

// Stage override + tag editor for one client, saved immediately on change.
export default function ClientClassification({ client, effectiveStage, canEdit, onSaved }) {
  const [tags, setTags] = useState(client.tags || []);
  const [stage, setStage] = useState(client.stage || '');
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState('');
  const listId = useId();

  useEffect(() => { setTags(client.tags || []); setStage(client.stage || ''); }, [client.id, client.tags, client.stage]);
  useEffect(() => { listClientTags().then(setSuggestions).catch(() => {}); }, [client.id]);

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
