import { getResendClient } from './resend.js';
import { getVerifiedEmailDomain } from './emailDomains.js';

export function buildFromHeader(fromName) {
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  return `${(fromName || 'GigWorks').trim()} <${fromEmail}>`;
}

function platformDomain() {
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  return fromEmail.split('@')[1];
}

// Best-effort per-account local-part on the shared platform domain, so two
// businesses without their own EmailDomain (see server/src/lib/emailDomains.js)
// don't all send from the exact same address. Cosmetic only — nothing is
// keyed on this being unique, so two businesses landing on the same slug is
// harmless, not an error. Returns null (triggering the plain buildFromHeader
// fallback) if the name doesn't yield anything usable.
function slugifyLocalPart(name) {
  const slug = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/, '');
  return slug || null;
}

// Account-aware version of buildFromHeader, for the genuinely
// business-branded sends (contracts, invoices, inquiries, reminders,
// contractor threads). Three tiers: an account's own verified EmailDomain if
// it has one; otherwise a slug of its display name under the shared platform
// domain (e.g. "acme-events@gigworks.io" instead of the same address for
// everyone); otherwise buildFromHeader's plain global default. Platform-level
// sends (auth, support notifications to the platform admin, admin-to-business
// support replies) intentionally keep calling buildFromHeader directly
// instead — those are GigWorks-the-platform talking, not the business's own
// brand, so they always get the plain default regardless of account.
export async function resolveFromHeader({ accountId, fromName, localPart }) {
  const domain = accountId ? await getVerifiedEmailDomain(accountId) : null;
  if (domain) {
    const fromEmail = `${localPart || 'hello'}@${domain.domain}`;
    return `${(fromName || 'GigWorks').trim()} <${fromEmail}>`;
  }
  // Only when RESEND_FROM_EMAIL is actually configured — the resend.dev
  // sandbox fallback doesn't accept arbitrary local-parts, so leave that
  // path exactly as buildFromHeader already handles it.
  const slug = accountId && process.env.RESEND_FROM_EMAIL ? slugifyLocalPart(fromName) : null;
  if (slug) return `${fromName.trim()} <${slug}@${platformDomain()}>`;
  return buildFromHeader(fromName);
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
// `maxWidth` defaults to 480 — right for this shell's original use (a short
// heading, a couple lines of body text, a button) but too narrow for the
// richer bodyHtml the threaded-email routes (server/src/routes/
// emailThreads.js) hand this same shell: a Stage Plot page image or a
// multi-column table, which just get uncomfortably squeezed (an image can
// visibly overflow/clip in email clients — Outlook especially — that don't
// reliably honor an <img>'s own max-width:100% inside a narrow container)
// at 480px. Those callers pass a wider value instead of duplicating this
// whole shell just to change one number.
//
// Converts base64 Data URLs (data:image/...) into inline CID attachments
// (cid:business-logo) so major email clients (Gmail, Outlook, Yahoo) display
// the logo crisp and clear instead of blocking inline base64 data URLs.
export function buildActionEmailHtml({ businessInfo, heading, bodyHtml, buttonText, buttonUrl, footnote, maxWidth = 480 }) {
  const accent = businessInfo?.accentColor || DEFAULT_ACCENT_COLOR;
  const name = businessInfo?.name || 'GigWorks';
  const attachments = [];
  let logoSrc = businessInfo?.logo || '';

  if (logoSrc.startsWith('data:image/')) {
    const match = logoSrc.match(/^data:(image\/[a-zA-Z0-9+-]+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1];
      const ext = mimeType.split('/')[1] || 'png';
      const base64Data = match[2];
      attachments.push({
        filename: `logo.${ext}`,
        content: Buffer.from(base64Data, 'base64'),
        inlineContentId: 'business-logo',
      });
      logoSrc = 'cid:business-logo';
    }
  }

  const logoBlock = logoSrc
    ? `<img src="${logoSrc}" alt="${escapeHtml(name)}" style="max-height:48px;max-width:220px;display:block;margin:0 auto 16px;" />`
    : `<div style="font-size:20px;font-weight:700;color:#1e293b;text-align:center;margin-bottom:16px;">${escapeHtml(name)}</div>`;

  const htmlString = `
<div style="background-color:#f8fafc;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:${maxWidth}px;margin:0 auto;background-color:#ffffff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
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

  // Return a String instance with attached inline attachments so existing callers
  // using html: buildActionEmailHtml(...) work transparently.
  const result = new String(htmlString);
  result.attachments = attachments;
  return result;
}

// Turns client-supplied { contentId, filename, base64 } entries (e.g. a
// stage plot page thumbnail) into Resend inline attachments — the sending
// route's HTML can then reference `cid:<contentId>` directly, same
// inlineContentId mechanism buildActionEmailHtml uses for the business
// logo above, just for images the client provides rather than one baked
// into the template.
export function buildInlineImageAttachments(inlineImages) {
  if (!Array.isArray(inlineImages)) return [];
  return inlineImages
    .filter((img) => img?.base64 && img?.contentId)
    .map((img) => ({
      content: img.base64,
      filename: img.filename || `${img.contentId}.png`,
      contentType: img.contentType || 'image/png',
      inlineContentId: img.contentId,
    }));
}

// Throws if RESEND_API_KEY isn't configured — callers catch and respond 503,
// matching the existing lazy-init behavior in resend.js.
export async function sendMail({ from, to, subject, html, replyTo, headers, attachments }) {
  const resend = getResendClient();
  const finalHtml = typeof html === 'object' && html !== null ? html.toString() : html;
  const embeddedAttachments = (typeof html === 'object' && html !== null && Array.isArray(html.attachments)) ? html.attachments : [];
  const finalAttachments = [...(attachments || []), ...embeddedAttachments];

  return resend.emails.send({
    from,
    to,
    subject,
    html: finalHtml,
    ...(replyTo ? { replyTo } : {}),
    ...(headers ? { headers } : {}),
    ...(finalAttachments.length ? { attachments: finalAttachments } : {}),
  });
}
