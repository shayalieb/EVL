import assert from 'node:assert/strict';
import test from 'node:test';
import { requireEmailSendPermission } from '../src/lib/emailSendPolicy.js';

function responseRecorder() {
  return {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test('email sending rejects members without booking permission', () => {
  const req = { membership: { role: 'member', permissions: { manageBookings: false } } };
  const res = responseRecorder();
  let advanced = false;

  requireEmailSendPermission(req, res, () => { advanced = true; });

  assert.equal(advanced, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.payload, { error: 'Not authorized.' });
});

test('email sending allows members with booking permission', () => {
  const req = { membership: { role: 'member', permissions: { manageBookings: true } } };
  const res = responseRecorder();
  let advanced = false;

  requireEmailSendPermission(req, res, () => { advanced = true; });

  assert.equal(advanced, true);
  assert.equal(res.statusCode, null);
});
