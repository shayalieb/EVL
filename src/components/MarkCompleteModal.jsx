import { useEffect, useState } from 'react';
import Modal from './ui/Modal';

// Shown when marking a Booking or Event complete that has a link to the
// other side (Booking.convertedEventId, in either direction) and that
// linked record isn't already completed — lets the user choose to complete
// just the one they clicked, or both together (the common case once a gig
// has fully wrapped). Skipped entirely by the caller when there's no link
// to ask about, or the linked record is already completed.
export default function MarkCompleteModal({ open, onClose, onConfirm, primaryLabel, linkedLabel }) {
  const [includePrimary, setIncludePrimary] = useState(true);
  const [includeLinked, setIncludeLinked] = useState(true);

  useEffect(() => {
    if (open) {
      setIncludePrimary(true);
      setIncludeLinked(true);
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Mark complete" widthClass="max-w-sm">
      <div className="space-y-3 mb-5">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includePrimary}
            onChange={(e) => setIncludePrimary(e.target.checked)}
            data-testid="mark-complete-primary-checkbox"
            className="rounded border-slate-300"
          />
          {primaryLabel}
        </label>
        {linkedLabel && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={includeLinked}
              onChange={(e) => setIncludeLinked(e.target.checked)}
              data-testid="mark-complete-linked-checkbox"
              className="rounded border-slate-300"
            />
            {linkedLabel}
          </label>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          data-testid="mark-complete-cancel-button"
          className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm({ includePrimary, includeLinked })}
          disabled={!includePrimary && !includeLinked}
          data-testid="mark-complete-confirm-button"
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Mark Complete
        </button>
      </div>
    </Modal>
  );
}
