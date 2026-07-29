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

// Matches the frontend's DEFAULT_ACCENT_COLOR (src/lib/colorTheme.js) — kept
// as its own constant here since server code doesn't share modules with the
// client bundle.
const DEFAULT_ACCENT_COLOR = '#6366f1';

// Shared branded shell for every emailed action link (contract sign, invoice
// pay, inquiry link) — the business's own logo (same businessInfo.logo data
// URL used throughout the app's documents) instead of a generic header, a
// real button instead of a raw pasted URL, and a small "Powered by
// GigWorks" footer. Table-free but still deliberately simple/inline-styled
// throughout (no flexbox/grid) since email clients — Outlook especially —
// render a much smaller CSS subset than a browser.
//
// `bodyHtml` is trusted, pre-built HTML (callers already escapeHtml() any
// interpolated user text before handing it in, same as before this helper
// existed) — this function only supplies the shell around it.
export function buildActionEmailHtml({ businessInfo, heading, bodyHtml, buttonText, buttonUrl, footnote }) {
  const accent = businessInfo?.accentColor || DEFAULT_ACCENT_COLOR;
  const name = businessInfo?.name || 'GigWorks';
  const logoBlock = businessInfo?.logo
    ? `<img src="${businessInfo.logo}" alt="${escapeHtml(name)}" style="max-height:48px;max-width:220px;display:block;margin:0 auto 16px;" />`
    : `<div style="font-size:20px;font-weight:700;color:#1e293b;text-align:center;margin-bottom:16px;">${escapeHtml(name)}</div>`;

  return `
<div style="background-color:#f8fafc;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
    ${logoBlock}
    ${heading ? `<h1 style="font-size:18px;font-weight:700;color:#1e293b;margin:0 0 12px;text-align:center;">${escapeHtml(heading)}</h1>` : ''}
    <div style="font-size:14px;line-height:1.6;color:#475569;">${bodyHtml}</div>
    ${buttonUrl ? `
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${buttonUrl}" style="display:inline-block;background-color:${accent};color:#ffffff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">${escapeHtml(buttonText || 'Click here')}</a>
    </div>` : ''}
    ${footnote ? `<p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:20px;">${footnote}</p>` : ''}
  </div>
  <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:20px;">Powered by GigWorks</p>
</div>`;
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
