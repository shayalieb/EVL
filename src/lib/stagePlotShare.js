import { API_BASE, apiFetch } from '../context/AuthContext';

export async function getStagePlotShare(eventId) {
  return apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/share`);
}

export async function createStagePlotShare(eventId, expiration) {
  const data = await apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/share`, { method: 'POST', body: JSON.stringify({ expiration }) });
  return data;
}

export async function publishStagePlotRevision(eventId, note) {
  return apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/share/publish`, { method: 'POST', body: JSON.stringify({ note }) });
}

export async function restoreStagePlotRevision(eventId, revisionNumber) {
  return apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/share/revisions/${revisionNumber}/restore`, { method: 'POST' });
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
