import { API_BASE, apiFetch } from '../context/AuthContext';

export async function getRunOfShowShare(eventId) {
  return apiFetch(`/run-of-show/${encodeURIComponent(eventId)}/share`);
}

export async function createRunOfShowShare(eventId, expiration) {
  return apiFetch(`/run-of-show/${encodeURIComponent(eventId)}/share`, { method: 'POST', body: JSON.stringify({ expiration }) });
}

export async function revokeRunOfShowShare(eventId) {
  return apiFetch(`/run-of-show/${encodeURIComponent(eventId)}/share`, { method: 'DELETE' });
}

export async function getPublicRunOfShow(token) {
  const response = await fetch(`${API_BASE || '/api'}/public/run-of-show/${encodeURIComponent(token)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not load this run of show.');
  return data;
}
