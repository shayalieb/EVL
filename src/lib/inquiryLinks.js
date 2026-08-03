import { apiFetch } from '../context/AuthContext';

export async function listInquiryLinks({ status, bookingId } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (bookingId) params.set('bookingId', bookingId);
  const q = params.toString() ? `?${params.toString()}` : '';
  const data = await apiFetch(`/inquiry-links${q}`);
  return data.links;
}

export async function createInquiryLink({ recipientEmail, recipientName, bookingId }) {
  // returns { link, inquiryLink, emailSent, emailError }
  return apiFetch('/inquiry-links', {
    method: 'POST',
    body: JSON.stringify({ recipientEmail, recipientName, bookingId }),
  });
}

// Issues a fresh token (and expiry) for a still-open link that was lost or
// expired before the client used it — returns the same shape as
// createInquiryLink so callers can reuse one "here's the link" result view.
export async function regenerateInquiryLink(id) {
  return apiFetch(`/inquiry-links/${id}/regenerate`, { method: 'POST' });
}

export async function applyInquiryLink(id, { bookingId, clientId }) {
  const data = await apiFetch(`/inquiry-links/${id}/apply`, {
    method: 'POST',
    body: JSON.stringify({ bookingId, clientId }),
  });
  return data.link;
}

// The one account-wide "general" link a business can paste on their own
// website — get-or-create, so this always returns a usable URL.
export async function getGeneralInquiryLink() {
  const data = await apiFetch('/inquiry-links/reusable-link');
  return data.inquiryLink;
}

// Rotates the general link's token — the previously-embedded URL stops
// working, this returns the new one to swap in.
export async function regenerateGeneralInquiryLink() {
  const data = await apiFetch('/inquiry-links/reusable-link/regenerate', { method: 'POST' });
  return data.inquiryLink;
}

// ---- Public (unauthenticated, token-based — used by InquiryFormPage) ----

export async function getInquiryByToken(token) {
  // returns { businessInfo, eventTypes }
  return apiFetch(`/inquiry/${encodeURIComponent(token)}`);
}

export async function submitInquiry(token, payload) {
  return apiFetch(`/inquiry/${encodeURIComponent(token)}/submit`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
