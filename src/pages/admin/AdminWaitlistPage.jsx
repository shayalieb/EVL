import { useEffect, useState } from 'react';
import { apiFetch } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import SearchInput from '../../components/ui/SearchInput';
import FilterSelect from '../../components/ui/FilterSelect';
import Pagination from '../../components/ui/Pagination';
import { matchesSearch } from '../../lib/search';
import { usePagination } from '../../lib/usePagination';

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'converted', label: 'Converted' },
  { value: 'archived', label: 'Archived' },
];
const PLAN_LABELS = { solo: 'Solo', team: 'Team', studio: 'Studio' };

export default function AdminWaitlistPage() {
  const { showToast } = useToast();
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    apiFetch('/admin/waitlist').then((data) => setEntries(data.entries)).catch((err) => setError(err.message));
  }, []);

  async function updateStatus(entry, nextStatus) {
    try {
      const data = await apiFetch(`/admin/waitlist/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setEntries((current) => current.map((item) => item.id === entry.id ? data.entry : item));
      showToast('Waitlist status updated');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const filtered = (entries || []).filter((entry) => {
    if (status && entry.status !== status) return false;
    return matchesSearch(search, [entry.name, entry.email, entry.businessName, entry.selectedPlan]);
  });
  const { page, setPage, pageCount, pageItems, pageSize, totalItems } = usePagination(filtered);

  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!entries) return <div className="text-sm text-slate-400">Loading…</div>;

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Waitlist</h2>
        <p className="text-sm text-slate-500 mt-1">People who requested access before public signup opened.</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, business, or email…" className="w-80" />
        <FilterSelect value={status} onChange={setStatus} allLabel="All Statuses" options={STATUS_OPTIONS} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3">Prospect</th><th className="px-4 py-3">Business</th><th className="px-4 py-3">Plan interest</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Status</th>
            </tr></thead>
            <tbody>
              {pageItems.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No waitlist signups match these filters.</td></tr>}
              {pageItems.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3"><div className="font-medium text-slate-800">{entry.name}</div><a href={`mailto:${entry.email}`} className="text-xs text-indigo-600">{entry.email}</a></td>
                  <td className="px-4 py-3 text-slate-500">{entry.businessName || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{entry.selectedPlan ? `${PLAN_LABELS[entry.selectedPlan]} · ${entry.billingInterval === 'year' ? 'Annual' : 'Monthly'}` : 'Not selected'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{new Date(entry.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3"><select value={entry.status} onChange={(e) => updateStatus(entry, e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold">{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
      </div>
    </div>
  );
}
