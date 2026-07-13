import { useState } from 'react';

function currency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

export default function ContractorPickerRow({
  booking, contractor, inquiryStatuses, index, emailTemplates,
  onStatusChange, onRemove, onSendEmail, onOpenContractor,
  onDragStart, onDragOver, onDrop, isDragging,
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [sending, setSending] = useState(false);

  if (!contractor) return null;
  const status = inquiryStatuses.find((s) => s.id === booking.inquiryStatusId);

  async function handleSend() {
    if (!selectedTemplateId || sending) return;
    setSending(true);
    try {
      await onSendEmail(booking.contractorId, selectedTemplateId);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(index); }}
      onDrop={() => onDrop(index)}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-white ${isDragging ? 'opacity-40' : 'border-slate-200'}`}
    >
      <span className="cursor-grab text-slate-300 select-none" aria-hidden="true">⠿</span>

      <button
        type="button"
        onClick={() => onOpenContractor(contractor)}
        className="flex-1 min-w-0 text-left"
      >
        <div className="text-sm font-medium text-slate-800 truncate hover:text-indigo-600 hover:underline">
          {contractor.firstName} {contractor.lastName}
        </div>
        <div className="text-xs text-slate-400 truncate">
          {contractor.contractorType1}{contractor.contractorType2 ? ` · ${contractor.contractorType2}` : ''}
        </div>
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
            disabled={!contractor.email || !selectedTemplateId || sending}
            className={`shrink-0 px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-600 text-xs font-semibold hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 ${contractor.email ? '' : 'invisible'}`}
          >
            {sending && <span className="w-3 h-3 rounded-full border-2 border-indigo-300/40 border-t-indigo-600 animate-spin" />}
            Send Email
          </button>
        </>
      )}

      <select
        value={booking.inquiryStatusId || ''}
        onChange={(e) => onStatusChange(booking.contractorId, e.target.value)}
        className="shrink-0 ml-3 w-32 px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-medium"
        style={status ? { color: status.color, borderColor: `${status.color}55`, backgroundColor: `${status.color}11` } : undefined}
      >
        {inquiryStatuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>

      <div className="w-20 text-right text-sm font-semibold text-slate-700 shrink-0">
        {currency(contractor.price)}
      </div>

      <button
        type="button"
        onClick={() => onRemove(booking.contractorId)}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
        aria-label="Remove contractor"
      >
        ✕
      </button>
    </div>
  );
}
