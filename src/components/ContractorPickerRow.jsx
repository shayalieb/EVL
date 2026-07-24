import { useState } from 'react';
import Badge from './ui/Badge';
import { formatCurrency as currency } from '../lib/format';
import { getPricingTier, getPricingTiers } from '../lib/pricingTiers';
import { BUCKETS, statusBucket } from '../lib/inquiryStatusBucket';

const timeInputClass = 'px-2 py-1 rounded-lg border border-slate-300 text-xs focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const PAYMENT_METHOD_LABELS = { ach: 'ACH', check: 'Check', card: 'Card', other: 'Other' };

export default function ContractorPickerRow({
  booking, contractor, inquiryStatuses, index, emailTemplates, threadSummary,
  onStatusChange, onRemove, onRequestSend, onOpenContractor, onOpenThread, onTierChange, onTimeChange,
  onPayClick, onMarkUnpaid,
  onDragStart, onDragOver, onDrop, isDragging,
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  if (!contractor) return null;
  const status = inquiryStatuses.find((s) => s.id === booking.inquiryStatusId);
  const unreadCount = threadSummary?.unreadCount || 0;
  const tiers = getPricingTiers(contractor);
  const activeTier = getPricingTier(contractor, booking.pricingTierId);

  const currentBucket = statusBucket(status);
  const statusesByBucket = Object.fromEntries(BUCKETS.map((b) => [b.value, inquiryStatuses.filter((s) => statusBucket(s) === b.value)]));

  // Switching bucket picks that bucket's first configured status (e.g.
  // whichever inquiry status is first in Settings' Tentative group) — the
  // secondary dropdown below is for picking a more specific one afterward.
  function handleBucketClick(bucketValue) {
    if (bucketValue === currentBucket) return;
    const candidate = statusesByBucket[bucketValue][0];
    if (candidate) onStatusChange(booking.contractorId, candidate.id);
  }

  function handleSend() {
    if (!selectedTemplateId) return;
    onRequestSend(booking.contractorId, selectedTemplateId);
  }

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(index); }}
      onDrop={() => onDrop(index)}
      className={`rounded-lg border-l-4 border-l-indigo-400 border border-slate-200 bg-white ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center gap-3 px-3.5 pt-3.5 pb-2.5">
        <span className="cursor-grab text-slate-300 select-none" aria-hidden="true">⠿</span>

        <button
          type="button"
          onClick={() => onOpenContractor(contractor)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="text-sm font-medium text-slate-800 truncate hover:text-indigo-600 hover:underline">
            {contractor.firstName} {contractor.lastName}
          </div>
          <div className="text-sm font-bold text-slate-600 truncate">
            {contractor.contractorType1}{contractor.contractorType2 ? ` · ${contractor.contractorType2}` : ''}
          </div>
        </button>

        <div className="shrink-0 flex items-center gap-1">
          <div className="flex gap-1">
            {BUCKETS.map((b) => {
              const active = currentBucket === b.value;
              const disabled = statusesByBucket[b.value].length === 0;
              return (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => handleBucketClick(b.value)}
                  disabled={disabled}
                  title={disabled ? `No "${b.label}" inquiry status configured in Settings` : b.label}
                  className="px-2 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-30 disabled:cursor-not-allowed border-slate-300 text-slate-500 hover:bg-slate-50"
                  style={active ? { color: status.color, borderColor: `${status.color}55`, backgroundColor: `${status.color}11` } : undefined}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
          {currentBucket !== 'unavailable' && statusesByBucket[currentBucket].length > 1 && (
            <select
              value={booking.inquiryStatusId || ''}
              onChange={(e) => onStatusChange(booking.contractorId, e.target.value)}
              title="Specific status"
              className="w-28 px-1.5 py-1.5 rounded-lg border border-slate-300 text-xs"
            >
              {statusesByBucket[currentBucket].map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpenThread(booking.contractorId)}
          className="relative shrink-0 w-12 h-12 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50"
          aria-label="View email history"
          title="Email history"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-7 h-7"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center border-2 border-white">
              {unreadCount}
            </span>
          )}
        </button>

        {emailTemplates.length > 0 && (
          <>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              disabled={!contractor.email}
              className={`shrink-0 w-36 px-2 py-1.5 rounded-lg border border-slate-300 text-xs ${contractor.email ? '' : 'invisible'}`}
            >
              <option value="">Select template…</option>
              {emailTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button
              type="button"
              onClick={handleSend}
              disabled={!contractor.email || !selectedTemplateId}
              className={`shrink-0 px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-600 text-xs font-semibold hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 ${contractor.email ? '' : 'invisible'}`}
            >
              Send Email
            </button>
          </>
        )}

        {tiers.length > 1 && (
          <select
            value={activeTier?.id || ''}
            onChange={(e) => onTierChange(booking.contractorId, e.target.value)}
            className="shrink-0 w-24 px-1.5 py-1.5 rounded-lg border border-slate-300 text-xs"
          >
            {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}

        <div className="w-20 text-right text-sm font-semibold text-slate-700 shrink-0">
          {currency(activeTier?.price)}
        </div>

        {/* Payment only makes sense once a contractor is actually
            confirmed to work the gig — Tentative/Not Avail don't get a
            Pay action. */}
        {currentBucket === 'confirmed' && (
          booking.paymentStatus === 'paid' ? (
            <div className="shrink-0 flex items-center gap-1">
              <button
                type="button"
                onClick={() => onPayClick(booking.contractorId)}
                title={`${currency(booking.paidAmount)}${booking.paymentMethod ? ` via ${PAYMENT_METHOD_LABELS[booking.paymentMethod] || booking.paymentMethod}` : ''}${booking.paymentMethod === 'check' && booking.paymentReference ? ` #${booking.paymentReference}` : ''} — click to edit`}
              >
                <Badge color="#22c55e">Paid</Badge>
              </button>
              <button
                type="button"
                onClick={() => onMarkUnpaid(booking.contractorId)}
                className="text-slate-300 hover:text-red-600 px-0.5"
                aria-label="Mark unpaid"
                title="Mark unpaid"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onPayClick(booking.contractorId)}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 text-xs font-semibold hover:bg-emerald-50"
            >
              Pay
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onRemove(booking.contractorId)}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
          aria-label="Remove contractor"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-2 px-3.5 pb-3.5 pl-9">
        <label className="text-xs font-semibold text-slate-400">Start</label>
        <input
          type="time"
          value={booking.startTime || ''}
          onChange={(e) => onTimeChange(booking.contractorId, 'startTime', e.target.value)}
          className={timeInputClass}
        />
        <label className="text-xs font-semibold text-slate-400 ml-2">End</label>
        <input
          type="time"
          value={booking.endTime || ''}
          onChange={(e) => onTimeChange(booking.contractorId, 'endTime', e.target.value)}
          className={timeInputClass}
        />
      </div>
    </div>
  );
}
