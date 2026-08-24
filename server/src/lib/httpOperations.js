import { randomUUID } from 'node:crypto';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,80}$/;

function requestLogSampleRate() {
  const fallback = process.env.NODE_ENV === 'production' ? 0.01 : 1;
  const configured = Number(process.env.REQUEST_LOG_SAMPLE_RATE ?? fallback);
  return Number.isFinite(configured) ? Math.min(1, Math.max(0, configured)) : fallback;
}

export function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

export function requestContext(req, res, next) {
  const supplied = req.get('x-request-id');
  req.requestId = supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  const startedAt = process.hrtime.bigint();
  const path = new URL(req.originalUrl || req.url, 'http://localhost').pathname;

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    // Errors and slow requests are always retained. Routine successes are
    // sampled in production so access logging itself does not become a CPU,
    // network, or log-ingestion bottleneck at high request volume.
    if (res.statusCode < 400 && durationMs < 1000 && Math.random() > requestLogSampleRate()) return;
    // req.path intentionally excludes query strings, which may contain
    // password-reset, portal, contract, and payment tokens.
    console.log(JSON.stringify({
      level: 'info',
      type: 'http_request',
      requestId: req.requestId,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      contentLength: Number(res.getHeader('content-length')) || null,
      userId: req.session?.userId || null,
      accountId: req.membership?.accountId || null,
    }));
  });
  next();
}
