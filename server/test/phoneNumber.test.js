import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeE164, displayPhone } from '../src/lib/phoneNumber.js';

test('normalizes North American local numbers to E.164', () => {
  assert.equal(normalizeE164('(212) 555-0100'), '+12125550100');
  assert.equal(normalizeE164('+44 20 7946 0958'), '+442079460958');
  assert.equal(normalizeE164('not a phone'), null);
});

test('formats North American E.164 numbers for display', () => {
  assert.equal(displayPhone('+12125550100'), '(212) 555-0100');
  assert.equal(displayPhone('+442079460958'), '+442079460958');
});
