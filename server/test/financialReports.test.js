import test from 'node:test';
import assert from 'node:assert/strict';
import { contractorAssignmentCost, inIsoDateRange, receivableAgingBucket } from '../src/lib/financialReports.js';

test('receivables are assigned to stable aging buckets', () => {
  const asOf = new Date('2026-08-30T23:59:59.999Z');
  assert.equal(receivableAgingBucket(null, asOf), 'current');
  assert.equal(receivableAgingBucket(new Date('2026-09-01T00:00:00Z'), asOf), 'current');
  assert.equal(receivableAgingBucket(new Date('2026-08-30T00:00:00Z'), asOf), 'current');
  assert.equal(receivableAgingBucket(new Date('2026-08-15T00:00:00Z'), asOf), 'days1to30');
  assert.equal(receivableAgingBucket(new Date('2026-07-15T00:00:00Z'), asOf), 'days31to60');
  assert.equal(receivableAgingBucket(new Date('2026-05-01T00:00:00Z'), asOf), 'days90plus');
});

test('contractor cost includes overnight overtime', () => {
  const cost = contractorAssignmentCost(
    { pricingTierId: 'standard', startTime: '20:00', endTime: '03:00' },
    { pricingTiers: [{ id: 'standard', price: 500, includedHours: 5, overtimeRate: 100 }] },
  );
  assert.equal(cost, 700);
});

test('ISO event dates respect report boundaries', () => {
  assert.equal(inIsoDateRange('2026-08-15', '2026-08-01', '2026-08-31'), true);
  assert.equal(inIsoDateRange('2026-09-01', '2026-08-01', '2026-08-31'), false);
});
