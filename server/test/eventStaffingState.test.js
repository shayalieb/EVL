import test from 'node:test';
import assert from 'node:assert/strict';
import { activeContractorBookingCount, normalizeNoOutsideContractorsNeeded } from '../src/lib/eventStaffingState.js';

const statuses = [
  { id: 'confirmed', bucket: 'confirmed' },
  { id: 'tentative', bucket: 'tentative' },
  { id: 'declined', bucket: 'unavailable' },
];

test('active contractor assignments override the no-outside-staffing flag', () => {
  const bookings = [{ contractorId: 'one', inquiryStatusId: 'confirmed' }];
  assert.equal(activeContractorBookingCount(bookings, statuses), 1);
  assert.equal(normalizeNoOutsideContractorsNeeded(true, bookings, statuses), false);
});

test('unavailable contractors do not prevent an internally staffed event', () => {
  const bookings = [{ contractorId: 'one', inquiryStatusId: 'declined' }];
  assert.equal(activeContractorBookingCount(bookings, statuses), 0);
  assert.equal(normalizeNoOutsideContractorsNeeded(true, bookings, statuses), true);
});

test('unknown and legacy statuses are treated as active rather than silently ignored', () => {
  const bookings = [{ contractorId: 'one', inquiryStatusId: 'legacy-status' }];
  assert.equal(activeContractorBookingCount(bookings, statuses), 1);
  assert.equal(normalizeNoOutsideContractorsNeeded(true, bookings, statuses), false);
});

test('an event with no contractor roster can retain the internal-staffing selection', () => {
  assert.equal(normalizeNoOutsideContractorsNeeded(true, [], statuses), true);
  assert.equal(normalizeNoOutsideContractorsNeeded(false, [], statuses), false);
});
