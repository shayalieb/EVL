import { getResendClient } from './resend.js';

export function buildFromHeader(fromName) {
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  return `${(fromName || 'GigWorks').trim()} <${fromEmail}>`;
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// For plain-text values (names, subjects, notes) interpolated into a
// hardcoded `html:` template below — never use this on a value that's
// already meant to be HTML (e.g. a rich-text template body).
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// Throws if RESEND_API_KEY isn't configured — callers catch and respond 503,
// matching the existing lazy-init behavior in resend.js.
export async function sendMail({ from, to, subject, html, replyTo, headers, attachments }) {
  const resend = getResendClient();
  // NOTE: the SDK's own field is `replyTo` (camelCase) — it maps this to the
  // API's `reply_to` internally. Passing `reply_to` here is silently dropped.
  return resend.emails.send({
    from,
    to,
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
    ...(headers ? { headers } : {}),
    ...(attachments?.length ? { attachments } : {}),
  });
}
