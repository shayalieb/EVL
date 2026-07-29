import { apiFetch } from '../context/AuthContext';

export async function listInquiryLinks(status) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await apiFetch(`/inquiry-links${q}`);
  return data.links;
}

export async function createInquiryLink({ recipientEmail, recipientName }) {
  // returns { link, inquiryLink, emailSent, emailError }
  return apiFetch('/inquiry-links', {
    method: 'POST',
    body: JSON.stringify({ recipientEmail, recipientName }),
  });
}

export async function applyInquiryLink(id, { bookingId, clientId }) {
  const data = await apiFetch(`/inquiry-links/${id}/apply`, {
    method: 'POST',
    body: JSON.stringify({ bookingId, clientId }),
  });
  return data.link;
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
