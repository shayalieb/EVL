import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MoneyInput from '../components/ui/MoneyInput';
import { listAgencyGroups } from '../lib/agencyGroups';
import { createFinancialExpense, getFinancialSummary, listFinancialTransactions, reverseFinancialTransaction } from '../lib/financials';

const inputClass = 'w-full min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';
const categories = [
  ['contractor_payment', 'Contractor payment'], ['production', 'Production'], ['backline', 'Backline'], ['travel', 'Travel'],
  ['processing_fee', 'Processing fee'], ['agency_commission', 'Agency commission'], ['tax', 'Tax'], ['reimbursement', 'Reimbursement'], ['other_expense', 'Other expense'],
];
const categoryLabel = Object.fromEntries([...categories, ['client_payment', 'Client payment'], ['payment_adjustment', 'Payment adjustment'], ['reversal', 'Reversal']]);
const money = (value) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const today = () => new Date().toISOString().slice(0, 10);

export default function FinancialsPage() {
  const { currentUser, can } = useAuth();
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showExpense, setShowExpense] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ amount: '', category: 'contractor_payment', description: '', occurredAt: today(), paymentMethod: '', reference: '', memo: '', groupId: '' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const filters = groupId ? { groupId } : {};
      const [nextSummary, ledger] = await Promise.all([getFinancialSummary(filters), listFinancialTransactions({ ...filters, pageSize: 50 })]);
      setSummary(nextSummary); setTransactions(ledger.transactions);
    } catch (err) { setError(err.message || 'Financial information could not be loaded.'); }
    finally { setLoading(false); }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (currentUser?.planTier === 'agency') listAgencyGroups().then(setGroups).catch(() => {}); }, [currentUser?.planTier]);

  async function saveExpense(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await createFinancialExpense({ ...form, groupId: form.groupId || groupId || null });
      setForm({ amount: '', category: 'contractor_payment', description: '', occurredAt: today(), paymentMethod: '', reference: '', memo: '', groupId: '' });
      setShowExpense(false); await load();
    } catch (err) { setError(err.message || 'Expense could not be recorded.'); }
    finally { setSaving(false); }
  }

  async function reverse(tx) {
    const reason = window.prompt('Why is this entry being corrected? The original will remain in the audit trail.');
    if (!reason?.trim()) return;
    try { await reverseFinancialTransaction(tx.id, reason.trim()); await load(); }
    catch (err) { setError(err.message || 'Transaction could not be reversed.'); }
  }

  return (
    <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Financials</h1><p className="mt-1 text-sm text-slate-500">Cash activity, outstanding balances, contractor obligations, and booking profitability.</p></div>
        <div className="flex flex-wrap gap-2">
          {groups.length > 0 && <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputClass} aria-label="Managed group"><option value="">All managed groups</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>}
          {can('manageBookings') && <button type="button" onClick={() => setShowExpense((value) => !value)} className="min-h-11 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">{showExpense ? 'Cancel' : '+ Record expense'}</button>}
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {showExpense && <form onSubmit={saveExpense} className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm space-y-4"><div><h2 className="font-bold text-slate-800">Record money paid out</h2><p className="text-xs text-slate-500 mt-1">Once posted, this entry cannot be edited. If it is wrong, reverse it so the audit history remains intact.</p></div><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"><label className="text-sm font-medium text-slate-700">Amount<MoneyInput value={form.amount} onChange={(amount) => setForm((old) => ({ ...old, amount }))} className={`${inputClass} mt-1`} /></label><label className="text-sm font-medium text-slate-700">Category<select value={form.category} onChange={(e) => setForm((old) => ({ ...old, category: e.target.value }))} className={`${inputClass} mt-1`}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Payment date<input type="date" value={form.occurredAt} onChange={(e) => setForm((old) => ({ ...old, occurredAt: e.target.value }))} className={`${inputClass} mt-1`} /></label><label className="text-sm font-medium text-slate-700">Method<select value={form.paymentMethod} onChange={(e) => setForm((old) => ({ ...old, paymentMethod: e.target.value }))} className={`${inputClass} mt-1`}><option value="">Not specified</option><option value="ach">ACH</option><option value="check">Check</option><option value="card">Card</option><option value="cash">Cash</option><option value="wire">Wire</option><option value="other">Other</option></select></label></div><div className="grid sm:grid-cols-2 gap-3"><label className="text-sm font-medium text-slate-700">Description<input required value={form.description} onChange={(e) => setForm((old) => ({ ...old, description: e.target.value }))} placeholder="What was this payment for?" className={`${inputClass} mt-1`} /></label><label className="text-sm font-medium text-slate-700">Reference<input value={form.reference} onChange={(e) => setForm((old) => ({ ...old, reference: e.target.value }))} placeholder="Check or confirmation number" className={`${inputClass} mt-1`} /></label></div>{groups.length > 0 && <label className="block text-sm font-medium text-slate-700 max-w-sm">Managed group<select value={form.groupId} onChange={(e) => setForm((old) => ({ ...old, groupId: e.target.value }))} className={`${inputClass} mt-1`}><option value="">Agency-wide / unassigned</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}<div className="flex justify-end"><button disabled={saving} className="min-h-11 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Recording…' : 'Record expense'}</button></div></form>}

      {loading && !summary ? <div className="py-20 text-center text-sm text-slate-400">Loading financials…</div> : summary && <>
        <section className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">{[['Cash received', summary.inflow, 'text-emerald-700'], ['Cash paid out', summary.outflow, 'text-rose-700'], ['Net cash', summary.netCash, summary.netCash >= 0 ? 'text-indigo-700' : 'text-rose-700'], ['Client balances due', summary.accountsReceivable, 'text-amber-700'], ['Contractor payables', summary.accountsPayable, 'text-violet-700']].map(([label, value, color]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-2 text-xl font-bold ${color}`}>{money(value)}</p></div>)}</section>

        <section className="grid lg:grid-cols-2 gap-5"><div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-800">Contractors awaiting payment</h2><p className="text-xs text-slate-500 mt-1">Based on unpaid contractor assignments with a saved rate.</p><div className="mt-4 divide-y divide-slate-100">{summary.payables.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No contractor payables found.</p> : summary.payables.map((item, index) => <Link key={`${item.eventId}-${item.contractorId}-${index}`} to={`/events/${item.eventId}?tab=financials`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50"><div className="min-w-0"><p className="text-sm font-semibold text-slate-700 truncate">{item.contractorName}</p><p className="text-xs text-slate-400 truncate">{item.eventName}</p></div><span className="text-sm font-bold text-slate-700">{money(item.amount)}</span></Link>)}</div></div><div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-800">Booking profitability</h2><p className="text-xs text-slate-500 mt-1">Billed revenue compared with currently known gig costs.</p><div className="mt-4 divide-y divide-slate-100">{summary.profitability.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">Issue an invoice to begin profitability tracking.</p> : summary.profitability.map((item) => <Link key={item.bookingId} to={`/bookings/${item.bookingId}?tab=invoices`} className="grid grid-cols-[1fr_auto] gap-3 py-3 hover:bg-slate-50"><div className="min-w-0"><p className="text-sm font-semibold text-slate-700 truncate">{item.name}</p><p className="text-xs text-slate-400">{money(item.billed)} billed · {money(item.estimatedCosts)} known costs</p></div><div className="text-right"><p className={`text-sm font-bold ${item.estimatedProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(item.estimatedProfit)}</p><p className="text-xs text-slate-400">{item.margin.toFixed(1)}%</p></div></Link>)}</div></div></section>
      </>}

      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden"><div className="px-5 py-4 border-b border-slate-100"><h2 className="font-bold text-slate-800">Accounting ledger</h2><p className="text-xs text-slate-500 mt-1">Permanent transaction history. Corrections create an equal and opposite entry.</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Description</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Entered by</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{transactions.length === 0 ? <tr><td colSpan="6" className="px-5 py-10 text-center text-slate-400">No posted transactions yet.</td></tr> : transactions.map((tx) => <tr key={tx.id} className={tx.reversed ? 'bg-slate-50 opacity-60' : ''}><td className="px-5 py-3 whitespace-nowrap text-slate-500">{new Date(tx.occurredAt).toLocaleDateString()}</td><td className="px-5 py-3"><p className="font-medium text-slate-700">{tx.description}</p>{tx.memo && <p className="text-xs text-slate-400">{tx.memo}</p>}</td><td className="px-5 py-3 text-slate-500">{categoryLabel[tx.category] || tx.category.replaceAll('_', ' ')}</td><td className="px-5 py-3 text-slate-500">{tx.createdBy ? `${tx.createdBy.firstName} ${tx.createdBy.lastName}` : 'System'}</td><td className={`px-5 py-3 text-right font-bold ${tx.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{tx.amount >= 0 ? '+' : '−'}{money(Math.abs(tx.amount))}</td><td className="px-5 py-3 text-right">{can('manageBookings') && !tx.reversed && !tx.reversalOfId && <button type="button" onClick={() => reverse(tx)} className="min-h-11 px-2 text-xs font-semibold text-slate-500 hover:text-rose-600">Reverse</button>}</td></tr>)}</tbody></table></div></section>
    </main>
  );
}
