import sanitizeHtml from 'sanitize-html';
import { normalizeValidEmail } from './emailAddress.js';

export function mailbox(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const match = String(raw || '').match(/<([^<>]+)>/);
  return normalizeValidEmail(match ? match[1] : raw);
}
export function inboxHtml(value) {
  return sanitizeHtml(String(value || '').slice(0, 500000), {
    allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a', 'ul', 'ol', 'li', 'blockquote', 'div', 'span', 'table', 'tr', 'td', 'th'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['https', 'http', 'mailto'],
  });
}
export function plainEmailHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]).replace(/\n/g, '<br>');
}
export function inboundAddresses(data) {
  // SMTP envelope recipients are authoritative. The visible To header is
  // sender-controlled and may name an unrelated tenant or private alias.
  const envelope = Array.isArray(data.received_for) ? data.received_for : [];
  const values = envelope.length ? envelope : (Array.isArray(data.to) ? data.to : []);
  return [...new Set(values.map(mailbox).filter(Boolean))];
}
export function isInboxAlias(address) { return /^inbox\+[a-z0-9-]+@/i.test(address); }
export function attachmentMetadata(items = []) {
  return (Array.isArray(items) ? items : []).filter((a) => a?.id).slice(0, 50).map((a) => ({
    filename: String(a.filename || 'attachment').slice(0, 255),
    contentType: String(a.content_type || 'application/octet-stream').slice(0, 255),
    size: Math.max(0, Math.min(2147483647, Number(a.size) || 0)),
    providerAttachmentId: String(a.id),
  }));
}

// Keep the readable outbound history without duplicating bearer action URLs
// from contracts, invoices or portal links into a shared database record.
export function outboundHistoryHtml(value) {
  const withoutLinks = sanitizeHtml(String(value || ''), {
    allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'blockquote', 'div', 'span', 'table', 'tr', 'td', 'th'],
    allowedAttributes: {},
  });
  return inboxHtml(withoutLinks.replace(/https?:\/\/[^\s<>]+/gi, '[link in original email]'));
}
