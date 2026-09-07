import { apiFetch } from '../context/AuthContext';

// `history` is a flat array of { role: 'user'|'assistant', content: string }
// prior turns — kept client-side only for now (see AssistantModal.jsx),
// not persisted server-side.
export async function askAssistant(question, history = []) {
  const data = await apiFetch('/assistant/ask', {
    method: 'POST',
    body: JSON.stringify({ question, history }),
  });
  return data.answer;
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
