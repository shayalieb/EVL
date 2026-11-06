import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { deleteClientCompany, getClientCompany, stageInfo, updateClientCompany } from '../lib/clients';
import { formatCurrency } from '../lib/format';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

function Stat({ label, value, tone = '', testId }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div data-testid={testId} className={`mt-1 text-lg font-bold ${tone || 'text-slate-800'}`}>{value}</div>
    </div>
  );
}

// Everyone at one organisation, with their money and activity rolled up.
export default function ClientCompanyPage() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canEdit = can('manageClients');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', website: '', notes: '' });
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try { setData(await getClientCompany(companyId)); setError(''); }
    catch (err) { setError(err.status === 404 ? 'This company could not be found.' : err.message || 'Could not load this company.'); }
  }, [companyId]);
  useEffect(() => { setData(null); load(); }, [load]);

  if (error) {
    return (
      <div>
        <Link to="/clients" className="text-sm font-semibold text-indigo-600 hover:underline">← Clients</Link>
        <p role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-6 text-sm text-red-600">{error}</p>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-slate-400">Loading company…</p>;

  const { company, stats, members } = data;
  const money = stats.money;

  function startEdit() {
    setForm({ name: company.name, phone: company.phone || '', website: company.website || '', notes: company.notes || '' });
    setFormError(''); setEditing(true);
  }
  async function save(e) {
    e.preventDefault();
    try { await updateClientCompany(company.id, form); setEditing(false); await load(); }
    catch (err) { setFormError(err.message); }
  }
  async function remove() {
    try { await deleteClientCompany(company.id); navigate('/clients'); }
    catch (err) { setFormError(err.message); setConfirmDelete(false); }
  }

  return (
    <div data-testid="client-company-page">
      <Link to="/clients" className="text-sm font-semibold text-indigo-600 hover:underline">← Clients</Link>
      <div className="mt-2 mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 data-testid="client-company-name" className="truncate text-2xl font-bold text-slate-800">{company.name}</h2>
          <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-slate-500">
            {company.phone && <a href={`tel:${company.phone}`} className="hover:text-indigo-600">{company.phone}</a>}
            {company.website && <a href={/^https?:\/\//i.test(company.website) ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600">{company.website}</a>}
          </div>
          {company.notes && <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-slate-600">{company.notes}</p>}
        </div>
        {canEdit && !editing && (
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-red-600">Delete company</button>
            <button type="button" onClick={startEdit} data-testid="client-company-edit" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Edit</button>
          </div>
        )}
      </div>

      {editing && (
        <form onSubmit={save} className="mb-6 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Company name" data-testid="client-company-name-input" maxLength={120} className={inputClass} />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" aria-label="Company phone" className={inputClass} />
            <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="Website" aria-label="Company website" className={inputClass} />
          </div>
          <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes about the organisation" aria-label="Company notes" className={inputClass} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" data-testid="client-company-save" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">Save</button>
          </div>
        </form>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="People" value={stats.memberCount} testId="client-company-stat-people" />
        {money && <Stat label="Lifetime paid" value={formatCurrency(money.paid)} testId="client-company-stat-paid" />}
        {money && <Stat label="Balance due" value={formatCurrency(money.outstanding)} tone={money.overdue > 0 ? 'text-rose-600' : money.outstanding > 0 ? 'text-amber-600' : ''} testId="client-company-stat-balance" />}
        <Stat label="Last contact" value={stats.lastContactAt ? new Date(stats.lastContactAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'} />
      </div>

      <h3 className="mb-2 text-sm font-bold text-slate-700">People at {company.name}</h3>
      {members.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">No clients are assigned to this company yet. Open a client and set their company.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {members.map((m) => {
            const stage = stageInfo(m.effectiveStage);
            return (
              <li key={m.id} data-testid="client-company-member">
                <Link to={`/clients/${m.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800">{m.firstName} {m.lastName}</div>
                    <div className="truncate text-xs text-slate-400">{[m.email, m.phone].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-sm">
                    {m.money?.outstanding > 0 && <span className={m.money.overdue > 0 ? 'font-semibold text-rose-600' : 'text-amber-600'}>{formatCurrency(m.money.outstanding)} due</span>}
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${stage.color}1f`, color: stage.color }}>{stage.label}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={remove} title="Delete company?" description="The people in it stay as clients; they just stop being grouped under this company." />
    </div>
  );
}
