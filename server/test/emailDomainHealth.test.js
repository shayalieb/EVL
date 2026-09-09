import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEmailDomainRecords } from '../src/lib/emailDomainHealth.js';

test('email domain health separates sending from inbound reply routing', () => {
  assert.deepEqual(analyzeEmailDomainRecords([
    { record: 'DKIM', status: 'verified', value: 'key' },
    { record: 'SPF', status: 'verified', value: 'v=spf1 include:amazonses.com' },
    { type: 'MX', status: 'pending', value: 'inbound-smtp.us-east-1.amazonaws.com' },
  ]), { sendingStatus: 'verified', receivingStatus: 'pending' });
});

test('email domain health does not claim reply tracking without an inbound record', () => {
  assert.deepEqual(analyzeEmailDomainRecords([{ record: 'DKIM', status: 'verified', value: 'key' }]), { sendingStatus: 'verified', receivingStatus: 'not_configured' });
});
