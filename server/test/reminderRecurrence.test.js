import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRecurringDate } from '../src/lib/reminderRecurrence.js';

test('daily recurrence preserves local time across daylight saving changes', () => {
  const next = nextRecurringDate(new Date('2026-03-07T14:00:00.000Z'), 'daily', 'America/New_York');
  assert.equal(next.toISOString(), '2026-03-08T13:00:00.000Z');
});

test('monthly recurrence clamps to the final day of a shorter month', () => {
  const next = nextRecurringDate(new Date('2026-01-31T14:00:00.000Z'), 'monthly', 'America/New_York');
  assert.equal(next.toISOString(), '2026-02-28T14:00:00.000Z');
});
