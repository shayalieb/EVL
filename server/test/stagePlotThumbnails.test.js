import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeStagePlotThumbnail } from '../src/lib/stagePlotThumbnails.js';

test('stage plot thumbnail decoder accepts bounded PNG data URLs', () => {
  const buffer = decodeStagePlotThumbnail(`data:image/png;base64,${Buffer.from('png').toString('base64')}`);
  assert.equal(buffer.toString(), 'png');
});

test('stage plot thumbnail decoder rejects wrong formats and oversized payloads', () => {
  assert.throws(() => decodeStagePlotThumbnail('data:image/jpeg;base64,abc'), /must be a PNG/);
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
  assert.throws(() => decodeStagePlotThumbnail(`data:image/png;base64,${oversized}`), /too large/);
});
