import assert from 'node:assert/strict';
import test from 'node:test';
import { mapWithConcurrency } from '../src/lib/concurrency.js';

test('mapWithConcurrency preserves order and caps active work', async () => {
  let active = 0;
  let peak = 0;
  const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return value * 2;
  });

  assert.equal(peak, 2);
  assert.deepEqual(results.map((result) => result.value), [2, 4, 6, 8, 10]);
});

test('mapWithConcurrency captures failures and continues the batch', async () => {
  const results = await mapWithConcurrency([1, 2, 3], 2, async (value) => {
    if (value === 2) throw new Error('failed');
    return value;
  });

  assert.equal(results[1].status, 'rejected');
  assert.equal(results[2].status, 'fulfilled');
});
