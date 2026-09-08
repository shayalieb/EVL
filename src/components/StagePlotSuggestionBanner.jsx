import { SparkleIcon } from './ui/icons';

// A cold-start nudge based on this account's own recent stage plots (see
// server/src/lib/stagePlotEquipmentUsage.js) — only ever shown while the
// current plot is still empty. Accepting a suggestion re-submits its
// `prompt` through the exact same AI prompt bar / proposal card as manual
// input, so it's confirmed the same way, not a shortcut that skips review.
export default function StagePlotSuggestionBanner({ suggestion, onAccept, onDismiss, loading }) {
  return (
    <div data-testid="stage-plot-suggestion-banner" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm">
      <span className="flex items-center gap-2 text-slate-700">
        <SparkleIcon className="h-4 w-4 shrink-0 text-emerald-600" />
        You've added {suggestion.label} to {suggestion.occurrences} of your last {suggestion.outOf} stage plots — add it here too?
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={loading}
          data-testid="stage-plot-suggestion-accept-button"
          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
        >
          Add it
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={loading}
          data-testid="stage-plot-suggestion-dismiss-button"
          className="px-2 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          No thanks
        </button>
      </span>
    </div>
  );
}
