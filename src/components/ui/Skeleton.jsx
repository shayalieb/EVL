export function Skeleton({ className = '', style, ...props }) {
  return (
    <div
      className={`animate-pulse bg-slate-200/80 rounded ${className}`}
      style={style}
      {...props}
    />
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-1/3 rounded-md" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4 rounded" />
        <Skeleton className="h-4 w-1/2 rounded" />
      </div>
    </div>
  );
}

export function SkeletonRow({ className = '' }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 ${className}`}>
      <div className="space-y-1.5 flex-1 min-w-0">
        <Skeleton className="h-4 w-2/5 rounded" />
        <Skeleton className="h-3 w-1/4 rounded" />
      </div>
      <Skeleton className="h-6 w-20 rounded-full shrink-0" />
    </div>
  );
}

export function SkeletonTable({ rows = 4, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export default Skeleton;
