import { getResendClient } from './resend.js';

export function buildFromHeader(fromName) {
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  return `${(fromName || 'GigWorks').trim()} <${fromEmail}>`;
}

// Throws if RESEND_API_KEY isn't configured — callers catch and respond 503,
// matching the existing lazy-init behavior in resend.js.
export async function sendMail({ from, to, subject, html, replyTo, headers }) {
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
  });
}
