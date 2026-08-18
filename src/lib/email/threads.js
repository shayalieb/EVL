import { apiFetch } from '../../context/AuthContext';

export async function getThreadSummaries(eventId) {
  const data = await apiFetch(`/email/threads/summary?eventId=${encodeURIComponent(eventId)}`);
  return data.summaries;
}

// Same shape as getThreadSummaries, but across every event on the account —
// one row per contractor instead of per (event, contractor). See
// ContractorsPage.jsx's Last Contact column.
export async function getRosterSummary() {
  const data = await apiFetch('/email/threads/roster-summary');
  return data.summaries;
}

export async function getThread(eventId, contractorId) {
  const data = await apiFetch(`/email/threads?eventId=${encodeURIComponent(eventId)}&contractorId=${encodeURIComponent(contractorId)}`);
  return data.thread;
}

export async function markThreadRead(threadId) {
  return apiFetch(`/email/threads/${threadId}/read`, { method: 'PATCH' });
}

export async function sendThreadedEmail({ eventId, contractorId, contractorEmail, subject, body, templateId, fromName, documentIds, pdfAttachment, inlineImages }) {
  return apiFetch('/email/threads/send', {
    method: 'POST',
    body: JSON.stringify({ eventId, contractorId, contractorEmail, subject, body, templateId, fromName, documentIds, pdfAttachment, inlineImages }),
  });
}

export async function logManualContact({ eventId, contractorId, contractorEmail, channel, note }) {
  return apiFetch('/email/threads/log', {
    method: 'POST',
    body: JSON.stringify({ eventId, contractorId, contractorEmail, channel, note }),
  });
}
