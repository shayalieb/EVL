import assert from 'node:assert/strict';
import test from 'node:test';
import { closeRedis, pingRedis } from '../src/lib/rateLimiter.js';

test('Redis failure is bounded and a later request can retry', async () => {
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
  const startedAt = Date.now();
  await assert.rejects(pingRedis());
  assert.ok(Date.now() - startedAt < 3000, 'Redis failure should not hang a request');

  await assert.rejects(pingRedis());
  await closeRedis();
  delete process.env.REDIS_URL;
});
