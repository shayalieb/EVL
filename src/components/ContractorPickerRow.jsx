import { useState } from 'react';
import Badge from './ui/Badge';
import { formatCurrency as currency, isValidEmailAddress } from '../lib/format';
import { getPricingTier, getPricingTiers, getOvertimeHours, getOvertimeAmount } from '../lib/pricingTiers';
import { BUCKETS, statusBucket } from '../lib/inquiryStatusBucket';

const controlClass = 'min-h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const PAYMENT_METHOD_LABELS = { ach: 'ACH', check: 'Check', card: 'Card', cash: 'Cash', wire: 'Wire', other: 'Other' };
const requestStyle = { submitted: 'bg-amber-100 text-amber-800', approved: 'bg-emerald-100 text-emerald-700', disputed: 'bg-rose-100 text-rose-700', paid: 'bg-indigo-100 text-indigo-700' };
const requestLabel = { submitted: 'Request needs review', approved: 'Request approved', disputed: 'Request returned', paid: 'Request paid' };

export default function ContractorPickerRow({ booking, contractor, inquiryStatuses, index, emailTemplates, threadSummary, onStatusChange, onRemove, onRequestSend, onOpenContractor, onOpenThread, onTierChange, onTimeChange, onOvertimeChange, onPayClick, onMarkUnpaid, paymentRequest, onReviewPaymentRequest, onDragStart, onDragOver, onDrop, isDragging }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (!contractor) return null;

  const status = inquiryStatuses.find((item) => item.id === booking.inquiryStatusId);
  const currentBucket = statusBucket(status);
  const unreadCount = threadSummary?.unreadCount || 0;
  const hasValidEmail = isValidEmailAddress(contractor.email);
  const tiers = getPricingTiers(contractor);
  const activeTier = getPricingTier(contractor, booking.pricingTierId);
  const tierTracksOvertime = Number(activeTier?.includedHours) > 0 && Number(activeTier?.overtimeRate) > 0;
  const isManualOvertime = booking.overtimeHoursOverride !== null && booking.overtimeHoursOverride !== undefined && booking.overtimeHoursOverride !== '';
  const overtimeHours = tierTracksOvertime ? getOvertimeHours(booking, contractor) : 0;
  const overtimeAmount = tierTracksOvertime ? getOvertimeAmount(booking, contractor) : 0;
  const bucketStripClass = { confirmed: 'border-l-green-400', tentative: 'border-l-yellow-400', unavailable: 'border-l-red-400' }[currentBucket] || 'border-l-indigo-400';

  return <div draggable onDragStart={() => onDragStart(index)} onDragOver={(event) => { event.preventDefault(); onDragOver(index); }} onDrop={() => onDrop(index)} data-testid="contractor-picker-row" className={`rounded-xl border border-l-4 border-slate-200 bg-white ${bucketStripClass} ${isDragging ? 'opacity-40' : ''}`}>
    <div className="flex flex-wrap items-center gap-2.5 p-3">
      <span className="cursor-grab select-none text-slate-300" aria-hidden="true">⠿</span>
      <button type="button" onClick={() => onOpenContractor(contractor)} data-testid="contractor-picker-row-name-button" className="min-w-[10rem] flex-1 text-left"><span className="block truncate text-sm font-semibold text-slate-800 hover:text-indigo-600">{contractor.firstName} {contractor.lastName}</span><span className="block truncate text-xs text-slate-500">{contractor.contractorType1}{contractor.contractorType2 ? ` · ${contractor.contractorType2}` : ''}</span></button>
      <select value={booking.inquiryStatusId || ''} onChange={(event) => onStatusChange(booking.contractorId, event.target.value)} aria-label={`Status for ${contractor.firstName} ${contractor.lastName}`} data-testid="contractor-picker-row-status-select" className={`${controlClass} w-36`}>{BUCKETS.map((bucket) => <optgroup key={bucket.value} label={bucket.label}>{inquiryStatuses.filter((item) => statusBucket(item) === bucket.value).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>)}</select>
      <div className="min-w-20 text-right"><span className="block text-sm font-bold text-slate-700">{currency(activeTier?.price)}</span>{tiers.length > 1 && <span className="block text-[11px] text-slate-400">{activeTier?.name}</span>}</div>
      {paymentRequest && <button type="button" onClick={() => onReviewPaymentRequest(paymentRequest)} data-testid="contractor-picker-row-payment-request-button" title={paymentRequest.note || 'Open payment request'} className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${requestStyle[paymentRequest.status] || requestStyle.submitted}`}>{requestLabel[paymentRequest.status] || 'Payment request'}</button>}
      {currentBucket === 'confirmed' && (booking.paymentStatus === 'paid' ? <div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => onPayClick(booking.contractorId)} title={`${currency(booking.paidAmount)}${booking.paymentMethod ? ` via ${PAYMENT_METHOD_LABELS[booking.paymentMethod] || booking.paymentMethod}` : ''}`} data-testid="contractor-picker-row-paid-badge-button"><Badge color="#22c55e">Paid</Badge></button><button type="button" onClick={() => onMarkUnpaid(booking.contractorId)} className="px-1 text-slate-300 hover:text-red-600" aria-label="Mark unpaid" data-testid="contractor-picker-row-mark-unpaid-button">✕</button></div> : <button type="button" onClick={() => onPayClick(booking.contractorId)} data-testid="contractor-picker-row-pay-button" className="min-h-10 shrink-0 rounded-lg border border-emerald-300 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Pay</button>)}
      <button type="button" onClick={() => setDetailsOpen((open) => !open)} aria-expanded={detailsOpen} data-testid="contractor-picker-row-details-button" className="min-h-10 shrink-0 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">{detailsOpen ? 'Less' : 'More'}</button>
      <button type="button" onClick={() => onRemove(booking.contractorId)} className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-600" aria-label="Remove contractor" data-testid="contractor-picker-row-remove-button">✕</button>
    </div>
    {detailsOpen && <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-3 sm:pl-9"><div className="flex flex-wrap items-end gap-2.5">
      <button type="button" onClick={() => onOpenThread(booking.contractorId)} data-testid="contractor-picker-row-email-history-button" className="relative min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:text-indigo-600">Email history{unreadCount > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadCount}</span>}</button>
      {emailTemplates.length > 0 && hasValidEmail && <><select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} data-testid="contractor-picker-row-template-select" className={`${controlClass} w-40`}><option value="">Select email…</option>{emailTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select><button type="button" onClick={() => selectedTemplateId && onRequestSend(booking.contractorId, selectedTemplateId)} disabled={!selectedTemplateId} data-testid="contractor-picker-row-send-email-button" className="min-h-10 rounded-lg border border-indigo-300 px-3 text-xs font-semibold text-indigo-600 disabled:opacity-40">Send</button></>}
      {!hasValidEmail && <span className="self-center text-xs font-semibold text-amber-700">Email required before sending</span>}
      {tiers.length > 1 && <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rate<select value={activeTier?.id || ''} onChange={(event) => onTierChange(booking.contractorId, event.target.value)} data-testid="contractor-picker-row-tier-select" className={`${controlClass} mt-1 block w-32 normal-case`}>{tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}</select></label>}
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Start<input type="time" value={booking.startTime || ''} onChange={(event) => onTimeChange(booking.contractorId, 'startTime', event.target.value)} data-testid="contractor-picker-row-start-time-input" className={`${controlClass} mt-1 block`} /></label>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">End<input type="time" value={booking.endTime || ''} onChange={(event) => onTimeChange(booking.contractorId, 'endTime', event.target.value)} data-testid="contractor-picker-row-end-time-input" className={`${controlClass} mt-1 block`} /></label>
      {tierTracksOvertime && <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">OT hours<input type="number" min="0" step="0.5" value={booking.overtimeHoursOverride ?? ''} placeholder={overtimeHours > 0 ? overtimeHours.toFixed(1) : '0'} onChange={(event) => onOvertimeChange(booking.contractorId, event.target.value === '' ? null : event.target.value)} title={isManualOvertime ? 'Manual override—clear to use Start and End time' : 'Calculated from Start and End time'} data-testid="contractor-picker-row-overtime-hours-input" className={`${controlClass} mt-1 block w-20`} /></label>}
      {overtimeAmount > 0 && <span data-testid="contractor-picker-row-overtime-amount" className="self-center text-xs font-semibold text-slate-600">+{currency(overtimeAmount)} overtime</span>}
    </div></div>}
  </div>;
}
