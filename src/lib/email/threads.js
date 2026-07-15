import { apiFetch } from '../../context/AuthContext';

export async function getThreadSummaries(eventId) {
  const data = await apiFetch(`/email/threads/summary?eventId=${encodeURIComponent(eventId)}`);
  return data.summaries;
}

export async function getThread(eventId, contractorId) {
  const data = await apiFetch(`/email/threads?eventId=${encodeURIComponent(eventId)}&contractorId=${encodeURIComponent(contractorId)}`);
  return data.thread;
}

export async function markThreadRead(threadId) {
  return apiFetch(`/email/threads/${threadId}/read`, { method: 'PATCH' });
}

export async function sendThreadedEmail({ eventId, contractorId, contractorEmail, subject, body, templateId, fromName }) {
  return apiFetch('/email/threads/send', {
    method: 'POST',
    body: JSON.stringify({ eventId, contractorId, contractorEmail, subject, body, templateId, fromName }),
  });
}
