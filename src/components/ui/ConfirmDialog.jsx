import { useEffect, useState } from 'react';
import Modal from './Modal';

// `confirmText` is opt-in (undefined for every existing caller) — when set,
// the confirm button stays disabled until the typed value matches exactly,
// for the handful of deletes where a stray click next to Edit/a row would
// otherwise be one click away from destroying something (e.g. a contractor).
export default function ConfirmDialog({ open, onClose, onConfirm, title = 'Are you sure?', description, confirmLabel = 'Delete', danger = true, confirmText }) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const requiresTyping = !!confirmText;
  const canConfirm = !requiresTyping || typed === confirmText;

  return (
    <Modal open={open} onClose={onClose} title={title} widthClass="max-w-sm">
      <p className="text-sm text-slate-600 mb-3">{description}</p>
      {requiresTyping && (
        <div className="mb-5">
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Type <span className="font-bold text-slate-700">{confirmText}</span> to confirm
          </label>
          <input
            type="text"
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            data-testid="confirm-dialog-type-to-confirm-input"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-100"
          />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          data-testid="confirm-dialog-cancel-button"
          className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
          data-testid="confirm-dialog-confirm-button"
          className={`px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
