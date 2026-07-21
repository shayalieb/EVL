import { apiFetch } from '../../context/AuthContext';

export async function sendEmail({ to, subject, body, fromName, replyTo, pdfAttachment }) {
  return apiFetch('/email/send', {
    method: 'POST',
    body: JSON.stringify({ to, subject, body, fromName, replyTo, pdfAttachment }),
  });
}
