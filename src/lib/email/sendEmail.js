import { apiFetch } from '../../context/AuthContext';

export async function sendEmail({ to, subject, bodyText, fromName, replyTo }) {
  return apiFetch('/email/send', {
    method: 'POST',
    body: JSON.stringify({ to, subject, body: bodyText, fromName, replyTo }),
  });
}
