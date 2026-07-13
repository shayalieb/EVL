import { ensureFreshToken, forgetToken } from './gisClient';
import { buildRawMessage } from './mime';

async function toGmailError(res) {
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || String(res.status);
  const message = body?.error?.message || res.statusText || 'Failed to send email.';
  return Object.assign(new Error(message), { status: res.status, reason });
}

async function postMessage(token, raw) {
  return fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
}

export async function sendEmail({ to, subject, bodyText }) {
  const raw = buildRawMessage({ to, subject, bodyText });
  let token = await ensureFreshToken({ interactive: false });
  let res = await postMessage(token, raw);

  if (res.status === 401) {
    forgetToken();
    token = await ensureFreshToken({ interactive: false });
    res = await postMessage(token, raw);
  }

  if (!res.ok) throw await toGmailError(res);
  return res.json();
}
