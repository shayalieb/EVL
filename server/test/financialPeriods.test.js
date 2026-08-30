import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePermissions } from '../src/lib/membership.js';

test('legacy booking managers retain financial access until customized', () => {
  const permissions = sanitizePermissions({ manageBookings: true });
  assert.equal(permissions.viewFinancials, true);
  assert.equal(permissions.recordFinancialTransactions, true);
  assert.equal(permissions.exportFinancialReports, true);
});

test('explicit financial restrictions override legacy access', () => {
  const permissions = sanitizePermissions({ manageBookings: true, viewFinancials: true, recordFinancialTransactions: false, exportFinancialReports: false });
  assert.equal(permissions.viewFinancials, true);
  assert.equal(permissions.recordFinancialTransactions, false);
  assert.equal(permissions.exportFinancialReports, false);
});
