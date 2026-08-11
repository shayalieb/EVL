import sanitizeHtml from 'sanitize-html';

// Reply threads top-post: the contractor's new words sit above the entire
// prior conversation, which their mail client re-quotes automatically. We
// only ever want the new words — both for what gets stored/shown as "their
// reply," and for what gets fed to the AI classifier (the quoted history is
// the account's own outbound message asking about availability; including it
// just gives the classifier a confusing double dose of the same question).
const QUOTE_PREAMBLE_PATTERNS = [
  /^-{2,}\s*Original Message\s*-{2,}\s*$/i,
  /^-{2,}\s*Forwarded message\s*-{2,}\s*$/i,
  /^On\s.{0,200}\swrote:\s*$/i,
];

// Plain-text quote stripping: scan line by line for the first sign of
// quoted content (a '>'-prefixed line, a client-generated preamble, or an
// Outlook-style "From:"/"Sent:" header pair) and cut everything from there.
export function stripQuotedText(text) {
  if (!text) return '';
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let cutIndex = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('>')) { cutIndex = i; break; }
    if (QUOTE_PREAMBLE_PATTERNS.some((re) => re.test(trimmed))) { cutIndex = i; break; }
    if (/^From:\s*.+$/i.test(trimmed) && /^Sent:\s*.+$/i.test((lines[i + 1] || '').trim())) { cutIndex = i; break; }
  }
  return lines.slice(0, cutIndex).join('\n').trim();
}

// HTML quote stripping: drop <blockquote> subtrees and the quote containers
// mail clients tag with well-known classes (Gmail/Yahoo/Outlook), on top of
// whatever tag/attribute allowlist the caller is already applying.
export function stripQuotedHtml(html, sanitizeOptions) {
  if (!html) return '';
  return sanitizeHtml(html, {
    ...sanitizeOptions,
    exclusiveFilter: (frame) => {
      const cls = frame.attribs?.class || '';
      return frame.tag === 'blockquote' || /gmail_quote|yahoo_quoted|outlookmessageheader|gmail_extra/i.test(cls);
    },
  });
}
