import Modal from './ui/Modal';

const TYPE_LABELS = {
  created: 'Created',
  edited: 'Edited',
  deleted: 'Deleted',
  emailed: 'Emailed vendor',
  'email-reply': 'Vendor replied',
  'ai-status-update': 'AI status update',
};

function formatWhen(at) {
  return new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Read-only popup showing two merged sources, newest first:
//  - the system-generated create/edit/delete trail kept on Bookings and
//    Events (record.history) — only the curated fields in
//    DataContext.jsx's diffEventFields/diffBookingFields, not every edit,
//    so this doesn't turn into a firehose of noise
//  - vendor email activity for the same record (type 'emailed'/'email-reply',
//    passed in by the caller — see EventFormPage.jsx/BookingFormPage.jsx)
// Distinct from Booking's own free-text "Activity Log" notes field, a
// separate, older feature.
export default function HistoryModal({ open, onClose, title, entries }) {
  const sorted = [...(entries || [])].sort((a, b) => new Date(b.at) - new Date(a.at));

  return (
    <Modal open={open} onClose={onClose} title={title || 'History'}>
      {sorted.length > 0 ? (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {sorted.map((entry) => (
            <div key={entry.id} data-testid="history-modal-entry" className="text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
              <div className="flex items-center justify-between gap-2 text-slate-700 font-semibold">
                <span>{TYPE_LABELS[entry.type] || entry.type}</span>
                <span className="text-xs font-normal text-slate-400 shrink-0">{formatWhen(entry.at)}</span>
              </div>
              {entry.type === 'emailed' || entry.type === 'email-reply' ? (
                <div className="text-xs text-slate-500 mt-0.5">
                  {entry.type === 'emailed' ? `To ${entry.contractorName}` : `From ${entry.contractorName}`}
                  {entry.subject && <span className="text-slate-400"> — {entry.subject}</span>}
                </div>
              ) : (
                <>
                  {entry.actorName && <div className="text-xs text-slate-400 mt-0.5">by {entry.actorName}</div>}
                  {entry.changes?.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {entry.changes.map((c, i) => (
                        <li key={i} className="text-xs text-slate-500">
                          <span className="font-medium text-slate-600">{c.label}</span>
                          {c.from !== undefined ? `: ${c.from} → ${c.to}` : `: ${c.to}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
          No history yet.
        </div>
      )}
    </Modal>
  );
}
