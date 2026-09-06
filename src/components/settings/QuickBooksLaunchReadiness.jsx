import { useEffect, useState } from 'react';
import { useToast } from '../ui/Toast';
import { getQuickBooksLaunchReadiness } from '../../lib/quickBooks';

export default function QuickBooksLaunchReadiness() {
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  async function reload() {
    setLoading(true);
    try { setData(await getQuickBooksLaunchReadiness()); }
    catch (error) { showToast(error.message || 'Unable to run the QuickBooks readiness check', 'error'); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const readiness = data?.readiness;
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-800">QuickBooks launch readiness</h3>{readiness && <span className={`rounded-full px-2 py-1 text-xs font-semibold ${readiness.environment === 'sandbox' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-700'}`}>{readiness.environment === 'sandbox' ? 'Sandbox mode' : 'Production mode'}</span>}</div><p className="mt-1 text-sm text-slate-500">Complete both accounting paths with reviewed sample records before enabling the integration for customers.</p></div><button type="button" onClick={reload} disabled={loading} className="text-sm font-semibold text-indigo-600 disabled:opacity-50">{loading ? 'Checking…' : 'Run readiness check'}</button></div>{readiness && <><div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"><div className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-black ${readiness.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-600'}`}>{readiness.completed}/{readiness.total}</div><div><p className={`font-bold ${readiness.ready ? 'text-emerald-700' : 'text-slate-800'}`}>{readiness.ready ? 'Ready for controlled launch' : 'Testing is not complete'}</p><p className="mt-1 text-xs text-slate-500">A check becomes complete only after GigWorks can verify the related configuration or synchronized sample.</p></div></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{readiness.checks.map((check) => <div key={check.id} className={`rounded-lg border p-3 ${check.complete ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}><div className="flex gap-2"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${check.complete ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{check.complete ? '✓' : '○'}</span><div><p className="text-sm font-semibold text-slate-700">{check.label}</p>{!check.complete && <p className="mt-1 text-xs text-slate-500">{check.help}</p>}</div></div></div>)}</div>{readiness.environment === 'sandbox' && readiness.ready && <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Sandbox validation is complete. The final launch step is to configure the production Intuit app, reconnect the production company, and repeat the connection and mapping checks.</p>}{readiness.environment === 'production' && !readiness.ready && <p className="mt-4 text-xs text-slate-500">Recommendation: validate this checklist with a dedicated Intuit sandbox before inviting customers to connect live companies.</p>}</>}</section>;
}
