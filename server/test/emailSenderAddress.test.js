import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSenderLocalPart } from '../src/lib/emailDomains.js';

test('sender mailbox names are normalized and accept familiar address characters', () => {
  assert.deepEqual(validateSenderLocalPart(' Bookings.Team+NYC '), { valid: true, value: 'bookings.team+nyc' });
});

test('sender mailbox names reject addresses, consecutive dots, and punctuation at the edges', () => {
  assert.equal(validateSenderLocalPart('name@example.com').valid, false);
  assert.equal(validateSenderLocalPart('name..team').valid, false);
  assert.equal(validateSenderLocalPart('.name').valid, false);
  assert.equal(validateSenderLocalPart('name-').valid, false);
});
