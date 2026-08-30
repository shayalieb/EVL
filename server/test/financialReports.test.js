import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingProfitabilitySnapshot, contractorAssignmentCost, contractorPaymentTiming, inIsoDateRange, receivableAgingBucket } from '../src/lib/financialReports.js';

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

test('profitability stays incomplete when a contractor rate is missing', () => {
  const result = bookingProfitabilitySnapshot({
    billed: 8000,
    event: { otherExpenses: [], noOutsideContractorsNeeded: false },
    assignments: [{ contractorId: 'contractor-without-rate' }],
    contractorById: new Map([['contractor-without-rate', { pricingTiers: [] }]]),
  });
  assert.equal(result.costsComplete, false);
  assert.equal(result.missingCostCount, 1);
  assert.equal(result.estimatedProfit, null);
  assert.equal(result.margin, null);
});

test('profitability is available when contractor costs are complete', () => {
  const result = bookingProfitabilitySnapshot({
    billed: 8000,
    event: { otherExpenses: [{ amount: 500 }], noOutsideContractorsNeeded: false },
    assignments: [{ contractorId: 'contractor', pricingTierId: 'standard' }],
    contractorById: new Map([['contractor', { pricingTiers: [{ id: 'standard', price: 1500 }] }]]),
  });
  assert.equal(result.costsComplete, true);
  assert.equal(result.estimatedCosts, 2000);
  assert.equal(result.estimatedProfit, 6000);
  assert.equal(result.margin, 75);
});

test('contractor payment timing distinguishes missing, due, overdue, and upcoming dates', () => {
  assert.equal(contractorPaymentTiming(null, '2026-08-30').status, 'missing');
  assert.equal(contractorPaymentTiming('2026-08-30', '2026-08-30').status, 'due');
  assert.deepEqual(contractorPaymentTiming('2026-08-28', '2026-08-30'), { status: 'overdue', label: '2 days overdue', overdueDays: 2 });
  assert.equal(contractorPaymentTiming('2026-09-01', '2026-08-30').status, 'upcoming');
});

test('ISO event dates respect report boundaries', () => {
  assert.equal(inIsoDateRange('2026-08-15', '2026-08-01', '2026-08-31'), true);
  assert.equal(inIsoDateRange('2026-09-01', '2026-08-01', '2026-08-31'), false);
});
