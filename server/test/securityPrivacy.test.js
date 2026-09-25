import test from 'node:test';
import assert from 'node:assert/strict';
import { safeLogPath, scrubTelemetryEvent } from '../src/lib/securityPrivacy.js';
import { scrubTelemetryEvent as scrubBrowserEvent } from '../../src/lib/securityPrivacy.js';
import { inboundAddresses, inboxHtml, outboundHistoryHtml } from '../src/lib/inboxContent.js';

test('security: bearer URLs and query strings are excluded from logs', () => {
  for (const path of ['contract-sign', 'proposal-respond', 'invoice-pay', 'inquiry', 'rsvp', 'prep-request', 'contractor-calendar', 'public/stage-plots', 'public/run-of-show', 'public/song-sheets']) {
    const result = safeLogPath(`/api/${path}/secret-token/action?password=secret-password`);
    assert.equal(result.includes('secret-token'), false, path);
    assert.equal(result.includes('secret-password'), false, path);
  }
  assert.equal(safeLogPath('/api/bookings/id?search=email@example.com'), '/api/bookings/id');
});

test('security: error monitoring omits sensitive request data, ORM arguments and breadcrumbs', () => {
  const result = scrubTelemetryEvent({ request: { method: 'POST', url: '/api/contract-sign/secret-url?token=secret-query', headers: { authorization: 'secret-header' }, cookies: 'secret-cookie', data: { password: 'secret-password' } }, exception: { values: [{ type: 'PrismaError', value: 'secret-query-values' }] }, breadcrumbs: [{ message: 'secret-body' }], user: { email: 'secret-email' }, extra: { token: 'secret-token' }, spans: [{ description: 'secret-sql', data: { result: 'secret-record' } }] });
  assert.equal(JSON.stringify(result).includes('secret-'), false);
  assert.equal(result.exception.values[0].type, 'PrismaError');
});

test('security: visible recipients cannot override authenticated SMTP envelope routing', () => {
  assert.deepEqual(inboundAddresses({ received_for: ['hello@attacker.test'], to: ['inbox+victim@victim.test'] }), ['hello@attacker.test']);
});

test('security: hostile email markup cannot execute, track readers or retain outbound action tokens', () => {
  const payloads = [
    '<svg onload=alert(1)><script>bad()</script></svg>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="data:text/html;base64,QQ==">x</a>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<form action="https://evil.test"><input name=password></form>',
    '<div style="background:url(https://tracker.test)">hello</div>',
    '<math><mtext><img src=x onerror=alert(1)></mtext></math>',
  ];
  for (const payload of payloads) assert.doesNotMatch(inboxHtml(payload), /<script|<img|<svg|<iframe|<form|onload|onerror|javascript:|data:|style=/i);
  const body = outboundHistoryHtml('<a href="https://app.test/sign/secret-token">Sign contract</a><p>https://app.test/invoice/secret-pay</p>');
  assert.doesNotMatch(body, /secret-/);
  assert.match(body, /Sign contract/);
});

test('security: browser monitoring removes public link tokens and message data', () => {
  const event = scrubBrowserEvent({ request: { url: 'https://app.test/portal/secret-link?token=secret-query', headers: { cookie: 'secret-cookie' } }, transaction: '/invoice/secret-invoice', breadcrumbs: [{ message: 'secret-email' }], exception: { values: [{ value: 'secret-body', type: 'Error' }] }, extra: { message: 'secret-client' }, user: { email: 'secret-email' } });
  assert.equal(JSON.stringify(event).includes('secret-'), false);
});
