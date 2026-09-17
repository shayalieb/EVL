import test from 'node:test';
import assert from 'node:assert/strict';
import { lineItemTotal } from '../src/routes/invoices.js';

test('package totals use only the package price and ignore included or additional option details', () => {
  const total = lineItemTotal({
    type: 'package', amount: '1200', lineItems: [
      { pricingType: 'perUnit', quantity: 18, includedQuantity: 10, rate: 85, selected: true },
      { pricingType: 'flat', rate: 400, selected: true },
      { pricingType: 'flat', rate: 175, selected: false },
      { pricingType: 'flat', rate: 900, selected: true, excludedFromPrice: true },
    ],
  });
  assert.equal(total, 1200);
});

test('included package units never create a negative charge', () => {
  assert.equal(lineItemTotal({ type: 'package', amount: 500, lineItems: [{ pricingType: 'perUnit', quantity: 4, includedQuantity: 10, rate: 25 }] }), 500);
});
