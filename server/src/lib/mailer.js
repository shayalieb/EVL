import { getResendClient } from './resend.js';
import { getVerifiedEmailDomain } from './emailDomains.js';

export function buildFromHeader(fromName) {
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  return `${(fromName || 'GigWorks').trim()} <${fromEmail}>`;
}

// Account-aware version of buildFromHeader, for the genuinely
// business-branded sends (contracts, invoices, inquiries, reminders,
// contractor threads) — falls back to buildFromHeader's global default
// whenever the account has no verified EmailDomain (see
// server/src/lib/emailDomains.js), so nothing changes for any account that
// hasn't set one up. Platform-level sends (auth, support notifications to
// the platform admin, admin-to-business support replies) intentionally keep
// calling buildFromHeader directly instead — those are GigWorks-the-platform
// talking, not the business's own brand.
export async function resolveFromHeader({ accountId, fromName, localPart }) {
  const domain = accountId ? await getVerifiedEmailDomain(accountId) : null;
  if (!domain) return buildFromHeader(fromName);
  const fromEmail = `${localPart || 'hello'}@${domain.domain}`;
  return `${(fromName || 'GigWorks').trim()} <${fromEmail}>`;
}

// Same account-aware/fallback shape as resolveFromHeader, for the
// reply+<id>@<domain> aliases built in support.js/admin.js/emailThreads.js —
// inbound replies need to land on whichever domain the original message was
// actually sent from, so this has to agree with resolveFromHeader's choice
// for the same account. Returns null (not a placeholder) when neither an
// account domain nor RESEND_INBOUND_DOMAIN is configured, since callers
// already treat a missing alias as "skip it" (no inbound configured yet).
export async function resolveReplyDomain(accountId) {
  const domain = accountId ? await getVerifiedEmailDomain(accountId) : null;
  if (domain) return domain.domain;
  return process.env.RESEND_INBOUND_DOMAIN || null;
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
