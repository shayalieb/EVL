import { apiFetch, API_BASE } from '../context/AuthContext';
import { uploadToSignedUrl } from './directUpload';

export async function listDocuments(eventId) {
  const data = await apiFetch(`/documents?eventId=${encodeURIComponent(eventId)}`);
  return data.documents;
}

// eventId is optional — omit it (null/undefined) for an account-level
// attachment not tied to any event, e.g. a Set List library song's PDF.
export async function uploadDocument(eventId, file) {
  const upload = await apiFetch('/documents/upload-url', {
    method: 'POST',
    body: JSON.stringify({ filename: file.name, size: file.size, contentType: file.type || 'application/octet-stream' }),
  });
  await uploadToSignedUrl(upload, file);
  const result = await apiFetch('/documents/upload-complete', {
    method: 'POST',
    body: JSON.stringify({ storageKey: upload.storageKey, eventId, filename: file.name, contentType: file.type || 'application/octet-stream', size: file.size }),
  });
  return result.document;
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

// Public/unauthenticated — safe to embed in an emailed Set List, unlike
// documentDownloadUrl above which requires an app session. See
// server/src/routes/eventDocuments.js's publicSongSheetsRouter.
export function songSheetPublicDownloadUrl(shareToken) {
  return `${API_BASE}/public/song-sheets/${shareToken}/download`;
}

// Renders inline (no forced download) — for an <iframe>/<img> preview, not
// a save-to-disk link. See server/src/routes/eventDocuments.js's /preview
// route for why this needs its own endpoint rather than reusing download.
export function documentPreviewUrl(id) {
  return `${API_BASE}/documents/${id}/preview`;
}
