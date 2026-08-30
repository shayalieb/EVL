import test from 'node:test';
import assert from 'node:assert/strict';
import { agencyAmountCents, normalizeAgencyGroupCount } from '../src/lib/agencyPricing.js';

const tier = { includedGroupCount: 2, monthlyAmountCents: 14900, annualAmountCents: 142800, monthlyAdditionalGroupCents: 3500, annualAdditionalGroupCents: 33600 };

test('Agency pricing includes two groups and adds each extra group', () => {
  assert.equal(agencyAmountCents(tier, 'month', 2), 14900);
  assert.equal(agencyAmountCents(tier, 'month', 5), 25400);
  assert.equal(agencyAmountCents(tier, 'year', 5), 243600);
});

test('Agency group counts are bounded and never below the included amount', () => {
  assert.equal(normalizeAgencyGroupCount(1, 2), 2);
  assert.equal(normalizeAgencyGroupCount(999, 2), 500);
});
