import { useCallback, useEffect, useState } from 'react';
import { closeFinancialPeriod, listFinancialPeriods, reopenFinancialPeriod } from '../lib/financials';

function recentMonths(count = 12) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index - 1, 1));
    return { key: date.toISOString().slice(0, 7), label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  });
}

export default function FinancialPeriodControls({ groupId, role }) {
  const [periods, setPeriods] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const months = recentMonths();
  const canClose = role === 'owner' || role === 'admin';

  const load = useCallback(() => listFinancialPeriods(groupId).then(setPeriods).catch((err) => setError(err.message)), [groupId]);
  useEffect(() => { load(); }, [load]);

  async function close(month) {
    const reason = window.prompt(`Closing ${month} prevents backdated financial changes. Enter a closing note:`);
    if (!reason?.trim()) return;
    setBusy(month); setError('');
    try { await closeFinancialPeriod(month, groupId, reason.trim()); await load(); }
    catch (err) { setError(err.message || 'The period could not be closed.'); }
    finally { setBusy(''); }
  }

  async function reopen(month) {
    const reason = window.prompt(`Why are you reopening ${month}? This reason will be retained in the audit history.`);
    if (!reason?.trim()) return;
    setBusy(month); setError('');
    try { await reopenFinancialPeriod(month, groupId, reason.trim()); await load(); }
    catch (err) { setError(err.message || 'The period could not be reopened.'); }
    finally { setBusy(''); }
  }

  return <section className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm"><div className="px-5 py-4 border-b border-slate-100"><h2 className="font-bold text-slate-800">Accounting periods</h2><p className="mt-1 text-xs text-slate-500">Close completed months after reconciliation. Closed months reject backdated payments, expenses, and contractor-payment changes.</p></div>{error && <div className="mx-5 mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 p-5">{months.map((month) => { const period = periods.find((item) => item.month === month.key); const closed = period?.status === 'closed'; const latest = period?.activities?.[0]; return <div key={month.key} className={`rounded-lg border p-4 ${closed ? 'border-slate-300 bg-slate-50' : 'border-emerald-100 bg-emerald-50/40'}`}><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-800">{month.label}</p><p className={`mt-1 text-xs font-semibold ${closed ? 'text-slate-500' : 'text-emerald-700'}`}>{closed ? 'Closed' : 'Open'}</p></div>{canClose && (closed ? role === 'owner' && <button disabled={busy === month.key} type="button" onClick={() => reopen(month.key)} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:text-indigo-700 disabled:opacity-50">Reopen</button> : <button disabled={busy === month.key} type="button" onClick={() => close(month.key)} className="min-h-11 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50">Close month</button>)}</div>{latest && <div className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500"><p>{latest.action === 'closed' ? 'Closed' : 'Reopened'} by {latest.actor ? `${latest.actor.firstName} ${latest.actor.lastName}` : 'System'}</p><p className="mt-1 line-clamp-2">{latest.reason}</p></div>}</div>; })}</div>{!canClose && <p className="px-5 pb-5 text-xs text-slate-500">Only account owners and administrators can close a month. Only the owner can reopen one.</p>}</section>;
}
