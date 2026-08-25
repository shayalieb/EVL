import { useEffect, useId, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, children, widthClass = 'max-w-lg', bodyClassName = 'px-6 py-5', outerClassName = 'my-8', testId, descriptionId }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      const preferred = dialogRef.current?.querySelector('[autofocus]');
      const first = preferred || dialogRef.current?.querySelector(FOCUSABLE);
      (first || dialogRef.current)?.focus();
    });
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
      } else if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
        event.preventDefault();
        focusable[0].focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div data-testid={testId} className="fixed inset-0 z-40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/55" onClick={onClose} aria-hidden="true" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} className={`relative bg-white rounded-2xl shadow-xl w-full ${widthClass} ${outerClassName}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 id={titleId} className="text-lg font-bold text-slate-800">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            data-testid="modal-close-button"
            className="min-w-11 min-h-11 text-slate-400 hover:text-slate-600 rounded-lg p-2"
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
