import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanContractorDueDates } from '../src/lib/contractorDueDateCleanup.js';

test('contractor due-date cleanup removes only invalid stored dates', () => {
  const valid = { id: 'valid', paymentDueDate: '2026-09-10', paymentStatus: 'unpaid' };
  const missing = { id: 'missing', paymentStatus: 'unpaid' };
  const result = cleanContractorDueDates([
    valid,
    { id: 'bad-year', paymentDueDate: '0002-08-01', paymentStatus: 'unpaid' },
    { id: 'bad-day', paymentDueDate: '2026-02-30', paymentStatus: 'paid' },
    missing,
  ]);

  assert.equal(result.removedCount, 2);
  assert.equal(result.contractorBookings[0], valid);
  assert.equal(result.contractorBookings[1].paymentDueDate, null);
  assert.equal(result.contractorBookings[2].paymentDueDate, null);
  assert.equal(result.contractorBookings[2].paymentStatus, 'paid');
  assert.equal(result.contractorBookings[3], missing);
});

test('contractor due-date cleanup leaves non-array legacy values untouched', () => {
  const value = { legacy: true };
  assert.deepEqual(cleanContractorDueDates(value), { contractorBookings: value, removedCount: 0 });
});
