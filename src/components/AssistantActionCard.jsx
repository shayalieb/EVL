import { useState } from 'react';

// Confirmation card for a proposed assistant write — modeled directly on
// ReviewInquiryModal.jsx's preview-before-commit pattern. Nothing the
// assistant proposes is ever applied until the user clicks Confirm here;
// Dismiss is always safe, it just discards the proposal.
export default function AssistantActionCard({ pendingAction, onConfirm, onDismiss, confirming }) {
  const [clientChoice, setClientChoice] = useState(null);

  const needsClientDecision = pendingAction.type === 'add_client' && (pendingAction.candidates || []).length > 0;
  const confirmDisabled = confirming || (needsClientDecision && !clientChoice);

  function handleConfirmClick() {
    onConfirm(pendingAction.id, needsClientDecision ? clientChoice : null);
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-sm" data-testid="assistant-action-card">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-indigo-600">Review before saving</div>
      <div className="font-semibold text-slate-700 mb-2">{pendingAction.description}</div>
      {pendingAction.expiresAt && <p className="mb-3 text-xs text-slate-500">This confirmation expires at {new Date(pendingAction.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p>}

      {needsClientDecision && (
        <fieldset className="mb-3 space-y-1.5">
          <legend className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Possible existing client found — compare and choose</legend>
          {pendingAction.candidates.map((c) => (
            <label key={c.id} className="flex cursor-pointer gap-2 rounded-md border border-slate-200 bg-white p-2">
              <input type="radio" name="assistant-client-choice" checked={clientChoice === c.id} onChange={() => setClientChoice(c.id)} />
              <span>
                <span className="block font-semibold text-slate-700">Use {c.firstName} {c.lastName}</span>
                <span className="block text-slate-500">{c.email || 'No email'} · {c.phone || 'No phone'}</span>
              </span>
            </label>
          ))}
          <label className="flex cursor-pointer gap-2 rounded-md border border-slate-200 bg-white p-2">
            <input type="radio" name="assistant-client-choice" checked={clientChoice === 'new'} onChange={() => setClientChoice('new')} />
            <span className="font-semibold text-slate-700">Create a new client — keep this as a separate person</span>
          </label>
        </fieldset>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirmClick}
          disabled={confirmDisabled}
          data-testid="assistant-action-confirm-button"
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
        >
          {confirming && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
          Confirm
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={confirming}
          data-testid="assistant-action-dismiss-button"
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
