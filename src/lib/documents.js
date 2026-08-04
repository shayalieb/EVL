import { apiFetch, API_BASE } from '../context/AuthContext';

export async function listDocuments(eventId) {
  const data = await apiFetch(`/documents?eventId=${encodeURIComponent(eventId)}`);
  return data.documents;
}

export async function uploadDocument(eventId, file) {
  const formData = new FormData();
  formData.append('eventId', eventId);
  formData.append('file', file);
  // Not apiFetch — the browser must set its own multipart boundary
  // Content-Type header, which a forced 'application/json' would break.
  const res = await fetch(`${API_BASE}/documents`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || 'Failed to upload document.');
  return body.document;
}

export async function deleteDocument(id) {
  return apiFetch(`/documents/${id}`, { method: 'DELETE' });
}

export function documentDownloadUrl(id) {
  return `${API_BASE}/documents/${id}/download`;
}

// Renders inline (no forced download) — for an <iframe>/<img> preview, not
// a save-to-disk link. See server/src/routes/eventDocuments.js's /preview
// route for why this needs its own endpoint rather than reusing download.
export function documentPreviewUrl(id) {
  return `${API_BASE}/documents/${id}/preview`;
}
