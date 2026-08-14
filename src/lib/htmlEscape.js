const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Client-side mirror of server/src/lib/mailer.js's escapeHtml — needed here
// because email bodies composed in the browser (this file's callers) are
// sent to the server as already-built HTML (see routes/emailThreads.js's
// "bodyHtml, not escapeHtml(body)" comment) and never re-escaped there. For
// plain-text values (song titles, set list/event names) interpolated into a
// hardcoded template — never use this on a value that's already meant to be
// HTML (e.g. a rich-text editor body).
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}
