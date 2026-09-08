import { API_BASE, apiFetch } from '../context/AuthContext';

export async function getStagePlotShare(eventId) {
  const data = await apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/share`);
  return data.share;
}

export async function createStagePlotShare(eventId, expiration) {
  const data = await apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/share`, { method: 'POST', body: JSON.stringify({ expiration }) });
  return data.share;
}

export async function revokeStagePlotShare(eventId) {
  return apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/share`, { method: 'DELETE' });
}

export async function getPublicStagePlot(token) {
  const response = await fetch(`${API_BASE || '/api'}/public/stage-plots/${encodeURIComponent(token)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not load this stage plot.');
  return data;
}
