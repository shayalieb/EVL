import { useState } from 'react';

export default function Tooltip({ content, children, widthClass = 'w-64' }) {
  const [open, setOpen] = useState(false);
  if (!content) return children;
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          className={`absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 ${widthClass} rounded-lg bg-slate-800 text-white text-xs p-3 shadow-lg pointer-events-none`}
        >
          {content}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </span>
      )}
    </span>
  );
}
