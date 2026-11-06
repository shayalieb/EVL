import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectiveStage, normalizeTags, sanitizeSavedViewFilters } from '../src/lib/clientInsights.js';

test('stage: manual override wins, otherwise derived from work', () => {
  assert.equal(effectiveStage({ stage: 'vip', openWork: false, anyWork: false }), 'vip');
  assert.equal(effectiveStage({ stage: null, openWork: true, anyWork: true }), 'active');
  assert.equal(effectiveStage({ stage: null, openWork: false, anyWork: true }), 'past');
  assert.equal(effectiveStage({ stage: null, openWork: false, anyWork: false }), 'lead');
  assert.equal(effectiveStage({ stage: 'bogus', openWork: false, anyWork: false }), 'lead');
});

test('tags: normalised, de-duplicated and bounded', () => {
  assert.deepEqual(normalizeTags(['  VIP ', 'vip', 'Wedding  Party', '']).tags, ['vip', 'wedding party']);
  assert.ok(normalizeTags('nope').error);
  assert.ok(normalizeTags(['x'.repeat(31)]).error);
  assert.ok(normalizeTags(Array.from({ length: 13 }, (_, i) => `t${i}`)).error);
});

test('saved view filters: only whitelisted, correctly typed keys survive', () => {
  assert.deepEqual(
    sanitizeSavedViewFilters({ stage: 'past', owes: true, noContactDays: 60.7, tag: '', sort: 5, evil: 'x', followUp: false, search: 'a'.repeat(201) }),
    { stage: 'past', owes: true, noContactDays: 60 },
  );
  assert.deepEqual(sanitizeSavedViewFilters({ noContactDays: -3 }), {});
  assert.deepEqual(sanitizeSavedViewFilters(null), {});
});
