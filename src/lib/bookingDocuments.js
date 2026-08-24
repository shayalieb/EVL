import { apiFetch, API_BASE } from '../context/AuthContext';
import { uploadToSignedUrl } from './directUpload';

export async function listBookingDocuments(bookingId, category) {
  const data = await apiFetch(`/booking-documents?bookingId=${encodeURIComponent(bookingId)}&category=${encodeURIComponent(category)}`);
  return data.documents;
}

export async function uploadBookingDocument(bookingId, category, file) {
  const upload = await apiFetch('/booking-documents/upload-url', {
    method: 'POST',
    body: JSON.stringify({ filename: file.name, size: file.size }),
  });
  await uploadToSignedUrl(upload.signedUrl, file);
  const result = await apiFetch('/booking-documents/upload-complete', {
    method: 'POST',
    body: JSON.stringify({ storageKey: upload.storageKey, bookingId, category, filename: file.name, contentType: file.type || 'application/octet-stream', size: file.size }),
  });
  return result.document;
}

export async function deleteBookingDocument(id) {
  return apiFetch(`/booking-documents/${id}`, { method: 'DELETE' });
}

export function bookingDocumentDownloadUrl(id) {
  return `${API_BASE}/booking-documents/${id}/download`;
}
