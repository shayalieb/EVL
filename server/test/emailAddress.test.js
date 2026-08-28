import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidEmail, normalizeEmail, normalizeValidEmail } from '../src/lib/emailAddress.js';

test('email addresses are normalized consistently', () => {
  assert.equal(normalizeEmail('  Owner@Example.COM '), 'owner@example.com');
  assert.equal(normalizeValidEmail('  Crew@Example.COM '), 'crew@example.com');
});

test('missing and malformed email addresses are rejected', () => {
  for (const value of [undefined, null, '', 'person', 'person@', '@example.com', 'person @example.com']) {
    assert.equal(isValidEmail(value), false);
    assert.equal(normalizeValidEmail(value), null);
  }
});
