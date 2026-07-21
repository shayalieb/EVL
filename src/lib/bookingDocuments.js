import { apiFetch, API_BASE } from '../context/AuthContext';

export async function listBookingDocuments(bookingId, category) {
  const data = await apiFetch(`/booking-documents?bookingId=${encodeURIComponent(bookingId)}&category=${encodeURIComponent(category)}`);
  return data.documents;
}

export async function uploadBookingDocument(bookingId, category, file) {
  const formData = new FormData();
  formData.append('bookingId', bookingId);
  formData.append('category', category);
  formData.append('file', file);
  // Not apiFetch — the browser must set its own multipart boundary
  // Content-Type header, which a forced 'application/json' would break.
  const res = await fetch(`${API_BASE}/booking-documents`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || 'Failed to upload document.');
  return body.document;
}

export async function deleteBookingDocument(id) {
  return apiFetch(`/booking-documents/${id}`, { method: 'DELETE' });
}

export function bookingDocumentDownloadUrl(id) {
  return `${API_BASE}/booking-documents/${id}/download`;
}
