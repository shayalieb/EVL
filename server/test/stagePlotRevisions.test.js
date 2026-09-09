import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStagePlotSnapshot, summarizeStagePlotRevision } from '../src/lib/stagePlotRevisions.js';

test('published stage plot snapshots omit internal row identifiers', () => {
  const snapshot = buildStagePlotSnapshot({ name: 'Plot', updatedAt: new Date(), pages: [], channels: [{ id: 'private', stagePlotId: 'private', channelNumber: 1, source: 'Vocal' }], backlineItems: [] });
  assert.equal(snapshot.channels[0].id, undefined);
  assert.equal(snapshot.channels[0].stagePlotId, undefined);
});

test('revision summaries identify changed production sections', () => {
  const previous = { event: null, pages: [], channels: [], backlineItems: [] };
  const next = { event: null, pages: [], channels: [{ channelNumber: 1 }], backlineItems: [] };
  const summary = summarizeStagePlotRevision(next, previous);
  assert.deepEqual(summary.changedSections, ['Production List']);
  assert.equal(summary.countChanges.channels, 1);
});
