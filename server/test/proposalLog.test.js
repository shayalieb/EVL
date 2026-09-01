import test from 'node:test';
import assert from 'node:assert/strict';
import { mergedProposalLog } from '../../src/lib/proposalLog.js';

test('proposal log collapses the historical booking and server records for one send', () => {
  const bookingLog = [{ id: 'booking', type: 'sent', actorEmail: 'Owner@Example.com', at: '2026-09-01T12:53:40.000Z' }];
  const responseLog = [{ id: 'server', type: 'sent', actorEmail: 'owner@example.com', at: '2026-09-01T12:53:00.000Z' }];
  assert.deepEqual(mergedProposalLog(bookingLog, responseLog).map((entry) => entry.id), ['server']);
});

test('proposal log keeps legitimate repeated sends from the same source', () => {
  const bookingLog = [
    { id: 'one', type: 'sent', actorEmail: 'owner@example.com', at: '2026-09-01T12:53:00.000Z' },
    { id: 'two', type: 'sent', actorEmail: 'owner@example.com', at: '2026-09-01T12:54:00.000Z' },
  ];
  assert.deepEqual(mergedProposalLog(bookingLog, []).map((entry) => entry.id), ['one', 'two']);
});

test('proposal log does not collapse notes or meaningfully different manual sends', () => {
  const bookingLog = [
    { id: 'note', type: 'note', actorEmail: 'owner@example.com', note: 'Called client', at: '2026-09-01T12:53:00.000Z' },
    { id: 'manual', type: 'manual_sent', actorEmail: 'owner@example.com', note: 'Printed copy', at: '2026-09-01T12:53:00.000Z' },
  ];
  const responseLog = [{ id: 'server', type: 'manual_sent', actorEmail: 'owner@example.com', note: 'Text message', at: '2026-09-01T12:53:10.000Z' }];
  assert.deepEqual(mergedProposalLog(bookingLog, responseLog).map((entry) => entry.id), ['note', 'manual', 'server']);
});
