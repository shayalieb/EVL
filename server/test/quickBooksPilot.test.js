import test from 'node:test';
import assert from 'node:assert/strict';
import { quickBooksPilotHealth } from '../src/lib/quickBooksPilot.js';

test('pilot health distinguishes rollout and connection states', () => {
  assert.equal(quickBooksPilotHealth({ accessEnabled: false }), 'not_enabled');
  assert.equal(quickBooksPilotHealth({ accessEnabled: true }), 'awaiting_connection');
  assert.equal(quickBooksPilotHealth({ accessEnabled: true, connectionStatus: 'needs_reauthorization' }), 'connection_issue');
});

test('pilot health raises unresolved sync issues above successful history', () => {
  assert.equal(quickBooksPilotHealth({ accessEnabled: true, connectionStatus: 'active', issueCount: 2, lastSuccessfulSyncAt: new Date() }), 'needs_attention');
  assert.equal(quickBooksPilotHealth({ accessEnabled: true, connectionStatus: 'active' }), 'ready');
  assert.equal(quickBooksPilotHealth({ accessEnabled: true, connectionStatus: 'active', lastSuccessfulSyncAt: new Date() }), 'healthy');
});

