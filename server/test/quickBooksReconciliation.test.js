import test from 'node:test';
import assert from 'node:assert/strict';
import { quickBooksReconciliationDue } from '../src/lib/quickBooksReconciliation.js';

test('QuickBooks reconciliation runs when enabled and overdue', () => {
  const now = new Date('2026-09-06T12:00:00Z');
  assert.equal(quickBooksReconciliationDue({ status: 'active', reconciliationEnabled: true, reconciliationFrequencyHours: 24, lastReconciliationAt: new Date('2026-09-05T11:59:00Z') }, now), true);
  assert.equal(quickBooksReconciliationDue({ status: 'active', reconciliationEnabled: true, reconciliationFrequencyHours: 24, lastReconciliationAt: new Date('2026-09-06T11:00:00Z') }, now), false);
});

test('QuickBooks reconciliation stays off unless explicitly enabled', () => {
  assert.equal(quickBooksReconciliationDue({ status: 'active', reconciliationEnabled: false }), false);
  assert.equal(quickBooksReconciliationDue({ status: 'disconnected', reconciliationEnabled: true }), false);
});
