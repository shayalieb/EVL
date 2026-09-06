import { useEffect, useState } from 'react';
import { useToast } from '../ui/Toast';
import { runQuickBooksReconciliation, saveQuickBooksReconciliationSettings } from '../../lib/quickBooks';

export default function QuickBooksReconciliationPanel({ connection, setConnection }) {
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState(connection.reconciliationEnabled || false);
  const [frequency, setFrequency] = useState(connection.reconciliationFrequencyHours || 24);
  const [working, setWorking] = useState(false);
  useEffect(() => { setEnabled(connection.reconciliationEnabled || false); setFrequency(connection.reconciliationFrequencyHours || 24); }, [connection]);
  async function save() {
    setWorking(true);
    try { setConnection(await saveQuickBooksReconciliationSettings(enabled, Number(frequency))); showToast('Reconciliation settings saved'); }
    catch (error) { showToast(error.message || 'Unable to save reconciliation settings', 'error'); }
    finally { setWorking(false); }
  }
  async function runNow() {
    setWorking(true);
    try {
      const data = await runQuickBooksReconciliation();
      setConnection(data.connection);
      showToast(data.result.mismatches ? `${data.result.mismatches} records need review` : `${data.result.reviewed} records checked; no changes found`, data.result.mismatches ? 'error' : 'success');
    } catch (error) { showToast(error.message || 'Unable to reconcile QuickBooks', 'error'); }
    finally { setWorking(false); }
  }
  const status = connection.lastReconciliationStatus;
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><div><h3 className="font-bold text-slate-800">Reconciliation monitoring</h3><p className="mt-1 text-sm text-slate-500">Check synchronized records for changes or deletions made directly in QuickBooks. GigWorks only alerts you; it never overwrites either system automatically.</p></div><div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4"><label className="flex items-start gap-3"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600" /><span><span className="block text-sm font-semibold text-slate-800">Monitor automatically</span><span className="mt-1 block text-xs text-slate-500">Runs in the background and adds mismatches to QuickBooks activity.</span></span></label><label className="mt-4 block"><span className="mb-1 block text-xs font-semibold text-slate-600">Check frequency</span><select value={frequency} onChange={(event) => setFrequency(Number(event.target.value))} disabled={!enabled} className="min-h-11 w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"><option value={6}>Every 6 hours</option><option value={12}>Every 12 hours</option><option value={24}>Daily — recommended</option><option value={168}>Weekly</option></select></label><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={save} disabled={working} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save monitoring</button><button type="button" onClick={runNow} disabled={working} className="rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-600 disabled:opacity-50">{working ? 'Checking…' : 'Check now'}</button></div></div><div className="mt-4 flex flex-wrap items-center gap-2 text-sm"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${status === 'healthy' ? 'bg-emerald-100 text-emerald-700' : status === 'needs_review' || status === 'failed' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{status === 'healthy' ? 'Healthy' : status === 'needs_review' ? 'Review needed' : status === 'failed' ? 'Check failed' : 'Not checked yet'}</span><span className="text-slate-500">{connection.lastReconciliationAt ? `Last checked ${new Date(connection.lastReconciliationAt).toLocaleString()}` : 'Run the first check when your sandbox is connected.'}</span></div>{connection.lastError && status === 'failed' && <p className="mt-2 text-xs text-red-600">{connection.lastError}</p>}</section>;
}
