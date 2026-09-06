import test from 'node:test';
import assert from 'node:assert/strict';
import { quickBooksEnvironment, quickBooksLaunchReadiness } from '../src/lib/quickBooksLaunchReadiness.js';

const completeCounts = { customer: 1, invoice: 1, payment: 1, vendor: 1, bill: 1, bill_payment: 1 };

test('QuickBooks environment only enters sandbox when explicitly configured', () => {
  assert.equal(quickBooksEnvironment({ QUICKBOOKS_ENVIRONMENT: 'sandbox' }), 'sandbox');
  assert.equal(quickBooksEnvironment({}), 'production');
});

test('launch readiness requires both complete sample workflows and monitoring', () => {
  const now = new Date('2026-09-06T12:00:00Z');
  const connection = { status: 'active', lastHealthCheckAt: now, reconciliationEnabled: true, reconciliationFrequencyHours: 24, lastReconciliationAt: now, lastReconciliationStatus: 'healthy', accountingMappings: { contractorPaymentAccountId: 'bank' } };
  assert.equal(quickBooksLaunchReadiness({ configured: true, connection, setupReady: true, syncedCounts: completeCounts, issueCount: 0, environment: 'sandbox', now }).ready, true);
  assert.equal(quickBooksLaunchReadiness({ configured: true, connection, setupReady: true, syncedCounts: { ...completeCounts, bill_payment: 0 }, issueCount: 0, environment: 'sandbox', now }).ready, false);
  assert.equal(quickBooksLaunchReadiness({ configured: true, connection, setupReady: true, syncedCounts: completeCounts, issueCount: 1, environment: 'sandbox', now }).ready, false);
});
