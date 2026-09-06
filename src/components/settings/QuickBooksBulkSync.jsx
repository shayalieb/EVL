import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../ui/Toast';
import { getQuickBooksBillPreview, getQuickBooksContractorPaymentPreview, getQuickBooksPaymentPreview, getQuickBooksSyncPreview, syncQuickBooksBill, syncQuickBooksContractorPayment, syncQuickBooksInvoice, syncQuickBooksPayment } from '../../lib/quickBooks';

const MAX_BATCH = 25;
const CONCURRENCY = 2;

async function runControlled(items, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      try { await worker(items[index]); results[index] = { ...items[index], ok: true }; }
      catch (error) { results[index] = { ...items[index], ok: false, error: error.message || 'Synchronization failed.' }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, next));
  return results;
}

function money(value) { return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }); }

export default function QuickBooksBulkSync() {
  const { showToast } = useToast();
  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [results, setResults] = useState([]);

  async function reload() {
    setLoading(true);
    try {
      const [invoices, clientPayments, bills, contractorPayments] = await Promise.all([getQuickBooksSyncPreview(), getQuickBooksPaymentPreview(), getQuickBooksBillPreview(), getQuickBooksContractorPaymentPreview()]);
      const combined = [
        ...(invoices.rows || []).map((row) => ({ key: `invoice:${row.id}`, type: 'invoice', title: `Invoice #${row.number || '—'} · ${row.bookingName}`, detail: `${row.client?.name || 'No client'} · ${money(row.total)}`, status: row.syncStatus, sync: () => syncQuickBooksInvoice(row.id) })),
        ...(clientPayments.rows || []).map((row) => ({ key: `client-payment:${row.id}`, type: 'client payment', title: `Payment · Invoice #${row.invoiceNumber || '—'}`, detail: `${row.bookingName} · ${money(Math.abs(row.amount))}`, status: row.syncStatus, sync: () => syncQuickBooksPayment(row.id) })),
        ...(bills.rows || []).map((row) => ({ key: `bill:${row.localId}`, type: 'contractor bill', title: `${row.contractorName} · ${row.eventName}`, detail: `${row.eventDate || 'No date'} · ${money(row.amount)}`, status: row.syncStatus, sync: () => syncQuickBooksBill(row.eventId, row.assignmentId) })),
        ...(contractorPayments.rows || []).map((row) => ({ key: `contractor-payment:${row.id}`, type: 'contractor payment', title: `${row.contractorName} · ${row.eventName}`, detail: `${new Date(row.occurredAt).toLocaleDateString()} · ${money(row.amount)}`, status: row.syncStatus, sync: () => syncQuickBooksContractorPayment(row.id) })),
      ];
      setRecords(combined);
      setSelected(new Set());
      setResults([]);
    } catch (error) { showToast(error.message || 'Unable to load the bulk review.', 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = useMemo(() => records.filter((record) => record.status === 'ready'), [records]);
  const chosen = ready.filter((record) => selected.has(record.key));
  const blockedCount = records.filter((record) => !['ready', 'synced', 'not_confirmed', 'not_eligible'].includes(record.status)).length;

  function toggle(record) {
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(record.key)) next.delete(record.key);
      else if (next.size < MAX_BATCH) next.add(record.key);
      else showToast(`Choose up to ${MAX_BATCH} records at a time.`, 'error');
      return next;
    });
  }

  async function synchronize() {
    setConfirming(false);
    setRunning(true);
    const completed = await runControlled(chosen, (record) => record.sync());
    setResults(completed);
    setRunning(false);
    setSelected(new Set());
    const failed = completed.filter((item) => !item.ok).length;
    showToast(failed ? `${completed.length - failed} synchronized; ${failed} need attention.` : `${completed.length} records synchronized.`, failed ? 'error' : 'success');
  }

  function selectFirstReady() { setSelected(new Set(ready.slice(0, MAX_BATCH).map((record) => record.key))); }
  return <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-800">Bulk synchronization</h3><p className="mt-1 text-sm text-slate-500">Choose up to {MAX_BATCH} ready records. GigWorks processes two at a time and never creates customers or vendors in bulk.</p></div><button type="button" onClick={reload} disabled={loading || running} className="text-sm font-semibold text-indigo-600">{loading ? 'Loading…' : 'Refresh'}</button></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-white p-3"><p className="text-xs font-semibold text-slate-500">Ready</p><p className="mt-1 text-2xl font-bold text-indigo-700">{ready.length}</p></div><div className="rounded-lg bg-white p-3"><p className="text-xs font-semibold text-slate-500">Blocked</p><p className="mt-1 text-2xl font-bold text-amber-700">{blockedCount}</p></div><div className="rounded-lg bg-white p-3"><p className="text-xs font-semibold text-slate-500">Selected</p><p className="mt-1 text-2xl font-bold text-slate-800">{selected.size}/{MAX_BATCH}</p></div></div>
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={selectFirstReady} disabled={!ready.length || running} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-600 disabled:opacity-40">Select ready</button><button type="button" onClick={() => setSelected(new Set())} disabled={!selected.size || running} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40">Clear</button><button type="button" onClick={() => setConfirming(true)} disabled={!selected.size || running} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Review {selected.size} selected</button></div>
    <div className="mt-4 max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">{!ready.length ? <p className="p-6 text-center text-sm text-slate-400">No records are ready for bulk synchronization.</p> : ready.map((record) => <label key={record.key} className="flex min-h-14 cursor-pointer items-center gap-3 p-3 hover:bg-slate-50"><input type="checkbox" checked={selected.has(record.key)} onChange={() => toggle(record)} disabled={running} className="h-4 w-4 rounded border-slate-300 text-indigo-600" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{record.title}</span><span className="block truncate text-xs text-slate-500">{record.detail}</span></span><span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700">{record.type}</span></label>)}</div>
    {confirming && <div className="mt-4 rounded-lg border border-indigo-200 bg-white p-4"><h4 className="font-bold text-slate-800">Ready to synchronize {chosen.length} records?</h4><p className="mt-1 text-sm text-slate-600">This will create the selected accounting records in QuickBooks. Existing duplicate protection remains active.</p><div className="mt-3 flex gap-2"><button type="button" onClick={synchronize} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Confirm and sync</button><button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button></div></div>}
    {running && <p className="mt-4 rounded-lg bg-white p-4 text-sm font-semibold text-indigo-700">Synchronizing selected records with controlled concurrency…</p>}
    {!!results.length && <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><h4 className="font-bold text-slate-800">Latest batch results</h4><button type="button" onClick={reload} className="text-sm font-semibold text-indigo-600">Reload review</button></div><div className="mt-3 space-y-2">{results.map((result) => <div key={result.key} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-slate-700">{result.title}</span><span className={`font-semibold ${result.ok ? 'text-emerald-700' : 'text-red-700'}`}>{result.ok ? 'Synchronized' : result.error}</span></div>)}</div></div>}
  </section>;
}
