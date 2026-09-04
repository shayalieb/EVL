import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWhatsAppClickToChatUrl } from '../../src/lib/format.js';

test('builds a WhatsApp universal link for a formatted US contractor number', () => {
  const url = buildWhatsAppClickToChatUrl({
    recipientPhone: '(512) 555-0110',
    contractorName: 'Jamale Hopkins',
    eventName: 'Thomson & Sims Wedding',
    eventDate: '2026-09-12',
  });
  assert.match(url, /^https:\/\/wa\.me\/15125550110\?text=/);
  assert.match(decodeURIComponent(url), /Hi Jamale/);
  assert.match(decodeURIComponent(url), /Thomson & Sims Wedding on September 12, 2026/);
});

test('accepts explicit international numbers and rejects ambiguous invalid numbers', () => {
  assert.match(buildWhatsAppClickToChatUrl({ recipientPhone: '+44 20 7946 0958' }), /^https:\/\/wa\.me\/442079460958/);
  assert.equal(buildWhatsAppClickToChatUrl({ recipientPhone: '555-0110' }), '');
});

test('uses only the explicit contractor recipient and never a generic user phone', () => {
  const url = buildWhatsAppClickToChatUrl({
    recipientPhone: '(212) 555-0198',
    phone: '(646) 555-0100',
    contractorName: 'Contractor Name',
  });
  assert.match(url, /^https:\/\/wa\.me\/12125550198\?text=/);
  assert.doesNotMatch(url, /16465550100/);
});
