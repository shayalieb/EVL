import { useEffect, useId, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, children, widthClass = 'max-w-lg', bodyClassName = 'px-4 py-5 sm:px-6', outerClassName = 'sm:my-8', testId, descriptionId }) {
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
        onCloseRef.current?.();
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
    <div data-testid={testId} className="fixed inset-0 z-40 flex items-start justify-center overflow-hidden p-0 sm:items-center sm:p-4">
      <div className="fixed inset-0 bg-slate-900/55" onClick={onClose} aria-hidden="true" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} className={`relative flex max-h-[100dvh] w-full flex-col bg-white shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl ${widthClass} ${outerClassName}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
          <h3 id={titleId} className="min-w-0 truncate pr-2 text-lg font-bold text-slate-800">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={!onClose}
            data-testid="modal-close-button"
            className="min-w-11 min-h-11 shrink-0 text-slate-400 hover:text-slate-600 rounded-lg p-2 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className={`min-h-0 overflow-y-auto ${bodyClassName}`}>{children}</div>
      </div>
    </div>
  );
}
