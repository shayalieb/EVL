import assert from 'node:assert/strict';
import test from 'node:test';
import { checkReadiness } from '../src/lib/readiness.js';

test('readiness reports each failed dependency without exposing successes as failures', async () => {
  const result = await checkReadiness({
    database: async () => 'ok',
    redis: async () => { throw new Error('connection refused'); },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [{ dependency: 'redis', ok: false, error: 'connection refused' }]);
  assert.equal(typeof result.durationMs, 'number');
});

test('readiness bounds a dependency that does not settle', async () => {
  const result = await checkReadiness({ database: () => new Promise(() => {}) }, 5);
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].dependency, 'database');
  assert.match(result.failures[0].error, /timed out/);
});
