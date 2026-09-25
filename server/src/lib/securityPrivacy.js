// Public token endpoints must not expose bearer credentials to access logs.
export function safeLogPath(value = '') {
  const path = String(value).split(/[?#]/, 1)[0];
  return path
    .replace(/(\/api\/(?:contract-sign|proposal-respond|invoice-pay|inquiry|rsvp|prep-request|contractor-calendar)\/)[^/]+/gi, '$1[redacted]')
    .replace(/(\/api\/public\/(?:stage-plots|run-of-show|song-sheets)\/)[^/]+/gi, '$1[redacted]')
    .replace(/(\/(?:sign|proposal|invoice|inquiry|rsvp|gigs|review|prep-request|portal)\/)[^/]+/gi, '$1[redacted]');
}

export function scrubTelemetryEvent(event) {
  if (event.request) {
    const { method, url } = event.request;
    event.request = { method, url: safeLogPath(url) };
  }
  // Exception messages and breadcrumb payloads can include ORM arguments,
  // email bodies or credentials. Keep error type and stack locations only.
  for (const exception of event.exception?.values || []) exception.value = 'Server error (details redacted)';
  for (const span of event.spans || []) { delete span.data; delete span.description; }
  if (event.transaction) event.transaction = safeLogPath(event.transaction);
  event.breadcrumbs = [];
  delete event.extra;
  delete event.user;
  return event;
}
