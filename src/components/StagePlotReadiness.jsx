import { useMemo, useState } from 'react';
import { getStagePlotReadiness } from '../lib/stagePlotReadiness';

export default function StagePlotReadiness({ plot, onSelectElement }) {
  const [expanded, setExpanded] = useState(false);
  const readiness = useMemo(() => getStagePlotReadiness(plot), [plot]);
  const tone = readiness.ready ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50';

  function review(issue) {
    if (issue.elementId) onSelectElement?.(issue.elementId);
    document.getElementById('stageplot-production-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section className={`rounded-xl border p-4 ${tone}`} aria-label="Production readiness" data-testid="stageplot-readiness">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span aria-hidden="true">{readiness.ready ? '✓' : '!'}</span>
            <h3 className="text-sm font-bold text-slate-800">{readiness.ready ? 'Ready to share' : `${readiness.requiredCount} item${readiness.requiredCount === 1 ? '' : 's'} to resolve`}</h3>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {readiness.issues.length === 0 ? 'The canvas and production information are complete.' : `${readiness.recommendedCount} optional improvement${readiness.recommendedCount === 1 ? '' : 's'} also found. This check never blocks sending.`}
          </p>
        </div>
        {readiness.issues.length > 0 && <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">{expanded ? 'Hide details' : 'Review details'}</button>}
      </div>
      {expanded && (
        <div className="mt-4 space-y-2">
          {readiness.issues.map((issue, index) => (
            <button key={`${issue.code}-${issue.channelId || index}`} type="button" onClick={() => review(issue)} className="block w-full rounded-lg border border-white bg-white/80 px-3 py-2 text-left hover:border-indigo-200">
              <span className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${issue.severity === 'required' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{issue.severity === 'required' ? 'Resolve' : 'Suggested'}</span>
              <span className="text-xs font-semibold text-slate-700">{issue.title}</span>
              <span className="mt-1 block text-xs text-slate-500">{issue.detail}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
