import assert from 'node:assert/strict';
import test from 'node:test';
import { establishSession, regenerateSession } from '../src/lib/sessionAuth.js';

test('regenerateSession resolves after the session ID is rotated', async () => {
  let called = false;
  const req = { session: { regenerate(callback) { called = true; callback(); } } };

  await regenerateSession(req);

  assert.equal(called, true);
});

test('regenerateSession rejects store errors', async () => {
  const expected = new Error('session store unavailable');
  const req = { session: { regenerate(callback) { callback(expected); } } };

  await assert.rejects(regenerateSession(req), expected);
});

test('establishSession adds identity only after rotating the session', async () => {
  const order = [];
  const session = {
    regenerate(callback) {
      order.push('regenerate');
      callback();
    },
  };
  const req = { session };

  await establishSession(req, { userId: 'user-1' });
  order.push(req.session.userId);

  assert.deepEqual(order, ['regenerate', 'user-1']);
});
