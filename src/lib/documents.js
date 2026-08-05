import { apiFetch, API_BASE } from '../context/AuthContext';

export async function listDocuments(eventId) {
  const data = await apiFetch(`/documents?eventId=${encodeURIComponent(eventId)}`);
  return data.documents;
}

// eventId is optional — omit it (null/undefined) for an account-level
// attachment not tied to any event, e.g. a Set List library song's PDF.
export async function uploadDocument(eventId, file) {
  const formData = new FormData();
  if (eventId) formData.append('eventId', eventId);
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

// Duplicates a document (own storage bytes + own DB row) scoped to a new
// eventId — used when pulling a Set List library song's PDF into a real
// gig, so the gig's copy is fully independent of the library original.
export async function copyDocument(id, eventId) {
  const data = await apiFetch(`/documents/${id}/copy`, {
    method: 'POST',
    body: JSON.stringify({ eventId }),
  });
  return data.document;
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
