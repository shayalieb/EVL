import test from 'node:test';
import assert from 'node:assert/strict';
import { quickBooksPilotHealth, updateQuickBooksPilotTestResults } from '../src/lib/quickBooksPilot.js';

test('pilot health distinguishes rollout and connection states', () => {
  assert.equal(quickBooksPilotHealth({ accessEnabled: false }), 'not_enabled');
  assert.equal(quickBooksPilotHealth({ accessEnabled: true }), 'awaiting_connection');
  assert.equal(quickBooksPilotHealth({ accessEnabled: true, connectionStatus: 'needs_reauthorization' }), 'connection_issue');
});

test('pilot test runs remain in progress until every controlled step is recorded', () => {
  const update = updateQuickBooksPilotTestResults({}, 'connection', 'passed', 'Sandbox company connected');
  assert.equal(update.status, 'in_progress');
  assert.equal(update.complete, false);
  assert.equal(update.results.connection.evidence, 'Sandbox company connected');
});

test('pilot test runs fail safely when any completed step failed', () => {
  const steps = ['connection', 'customer_invoice', 'client_payment', 'vendor_bill', 'contractor_payment', 'duplicate_protection', 'reconciliation'];
  let results = {};
  let update;
  for (const step of steps) {
    update = updateQuickBooksPilotTestResults(results, step, step === 'duplicate_protection' ? 'failed' : 'passed');
    results = update.results;
  }
  assert.equal(update.complete, true);
  assert.equal(update.status, 'failed');
});

test('pilot health raises unresolved sync issues above successful history', () => {
  assert.equal(quickBooksPilotHealth({ accessEnabled: true, connectionStatus: 'active', issueCount: 2, lastSuccessfulSyncAt: new Date() }), 'needs_attention');
  assert.equal(quickBooksPilotHealth({ accessEnabled: true, connectionStatus: 'active' }), 'ready');
  assert.equal(quickBooksPilotHealth({ accessEnabled: true, connectionStatus: 'active', lastSuccessfulSyncAt: new Date() }), 'healthy');
});
