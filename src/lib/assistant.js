import { apiFetch } from '../context/AuthContext';

// `history` is a flat array of { role: 'user'|'assistant', content: string }
// prior turns — kept client-side only for now (see AssistantModal.jsx),
// not persisted server-side. Returns { answer, pendingAction, link } —
// pendingAction/link are null unless the assistant proposed a write or a
// navigation shortcut; nothing is applied until confirmAssistantAction is
// called separately, with the user's explicit confirmation.
export async function askAssistant(question, history = []) {
  return apiFetch('/assistant/ask', {
    method: 'POST',
    body: JSON.stringify({ question, history }),
  });
}

// `type` matches a pendingAction's `type`; `fields` should be exactly (or a
// user-edited version of) that pendingAction's `fields` — the server
// re-validates and re-checks permissions regardless of what's sent.
export async function confirmAssistantAction(type, fields) {
  const data = await apiFetch('/assistant/confirm-action', {
    method: 'POST',
    body: JSON.stringify({ type, fields }),
  });
  return data.result;
}

// Returns { title, hours, offerings, lineItems, summary } — offerings are
// real catalog objects (matched server-side against the account's actual
// pricing), lineItems are the assistant's own priced estimates for
// anything not in the catalog.
export async function draftProposal(bookingId, inquiryText) {
  const data = await apiFetch('/assistant/draft-proposal', {
    method: 'POST',
    body: JSON.stringify({ bookingId, inquiryText }),
  });
  return data.draft;
}
