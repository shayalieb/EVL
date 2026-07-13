import Modal from './Modal';

export default function ConfirmDialog({ open, onClose, onConfirm, title = 'Are you sure?', description, confirmLabel = 'Delete', danger = true }) {
  return (
    <Modal open={open} onClose={onClose} title={title} widthClass="max-w-sm">
      <p className="text-sm text-slate-600 mb-5">{description}</p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
