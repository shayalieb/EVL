export default function Modal({ open, onClose, title, children, widthClass = 'max-w-lg', bodyClassName = 'px-6 py-5', outerClassName = 'my-8' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/55" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-xl w-full ${widthClass} ${outerClassName}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className={bodyClassName}>{children}</div>
      </div>
    </div>
  );
}
