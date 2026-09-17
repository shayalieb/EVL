import test from 'node:test';
import assert from 'node:assert/strict';
import { lineItemTotal } from '../src/routes/invoices.js';

test('package totals include base, flat items, and units above the included quantity', () => {
  const total = lineItemTotal({
    type: 'package', amount: '1200', lineItems: [
      { pricingType: 'perUnit', quantity: 18, includedQuantity: 10, rate: 85, selected: true },
      { pricingType: 'flat', rate: 400, selected: true },
      { pricingType: 'flat', rate: 175, selected: false },
    ],
  });
  assert.equal(total, 2280);
});

test('included package units never create a negative charge', () => {
  assert.equal(lineItemTotal({ type: 'package', amount: 500, lineItems: [{ pricingType: 'perUnit', quantity: 4, includedQuantity: 10, rate: 25 }] }), 500);
});
