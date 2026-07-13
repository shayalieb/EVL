function isAscii(text) {
  return new TextEncoder().encode(text).length === text.length;
}

function base64UrlEncodeUtf8(str) {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  utf8Bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeMimeHeader(text) {
  if (isAscii(text)) return text;
  const utf8Bytes = new TextEncoder().encode(text);
  const binary = String.fromCharCode(...utf8Bytes);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

// Builds a base64url-encoded RFC 2822 message for the Gmail API's `raw`
// field. `From` is intentionally omitted — Gmail always fills it in with
// the authenticated account and errors on a mismatched explicit value.
export function buildRawMessage({ to, subject, bodyText }) {
  const headers = [
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
  ];
  const message = `${headers.join('\r\n')}\r\n\r\n${bodyText}`;
  return base64UrlEncodeUtf8(message);
}
