import test from 'node:test';
import assert from 'node:assert/strict';
import { financialMonth } from '../src/lib/financialPeriods.js';
import { sanitizePermissions } from '../src/lib/membership.js';

test('financial month keys are stable UTC accounting periods', () => {
  assert.equal(financialMonth(new Date('2026-08-31T23:59:59.999Z')), '2026-08');
  assert.equal(financialMonth('not-a-date'), null);
});

test('legacy booking managers retain financial access until customized', () => {
  const permissions = sanitizePermissions({ manageBookings: true });
  assert.equal(permissions.viewFinancials, true);
  assert.equal(permissions.recordFinancialTransactions, true);
  assert.equal(permissions.manageFinancialBudgets, true);
  assert.equal(permissions.exportFinancialReports, true);
});

test('explicit financial restrictions override legacy access', () => {
  const permissions = sanitizePermissions({ manageBookings: true, viewFinancials: true, recordFinancialTransactions: false, manageFinancialBudgets: false, exportFinancialReports: false });
  assert.equal(permissions.viewFinancials, true);
  assert.equal(permissions.recordFinancialTransactions, false);
  assert.equal(permissions.manageFinancialBudgets, false);
  assert.equal(permissions.exportFinancialReports, false);
});
