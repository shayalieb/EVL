import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAgencyGroup } from '../context/AgencyGroupContext';
import MoneyInput from '../components/ui/MoneyInput';
import AcceptPaymentModal from '../components/AcceptPaymentModal';
import { authorizeFinancialExport, createFinancialExpense, getFinancialReports, getFinancialSummary, listFinancialTransactions, reverseFinancialTransaction, updateContractorPayment } from '../lib/financials';
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
const reportTabs = [['receivables', 'Who owes you'], ['payables', 'Who you owe']];
const pageSections = [['overview', 'Overview'], ['payments', 'Payments'], ['reports', 'Reports']];

function friendlyDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ReportTable({ headers, children, empty }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400"><tr>{headers.map((header) => <th key={header.label} className={`px-4 py-3 ${header.right ? 'text-right' : ''}`}>{header.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{children || <tr><td colSpan={headers.length} className="px-5 py-10 text-center text-slate-400">{empty}</td></tr>}</tbody></table></div>;
}

function ReceivablesReport({ report }) {
  const buckets = [['Current', report.totals.current], ['1–30 days', report.totals.days1to30], ['31–60 days', report.totals.days31to60], ['61–90 days', report.totals.days61to90], ['90+ days', report.totals.days90plus]];
  return <><div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-5">{buckets.map(([label, amount]) => <Metric key={label} label={label} value={amount} color={label === 'Current' ? 'text-slate-700' : 'text-amber-700'} />)}</div><ReportTable headers={[{ label: 'Client / booking' }, { label: 'Invoice' }, { label: 'Due date' }, { label: 'Age' }, { label: 'Balance', right: true }]} empty="No outstanding client balances.">{report.rows.length > 0 && report.rows.map((row) => <tr key={row.invoiceId}><td className="px-4 py-3"><Link to={`/bookings/${row.bookingId}?tab=invoices`} className="font-semibold text-indigo-600 hover:text-indigo-700">{row.clientName}</Link><p className="text-xs text-slate-400">{row.bookingName}</p></td><td className="px-4 py-3 text-slate-500">#{row.invoiceNumber ?? '—'}</td><td className="px-4 py-3 text-slate-500">{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : 'No due date'}</td><td className={`px-4 py-3 ${row.overdueDays > 0 ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>{row.overdueDays > 0 ? `${row.overdueDays} days overdue` : 'Current'}</td><td className="px-4 py-3 text-right font-bold text-slate-700">{money(row.balance)}</td></tr>)}</ReportTable></>;
}

function PaymentStatus({ row }) {
  const styles = { overdue: 'bg-rose-100 text-rose-700', due: 'bg-amber-100 text-amber-800', missing: 'bg-slate-100 text-slate-600', upcoming: 'bg-blue-100 text-blue-700' };
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${styles[row.status] || styles.missing}`}>{row.label || 'Payment date missing'}</span>;
}

function PaymentActions({ row, canRecord, savingDueDate, onDueDate, onPay }) {
  if (!canRecord) return null;
  return <div className="flex min-w-44 flex-col items-end gap-2"><label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Due date<input type="date" value={row.paymentDueDate || ''} disabled={savingDueDate === row.assignmentId} onChange={(event) => onDueDate(row, event.target.value)} className="mt-1 min-h-10 rounded-lg border border-slate-200 px-2 text-sm text-slate-700 disabled:opacity-60" /></label><button type="button" onClick={() => onPay(row)} className="min-h-10 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700">Mark paid</button></div>;
}

function PayablesReport({ report, canRecord, savingDueDate, onDueDate, onPay }) {
  return <><div className="grid sm:grid-cols-2 gap-3 p-5"><Metric label="Total contractors still to pay" value={report.total} color="text-violet-700" /><Metric label="Overdue contractor payments" value={report.overdueTotal} color="text-rose-700" /></div><ReportTable headers={[{ label: 'Contractor' }, { label: 'Event' }, { label: 'Payment status' }, { label: 'Expected pay', right: true }, { label: 'Action', right: true }]} empty="No unpaid contractor assignments in this period.">{report.rows.length > 0 && report.rows.map((row, index) => <tr key={`${row.eventId}-${row.contractorId}-${index}`}><td className="px-4 py-3 font-semibold text-slate-700">{row.contractorName}</td><td className="px-4 py-3"><Link to={`/events/${row.eventId}?tab=financials`} className="font-medium text-indigo-600 hover:text-indigo-700">{row.eventName}</Link><p className="mt-0.5 text-xs text-slate-400">Event {row.eventDate || 'not scheduled'}</p></td><td className="px-4 py-3"><PaymentStatus row={row} /></td><td className="px-4 py-3 text-right font-bold text-slate-700">{money(row.expectedAmount)}</td><td className="px-4 py-3 text-right"><PaymentActions row={row} canRecord={canRecord} savingDueDate={savingDueDate} onDueDate={onDueDate} onPay={onPay} /></td></tr>)}</ReportTable></>;
}

function ContractorPaymentsPanel({ rows, missingRates, canRecord, savingDueDate, onDueDate, onPay }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-800">Contractors still to pay</h2><p className="mt-1 text-xs text-slate-500">Urgent payments appear first. Add a due date or record a completed payment here.</p>{missingRates.length > 0 && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-bold text-amber-900">{missingRates.length} contractor {missingRates.length === 1 ? 'rate is' : 'rates are'} missing</p><div className="mt-1 flex flex-wrap gap-2">{missingRates.slice(0, 3).map((item) => <Link key={`${item.eventId}-${item.assignmentId}`} to={`/events/${item.eventId}?tab=financials`} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">Add {item.contractorName}&apos;s rate →</Link>)}</div></div>}<div className="mt-4 divide-y divide-slate-100">{rows.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No contractor payments found.</p> : rows.map((item) => <div key={`${item.eventId}-${item.assignmentId}`} className="py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><Link to={`/events/${item.eventId}?tab=financials`} className="text-sm font-semibold text-slate-700 hover:text-indigo-600">{item.contractorName}</Link><p className="truncate text-xs text-slate-400">{item.eventName}</p><div className="mt-1.5"><PaymentStatus row={item} /></div></div><div className="text-right"><p className="text-sm font-bold text-slate-700">{money(item.amount)}</p><PaymentActions row={item} canRecord={canRecord} savingDueDate={savingDueDate} onDueDate={onDueDate} onPay={onPay} /></div></div></div>)}</div></div>;
}

function Metric({ label, value, color }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-1 text-lg font-bold ${color}`}>{money(value)}</p></div>;
}

function displayedReports(reports, tab, search, sort) {
  if (!reports) return null;
  const copy = { ...reports, [tab]: { ...reports[tab] } };
  const source = reports[tab].rows || [];
  const rows = source.filter((row) => Object.values(row).join(' ').toLowerCase().includes(search.toLowerCase()));
  const selectors = {
    amount: (row) => row.balance ?? row.expectedAmount ?? 0,
    name: (row) => row.clientName || row.contractorName || '',
    date: (row) => row.dueDate || row.eventDate || '',
    urgency: (row) => row.overdueDays || 0,
  };
  const selector = selectors[sort] || selectors.amount;
  rows.sort((a, b) => typeof selector(a) === 'string' ? selector(a).localeCompare(selector(b)) : selector(b) - selector(a));
  copy[tab].rows = rows;
  return copy;
}

export default function FinancialsPage() {
  const { currentUser, can } = useAuth();
  const { groups, selectedGroup } = useAgencyGroup();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedGroupId = searchParams.get('groupId') || '';
  const requestedSection = searchParams.get('section') || 'overview';
  const activeSection = pageSections.some(([id]) => id === requestedSection) ? requestedSection : 'overview';
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [reports, setReports] = useState(null);
  const [groupId, setGroupId] = useState(requestedGroupId);
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const [reportTab, setReportTab] = useState('receivables');
  const [reportSearch, setReportSearch] = useState('');
  const [reportSort, setReportSort] = useState('amount');
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showExpense, setShowExpense] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payingContractor, setPayingContractor] = useState(null);
  const [savingDueDate, setSavingDueDate] = useState('');

  useEffect(() => { setGroupId(requestedGroupId); }, [requestedGroupId]);

  function selectSection(nextSection) {
    const next = new URLSearchParams(searchParams);
    if (nextSection === 'overview') next.delete('section');
    else next.set('section', nextSection);
    setSearchParams(next, { replace: true });
  }
  const [form, setForm] = useState({ amount: '', category: 'contractor_payment', description: '', occurredAt: today(), paymentMethod: '', reference: '', memo: '', groupId: '' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const filters = { ...(groupId ? { groupId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };
      const [nextSummary, ledger, nextReports] = await Promise.all([getFinancialSummary(filters), listFinancialTransactions({ ...(groupId ? { groupId } : {}), pageSize: 50 }), getFinancialReports(filters)]);
      setSummary(nextSummary); setTransactions(ledger.transactions); setReports(nextReports);
    } catch (err) { setError(err.message || 'Financial information could not be loaded.'); }
    finally { setLoading(false); }
  }, [groupId, from, to]);

  useEffect(() => { load(); }, [load]);

  const visibleReports = displayedReports(reports, reportTab, reportSearch, reportSort);

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
    const reason = window.prompt('Why is this entry being undone? The original entry stays visible in the payment log.');
    if (!reason?.trim()) return;
    try { await reverseFinancialTransaction(tx.id, reason.trim()); await load(); }
    catch (err) { setError(err.message || 'Transaction could not be reversed.'); }
  }

  async function saveContractorDueDate(row, paymentDueDate) {
    setSavingDueDate(row.assignmentId); setError('');
    try { await updateContractorPayment(row.eventId, row.assignmentId, { paymentDueDate }); await load(); }
    catch (err) { setError(err.message || 'The contractor payment date could not be saved.'); }
    finally { setSavingDueDate(''); }
  }

  async function markContractorPaid(payload) {
    if (!payingContractor) return;
    await updateContractorPayment(payingContractor.eventId, payingContractor.assignmentId, { markPaid: true, amount: payload.amount, paymentDate: payload.paymentDate, paymentMethod: payload.method, paymentReference: payload.checkNumber, paymentMemo: payload.memo });
    setPayingContractor(null);
    await load();
  }

  return (
    <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Financials</h1><p className="mt-1 text-sm text-slate-500">See what came in, what went out, what is still owed, and which bookings are profitable.</p></div>
        {selectedGroup && <div className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700">Viewing {selectedGroup.name}</div>}
      </div>

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm" aria-label="Financial sections">
        {pageSections.map(([id, label]) => <button key={id} type="button" onClick={() => selectSection(id)} aria-current={activeSection === id ? 'page' : undefined} className={`min-h-11 flex-1 whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition-colors ${activeSection === id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}
      </nav>

      {activeSection !== 'payments' && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
      </section>}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {activeSection === 'payments' && <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-800">Payments</h2><p className="mt-1 text-sm text-slate-500">Review recorded money in and money out, or add an expense.</p></div>{can('recordFinancialTransactions') && <button type="button" onClick={() => setShowExpense((value) => !value)} className="min-h-11 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">{showExpense ? 'Cancel' : '+ Add money paid out'}</button>}</div>}
      {activeSection === 'payments' && showExpense && <form onSubmit={saveExpense} className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm space-y-4"><div><h2 className="font-bold text-slate-800">Add money paid out</h2><p className="text-xs text-slate-500 mt-1">Once recorded, this can't be edited — if it's wrong, undo it from the payment history below instead so the original stays visible.</p></div><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"><label className="text-sm font-medium text-slate-700">Amount<MoneyInput value={form.amount} onChange={(amount) => setForm((old) => ({ ...old, amount }))} className={`${inputClass} mt-1`} /></label><label className="text-sm font-medium text-slate-700">Category<select value={form.category} onChange={(e) => setForm((old) => ({ ...old, category: e.target.value }))} className={`${inputClass} mt-1`}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Payment date<input type="date" value={form.occurredAt} onChange={(e) => setForm((old) => ({ ...old, occurredAt: e.target.value }))} className={`${inputClass} mt-1`} /></label><label className="text-sm font-medium text-slate-700">Method<select value={form.paymentMethod} onChange={(e) => setForm((old) => ({ ...old, paymentMethod: e.target.value }))} className={`${inputClass} mt-1`}><option value="">Not specified</option><option value="ach">ACH</option><option value="check">Check</option><option value="card">Card</option><option value="cash">Cash</option><option value="wire">Wire</option><option value="other">Other</option></select></label></div><div className="grid sm:grid-cols-2 gap-3"><label className="text-sm font-medium text-slate-700">Description<input required value={form.description} onChange={(e) => setForm((old) => ({ ...old, description: e.target.value }))} placeholder="What was this payment for?" className={`${inputClass} mt-1`} /></label><label className="text-sm font-medium text-slate-700">Reference<input value={form.reference} onChange={(e) => setForm((old) => ({ ...old, reference: e.target.value }))} placeholder="Check or confirmation number" className={`${inputClass} mt-1`} /></label></div>{groups.length > 0 && <label className="block text-sm font-medium text-slate-700 max-w-sm">Managed group<select value={form.groupId} onChange={(e) => setForm((old) => ({ ...old, groupId: e.target.value }))} className={`${inputClass} mt-1`}><option value="">Use current group ({selectedGroup?.name || 'agency-wide'})</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}<div className="flex justify-end"><button disabled={saving} className="min-h-11 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Recording…' : 'Add payment'}</button></div></form>}

      {loading && !summary ? <div className="py-20 text-center text-sm text-slate-400">Loading financials…</div> : activeSection === 'overview' && summary && <>
        <section aria-labelledby="cash-already-moved-heading">
          <div className="mb-3">
            <h2 id="cash-already-moved-heading" className="font-bold text-slate-800">Money already received and spent</h2>
            <p className="mt-0.5 text-xs text-slate-500">Recorded payments{from || to ? ` from ${friendlyDate(from) || 'the beginning'} through ${friendlyDate(to) || 'today'}` : ' for all time'}.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">{[['Money received', summary.inflow, 'text-emerald-700', 'Client payments already recorded.'], ['Money spent', summary.outflow, 'text-rose-700', 'Expenses and payments already recorded.'], ['Difference', summary.netCash, summary.netCash >= 0 ? 'text-indigo-700' : 'text-rose-700', 'Money received minus money spent.']].map(([label, value, color, help]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-2 text-xl font-bold ${color}`}>{money(value)}</p><p className="mt-1 text-xs text-slate-500">{help}</p></div>)}</div>
        </section>

        <section aria-labelledby="money-expected-heading" className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5">
          <div className="mb-3">
            <h2 id="money-expected-heading" className="font-bold text-slate-800">Money expected in the next 30 days</h2>
            <p className="mt-0.5 text-xs text-slate-500">Planning estimates only. These amounts have not necessarily been paid yet.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">{[['Expected from clients', summary.next30.expectedIn, 'text-emerald-700'], ['Expected contractor payments', summary.next30.expectedOut, 'text-rose-700'], ['Expected difference', summary.next30.net, summary.next30.net >= 0 ? 'text-indigo-700' : 'text-rose-700']].map(([label, value, color]) => <div key={label} className="rounded-lg border border-indigo-100 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-2 text-xl font-bold ${color}`}>{money(value)}</p></div>)}</div>
        </section>

        <section aria-labelledby="outstanding-heading">
          <div className="mb-3"><h2 id="outstanding-heading" className="font-bold text-slate-800">Still outstanding</h2><p className="mt-0.5 text-xs text-slate-500">Open amounts that still need to be collected or paid.</p></div>
          <div className="grid sm:grid-cols-2 gap-3">{[['Customers still owe', summary.accountsReceivable, 'text-amber-700', 'Unpaid balances on sent invoices.'], ['Contractors still to pay', summary.accountsPayable, 'text-violet-700', 'Unpaid contractor assignments with a saved rate.']].map(([label, value, color, help]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-2 text-xl font-bold ${color}`}>{money(value)}</p><p className="mt-1 text-xs text-slate-500">{help}</p></div>)}</div>
        </section>

        <section className="grid lg:grid-cols-2 gap-5"><ContractorPaymentsPanel rows={summary.payables} missingRates={summary.missingRates || []} canRecord={can('recordFinancialTransactions')} savingDueDate={savingDueDate} onDueDate={saveContractorDueDate} onPay={setPayingContractor} /><div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-800">Estimated profit by booking</h2><p className="text-xs text-slate-500 mt-1">Profit is shown only after contractor costs are complete.</p><div className="mt-4 divide-y divide-slate-100">{summary.profitability.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">Issue an invoice to begin profitability tracking.</p> : summary.profitability.map((item) => <Link key={item.bookingId} to={item.costsComplete ? `/bookings/${item.bookingId}?tab=invoices` : item.eventId ? `/events/${item.eventId}?tab=financials` : `/bookings/${item.bookingId}`} className="grid grid-cols-[1fr_auto] gap-3 py-3 hover:bg-slate-50"><div className="min-w-0"><p className="text-sm font-semibold text-slate-700 truncate">{item.name}</p><p className="text-xs text-slate-400">{money(item.billed)} billed · {money(item.estimatedCosts)} costs entered</p></div>{item.costsComplete ? <div className="text-right"><p className={`text-sm font-bold ${item.estimatedProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(item.estimatedProfit)}</p><p className="text-xs text-slate-400">Estimated · {item.margin.toFixed(1)}%</p></div> : <div className="text-right"><p className="text-sm font-bold text-amber-700">Costs incomplete</p><p className="text-xs font-semibold text-indigo-600">Complete costs →</p></div>}</Link>)}</div></div></section>
      </>}

      {activeSection === 'overview' && reports?.dataQuality?.issues.length > 0 && <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="font-bold text-amber-900">Financial data needs attention</h2><p className="mt-1 text-sm text-amber-700">{reports.dataQuality.issueCount} records may affect report accuracy.</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Review before exporting</span></div><div className="mt-4 grid md:grid-cols-2 gap-3">{reports.dataQuality.issues.map((issue) => <div key={issue.id} className="rounded-lg border border-amber-200 bg-white p-4"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-800">{issue.title}</h3><span className="text-xs font-bold text-amber-700">{issue.count}</span></div><p className="mt-1 text-xs text-slate-500">{issue.detail}</p>{issue.links.length > 0 && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{issue.links.map((link) => <Link key={`${issue.id}-${link.path}`} to={link.path} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">Fix {link.label} →</Link>)}</div>}</div>)}</div></section>}

      {activeSection === 'reports' && visibleReports && <section className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="border-b border-slate-200 px-3 pt-3">
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Financial reports">
            {reportTabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={reportTab === id} onClick={() => setReportTab(id)} className={`min-h-11 whitespace-nowrap rounded-t-lg px-4 text-sm font-semibold ${reportTab === id ? 'border border-b-white border-slate-200 bg-white text-indigo-700 -mb-px' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>{label}</button>)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3"><input type="search" value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} placeholder="Search this report…" aria-label="Search this report" className={`${inputClass} max-w-xs`} /><select value={reportSort} onChange={(e) => setReportSort(e.target.value)} className={`${inputClass} max-w-48`} aria-label="Sort report"><option value="amount">Highest amount</option><option value="urgency">Most overdue</option><option value="date">Date</option><option value="name">Name</option></select>{can('exportFinancialReports') && <div className="ml-auto flex flex-wrap gap-2"><button type="button" disabled={exporting} onClick={exportCsv} className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">Export CSV</button><button type="button" disabled={exporting} onClick={exportPdf} className="min-h-11 rounded-lg bg-slate-800 px-3 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60">{exporting ? 'Creating…' : 'Export PDF'}</button></div>}</div>
        {reportTab === 'receivables' && <ReceivablesReport report={visibleReports.receivables} />}
        {reportTab === 'payables' && <PayablesReport report={visibleReports.payables} canRecord={can('recordFinancialTransactions')} savingDueDate={savingDueDate} onDueDate={saveContractorDueDate} onPay={setPayingContractor} />}
      </section>}

      {activeSection === 'payments' && <section className="rounded-xl border border-slate-200 bg-white overflow-hidden"><div className="px-5 py-4 border-b border-slate-100"><h2 className="font-bold text-slate-800">Payment history</h2><p className="text-xs text-slate-500 mt-1">Every recorded payment, newest first. Made a mistake? Undo it — the original stays here so nothing's silently changed.</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Description</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Entered by</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{transactions.length === 0 ? <tr><td colSpan="6" className="px-5 py-10 text-center text-slate-400">No posted transactions yet.</td></tr> : transactions.map((tx) => <tr key={tx.id} className={tx.reversed ? 'bg-slate-50 opacity-60' : ''}><td className="px-5 py-3 whitespace-nowrap text-slate-500">{new Date(tx.occurredAt).toLocaleDateString()}</td><td className="px-5 py-3"><p className="font-medium text-slate-700">{tx.description}</p>{tx.memo && <p className="text-xs text-slate-400">{tx.memo}</p>}</td><td className="px-5 py-3 text-slate-500">{categoryLabel[tx.category] || tx.category.replaceAll('_', ' ')}</td><td className="px-5 py-3 text-slate-500">{tx.createdBy ? `${tx.createdBy.firstName} ${tx.createdBy.lastName}` : 'System'}</td><td className={`px-5 py-3 text-right font-bold ${tx.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{tx.amount >= 0 ? '+' : '−'}{money(Math.abs(tx.amount))}</td><td className="px-5 py-3 text-right">{can('recordFinancialTransactions') && !tx.reversed && !tx.reversalOfId && <button type="button" onClick={() => reverse(tx)} className="min-h-11 px-2 text-xs font-semibold text-slate-500 hover:text-rose-600">Undo</button>}</td></tr>)}</tbody></table></div></section>}
      <AcceptPaymentModal open={!!payingContractor} title={payingContractor ? `Pay ${payingContractor.contractorName}` : 'Mark contractor paid'} confirmLabel="Mark paid" amountDue={payingContractor?.amount ?? payingContractor?.expectedAmount} amountLabel="Expected payment" onClose={() => setPayingContractor(null)} onAccept={markContractorPaid} />
    </main>
  );
}
