import assert from 'node:assert/strict';
import test from 'node:test';
import { withTimeout } from '../src/lib/withTimeout.js';

test('withTimeout returns a result that settles before the deadline', async () => {
  assert.equal(await withTimeout(Promise.resolve('ready'), 100, 'test'), 'ready');
});

test('withTimeout rejects work that exceeds the deadline', async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 1, 'database check'),
    /database check timed out after 1ms/,
  );
});
