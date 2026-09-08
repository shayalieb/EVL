import { apiFetch } from '../context/AuthContext';

// Conversation history now lives server-side (see getAssistantMessages/
// clearAssistantMessages below) — the server loads recent turns itself,
// nothing to send here. Returns { answer, pendingAction, link } —
// pendingAction/link are null unless the assistant proposed a write or a
// navigation shortcut; nothing is applied until confirmAssistantAction is
// called separately, with the user's explicit confirmation.
export async function askAssistant(question) {
  return apiFetch('/assistant/ask', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

// `type` matches a pendingAction's `type`; `fields` should be exactly (or a
// user-edited version of) that pendingAction's `fields` — the server
// re-validates and re-checks permissions regardless of what's sent.
// `description` is passed through purely for the Activity log display (see
// listAssistantActivity below) — cosmetic only, every actual field is
// re-validated server-side regardless of what description accompanies it.
export async function confirmAssistantAction(type, fields, description) {
  const data = await apiFetch('/assistant/confirm-action', {
    method: 'POST',
    body: JSON.stringify({ type, fields, description }),
  });
  return data.result;
}

// The audit trail of confirmed writes the assistant has made for this
// account — not a conversation transcript, just what actually changed,
// most recent first.
export async function listAssistantActivity() {
  const data = await apiFetch('/assistant/activity');
  return data.actions;
}

// This user's own chat with the assistant — oldest first, capped to the
// last 7 days server-side. Distinct from listAssistantActivity above:
// this is the actual conversation text, private to the person who asked.
export async function getAssistantMessages() {
  const data = await apiFetch('/assistant/messages');
  return data.messages;
}

// Wipes this user's entire persisted chat (not just the 7-day window) —
// only ever their own, never a teammate's.
export async function clearAssistantMessages() {
  return apiFetch('/assistant/messages', { method: 'DELETE' });
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
