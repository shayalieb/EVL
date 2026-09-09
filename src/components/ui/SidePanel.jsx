import { useEffect, useId, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A full-bleed alternative to Modal.jsx for tools that deserve real editing
// space (Stage Plot, Set Lists, Run of Show) — anchored to the right of
// AppLayout's sidebar (w-56, hidden below sm) and below its header (h-20),
// rather than a centered dialog that dims the whole screen. The sidebar
// stays visible and clickable next to it. Focus-trap/Escape/scroll-lock
// logic is copied from Modal.jsx so both overlays behave consistently.
export default function SidePanel({ open, onClose, title, children, testId }) {
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
    <div
      ref={dialogRef}
      data-testid={testId}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 sm:left-56 top-20 z-40 flex flex-col bg-white sm:border-l sm:border-slate-200"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
        <h2 id={titleId} className="min-w-0 truncate pr-2 text-lg font-bold text-slate-800">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          disabled={!onClose}
          data-testid="side-panel-close-button"
          className="min-w-11 min-h-11 shrink-0 text-slate-400 hover:text-slate-600 rounded-lg p-2 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
    </div>
  );
}
