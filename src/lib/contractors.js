import { apiFetch } from '../context/AuthContext';
import { fetchAllPages } from './fetchAllPages';

export async function listContractors() {
  return fetchAllPages('/contractors', 'contractors');
}

export async function createContractor(patch) {
  const data = await apiFetch('/contractors', { method: 'POST', body: JSON.stringify(patch) });
  return data.contractor;
}

export async function updateContractorApi(id, patch) {
  const data = await apiFetch(`/contractors/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.contractor;
}

export async function deleteContractorApi(id) {
  return apiFetch(`/contractors/${id}`, { method: 'DELETE' });
}

// One request, whole batch — returns { sentCount, skipped: [{contractorId,
// name, reason}] } so the caller can report exactly who didn't get it and
// why (no email on file vs. an actual send failure), see
// ContractorsPage.jsx's BulkEmailModal.
export async function bulkEmailContractors({ contractorIds, subject, body, fromName }) {
  return apiFetch('/contractors/bulk-email', {
    method: 'POST',
    body: JSON.stringify({ contractorIds, subject, body, fromName }),
  });
}

// Get-or-create — always returns a usable link, same pattern as
// src/lib/guests.js's getRsvpLink. Returns { calendarLink, showConfirmed,
// showTentative } — the visibility flags come along so the caller can
// initialize checkboxes without a second round trip.
export async function getContractorCalendarLink(contractorId) {
  return apiFetch(`/contractors/${contractorId}/calendar-link`);
}

// Rotates the link's token — the previously-shared URL stops working.
export async function regenerateContractorCalendarLink(contractorId) {
  return apiFetch(`/contractors/${contractorId}/calendar-link/regenerate`, { method: 'POST' });
}

// Which gig buckets this contractor is allowed to see on their own link —
// unavailable/declined gigs are never shown regardless (see the server
// route), only confirmed/tentative are owner-toggleable.
export async function updateContractorCalendarLinkVisibility(contractorId, { showConfirmed, showTentative }) {
  return apiFetch(`/contractors/${contractorId}/calendar-link`, {
    method: 'PATCH',
    body: JSON.stringify({ showConfirmed, showTentative }),
  });
}

// Emails the contractor their own calendar link — requires an email on
// file, 400s otherwise.
export async function emailContractorCalendarLink(contractorId) {
  return apiFetch(`/contractors/${contractorId}/calendar-link/email`, { method: 'POST' });
}

// ---- Public (unauthenticated, token-based — used by ContractorCalendarPage) ----

export async function getContractorCalendarByToken(token) {
  // returns { contractor, businessInfo, gigs }
  return apiFetch(`/contractor-calendar/${encodeURIComponent(token)}`);
}

export async function respondToGigByToken(token, eventId, action) {
  return apiFetch(`/contractor-calendar/${encodeURIComponent(token)}/gigs/${encodeURIComponent(eventId)}/respond`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}
