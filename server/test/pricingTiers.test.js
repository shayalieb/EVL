import test from 'node:test';
import assert from 'node:assert/strict';
import { getBookingTotal, getTierPrice } from '../../src/lib/pricingTiers.js';

test('legacy string tier prices remain numeric in booking totals', () => {
  const contractor = { pricingTiers: [{ id: 'standard', price: '3500', includedHours: '4', overtimeRate: '500' }] };
  const booking = { pricingTierId: 'standard', startTime: '18:00', endTime: '23:00' };
  assert.equal(getTierPrice(contractor, 'standard'), 3500);
  assert.equal(getBookingTotal(booking, contractor), 4000);
});
