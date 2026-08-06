// Windowed page numbers with ellipses, e.g. [1, '…', 4, 5, 6, '…', 42] —
// keeps the bar a fixed width regardless of how many pages exist (matters
// for admin lists that can run into the hundreds of pages).
function pageWindow(current, total, size = 5) {
  if (total <= size + 2) return Array.from({ length: total }, (_, i) => i + 1);
  const half = Math.floor(size / 2);
  let start = Math.max(2, current - half);
  const end = Math.min(total - 1, start + size - 1);
  start = Math.max(2, end - size + 1);
  const pages = [1];
  if (start > 2) pages.push('…');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push('…');
  pages.push(total);
  return pages;
}

export default function Pagination({ page, pageCount, onChange, totalItems, pageSize, testId }) {
  if (pageCount <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-t border-slate-100">
      <div className="text-xs text-slate-500">Showing {start}–{end} of {totalItems}</div>
      <div className="flex items-center gap-1" data-testid={testId}>
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          data-testid={testId ? `${testId}-prev-button` : undefined}
          className="px-2 py-1 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          ‹
        </button>
        {pageWindow(page, pageCount).map((p, i) => (
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="px-1.5 text-sm text-slate-400">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              data-testid={testId ? `${testId}-page-${p}-button` : undefined}
              className={`min-w-[28px] px-2 py-1 rounded-lg text-sm font-semibold ${p === page ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              {p}
            </button>
          )
        ))}
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          data-testid={testId ? `${testId}-next-button` : undefined}
          className="px-2 py-1 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </div>
  );
}
