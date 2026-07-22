import { API_BASE } from '../context/AuthContext';

// Not apiFetch — the browser must set its own multipart boundary
// Content-Type header, which a forced 'application/json' would break.
export async function sendSupportMessage(url, { body, subject, files } = {}) {
  const formData = new FormData();
  if (subject !== undefined) formData.append('subject', subject);
  formData.append('body', body);
  for (const file of files || []) formData.append('files', file);

  const res = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  const responseBody = await res.json().catch(() => null);
  if (!res.ok) throw new Error(responseBody?.error || 'Failed to send message.');
  return responseBody;
}

export function supportAttachmentDownloadUrl(id, { admin } = {}) {
  return admin ? `${API_BASE}/admin/support/attachments/${id}/download` : `${API_BASE}/support/attachments/${id}/download`;
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
