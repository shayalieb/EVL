import test from 'node:test';
import assert from 'node:assert/strict';
import { linkAvailability, resolveLinkExpiration } from '../src/lib/linkExpiration.js';

const now = new Date('2026-09-01T12:00:00.000Z');

test('link expiration applies a workflow default when no selection is supplied', () => {
  const result = resolveLinkExpiration(undefined, { defaultPreset: '14_days', now });
  assert.equal(result.error, undefined);
  assert.equal(result.expiresAt.toISOString(), '2026-09-15T12:00:00.000Z');
});

test('link expiration supports explicit presets and no expiration', () => {
  assert.equal(resolveLinkExpiration({ preset: '24_hours' }, { now }).expiresAt.toISOString(), '2026-09-02T12:00:00.000Z');
  assert.equal(resolveLinkExpiration({ preset: 'never' }, { now }).expiresAt, null);
});

test('custom expiration must be a reasonable future date', () => {
  assert.match(resolveLinkExpiration({ preset: 'custom', expiresAt: 'invalid' }, { now }).error, /valid expiration/i);
  assert.match(resolveLinkExpiration({ preset: 'custom', expiresAt: '2026-08-31T12:00:00.000Z' }, { now }).error, /future/i);
  assert.match(resolveLinkExpiration({ preset: 'custom', expiresAt: '2040-01-01T00:00:00.000Z' }, { now }).error, /five years/i);
  assert.equal(resolveLinkExpiration({ preset: 'custom', expiresAt: '2026-10-01T15:30:00.000Z' }, { now }).expiresAt.toISOString(), '2026-10-01T15:30:00.000Z');
});

test('workflows can require expiration even though the shared system supports never', () => {
  assert.match(resolveLinkExpiration({ preset: 'never' }, { now, allowNever: false }).error, /must have/i);
});

test('availability distinguishes active, expired, revoked, and used links', () => {
  assert.equal(linkAvailability({}, now), 'active');
  assert.equal(linkAvailability({ expiresAt: '2026-09-01T11:59:59.000Z' }, now), 'expired');
  assert.equal(linkAvailability({ revokedAt: now }, now), 'revoked');
  assert.equal(linkAvailability({ usedAt: now, singleUse: true }, now), 'used');
  assert.equal(linkAvailability({ usedAt: now, singleUse: false }, now), 'active');
});
