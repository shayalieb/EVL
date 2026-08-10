import { apiFetch } from '../context/AuthContext';

export async function listContractors() {
  const data = await apiFetch('/contractors');
  return data.contractors;
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

// Get-or-create — always returns a usable URL, same pattern as
// src/lib/guests.js's getRsvpLink.
export async function getContractorCalendarLink(contractorId) {
  const data = await apiFetch(`/contractors/${contractorId}/calendar-link`);
  return data.calendarLink;
}

// Rotates the link's token — the previously-shared URL stops working.
export async function regenerateContractorCalendarLink(contractorId) {
  const data = await apiFetch(`/contractors/${contractorId}/calendar-link/regenerate`, { method: 'POST' });
  return data.calendarLink;
}

// ---- Public (unauthenticated, token-based — used by ContractorCalendarPage) ----

export async function getContractorCalendarByToken(token) {
  // returns { contractor, businessInfo, gigs }
  return apiFetch(`/contractor-calendar/${encodeURIComponent(token)}`);
}
