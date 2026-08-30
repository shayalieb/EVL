import test from 'node:test';
import assert from 'node:assert/strict';
import { dollarsToCents } from '../src/lib/financialLedger.js';

test('financial ledger stores currency as exact integer cents', () => {
  assert.equal(dollarsToCents('12.34'), 1234);
  assert.equal(dollarsToCents(0.1 + 0.2), 30);
  assert.equal(dollarsToCents('1,000'), 0);
});

test('invalid ledger amounts normalize safely', () => {
  assert.equal(dollarsToCents(''), 0);
  assert.equal(dollarsToCents('not money'), 0);
});
