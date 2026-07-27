import { useState } from 'react';

// Small "···" action menu for secondary actions that would otherwise clutter
// a button row — same open/backdrop-click-to-close pattern as AppLayout's
// user menu. Clicking any item inside closes the menu automatically.
export default function OverflowMenu({ children, testId }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={testId}
        aria-label="More actions"
        className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50"
      >
        <span className="text-lg leading-none">⋯</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            onClick={() => setOpen(false)}
            className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 z-20 overflow-hidden py-1"
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}
