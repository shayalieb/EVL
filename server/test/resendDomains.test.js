import test from 'node:test';
import assert from 'node:assert/strict';
import { createResendDomain, enableResendDomainReceiving } from '../src/lib/resendDomains.js';
import { getDnsRecordPurpose } from '../../src/lib/emailDomainDns.js';

// Exercise the real installed SDK serialization, without making API calls.
test('domain creation and receiving setup preserve capabilities in the HTTP request', async () => {
  process.env.RESEND_API_KEY ||= 're_test_domains';
  const originalFetch = globalThis.fetch;
  const calls = [];
  const records = [{ type: 'MX', name: 'mail.example.com', value: 'inbound-smtp.us-east-1.amazonaws.com', status: 'pending' }];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body && JSON.parse(options.body) });
    return new Response(JSON.stringify({ id: 'domain-test', status: 'pending', records }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    assert.deepEqual(await createResendDomain('mail.example.com'), { resendDomainId: 'domain-test', dnsRecords: records });
    await enableResendDomainReceiving('domain-test');
    assert.deepEqual(calls[0].body, { name: 'mail.example.com', capabilities: { sending: 'enabled', receiving: 'enabled' } });
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[1].method, 'PATCH');
    assert.deepEqual(calls[1].body.capabilities, { sending: 'enabled', receiving: 'enabled' });
    assert.equal(calls[2].method, 'GET');
  } finally { globalThis.fetch = originalFetch; }
});

test('DNS instructions distinguish Inbox receiving from delivery-report MX records', () => {
  assert.equal(getDnsRecordPurpose({ type: 'MX', value: 'inbound-smtp.us-east-1.amazonaws.com' }).title, 'Inbox receiving');
  assert.equal(getDnsRecordPurpose({ type: 'MX', value: 'feedback-smtp.us-east-1.amazonses.com' }).title, 'Return-path routing');
});
