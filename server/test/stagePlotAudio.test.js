import test from 'node:test';
import assert from 'node:assert/strict';
import { stagePlotAudioData } from '../src/lib/stagePlotAudio.js';

test('stage plot audio fields remain optional and normalize empty values', () => {
  assert.deepEqual(stagePlotAudioData({ monitorMix: '', channelFormat: '' }), { monitorMix: null, channelFormat: 'mono' });
});

test('stage plot audio fields are bounded and unknown properties are ignored', () => {
  const result = stagePlotAudioData({ preferredDevice: `  ${'x'.repeat(400)}  `, unsafe: 'nope' });
  assert.equal(result.preferredDevice.length, 300);
  assert.equal('unsafe' in result, false);
});
