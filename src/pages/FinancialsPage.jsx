import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MoneyInput from '../components/ui/MoneyInput';
import FinancialForecastDashboard from '../components/FinancialForecastDashboard';
import FinancialPeriodControls from '../components/FinancialPeriodControls';
import { listAgencyGroups } from '../lib/agencyGroups';
import { authorizeFinancialExport, createFinancialExpense, deleteFinancialView, getFinancialForecast, getFinancialReports, getFinancialSummary, listFinancialTransactions, listSavedFinancialViews, reverseFinancialTransaction, saveFinancialView } from '../lib/financials';
import { exportFinancialReportCsv, exportFinancialReportPdf } from '../lib/financialReportExports';

const inputClass = 'w-full min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';
const categories = [
  ['contractor_payment', 'Contractor payment'], ['production', 'Production'], ['backline', 'Backline'], ['travel', 'Travel'],
  ['processing_fee', 'Processing fee'], ['agency_commission', 'Agency commission'], ['tax', 'Tax'], ['reimbursement', 'Reimbursement'], ['other_expense', 'Other expense'],
];
const categoryLabel = Object.fromEntries([...categories, ['client_payment', 'Client payment'], ['payment_adjustment', 'Payment adjustment'], ['reversal', 'Reversal']]);
const money = (value) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const today = () => new Date().toISOString().slice(0, 10);
const startOfYear = () => `${new Date().getFullYear()}-01-01`;
const reportTabs = [['pnl', 'Profit & Loss'], ['receivables', 'Receivables Aging'], ['payables', 'Contractor Payables'], ['profitability', 'Booking Profitability']];

function ReportTable({ headers, children, empty }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400"><tr>{headers.map((header) => <th key={header.label} className={`px-4 py-3 ${header.right ? 'text-right' : ''}`}>{header.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{children || <tr><td colSpan={headers.length} className="px-5 py-10 text-center text-slate-400">{empty}</td></tr>}</tbody></table></div>;
}

function ProfitAndLossReport({ report }) {
  const rows = [...report.income.map((row) => ({ ...row, type: 'Income' })), ...report.expenses.map((row) => ({ ...row, type: 'Expense' }))];
  return <><div className="grid sm:grid-cols-3 gap-3 p-5"><Metric label="Income received" value={report.totalIncome} color="text-emerald-700" /><Metric label="Expenses paid" value={report.totalExpenses} color="text-rose-700" /><Metric label="Net income" value={report.netIncome} color={report.netIncome >= 0 ? 'text-indigo-700' : 'text-rose-700'} /></div><div className="px-5 pb-4 text-xs text-slate-500"><strong>Cash basis:</strong> income appears when received and expenses when paid.</div><ReportTable headers={[{ label: 'Type' }, { label: 'Category' }, { label: 'Amount', right: true }]} empty="No cash activity in this period.">{rows.length > 0 && rows.map((row) => <tr key={`${row.type}-${row.category}`}><td className="px-4 py-3 text-slate-500">{row.type}</td><td className="px-4 py-3 font-medium text-slate-700 capitalize">{(categoryLabel[row.category] || row.category).replaceAll('_', ' ')}</td><td className={`px-4 py-3 text-right font-bold ${row.type === 'Income' ? 'text-emerald-700' : 'text-rose-700'}`}>{money(row.amount)}</td></tr>)}</ReportTable></>;
}

function ReceivablesReport({ report }) {
  const buckets = [['Current', report.totals.current], ['1–30 days', report.totals.days1to30], ['31–60 days', report.totals.days31to60], ['61–90 days', report.totals.days61to90], ['90+ days', report.totals.days90plus]];
  return <><div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-5">{buckets.map(([label, amount]) => <Metric key={label} label={label} value={amount} color={label === 'Current' ? 'text-slate-700' : 'text-amber-700'} />)}</div><ReportTable headers={[{ label: 'Client / booking' }, { label: 'Invoice' }, { label: 'Due date' }, { label: 'Age' }, { label: 'Balance', right: true }]} empty="No outstanding client balances.">{report.rows.length > 0 && report.rows.map((row) => <tr key={row.invoiceId}><td className="px-4 py-3"><Link to={`/bookings/${row.bookingId}?tab=invoices`} className="font-semibold text-indigo-600 hover:text-indigo-700">{row.clientName}</Link><p className="text-xs text-slate-400">{row.bookingName}</p></td><td className="px-4 py-3 text-slate-500">#{row.invoiceNumber ?? '—'}</td><td className="px-4 py-3 text-slate-500">{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : 'No due date'}</td><td className={`px-4 py-3 ${row.overdueDays > 0 ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>{row.overdueDays > 0 ? `${row.overdueDays} days overdue` : 'Current'}</td><td className="px-4 py-3 text-right font-bold text-slate-700">{money(row.balance)}</td></tr>)}</ReportTable></>;
}

function PayablesReport({ report }) {
  return <><div className="grid sm:grid-cols-2 gap-3 p-5"><Metric label="Total contractor payables" value={report.total} color="text-violet-700" /><Metric label="Past-event payables" value={report.overdueTotal} color="text-rose-700" /></div><ReportTable headers={[{ label: 'Contractor' }, { label: 'Event' }, { label: 'Event date' }, { label: 'Status' }, { label: 'Expected pay', right: true }]} empty="No unpaid contractor assignments in this period.">{report.rows.length > 0 && report.rows.map((row, index) => <tr key={`${row.eventId}-${row.contractorId}-${index}`}><td className="px-4 py-3 font-semibold text-slate-700">{row.contractorName}</td><td className="px-4 py-3"><Link to={`/events/${row.eventId}?tab=financials`} className="font-medium text-indigo-600 hover:text-indigo-700">{row.eventName}</Link></td><td className="px-4 py-3 text-slate-500">{row.eventDate || 'Not scheduled'}</td><td className={`px-4 py-3 ${row.overdueDays > 0 ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>{row.overdueDays > 0 ? `Event passed ${row.overdueDays} days ago` : 'Upcoming'}</td><td className="px-4 py-3 text-right font-bold text-slate-700">{money(row.expectedAmount)}</td></tr>)}</ReportTable></>;
}

function ProfitabilityReport({ report }) {
  return <><div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-5"><Metric label="Billed" value={report.totalBilled} color="text-slate-700" /><Metric label="Collected" value={report.totalCollected} color="text-emerald-700" /><Metric label="Known costs" value={report.totalCosts} color="text-rose-700" /><Metric label="Estimated profit" value={report.totalProfit} color={report.totalProfit >= 0 ? 'text-indigo-700' : 'text-rose-700'} /></div><ReportTable headers={[{ label: 'Booking' }, { label: 'Billed', right: true }, { label: 'Collected', right: true }, { label: 'Costs', right: true }, { label: 'Profit', right: true }, { label: 'Margin', right: true }]} empty="No bookings with financial activity in this period.">{report.rows.length > 0 && report.rows.map((row) => <tr key={row.bookingId}><td className="px-4 py-3"><Link to={`/bookings/${row.bookingId}?tab=invoices`} className="font-semibold text-indigo-600 hover:text-indigo-700">{row.name}</Link><p className="text-xs text-slate-400">{row.eventDate || 'Date not set'}{!row.costingComplete ? ' · Missing contractor rate' : ''}</p></td><td className="px-4 py-3 text-right text-slate-600">{money(row.billed)}</td><td className="px-4 py-3 text-right text-emerald-700">{money(row.collected)}</td><td className="px-4 py-3 text-right text-rose-700">{money(row.totalCosts)}</td><td className={`px-4 py-3 text-right font-bold ${row.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(row.profit)}</td><td className="px-4 py-3 text-right font-semibold text-slate-600">{row.margin === null ? '—' : `${row.margin.toFixed(1)}%`}</td></tr>)}</ReportTable></>;
}

function Metric({ label, value, color }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-1 text-lg font-bold ${color}`}>{money(value)}</p></div>;
}

function displayedReports(reports, tab, search, sort) {
  if (!reports) return null;
  const copy = { ...reports, [tab === 'pnl' ? 'profitAndLoss' : tab]: { ...reports[tab === 'pnl' ? 'profitAndLoss' : tab] } };
  if (tab === 'pnl') {
    const matches = (row) => `${row.category} ${row.amount}`.toLowerCase().includes(search.toLowerCase());
    copy.profitAndLoss.income = reports.profitAndLoss.income.filter(matches);
    copy.profitAndLoss.expenses = reports.profitAndLoss.expenses.filter(matches);
    return copy;
  }
  const source = reports[tab].rows || [];
  const rows = source.filter((row) => Object.values(row).join(' ').toLowerCase().includes(search.toLowerCase()));
  const selectors = {
    amount: (row) => row.balance ?? row.expectedAmount ?? row.profit ?? 0,
    name: (row) => row.clientName || row.contractorName || row.name || '',
    date: (row) => row.dueDate || row.eventDate || '',
    urgency: (row) => row.overdueDays || 0,
  };
  const selector = selectors[sort] || selectors.amount;
  rows.sort((a, b) => typeof selector(a) === 'string' ? selector(a).localeCompare(selector(b)) : selector(b) - selector(a));
  copy[tab].rows = rows;
  return copy;
}

export default function FinancialsPage() {
  const { currentUser, can, role } = useAuth();
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [reports, setReports] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const [reportTab, setReportTab] = useState('pnl');
  const [reportSearch, setReportSearch] = useState('');
  const [reportSort, setReportSort] = useState('amount');
  const [savedViews, setSavedViews] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showExpense, setShowExpense] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ amount: '', category: 'contractor_payment', description: '', occurredAt: today(), paymentMethod: '', reference: '', memo: '', groupId: '' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const filters = { ...(groupId ? { groupId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };
      const [nextSummary, ledger, nextReports, nextForecast] = await Promise.all([getFinancialSummary(filters), listFinancialTransactions({ ...filters, pageSize: 50 }), getFinancialReports(filters), getFinancialForecast(groupId ? { groupId } : {})]);
      setSummary(nextSummary); setTransactions(ledger.transactions); setReports(nextReports); setForecast(nextForecast);
    } catch (err) { setError(err.message || 'Financial information could not be loaded.'); }
    finally { setLoading(false); }
  }, [groupId, from, to]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (currentUser?.planTier === 'agency') listAgencyGroups().then(setGroups).catch(() => {}); }, [currentUser?.planTier]);
  useEffect(() => { listSavedFinancialViews().then(setSavedViews).catch(() => {}); }, []);

  const visibleReports = displayedReports(reports, reportTab, reportSearch, reportSort);

  async function saveView() {
    const name = window.prompt('Name this report view:');
    if (!name?.trim()) return;
    try {
      const view = await saveFinancialView({ name: name.trim(), reportTab, filters: { from, to, groupId } });
      setSavedViews((old) => [view, ...old.filter((item) => item.id !== view.id && item.name !== view.name)]);
    } catch (err) { setError(err.message || 'The report view could not be saved.'); }
  }

  function applyView(view) {
    setReportTab(view.reportTab); setFrom(view.filters?.from || ''); setTo(view.filters?.to || ''); setGroupId(view.filters?.groupId || ''); setReportSearch('');
  }

  async function removeView(event, view) {
    event.stopPropagation();
    try { await deleteFinancialView(view.id); setSavedViews((old) => old.filter((item) => item.id !== view.id)); }
    catch (err) { setError(err.message || 'The saved view could not be removed.'); }
  }

  async function exportPdf() {
    if (!visibleReports) return;
    setExporting(true);
    try { await authorizeFinancialExport(reportTab, 'pdf', { from, to, groupId }); await exportFinancialReportPdf({ tab: reportTab, reports: visibleReports, businessInfo: currentUser?.businessInfo, groupName: groups.find((group) => group.id === groupId)?.name, from, to }); }
    catch { setError('The PDF could not be generated.'); }
    finally { setExporting(false); }
  }

  async function exportCsv() {
    if (!visibleReports) return;
    setExporting(true); setError('');
    try { await authorizeFinancialExport(reportTab, 'csv', { from, to, groupId }); exportFinancialReportCsv({ tab: reportTab, reports: visibleReports }); }
    catch (err) { setError(err.message || 'The CSV could not be generated.'); }
    finally { setExporting(false); }
  }

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
          {can('recordFinancialTransactions') && <button type="button" onClick={() => setShowExpense((value) => !value)} className="min-h-11 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">{showExpense ? 'Cancel' : '+ Record expense'}</button>}
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} mt-1`} /></label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-1`} /></label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setFrom(startOfYear()); setTo(today()); }} className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">This year</button>
            <button type="button" onClick={() => { const date = new Date(); date.setMonth(date.getMonth() - 12); setFrom(date.toISOString().slice(0, 10)); setTo(today()); }} className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Last 12 months</button>
            <button type="button" onClick={() => { setFrom(''); setTo(''); }} className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">All time</button>
          </div>
          {loading && <span className="pb-3 text-xs text-slate-400">Refreshing…</span>}
        </div>
        {savedViews.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"><span className="text-xs font-semibold text-slate-400">Saved views</span>{savedViews.map((view) => <div key={view.id} className="flex min-h-9 items-center rounded-full bg-indigo-50"><button type="button" onClick={() => applyView(view)} className="min-h-9 pl-3 pr-2 text-xs font-semibold text-indigo-700 hover:text-indigo-900">{view.name}</button><button type="button" onClick={(event) => removeView(event, view)} className="min-h-9 px-2 text-indigo-300 hover:text-rose-600" aria-label={`Delete ${view.name}`}>×</button></div>)}</div>}
      </section>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {showExpense && <form onSubmit={saveExpense} className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm space-y-4"><div><h2 className="font-bold text-slate-800">Record money paid out</h2><p className="text-xs text-slate-500 mt-1">Once posted, this entry cannot be edited. If it is wrong, reverse it so the audit history remains intact.</p></div><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"><label className="text-sm font-medium text-slate-700">Amount<MoneyInput value={form.amount} onChange={(amount) => setForm((old) => ({ ...old, amount }))} className={`${inputClass} mt-1`} /></label><label className="text-sm font-medium text-slate-700">Category<select value={form.category} onChange={(e) => setForm((old) => ({ ...old, category: e.target.value }))} className={`${inputClass} mt-1`}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Payment date<input type="date" value={form.occurredAt} onChange={(e) => setForm((old) => ({ ...old, occurredAt: e.target.value }))} className={`${inputClass} mt-1`} /></label><label className="text-sm font-medium text-slate-700">Method<select value={form.paymentMethod} onChange={(e) => setForm((old) => ({ ...old, paymentMethod: e.target.value }))} className={`${inputClass} mt-1`}><option value="">Not specified</option><option value="ach">ACH</option><option value="check">Check</option><option value="card">Card</option><option value="cash">Cash</option><option value="wire">Wire</option><option value="other">Other</option></select></label></div><div className="grid sm:grid-cols-2 gap-3"><label className="text-sm font-medium text-slate-700">Description<input required value={form.description} onChange={(e) => setForm((old) => ({ ...old, description: e.target.value }))} placeholder="What was this payment for?" className={`${inputClass} mt-1`} /></label><label className="text-sm font-medium text-slate-700">Reference<input value={form.reference} onChange={(e) => setForm((old) => ({ ...old, reference: e.target.value }))} placeholder="Check or confirmation number" className={`${inputClass} mt-1`} /></label></div>{groups.length > 0 && <label className="block text-sm font-medium text-slate-700 max-w-sm">Managed group<select value={form.groupId} onChange={(e) => setForm((old) => ({ ...old, groupId: e.target.value }))} className={`${inputClass} mt-1`}><option value="">Agency-wide / unassigned</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}<div className="flex justify-end"><button disabled={saving} className="min-h-11 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Recording…' : 'Record expense'}</button></div></form>}

      {forecast && <FinancialForecastDashboard forecast={forecast} groupId={groupId} canManage={can('manageFinancialBudgets')} onRefresh={load} />}
      <FinancialPeriodControls groupId={groupId} role={role} />

      {loading && !summary ? <div className="py-20 text-center text-sm text-slate-400">Loading financials…</div> : summary && <>
        <section className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">{[['Cash received', summary.inflow, 'text-emerald-700'], ['Cash paid out', summary.outflow, 'text-rose-700'], ['Net cash', summary.netCash, summary.netCash >= 0 ? 'text-indigo-700' : 'text-rose-700'], ['Client balances due', summary.accountsReceivable, 'text-amber-700'], ['Contractor payables', summary.accountsPayable, 'text-violet-700']].map(([label, value, color]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-2 text-xl font-bold ${color}`}>{money(value)}</p></div>)}</section>

        <section className="grid lg:grid-cols-2 gap-5"><div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-800">Contractors awaiting payment</h2><p className="text-xs text-slate-500 mt-1">Based on unpaid contractor assignments with a saved rate.</p><div className="mt-4 divide-y divide-slate-100">{summary.payables.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No contractor payables found.</p> : summary.payables.map((item, index) => <Link key={`${item.eventId}-${item.contractorId}-${index}`} to={`/events/${item.eventId}?tab=financials`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50"><div className="min-w-0"><p className="text-sm font-semibold text-slate-700 truncate">{item.contractorName}</p><p className="text-xs text-slate-400 truncate">{item.eventName}</p></div><span className="text-sm font-bold text-slate-700">{money(item.amount)}</span></Link>)}</div></div><div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-800">Booking profitability</h2><p className="text-xs text-slate-500 mt-1">Billed revenue compared with currently known gig costs.</p><div className="mt-4 divide-y divide-slate-100">{summary.profitability.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">Issue an invoice to begin profitability tracking.</p> : summary.profitability.map((item) => <Link key={item.bookingId} to={`/bookings/${item.bookingId}?tab=invoices`} className="grid grid-cols-[1fr_auto] gap-3 py-3 hover:bg-slate-50"><div className="min-w-0"><p className="text-sm font-semibold text-slate-700 truncate">{item.name}</p><p className="text-xs text-slate-400">{money(item.billed)} billed · {money(item.estimatedCosts)} known costs</p></div><div className="text-right"><p className={`text-sm font-bold ${item.estimatedProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(item.estimatedProfit)}</p><p className="text-xs text-slate-400">{item.margin.toFixed(1)}%</p></div></Link>)}</div></div></section>
      </>}

      {reports?.dataQuality?.issues.length > 0 && <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="font-bold text-amber-900">Financial data needs attention</h2><p className="mt-1 text-sm text-amber-700">{reports.dataQuality.issueCount} records may affect report accuracy.</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Review before exporting</span></div><div className="mt-4 grid md:grid-cols-2 gap-3">{reports.dataQuality.issues.map((issue) => <div key={issue.id} className="rounded-lg border border-amber-200 bg-white p-4"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-800">{issue.title}</h3><span className="text-xs font-bold text-amber-700">{issue.count}</span></div><p className="mt-1 text-xs text-slate-500">{issue.detail}</p>{issue.links.length > 0 && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{issue.links.map((link) => <Link key={`${issue.id}-${link.path}`} to={link.path} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">Fix {link.label} →</Link>)}</div>}</div>)}</div></section>}

      {visibleReports && <section className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="border-b border-slate-200 px-3 pt-3">
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Financial reports">
            {reportTabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={reportTab === id} onClick={() => setReportTab(id)} className={`min-h-11 whitespace-nowrap rounded-t-lg px-4 text-sm font-semibold ${reportTab === id ? 'border border-b-white border-slate-200 bg-white text-indigo-700 -mb-px' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>{label}</button>)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3"><input type="search" value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} placeholder="Search this report…" aria-label="Search this report" className={`${inputClass} max-w-xs`} /><select value={reportSort} onChange={(e) => setReportSort(e.target.value)} className={`${inputClass} max-w-48`} aria-label="Sort report"><option value="amount">Highest amount</option><option value="urgency">Most overdue</option><option value="date">Date</option><option value="name">Name</option></select><div className="ml-auto flex flex-wrap gap-2"><button type="button" onClick={saveView} className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Save view</button>{can('exportFinancialReports') && <><button type="button" disabled={exporting} onClick={exportCsv} className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">Export CSV</button><button type="button" disabled={exporting} onClick={exportPdf} className="min-h-11 rounded-lg bg-slate-800 px-3 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60">{exporting ? 'Creating…' : 'Export PDF'}</button></>}</div></div>
        {reportTab === 'pnl' && <ProfitAndLossReport report={visibleReports.profitAndLoss} />}
        {reportTab === 'receivables' && <ReceivablesReport report={visibleReports.receivables} />}
        {reportTab === 'payables' && <PayablesReport report={visibleReports.payables} />}
        {reportTab === 'profitability' && <ProfitabilityReport report={visibleReports.profitability} />}
      </section>}

      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden"><div className="px-5 py-4 border-b border-slate-100"><h2 className="font-bold text-slate-800">Accounting ledger</h2><p className="text-xs text-slate-500 mt-1">Permanent transaction history. Corrections create an equal and opposite entry.</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Description</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Entered by</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{transactions.length === 0 ? <tr><td colSpan="6" className="px-5 py-10 text-center text-slate-400">No posted transactions yet.</td></tr> : transactions.map((tx) => <tr key={tx.id} className={tx.reversed ? 'bg-slate-50 opacity-60' : ''}><td className="px-5 py-3 whitespace-nowrap text-slate-500">{new Date(tx.occurredAt).toLocaleDateString()}</td><td className="px-5 py-3"><p className="font-medium text-slate-700">{tx.description}</p>{tx.memo && <p className="text-xs text-slate-400">{tx.memo}</p>}</td><td className="px-5 py-3 text-slate-500">{categoryLabel[tx.category] || tx.category.replaceAll('_', ' ')}</td><td className="px-5 py-3 text-slate-500">{tx.createdBy ? `${tx.createdBy.firstName} ${tx.createdBy.lastName}` : 'System'}</td><td className={`px-5 py-3 text-right font-bold ${tx.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{tx.amount >= 0 ? '+' : '−'}{money(Math.abs(tx.amount))}</td><td className="px-5 py-3 text-right">{can('recordFinancialTransactions') && !tx.reversed && !tx.reversalOfId && <button type="button" onClick={() => reverse(tx)} className="min-h-11 px-2 text-xs font-semibold text-slate-500 hover:text-rose-600">Reverse</button>}</td></tr>)}</tbody></table></div></section>
    </main>
  );
}
