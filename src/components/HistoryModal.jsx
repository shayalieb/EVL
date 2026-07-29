import Modal from './ui/Modal';

const TYPE_LABELS = {
  created: 'Created',
  edited: 'Edited',
  deleted: 'Deleted',
};

// Read-only popup for the system-generated create/edit/delete trail kept on
// Bookings and Events (record.history) — distinct from Booking's own
// free-text "Activity Log" notes field, which is a separate, older feature.
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
                <span className="text-xs font-normal text-slate-400 shrink-0">
                  {new Date(entry.at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              {entry.actorName && <div className="text-xs text-slate-400 mt-0.5">by {entry.actorName}</div>}
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
