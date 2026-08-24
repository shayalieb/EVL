import assert from 'node:assert/strict';
import test from 'node:test';
import { requestContext, securityHeaders } from '../src/lib/httpOperations.js';

function fakeResponse() {
  const headers = new Map();
  const listeners = new Map();
  return {
    statusCode: 200,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    on(event, callback) { listeners.set(event, callback); },
    headers,
    listeners,
  };
}

test('security headers prevent framing and content sniffing', () => {
  const res = fakeResponse();
  let advanced = false;
  securityHeaders({}, res, () => { advanced = true; });
  assert.equal(res.getHeader('x-frame-options'), 'DENY');
  assert.equal(res.getHeader('x-content-type-options'), 'nosniff');
  assert.equal(advanced, true);
});

test('request context rejects unsafe supplied IDs', () => {
  const req = { get: () => 'bad\nvalue', method: 'GET', url: '/api/health' };
  const res = fakeResponse();
  requestContext(req, res, () => {});
  assert.notEqual(req.requestId, 'bad\nvalue');
  assert.equal(res.getHeader('x-request-id'), req.requestId);
});

test('production request sampling keeps errors and can omit routine successes', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRate = process.env.REQUEST_LOG_SAMPLE_RATE;
  const previousLog = console.log;
  const logs = [];
  process.env.NODE_ENV = 'production';
  process.env.REQUEST_LOG_SAMPLE_RATE = '0';
  console.log = (value) => logs.push(value);
  try {
    const success = fakeResponse();
    requestContext({ get: () => null, method: 'GET', url: '/api/health' }, success, () => {});
    success.listeners.get('finish')();
    assert.equal(logs.length, 0);

    const failure = fakeResponse();
    failure.statusCode = 503;
    requestContext({ get: () => null, method: 'GET', url: '/api/ready' }, failure, () => {});
    failure.listeners.get('finish')();
    assert.equal(JSON.parse(logs[0]).status, 503);
  } finally {
    console.log = previousLog;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousRate === undefined) delete process.env.REQUEST_LOG_SAMPLE_RATE; else process.env.REQUEST_LOG_SAMPLE_RATE = previousRate;
  }
});
