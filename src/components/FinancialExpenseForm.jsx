import { useEffect, useState } from 'react';
import MoneyInput from './ui/MoneyInput';
import { queryBookings } from '../lib/bookings';
import { queryEvents } from '../lib/events';
import { queryContractors } from '../lib/contractors';

const inputClass = 'mt-1 w-full min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';
const categories = [['contractor_payment', 'Contractor'], ['production', 'Production'], ['travel', 'Travel'], ['backline', 'Equipment / backline'], ['processing_fee', 'Processing fee'], ['other_expense', 'Other']];
const allCategories = [...categories.slice(0, 5), ['agency_commission', 'Agency commission'], ['tax', 'Tax'], ['reimbursement', 'Reimbursement'], ['other_expense', 'Other expense']];

export default function FinancialExpenseForm({ form, setForm, receiptFile, setReceiptFile, groups, selectedGroup, saving, onSubmit, onCancel }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [relatedType, setRelatedType] = useState('');
  const [relatedSearch, setRelatedSearch] = useState('');
  const [relatedResults, setRelatedResults] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedLabel, setRelatedLabel] = useState('');
  const effectiveGroupId = form.groupId || selectedGroup?.id;

  useEffect(() => {
    if (!detailsOpen || !relatedType) { setRelatedResults([]); return undefined; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setRelatedLoading(true);
      try {
        const params = { page: 1, pageSize: 8, search: relatedSearch, ...(effectiveGroupId && relatedType !== 'contractor' ? { groupId: effectiveGroupId } : {}) };
        const result = relatedType === 'booking' ? await queryBookings(params) : relatedType === 'event' ? await queryEvents(params) : await queryContractors(params);
        if (!cancelled) setRelatedResults(result.items);
      } catch { if (!cancelled) setRelatedResults([]); }
      finally { if (!cancelled) setRelatedLoading(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [detailsOpen, effectiveGroupId, relatedSearch, relatedType]);

  function chooseRelated(item) {
    const label = relatedType === 'contractor' ? `${item.firstName || ''} ${item.lastName || ''}`.trim() : item.eventName || item.name || 'Untitled record';
    setRelatedLabel(label);
    setForm((old) => ({ ...old, bookingId: relatedType === 'booking' ? item.id : '', eventId: relatedType === 'event' ? item.id : '', contractorId: relatedType === 'contractor' ? item.id : '' }));
  }

  function changeRelatedType(value) {
    setRelatedType(value); setRelatedSearch(''); setRelatedLabel('');
    setForm((old) => ({ ...old, bookingId: '', eventId: '', contractorId: '' }));
  }

  return <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-indigo-100 bg-white p-5 shadow-sm" aria-busy={saving}>
    <div><h2 className="font-bold text-slate-800">Add money paid out</h2><p className="mt-1 text-sm text-slate-500">Start with the three essentials. Everything else is optional.</p></div>
    <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800"><strong>Looking for money received?</strong> Record customer payments from the booking&apos;s invoice so the balance and payment history stay synchronized.</div>
    <fieldset disabled={saving} className="space-y-5 disabled:opacity-60">
      <div><label className="block text-sm font-bold text-slate-700"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-700">1</span>What was paid for?<input required autoFocus value={form.description} onChange={(event) => setForm((old) => ({ ...old, description: event.target.value }))} placeholder="Example: Van rental for the Smith wedding" className={inputClass} /></label><div className="mt-2 flex flex-wrap gap-2">{categories.map(([value, label]) => <button key={value} type="button" onClick={() => setForm((old) => ({ ...old, category: value }))} className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${form.category === value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}</div></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold text-slate-700"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-700">2</span>How much?<MoneyInput value={form.amount} onChange={(amount) => setForm((old) => ({ ...old, amount }))} className={inputClass} /></label><label className="block text-sm font-bold text-slate-700"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-700">3</span>When was it paid?<input required type="date" value={form.occurredAt} onChange={(event) => setForm((old) => ({ ...old, occurredAt: event.target.value }))} className={inputClass} /></label></div>
      <details open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)} className="rounded-lg border border-slate-200"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">Optional details</summary><div className="space-y-4 border-t border-slate-100 p-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Category<select value={form.category} onChange={(event) => setForm((old) => ({ ...old, category: event.target.value }))} className={inputClass}>{allCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Payment method<select value={form.paymentMethod} onChange={(event) => setForm((old) => ({ ...old, paymentMethod: event.target.value }))} className={inputClass}><option value="">Not specified</option><option value="ach">ACH</option><option value="check">Check</option><option value="card">Card</option><option value="cash">Cash</option><option value="wire">Wire</option><option value="other">Other</option></select></label><label className="text-sm font-medium text-slate-700">Paid to / vendor<input value={form.payee || ''} onChange={(event) => setForm((old) => ({ ...old, payee: event.target.value }))} placeholder="Example: City Van Rental" className={inputClass} /></label><label className="text-sm font-medium text-slate-700">Receipt or vendor invoice<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif" onChange={(event) => setReceiptFile(event.target.files?.[0] || null)} className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700`} /><span className="mt-1 block text-xs font-normal text-slate-400">PDF or image, up to 10MB. You can add this later.</span>{receiptFile && <span className="mt-1 block truncate text-xs font-semibold text-emerald-700">Ready to attach: {receiptFile.name}</span>}</label></div>{groups.length > 0 && <label className="block max-w-md text-sm font-medium text-slate-700">Managed group<select value={form.groupId} onChange={(event) => setForm((old) => ({ ...old, groupId: event.target.value }))} className={inputClass}><option value="">Current selection ({selectedGroup?.name || 'agency-wide'})</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}<div><label className="block text-sm font-medium text-slate-700">Attach to a record<select value={relatedType} onChange={(event) => changeRelatedType(event.target.value)} className={`${inputClass} max-w-md`}><option value="">No attachment</option><option value="booking">Booking</option><option value="event">Event</option><option value="contractor">Contractor</option></select></label>{relatedType && <div className="mt-2 max-w-xl"><input type="search" value={relatedSearch} onChange={(event) => setRelatedSearch(event.target.value)} placeholder={`Search ${relatedType}s…`} className={inputClass} />{relatedLabel && <p className="mt-2 text-sm font-semibold text-emerald-700">Attached to {relatedLabel}</p>}{!relatedLabel && <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white">{relatedLoading ? <p className="p-3 text-sm text-slate-400">Searching…</p> : relatedResults.length === 0 ? <p className="p-3 text-sm text-slate-400">No matching records.</p> : relatedResults.map((item) => <button key={item.id} type="button" onClick={() => chooseRelated(item)} className="block min-h-11 w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 last:border-0 hover:bg-slate-50">{relatedType === 'contractor' ? `${item.firstName || ''} ${item.lastName || ''}`.trim() : item.eventName || item.name || 'Untitled record'}</button>)}</div>}</div>}</div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Reference<input value={form.reference} onChange={(event) => setForm((old) => ({ ...old, reference: event.target.value }))} placeholder="Check or confirmation number" className={inputClass} /></label><label className="text-sm font-medium text-slate-700">Internal note<input value={form.memo} onChange={(event) => setForm((old) => ({ ...old, memo: event.target.value }))} placeholder="Optional note" className={inputClass} /></label></div></div></details>
    </fieldset>
    <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3"><button type="button" onClick={onCancel} disabled={saving} className="min-h-11 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60">Cancel</button><button disabled={saving} className="min-h-11 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Adding payment…' : 'Add payment'}</button></div>
  </form>;
}
