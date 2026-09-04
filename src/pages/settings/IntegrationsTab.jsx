import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../components/ui/Toast';
import { beginQuickBooksConnection, checkQuickBooksConnection, createQuickBooksCustomer, createQuickBooksVendor, disconnectQuickBooks, findQuickBooksCustomerMatches, findQuickBooksVendorMatches, getQuickBooksActivity, getQuickBooksBillPreview, getQuickBooksContractorPaymentPreview, getQuickBooksPaymentPreview, getQuickBooksSetup, getQuickBooksStatus, getQuickBooksSyncPreview, getQuickBooksVendorPreview, linkQuickBooksCustomer, linkQuickBooksVendor, manuallyReconcileQuickBooksContractorPayment, manuallyReconcileQuickBooksPayment, reconcileQuickBooksContractorPayment, reconcileQuickBooksPayment, refreshQuickBooksReferenceData, saveQuickBooksMappings, syncQuickBooksBill, syncQuickBooksContractorPayment, syncQuickBooksInvoice, syncQuickBooksPayment } from '../../lib/quickBooks';

const mappingFields = [
  ['incomeAccountId', 'Gig income', ['Income', 'Other Income'], 'Where invoice revenue is recorded.'],
  ['contractorExpenseAccountId', 'Contractor payments', ['Expense', 'Cost of Goods Sold', 'Other Expense'], 'Where performer and crew costs are recorded.'],
  ['otherExpenseAccountId', 'Other gig expenses', ['Expense', 'Cost of Goods Sold', 'Other Expense'], 'Default for production, travel, backline, and other costs.'],
  ['accountsReceivableId', 'Money clients owe', ['Accounts Receivable'], 'QuickBooks accounts receivable account.'],
  ['accountsPayableId', 'Money owed to contractors', ['Accounts Payable'], 'QuickBooks accounts payable account.'],
  ['serviceItemId', 'Invoice service item', ['Service', 'NonInventory'], 'The QuickBooks product/service used for GigWorks invoice lines.'],
];
const expenseCategories = [['contractor_payment', 'Contractor payment'], ['production', 'Production'], ['backline', 'Backline'], ['travel', 'Travel'], ['processing_fee', 'Processing fee'], ['agency_commission', 'Agency commission'], ['tax', 'Tax'], ['reimbursement', 'Reimbursement'], ['other_expense', 'Other expense']];
const blankMappings = { incomeAccountId: '', contractorExpenseAccountId: '', otherExpenseAccountId: '', accountsReceivableId: '', accountsPayableId: '', serviceItemId: '', contractorPaymentAccountId: '', agencyTrackingMode: 'none', categoryMappings: {}, groupMappings: {} };

function AccountSelect({ value, onChange, accounts, allowedTypes, label, required = true }) {
  const options = accounts.filter((account) => allowedTypes.includes(account.type));
  return <select aria-label={label} required={required} value={value || ''} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"><option value="">Choose an account…</option>{options.map((account) => <option key={account.id} value={account.id}>{account.fullyQualifiedName || account.name}</option>)}</select>;
}

function AccountingSetup({ setup, setSetup }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ ...blankMappings, ...(setup?.mappings || {}), categoryMappings: setup?.mappings?.categoryMappings || {}, groupMappings: setup?.mappings?.groupMappings || {} });
  const [working, setWorking] = useState(false);
  const accounts = setup?.accounts || [];
  const expenseAccounts = accounts.filter((account) => ['Expense', 'Cost of Goods Sold', 'Other Expense'].includes(account.type));

  useEffect(() => setForm({ ...blankMappings, ...(setup?.mappings || {}), categoryMappings: setup?.mappings?.categoryMappings || {}, groupMappings: setup?.mappings?.groupMappings || {} }), [setup]);

  async function refresh() {
    setWorking(true);
    try { const updated = await refreshQuickBooksReferenceData(); setSetup(updated); showToast('QuickBooks accounts imported'); }
    catch (error) { showToast(error.message || 'Unable to import QuickBooks accounts', 'error'); }
    finally { setWorking(false); }
  }

  async function save(event) {
    event.preventDefault();
    setWorking(true);
    try { const updated = await saveQuickBooksMappings(form); setSetup(updated); showToast('Accounting setup saved'); }
    catch (error) { showToast(error.message || 'Unable to save accounting setup', 'error'); }
    finally { setWorking(false); }
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-800">Accounting setup</h3><p className="mt-1 text-sm text-slate-500">Tell GigWorks where each kind of activity belongs. This setup does not create or change transactions.</p></div><button type="button" onClick={refresh} disabled={working} className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50">{working ? 'Importing…' : accounts.length ? 'Refresh accounts' : 'Import accounts'}</button></div>
    <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Setup checklist</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{(setup?.readiness?.checks || []).map((check) => <div key={check.id} className="flex items-center gap-2 text-sm"><span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${check.complete ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-400'}`}>{check.complete ? '✓' : '○'}</span><span className={check.complete ? 'text-slate-700' : 'text-slate-500'}>{check.label}</span></div>)}</div>{setup?.readiness?.ready && <p className="mt-3 text-sm font-semibold text-emerald-700">Ready for controlled invoice synchronization.</p>}</div>
    {!accounts.length ? <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Import the QuickBooks chart of accounts to begin mapping.</p> : <form onSubmit={save} className="mt-6 space-y-6">
      <div><h4 className="text-sm font-bold text-slate-700">Required accounts</h4><div className="mt-3 grid gap-4 sm:grid-cols-2">{mappingFields.map(([key, label, types, help]) => <label key={key} className={key === 'otherExpenseAccountId' ? 'sm:col-span-2' : ''}><span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span><AccountSelect label={label} value={form[key]} accounts={key === 'serviceItemId' ? (setup.items || []) : accounts} allowedTypes={types} onChange={(value) => setForm((old) => ({ ...old, [key]: value }))} /><span className="mt-1 block text-xs text-slate-400">{help}</span></label>)}</div></div>
      <div className="border-t border-slate-100 pt-5"><h4 className="text-sm font-bold text-slate-700">Contractor payment account</h4><p className="mt-1 text-xs text-slate-500">Optional until you synchronize contractor payments. Choose the QuickBooks account the money is paid from.</p><div className="mt-3 max-w-sm"><AccountSelect label="Contractor payment account" required={false} value={form.contractorPaymentAccountId} accounts={accounts} allowedTypes={['Bank', 'Credit Card']} onChange={(value) => setForm((old) => ({ ...old, contractorPaymentAccountId: value }))} /></div></div>
      <div className="border-t border-slate-100 pt-5"><h4 className="text-sm font-bold text-slate-700">Agency group tracking</h4><p className="mt-1 text-xs text-slate-500">Optional. Use one QuickBooks dimension consistently across every group.</p><select value={form.agencyTrackingMode || 'none'} onChange={(event) => setForm((old) => ({ ...old, agencyTrackingMode: event.target.value, groupMappings: {} }))} className="mt-3 min-h-11 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="none">Do not track groups separately</option><option value="class" disabled={!setup.classes?.length}>QuickBooks Classes{!setup.classes?.length ? ' — none available' : ''}</option><option value="location" disabled={!setup.locations?.length}>QuickBooks Locations{!setup.locations?.length ? ' — none available' : ''}</option></select>{form.agencyTrackingMode !== 'none' && setup.agencyGroups?.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">{setup.agencyGroups.map((group) => <label key={group.id}><span className="mb-1 block text-xs font-semibold text-slate-600">{group.name}</span><select required value={form.groupMappings?.[group.id] || ''} onChange={(event) => setForm((old) => ({ ...old, groupMappings: { ...old.groupMappings, [group.id]: event.target.value } }))} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Choose {form.agencyTrackingMode}…</option>{(form.agencyTrackingMode === 'class' ? setup.classes : setup.locations).map((item) => <option key={item.id} value={item.id}>{item.fullyQualifiedName || item.name}</option>)}</select></label>)}</div>}</div>
      <details className="border-t border-slate-100 pt-5"><summary className="cursor-pointer text-sm font-bold text-indigo-600">Customize individual expense categories</summary><p className="mt-2 text-xs text-slate-500">Optional. Categories otherwise use the default contractor or other-expense account above.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{expenseCategories.map(([key, label]) => <label key={key}><span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span><select value={form.categoryMappings?.[key] || ''} onChange={(event) => setForm((old) => ({ ...old, categoryMappings: { ...old.categoryMappings, [key]: event.target.value } }))} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Use default account</option>{expenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.fullyQualifiedName || account.name}</option>)}</select></label>)}</div></details>
      <button disabled={working} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{working ? 'Saving…' : 'Save accounting setup'}</button>
    </form>}
  </section>;
}

const syncLabels = { synced: 'Synced', ready: 'Ready', needs_customer: 'Match customer', not_eligible: 'Not issued', missing_client: 'Client missing', setup_required: 'Setup required', failed: 'Retry needed' };
const syncColors = { synced: 'bg-emerald-100 text-emerald-700', ready: 'bg-blue-100 text-blue-700', needs_customer: 'bg-amber-100 text-amber-800', failed: 'bg-red-100 text-red-700', not_eligible: 'bg-slate-100 text-slate-500', missing_client: 'bg-red-100 text-red-700', setup_required: 'bg-slate-100 text-slate-500' };

function InvoiceSyncReview() {
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);
  const [matches, setMatches] = useState(null);
  const [filter, setFilter] = useState('action');

  async function reload() { setLoading(true); try { setData(await getQuickBooksSyncPreview()); } catch (error) { showToast(error.message, 'error'); } finally { setLoading(false); } }
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function reviewCustomer(row) {
    setWorkingId(row.id);
    try { setMatches(await findQuickBooksCustomerMatches(row.client.id)); }
    catch (error) { showToast(error.message || 'Unable to search QuickBooks customers', 'error'); }
    finally { setWorkingId(null); }
  }

  async function chooseCustomer(quickBooksId) {
    setWorkingId(matches.client.id);
    try { await linkQuickBooksCustomer(matches.client.id, quickBooksId); setMatches(null); await reload(); showToast('Customer matched'); }
    catch (error) { showToast(error.message || 'Unable to match customer', 'error'); }
    finally { setWorkingId(null); }
  }

  async function createCustomer() {
    setWorkingId(matches.client.id);
    try { await createQuickBooksCustomer(matches.client.id); setMatches(null); await reload(); showToast('QuickBooks customer created'); }
    catch (error) { showToast(error.message || 'Unable to create customer', 'error'); }
    finally { setWorkingId(null); }
  }

  async function syncInvoice(row) {
    setWorkingId(row.id);
    try { await syncQuickBooksInvoice(row.id); await reload(); showToast(`Invoice #${row.number || ''} synchronized`); }
    catch (error) { showToast(error.message || 'Unable to synchronize invoice', 'error'); }
    finally { setWorkingId(null); }
  }

  if (loading && !data) return <p className="text-sm text-slate-400">Loading invoice sync review…</p>;
  const rows = (data?.rows || []).filter((row) => filter === 'all' || (filter === 'action' ? ['ready', 'needs_customer', 'failed'].includes(row.syncStatus) : row.syncStatus === filter));
  const actionCount = (data?.rows || []).filter((row) => ['ready', 'needs_customer', 'failed'].includes(row.syncStatus)).length;
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-800">Review and sync invoices</h3><p className="mt-1 text-sm text-slate-500">Resolve customers first, then send issued invoices one at a time. Showing the 100 most recent invoices.</p></div><button type="button" onClick={reload} disabled={loading} className="text-sm font-semibold text-indigo-600">{loading ? 'Refreshing…' : 'Refresh'}</button></div><div className="mt-4 flex flex-wrap gap-2">{[['action', `Needs action (${actionCount})`], ['ready', 'Ready'], ['synced', 'Synced'], ['all', 'All']].map(([value, label]) => <button type="button" key={value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}</div><div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">{!rows.length ? <p className="p-6 text-center text-sm text-slate-400">No invoices in this view.</p> : rows.map((row) => <div key={row.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-800">Invoice #{row.number || '—'} · {row.bookingName}</p><span className={`rounded-full px-2 py-1 text-xs font-semibold ${syncColors[row.syncStatus]}`}>{syncLabels[row.syncStatus]}</span></div><p className="mt-1 text-sm text-slate-500">{row.client?.name || 'No linked client'}{row.client?.email ? ` · ${row.client.email}` : ''} · {Number(row.total || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</p>{row.error && <p className="mt-1 text-xs text-red-600">{row.error}</p>}</div><div>{row.syncStatus === 'needs_customer' && <button type="button" disabled={workingId === row.id} onClick={() => reviewCustomer(row)} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Review customer</button>}{['ready', 'failed'].includes(row.syncStatus) && <button type="button" disabled={workingId === row.id} onClick={() => syncInvoice(row)} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{workingId === row.id ? 'Syncing…' : row.syncStatus === 'failed' ? 'Retry' : 'Sync invoice'}</button>}</div></div>)}</div>{matches && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"><h4 className="font-bold text-slate-800">Compare {matches.client.name}</h4><p className="mt-1 text-xs text-slate-600">Choose a matching QuickBooks customer, or create a new one only if none match.</p>{matches.searchTruncated && <p className="mt-2 text-xs font-semibold text-amber-800">This company has more than 5,000 customers. Only the first 5,000 were checked; search directly in QuickBooks before creating a possible duplicate.</p>}<div className="mt-3 space-y-2">{matches.candidates.length ? matches.candidates.map((candidate) => <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3"><div><p className="font-semibold text-slate-700">{candidate.displayName}</p><p className="text-xs text-slate-500">{candidate.email || 'No email'} · {candidate.phone || 'No phone'} · {candidate.score}% match</p></div><button type="button" onClick={() => chooseCustomer(candidate.id)} disabled={workingId === matches.client.id} className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-600">Use this customer</button></div>) : <p className="text-sm text-slate-600">No similar QuickBooks customers were found.</p>}</div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={createCustomer} disabled={workingId === matches.client.id || matches.searchTruncated} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Create new customer</button><button type="button" onClick={() => setMatches(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600">Cancel</button></div></div>}</section>;
}

function VendorSyncReview() {
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [workingId, setWorkingId] = useState(null);
  const [matches, setMatches] = useState(null);
  async function reload() { try { setData(await getQuickBooksVendorPreview()); } catch (error) { showToast(error.message, 'error'); } }
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function review(row) { setWorkingId(row.id); try { setMatches(await findQuickBooksVendorMatches(row.id)); } catch (error) { showToast(error.message || 'Unable to search QuickBooks vendors', 'error'); } finally { setWorkingId(null); } }
  async function choose(quickBooksId) { setWorkingId(matches.contractor.id); try { await linkQuickBooksVendor(matches.contractor.id, quickBooksId); setMatches(null); await reload(); showToast('Vendor matched'); } catch (error) { showToast(error.message || 'Unable to match vendor', 'error'); } finally { setWorkingId(null); } }
  async function create() { setWorkingId(matches.contractor.id); try { await createQuickBooksVendor(matches.contractor.id); setMatches(null); await reload(); showToast('QuickBooks vendor created'); } catch (error) { showToast(error.message || 'Unable to create vendor', 'error'); } finally { setWorkingId(null); } }
  const rows = data?.rows || [];
  const needsAction = rows.filter((row) => row.syncStatus !== 'synced');
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-800">Contractors and QuickBooks vendors</h3><p className="mt-1 text-sm text-slate-500">Compare each contractor before creating a vendor. This prevents duplicate payees before bills are introduced.</p></div><button type="button" onClick={reload} className="text-sm font-semibold text-indigo-600">Refresh</button></div>{data?.truncated && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Showing the first 500 contractors. Use contractor search to narrow large directories in a future phase.</p>}<div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">{!needsAction.length ? <p className="p-6 text-center text-sm text-slate-400">All contractors are matched to QuickBooks vendors.</p> : needsAction.slice(0, 100).map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-800">{row.name}</p><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.syncStatus === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{row.syncStatus === 'failed' ? 'Retry needed' : 'Vendor needed'}</span></div><p className="mt-1 text-sm text-slate-500">{row.email || 'No email'}{row.contractorType ? ` · ${row.contractorType}` : ''}</p>{row.error && <p className="mt-1 text-xs text-red-600">{row.error}</p>}</div><button type="button" disabled={workingId === row.id} onClick={() => review(row)} className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-600 disabled:opacity-50">{workingId === row.id ? 'Searching…' : 'Review vendor'}</button></div>)}</div>{matches && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"><h4 className="font-bold text-slate-800">Compare {matches.contractor.name}</h4><p className="mt-1 text-xs text-slate-600">Choose an existing vendor when it represents the same person, or create a new one.</p>{matches.searchTruncated && <p className="mt-2 text-xs font-semibold text-amber-800">Only the first 5,000 QuickBooks vendors were checked. Search QuickBooks directly before creating a possible duplicate.</p>}<div className="mt-3 space-y-2">{matches.candidates.length ? matches.candidates.map((candidate) => <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3"><div><p className="font-semibold text-slate-700">{candidate.displayName}</p><p className="text-xs text-slate-500">{candidate.email || 'No email'} · {candidate.phone || 'No phone'} · {candidate.score}% match</p></div><button type="button" onClick={() => choose(candidate.id)} disabled={workingId === matches.contractor.id} className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-600">Use this vendor</button></div>) : <p className="text-sm text-slate-600">No similar QuickBooks vendors were found.</p>}</div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={create} disabled={workingId === matches.contractor.id || matches.searchTruncated} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Create new vendor</button><button type="button" onClick={() => setMatches(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600">Cancel</button></div></div>}</section>;
}

const billLabels = { ready: 'Ready', synced: 'Synced', failed: 'Retry needed', needs_vendor: 'Vendor first', missing_rate: 'Rate missing', not_confirmed: 'Not confirmed' };
const billColors = { ...syncColors, needs_vendor: 'bg-amber-100 text-amber-800', missing_rate: 'bg-red-100 text-red-700', not_confirmed: 'bg-slate-100 text-slate-500' };

function ContractorBillReview() {
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [workingId, setWorkingId] = useState(null);
  const [filter, setFilter] = useState('action');
  async function reload() { try { setData(await getQuickBooksBillPreview()); } catch (error) { showToast(error.message, 'error'); } }
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function sync(row) { setWorkingId(row.localId); try { await syncQuickBooksBill(row.eventId, row.assignmentId); await reload(); showToast('Contractor bill synchronized'); } catch (error) { showToast(error.message || 'Unable to synchronize bill', 'error'); } finally { setWorkingId(null); } }
  const allRows = data?.rows || [];
  const rows = allRows.filter((row) => filter === 'all' || (filter === 'action' ? ['ready', 'failed', 'needs_vendor', 'missing_rate'].includes(row.syncStatus) : row.syncStatus === filter));
  const actionCount = allRows.filter((row) => ['ready', 'failed', 'needs_vendor', 'missing_rate'].includes(row.syncStatus)).length;
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-800">Review contractor bills</h3><p className="mt-1 text-sm text-slate-500">One bill per confirmed gig assignment. Review the contractor, event, date, and amount before sending it to QuickBooks.</p></div><button type="button" onClick={reload} className="text-sm font-semibold text-indigo-600">Refresh</button></div>{data?.truncated && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Showing assignments from the 250 most recent events.</p>}<div className="mt-4 flex flex-wrap gap-2">{[['action', `Needs action (${actionCount})`], ['ready', 'Ready'], ['synced', 'Synced'], ['all', 'All']].map(([value, label]) => <button type="button" key={value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}</div><div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">{!rows.length ? <p className="p-6 text-center text-sm text-slate-400">No contractor bills in this view.</p> : rows.map((row) => <div key={row.localId} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-800">{row.contractorName} · {row.eventName}</p><span className={`rounded-full px-2 py-1 text-xs font-semibold ${billColors[row.syncStatus]}`}>{billLabels[row.syncStatus]}</span>{row.paymentStatus === 'paid' && <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Paid in GigWorks</span>}</div><p className="mt-1 text-sm text-slate-500">{row.eventDate ? new Date(`${row.eventDate}T12:00:00`).toLocaleDateString() : 'No event date'} · {row.amount == null ? 'Rate unavailable' : Number(row.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}{row.dueDate ? ` · Due ${new Date(`${row.dueDate}T12:00:00`).toLocaleDateString()}` : ''}</p>{row.reason && !['ready', 'synced'].includes(row.syncStatus) && <p className="mt-1 text-xs text-slate-500">{row.reason}</p>}</div>{['ready', 'failed'].includes(row.syncStatus) && <button type="button" onClick={() => sync(row)} disabled={workingId === row.localId} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{workingId === row.localId ? 'Syncing…' : row.syncStatus === 'failed' ? 'Retry' : 'Sync bill'}</button>}</div>)}</div></section>;
}

const paymentLabels = { ready: 'Ready', synced: 'Synced', failed: 'Retry needed', manual_review: 'Manual review', manually_reconciled: 'Handled manually', needs_invoice: 'Invoice first', needs_customer: 'Customer first', mismatch: 'Does not match' };
const paymentColors = { ...syncColors, manual_review: 'bg-amber-100 text-amber-800', manually_reconciled: 'bg-slate-100 text-slate-600', needs_invoice: 'bg-amber-100 text-amber-800', needs_customer: 'bg-amber-100 text-amber-800', mismatch: 'bg-red-100 text-red-700' };

function PaymentSyncReview() {
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);
  const [manualRow, setManualRow] = useState(null);
  const [manualNote, setManualNote] = useState('');
  async function reload() { setLoading(true); try { setRows((await getQuickBooksPaymentPreview()).rows || []); } catch (error) { showToast(error.message, 'error'); } finally { setLoading(false); } }
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function sync(row) { setWorkingId(row.id); try { await syncQuickBooksPayment(row.id); await reload(); showToast('Payment synchronized'); } catch (error) { showToast(error.message || 'Unable to synchronize payment', 'error'); } finally { setWorkingId(null); } }
  async function reconcile(row) { setWorkingId(row.id); try { await reconcileQuickBooksPayment(row.id); await reload(); showToast('Payment matches QuickBooks'); } catch (error) { showToast(error.message || 'Payment needs review', 'error'); await reload(); } finally { setWorkingId(null); } }
  async function saveManual(event) { event.preventDefault(); setWorkingId(manualRow.id); try { await manuallyReconcileQuickBooksPayment(manualRow.id, manualNote); setManualRow(null); setManualNote(''); await reload(); showToast('Manual reconciliation recorded'); } catch (error) { showToast(error.message || 'Unable to record reconciliation', 'error'); } finally { setWorkingId(null); } }
  const actionRows = rows;
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-800">Payment reconciliation</h3><p className="mt-1 text-sm text-slate-500">Sync positive client payments. Corrections and reversals stay in review so they cannot become accidental refunds.</p></div><button type="button" onClick={reload} disabled={loading} className="text-sm font-semibold text-indigo-600">{loading ? 'Refreshing…' : 'Refresh'}</button></div><div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">{!actionRows.length ? <p className="p-6 text-center text-sm text-slate-400">No invoice payments are ready yet.</p> : actionRows.map((row) => <div key={row.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-800">Invoice #{row.invoiceNumber || '—'} · {row.bookingName}</p><span className={`rounded-full px-2 py-1 text-xs font-semibold ${paymentColors[row.syncStatus]}`}>{paymentLabels[row.syncStatus]}</span></div><p className={`mt-1 text-sm font-semibold ${row.amount >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{Number(row.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} · {new Date(row.occurredAt).toLocaleDateString()}</p>{row.reason && <p className="mt-1 text-xs text-slate-500">{row.reason}</p>}</div><div className="flex flex-wrap gap-2">{['ready', 'failed'].includes(row.syncStatus) && <button type="button" onClick={() => sync(row)} disabled={workingId === row.id} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{workingId === row.id ? 'Syncing…' : row.syncStatus === 'failed' ? 'Retry' : 'Sync payment'}</button>}{['synced', 'mismatch'].includes(row.syncStatus) && <button type="button" onClick={() => reconcile(row)} disabled={workingId === row.id} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${row.syncStatus === 'mismatch' ? 'border-red-200 text-red-600' : 'border-emerald-200 text-emerald-700'}`}>{workingId === row.id ? 'Checking…' : 'Verify'}</button>}{row.syncStatus === 'manual_review' && <button type="button" onClick={() => { setManualRow(row); setManualNote(''); }} className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800">Record how handled</button>}</div></div>)}</div>{manualRow && <form onSubmit={saveManual} className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"><h4 className="font-bold text-slate-800">Record manual reconciliation</h4><p className="mt-1 text-xs text-slate-600">Describe the QuickBooks adjustment, void, credit, or refund used. This creates an audit note; it does not change QuickBooks.</p><textarea required rows={3} value={manualNote} onChange={(event) => setManualNote(event.target.value)} className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm" placeholder="Example: Voided payment #123 in QuickBooks on Sep 4" /><div className="mt-3 flex gap-2"><button disabled={workingId === manualRow.id} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">Save reconciliation</button><button type="button" onClick={() => setManualRow(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600">Cancel</button></div></form>}</section>;
}

const contractorPaymentLabels = { ready: 'Ready', synced: 'Synced', failed: 'Retry needed', manual_review: 'Manual review', manually_reconciled: 'Handled manually', needs_bill: 'Bill first', needs_vendor: 'Vendor first', needs_account: 'Payment account needed', mismatch: 'Does not match' };
const contractorPaymentColors = { ...paymentColors, needs_bill: 'bg-amber-100 text-amber-800', needs_vendor: 'bg-amber-100 text-amber-800', needs_account: 'bg-amber-100 text-amber-800' };

function ContractorPaymentReview() {
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [workingId, setWorkingId] = useState(null);
  const [manualRow, setManualRow] = useState(null);
  const [manualNote, setManualNote] = useState('');
  async function reload() { try { setData(await getQuickBooksContractorPaymentPreview()); } catch (error) { showToast(error.message, 'error'); } }
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function sync(row) { setWorkingId(row.id); try { await syncQuickBooksContractorPayment(row.id); await reload(); showToast('Contractor payment synchronized'); } catch (error) { showToast(error.message || 'Unable to synchronize contractor payment', 'error'); } finally { setWorkingId(null); } }
  async function verify(row) { setWorkingId(row.id); try { await reconcileQuickBooksContractorPayment(row.id); await reload(); showToast('Contractor payment matches QuickBooks'); } catch (error) { showToast(error.message || 'Payment needs review', 'error'); await reload(); } finally { setWorkingId(null); } }
  async function saveManual(event) { event.preventDefault(); setWorkingId(manualRow.id); try { await manuallyReconcileQuickBooksContractorPayment(manualRow.id, manualNote); setManualRow(null); setManualNote(''); await reload(); showToast('Manual reconciliation recorded'); } catch (error) { showToast(error.message || 'Unable to record reconciliation', 'error'); } finally { setWorkingId(null); } }
  const rows = data?.rows || [];
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-800">Contractor payment reconciliation</h3><p className="mt-1 text-sm text-slate-500">Link recorded contractor payments to their QuickBooks bills. Corrections and reversals remain manual to prevent accidental duplicate payments.</p></div><button type="button" onClick={reload} className="text-sm font-semibold text-indigo-600">Refresh</button></div>{data && !data.paymentAccountConfigured && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Choose a contractor payment account above before synchronizing payments.</p>}<div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">{!rows.length ? <p className="p-6 text-center text-sm text-slate-400">No contractor payments have been recorded.</p> : rows.map((row) => <div key={row.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-800">{row.contractorName} · {row.eventName}</p><span className={`rounded-full px-2 py-1 text-xs font-semibold ${contractorPaymentColors[row.syncStatus]}`}>{contractorPaymentLabels[row.syncStatus]}</span></div><p className="mt-1 text-sm font-semibold text-rose-700">{Number(row.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} paid {new Date(row.occurredAt).toLocaleDateString()}{row.paymentMethod ? ` · ${row.paymentMethod}` : ''}{row.reference ? ` · ${row.reference}` : ''}</p>{row.reason && <p className="mt-1 text-xs text-slate-500">{row.reason}</p>}</div><div className="flex flex-wrap gap-2">{['ready', 'failed'].includes(row.syncStatus) && <button type="button" onClick={() => sync(row)} disabled={workingId === row.id} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{workingId === row.id ? 'Syncing…' : row.syncStatus === 'failed' ? 'Retry' : 'Sync payment'}</button>}{['synced', 'mismatch'].includes(row.syncStatus) && <button type="button" onClick={() => verify(row)} disabled={workingId === row.id} className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700">{workingId === row.id ? 'Checking…' : 'Verify'}</button>}{row.syncStatus === 'manual_review' && <button type="button" onClick={() => { setManualRow(row); setManualNote(''); }} className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800">Record how handled</button>}</div></div>)}</div>{manualRow && <form onSubmit={saveManual} className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"><h4 className="font-bold text-slate-800">Record manual reconciliation</h4><p className="mt-1 text-xs text-slate-600">Describe the correction, void, or adjustment entered in QuickBooks. This note does not change QuickBooks.</p><textarea required rows={3} value={manualNote} onChange={(event) => setManualNote(event.target.value)} className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm" placeholder="Example: Corrected bill payment in QuickBooks on Oct 3" /><div className="mt-3 flex gap-2"><button disabled={workingId === manualRow.id} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">Save reconciliation</button><button type="button" onClick={() => setManualRow(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600">Cancel</button></div></form>}</section>;
}

const activityEntityLabels = { customer: 'Customer', invoice: 'Invoice', payment: 'Client payment', vendor: 'Vendor', bill: 'Contractor bill', bill_payment: 'Contractor payment' };

function QuickBooksActivityCenter() {
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [entityType, setEntityType] = useState('all');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    getQuickBooksActivity({ page, status, entityType }).then((result) => { if (active) setData(result); }).catch((error) => showToast(error.message, 'error')).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, status, entityType]); // eslint-disable-line react-hooks/exhaustive-deps
  function changeStatus(value) { setStatus(value); setPage(1); }
  function changeEntity(value) { setEntityType(value); setPage(1); }
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-800">QuickBooks activity</h3><p className="mt-1 text-sm text-slate-500">A searchable-scale audit trail of what synchronized, failed, or needs review.</p></div>{loading && <span className="text-xs font-semibold text-slate-400">Loading…</span>}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-semibold text-slate-600">Result</span><select value={status} onChange={(event) => changeStatus(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="all">All results</option><option value="success">Successful ({data?.counts?.success || 0})</option><option value="failed">Failed ({data?.counts?.failed || 0})</option><option value="needs_review">Needs review ({data?.counts?.needs_review || 0})</option></select></label><label><span className="mb-1 block text-xs font-semibold text-slate-600">Record type</span><select value={entityType} onChange={(event) => changeEntity(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="all">All record types</option>{Object.entries(activityEntityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">{!data?.rows?.length ? <p className="p-6 text-center text-sm text-slate-400">No QuickBooks activity matches these filters.</p> : data.rows.map((row) => <div key={row.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-800">{row.entity?.displayName || activityEntityLabels[row.entityType] || row.entityType}</p><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.status === 'success' ? 'bg-emerald-100 text-emerald-700' : row.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{row.status === 'success' ? 'Successful' : row.status === 'failed' ? 'Failed' : 'Needs review'}</span></div><p className="mt-1 text-sm text-slate-500">{activityEntityLabels[row.entityType] || row.entityType} · {row.action.replaceAll('_', ' ')}</p>{row.message && <p className="mt-1 text-xs text-slate-600">{row.message}</p>}</div><div className="text-xs text-slate-400 sm:text-right"><p>{new Date(row.createdAt).toLocaleString()}</p>{row.entity?.quickBooksId && <p className="mt-1">QuickBooks ID {row.entity.quickBooksId}</p>}</div></div>)}</div><div className="mt-4 flex items-center justify-between"><p className="text-xs text-slate-500">{data?.total || 0} activity records</p><div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40">Previous</button><button type="button" disabled={page >= (data?.pageCount || 1) || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40">Next</button></div></div></section>;
}

export default function IntegrationsTab() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [setup, setSetup] = useState(null);
  const [setupLoading, setSetupLoading] = useState(false);

  useEffect(() => {
    const result = searchParams.get('quickbooks');
    if (result === 'connected') showToast('QuickBooks connected');
    if (result === 'error') showToast(searchParams.get('message') || 'Unable to connect QuickBooks', 'error');
    if (result) {
      const next = new URLSearchParams(searchParams);
      next.delete('quickbooks');
      next.delete('message');
      setSearchParams(next, { replace: true });
    }
    getQuickBooksStatus().then(setConnection).catch((error) => showToast(error.message, 'error')).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!connection?.connected) { setSetup(null); return; }
    setSetupLoading(true);
    getQuickBooksSetup().then(setSetup).catch((error) => showToast(error.message, 'error')).finally(() => setSetupLoading(false));
  }, [connection?.connected]); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    setWorking(true);
    try {
      const url = await beginQuickBooksConnection();
      window.location.assign(url);
    } catch (error) {
      showToast(error.message || 'Unable to start the QuickBooks connection', 'error');
      setWorking(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect QuickBooks from this GigWorks account? Existing QuickBooks records will not be deleted.')) return;
    setWorking(true);
    try {
      setConnection(await disconnectQuickBooks());
      showToast('QuickBooks disconnected');
    } catch (error) {
      showToast(error.message || 'Unable to disconnect QuickBooks', 'error');
    } finally {
      setWorking(false);
    }
  }

  async function checkConnection() {
    setWorking(true);
    try {
      setConnection(await checkQuickBooksConnection());
      showToast('QuickBooks connection is healthy');
    } catch (error) {
      showToast(error.message || 'QuickBooks needs to be reconnected', 'error');
      getQuickBooksStatus().then(setConnection).catch(() => {});
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading integrations…</p>;
  const connected = connection?.connected;
  return <div className="max-w-3xl space-y-5">
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-lg font-black text-white">qb</div>
          <div><h3 className="font-bold text-slate-800">QuickBooks Online</h3><p className="mt-1 max-w-xl text-sm text-slate-500">Connect your accounting company so completed GigWorks financial activity can be reviewed and synchronized without duplicate entry.</p></div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{connected ? 'Connected' : 'Not connected'}</span>
      </div>
      {connected ? <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="font-semibold text-slate-800">{connection.companyName || 'QuickBooks company'}</p><p className="mt-1 text-xs text-slate-500">Connected securely. Accounting synchronization will be enabled in the next integration phase.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={checkConnection} disabled={working} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">{working ? 'Checking…' : 'Check connection'}</button><button type="button" onClick={disconnect} disabled={working} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Disconnect</button></div></div> : <div className="mt-5"><button type="button" onClick={connect} disabled={working || !connection?.configured} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{working ? 'Opening QuickBooks…' : connection?.status === 'needs_reauthorization' ? 'Reconnect QuickBooks' : 'Connect QuickBooks'}</button>{!connection?.configured && <p className="mt-2 text-xs text-amber-700">QuickBooks connection will become available after the Intuit production credentials are configured.</p>}</div>}
    </section>
    {connected && (setupLoading ? <p className="text-sm text-slate-400">Loading accounting setup…</p> : setup && <AccountingSetup setup={setup} setSetup={setSetup} />)}
    {connected && setup?.readiness?.ready && <InvoiceSyncReview />}
    {connected && setup?.readiness?.ready && <PaymentSyncReview />}
    {connected && setup?.readiness?.ready && <VendorSyncReview />}
    {connected && setup?.readiness?.ready && <ContractorBillReview />}
    {connected && setup?.readiness?.ready && <ContractorPaymentReview />}
    {connected && setup?.readiness?.ready && <QuickBooksActivityCenter />}
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-5"><h3 className="font-bold text-slate-800">QuickBooks workflow ready</h3><div className="mt-3 grid gap-3 text-sm text-slate-600 sm:grid-cols-2"><p>✓ Clients and QuickBooks customers</p><p>✓ Invoices and client payments</p><p>✓ Contractors and vendors</p><p>✓ Contractor bills and payments</p></div><p className="mt-4 text-xs text-slate-500">Every accounting record remains review-based and duplicate-safe.</p></section>
  </div>;
}
