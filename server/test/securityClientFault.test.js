import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientFaultResponse } from '../src/lib/clientFault.js';

const named = (name, extra = {}) => Object.assign(new Error(extra.message || name), { name }, extra);

test('security: errors the caller causes become 4xx, and genuine faults stay 500', () => {
  assert.deepEqual(clientFaultResponse(new URIError('URI malformed')), { status: 400, message: 'Bad request.' });
  assert.equal(clientFaultResponse(Object.assign(new Error('Failed to decode param'), { status: 400 })).status, 400);
  assert.equal(clientFaultResponse(named('PrismaClientValidationError')).status, 400);
  assert.equal(clientFaultResponse(named('PrismaClientKnownRequestError', { code: 'P2002' })).status, 409);
  assert.equal(clientFaultResponse(named('PrismaClientKnownRequestError', { code: 'P2025' })).status, 404);
  assert.equal(clientFaultResponse(named('PrismaClientKnownRequestError', { code: 'P2000' })).status, 400);
  assert.equal(clientFaultResponse(named('PrismaClientUnknownRequestError', { message: 'invalid byte sequence for encoding "UTF8": 0x00' })).status, 400);
  assert.equal(clientFaultResponse(named('PrismaClientKnownRequestError', { code: 'P2010', message: 'invalid input syntax for type integer' })).status, 400);
  assert.equal(clientFaultResponse(named('PrismaClientUnknownRequestError', { message: 'ConnectorError { kind: QueryError(PostgresError { code: "22P05", message: "unsupported Unicode escape sequence" }) }' })).status, 400);
  assert.equal(clientFaultResponse(named('PrismaClientUnknownRequestError', { message: 'PostgresError { code: "22003", message: "value out of range" }' })).status, 400);
  // Class 22 only: other SQLSTATEs (connection, deadlock, constraint) are not the caller's doing.
  for (const code of ['08006', '40P01', '53300', '57P01', '23505']) assert.equal(clientFaultResponse(named('PrismaClientUnknownRequestError', { message: `PostgresError { code: "${code}", message: "x" }` })), null, code);
  // Wrong-typed input that reaches a string method is the caller's mistake.
  for (const message of ['name?.trim is not a function', 'body.firstName.trim is not a function', '(intermediate value).toLowerCase is not a function', "Cannot read properties of null (reading 'trim')", "Cannot read properties of undefined (reading 'toLowerCase')", 'req.body.note.split is not a function']) {
    assert.equal(clientFaultResponse(new TypeError(message))?.status, 400, message);
  }
  // Other TypeErrors are bugs in our own code and must keep surfacing as 500s.
  for (const message of ['foo is not a function', 'Cannot read properties of undefined (reading \'map\')', 'Cannot read properties of undefined (reading \'accountId\')', 'x is not iterable', 'Assignment to constant variable.']) {
    assert.equal(clientFaultResponse(new TypeError(message)), null, `${message} was treated as the caller's fault`);
  }
  // Nothing the caller did explains these: they must keep surfacing as server errors.
  for (const fault of [new Error('boom'), new TypeError('x is not a function'), named('PrismaClientInitializationError'), named('PrismaClientKnownRequestError', { code: 'P1001', message: "Can't reach database server" }), named('PrismaClientUnknownRequestError', { message: 'connection reset' }), null, undefined]) {
    assert.equal(clientFaultResponse(fault), null, `${fault?.name} was treated as the caller's fault`);
  }
  // The response never repeats what the caller sent or what the database said.
  assert.doesNotMatch(JSON.stringify(clientFaultResponse(named('PrismaClientValidationError', { message: 'Argument `where` SECRET' }))), /SECRET/);
});
