import assert from 'node:assert/strict';
import test from 'node:test';
import { withSerializableTransaction } from '../src/lib/serializableTransaction.js';

test('serializable transaction retries write conflicts', async () => {
  let attempts = 0;
  const database = {
    async $transaction(work, options) {
      attempts += 1;
      assert.equal(options.isolationLevel, 'Serializable');
      if (attempts === 1) throw Object.assign(new Error('conflict'), { code: 'P2034' });
      return work('transaction-client');
    },
  };
  assert.equal(await withSerializableTransaction(database, async (tx) => tx), 'transaction-client');
  assert.equal(attempts, 2);
});

test('serializable transaction does not retry unrelated errors', async () => {
  let attempts = 0;
  const database = { async $transaction() { attempts += 1; throw new Error('broken'); } };
  await assert.rejects(() => withSerializableTransaction(database, async () => {}), /broken/);
  assert.equal(attempts, 1);
});
