import test from 'node:test';
import assert from 'node:assert/strict';
import { getStagePlotReadiness } from '../../src/lib/stagePlotReadiness.js';

test('a basic linked stage plot can be ready without advanced audio', () => {
  const result = getStagePlotReadiness({
    pages: [{ scene: { elements: [{ id: 'mic-1' }] } }],
    channels: [{ id: 'ch-1', channelNumber: 1, source: 'Lead vocal', musicianName: 'Ari', elementId: 'mic-1' }],
    backlineItems: [],
  });
  assert.equal(result.ready, true);
  assert.equal(result.requiredCount, 0);
});

test('advanced workflow catches duplicate patches and incomplete details', () => {
  const result = getStagePlotReadiness({
    pages: [{ scene: { elements: [{ id: 'one' }, { id: 'two' }] } }],
    channels: [
      { id: 'a', channelNumber: 1, source: 'Vocal', musicianName: 'A', elementId: 'one', inputType: 'mic', preferredDevice: 'SM58', providedBy: 'venue', stageboxName: 'A', stageboxInput: '1' },
      { id: 'b', channelNumber: 2, source: 'Guitar', musicianName: 'B', elementId: 'two', stageboxName: 'a', stageboxInput: '1' },
    ],
  });
  assert.equal(result.requiredCount, 1);
  assert.ok(result.issues.some((issue) => issue.code === 'duplicate-patch'));
  assert.ok(result.issues.some((issue) => issue.code === 'missing-device'));
});
