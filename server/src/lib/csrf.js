import { randomBytes } from 'node:crypto';

const COOKIE_NAME = 'csrf_token';
const HEADER_NAME = 'x-csrf-token';

function baseCsrfCookieOptions() {
  return {
    // Must be readable by frontend JS (echoed back as a request header),
    // unlike the session cookie — this is what makes the double-submit
    // check work: a cross-site request can ride the session cookie in
    // automatically, but can't read this one to forge a matching header.
    httpOnly: false,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

// Mounted globally (see index.js) so every response carries a token before
// any upload happens, not just responses following a fresh login.
export function ensureCsrfCookie(req, res, next) {
  if (!readCookie(req, COOKIE_NAME)) {
    res.cookie(COOKIE_NAME, randomBytes(32).toString('hex'), baseCsrfCookieOptions());
  }
  next();
}

// Double-submit check for the app's multipart/form-data upload routes —
// the one class of state-changing request the app's implicit CSRF defense
// (strict CORS origin allowlist + requiring a non-"simple" JSON
// Content-Type, which forces a preflight the allowlist blocks) doesn't
// cover. multipart/form-data is itself a CORS-"simple" content type, so it
// skips preflight — a plain cross-site <form> POST would otherwise ride the
// session cookie in under SameSite=None. A forged cross-site request can't
// read this cookie's value (browsers never expose another origin's cookies
// to JS), so it can never supply a header that matches it.
export function requireCsrfHeader(req, res, next) {
  const cookieToken = readCookie(req, COOKIE_NAME);
  const headerToken = req.headers[HEADER_NAME];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Missing or invalid CSRF token. Refresh the page and try again.' });
  }
  next();
}
