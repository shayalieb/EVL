import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import { getBookkeeperExport, financialReceiptUrl } from '../lib/financials';
import { exportBookkeeperPackage } from '../lib/financialReportExports';

const inputClass = 'mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';
const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const money = (value) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function BookkeeperExportModal({ open, onClose, groups, defaultGroupId, businessName, onComplete }) {
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [groupId, setGroupId] = useState(defaultGroupId || '');
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) { setGroupId(defaultGroupId || ''); setReview(null); setError(''); } }, [defaultGroupId, open]);
  function changeFilters(setter, value) { setter(value); setReview(null); setError(''); }

  async function prepareReview() {
    setLoading(true); setError('');
    try { setReview(await getBookkeeperExport({ from, to, groupId, preview: true })); }
    catch (err) { setError(err.message || 'The package could not be prepared.'); }
    finally { setLoading(false); }
  }

  async function downloadPackage() {
    setLoading(true); setError('');
    try {
      const freshData = await getBookkeeperExport({ from, to, groupId, preview: false });
      const result = await exportBookkeeperPackage({ exportData: freshData, businessName, receiptUrl: financialReceiptUrl });
      onComplete(result.receiptErrors ? `Package downloaded, but ${result.receiptErrors} receipt ${result.receiptErrors === 1 ? 'file needs' : 'files need'} to be downloaded separately.` : 'Bookkeeper package downloaded');
      onClose();
    } catch (err) { setError(err.message || 'The package could not be downloaded.'); }
    finally { setLoading(false); }
  }

  const summary = review?.summary;
  return <Modal open={open} onClose={onClose} title="Export for bookkeeper" widthClass="max-w-2xl"><div className="space-y-5"><p className="text-sm text-slate-600">Create one organized ZIP file with payment history, a plain-language summary, items needing attention, and available receipts.</p><div className="grid gap-3 sm:grid-cols-3"><label className="text-sm font-semibold text-slate-700">From<input type="date" value={from} onChange={(event) => changeFilters(setFrom, event.target.value)} className={inputClass} /></label><label className="text-sm font-semibold text-slate-700">To<input type="date" value={to} onChange={(event) => changeFilters(setTo, event.target.value)} className={inputClass} /></label><label className="text-sm font-semibold text-slate-700">Scope<select value={groupId} onChange={(event) => changeFilters(setGroupId, event.target.value)} className={inputClass}><option value="">Entire account</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setFrom(yearStart()); setTo(today()); setReview(null); }} className="min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600">This year</button><button type="button" onClick={() => { const date = new Date(); date.setFullYear(date.getFullYear() - 1); setFrom(`${date.getFullYear()}-01-01`); setTo(`${date.getFullYear()}-12-31`); setReview(null); }} className="min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600">Last year</button><button type="button" onClick={() => { setFrom(''); setTo(''); setReview(null); }} className="min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600">All time</button></div>{error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}{summary && <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h4 className="font-bold text-slate-800">Review before downloading</h4><div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Money received</p><p className="mt-1 font-bold text-emerald-700">{money(summary.moneyReceived)}</p></div><div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Money paid out</p><p className="mt-1 font-bold text-rose-700">{money(summary.moneyPaidOut)}</p></div><div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Payment records</p><p className="mt-1 font-bold text-slate-800">{summary.transactionCount}</p></div></div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><p className={summary.missingReceiptCount ? 'font-semibold text-amber-700' : 'text-slate-500'}>{summary.missingReceiptCount} missing receipts</p><p className={summary.missingPayeeCount ? 'font-semibold text-amber-700' : 'text-slate-500'}>{summary.missingPayeeCount} missing vendors</p><p className={summary.unlinkedCount ? 'font-semibold text-amber-700' : 'text-slate-500'}>{summary.unlinkedCount} unlinked expenses</p></div><p className="mt-3 text-xs text-slate-500">{summary.receiptCount} receipt files will be included. Missing information does not block the download; it is listed in “items-to-review.csv.”</p></section>}<div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={loading} className="min-h-11 rounded-lg px-4 text-sm font-semibold text-slate-600">Cancel</button>{review ? <button type="button" onClick={downloadPackage} disabled={loading || !summary?.transactionCount} className="min-h-11 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Building package…' : 'Download ZIP package'}</button> : <button type="button" onClick={prepareReview} disabled={loading} className="min-h-11 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Preparing…' : 'Review package'}</button>}</div></div></Modal>;
}
