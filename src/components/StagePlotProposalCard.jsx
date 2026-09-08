import { useState } from 'react';

const LIST_LABELS = { channel: 'Production List', backline: 'Backline List' };

// Confirmation card for AI-proposed stage plot rows — same Confirm/Dismiss/
// `confirming` prop contract as AssistantActionCard.jsx, but renders an
// editable/removable list of proposed rows instead of a single description
// line, since that's the actual shape of this proposal (several new rows,
// not one action). Nothing is added to the stage plot until Confirm.
export default function StagePlotProposalCard({ pendingAction, onConfirm, onDismiss, confirming }) {
  const [items, setItems] = useState(pendingAction.fields.items);

  function removeItem(tempId) {
    setItems((current) => current.filter((item) => item.tempId !== tempId));
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-sm" data-testid="stage-plot-proposal-card">
      <div className="font-semibold text-slate-700 mb-2">{pendingAction.description}</div>

      <ul className="mb-3 space-y-1.5">
        {items.map((item) => (
          <li key={item.tempId} data-testid="stage-plot-proposal-item" className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
            <span>
              <span className="font-semibold text-slate-700">{item.listType === 'channel' ? item.source : item.item}</span>
              <span className="ml-2 text-xs text-slate-400">{LIST_LABELS[item.listType] || item.listType}</span>
              {item.unmapped && <span className="ml-2 text-xs font-semibold text-amber-600">Couldn't map this — review before confirming</span>}
            </span>
            <button
              type="button"
              onClick={() => removeItem(item.tempId)}
              aria-label={`Remove ${item.listType === 'channel' ? item.source : item.item}`}
              data-testid="stage-plot-proposal-item-remove-button"
              className="shrink-0 px-1.5 text-slate-300 hover:text-red-600"
            >
              ✕
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-slate-400">Nothing left to add.</li>}
      </ul>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onConfirm(items)}
          disabled={confirming || items.length === 0}
          data-testid="stage-plot-proposal-confirm-button"
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
        >
          {confirming && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
          Add {items.length} item{items.length === 1 ? '' : 's'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={confirming}
          data-testid="stage-plot-proposal-dismiss-button"
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
