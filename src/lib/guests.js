import { apiFetch } from '../context/AuthContext';

export async function listGuests(eventId) {
  const data = await apiFetch(`/guests?eventId=${encodeURIComponent(eventId)}`);
  return data.guests;
}

export async function createGuest(eventId, patch) {
  const data = await apiFetch('/guests', { method: 'POST', body: JSON.stringify({ eventId, ...patch }) });
  return data.guest;
}

export async function updateGuest(id, patch) {
  const data = await apiFetch(`/guests/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.guest;
}

export async function deleteGuest(id) {
  return apiFetch(`/guests/${id}`, { method: 'DELETE' });
}

// Get-or-create — always returns a usable URL.
export async function getRsvpLink(eventId) {
  const data = await apiFetch(`/guests/rsvp-link?eventId=${encodeURIComponent(eventId)}`);
  return data.rsvpLink;
}

// Rotates the link's token — the previously-shared URL stops working.
export async function regenerateRsvpLink(eventId) {
  const data = await apiFetch('/guests/rsvp-link/regenerate', { method: 'POST', body: JSON.stringify({ eventId }) });
  return data.rsvpLink;
}

// ---- Public (unauthenticated, token-based — used by RsvpPage) ----

export async function getRsvpByToken(token) {
  // returns { businessInfo, event }
  return apiFetch(`/rsvp/${encodeURIComponent(token)}`);
}

export async function submitRsvp(token, payload) {
  return apiFetch(`/rsvp/${encodeURIComponent(token)}`, { method: 'POST', body: JSON.stringify(payload) });
}
