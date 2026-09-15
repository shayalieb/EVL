import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { createTestAccount } from '../src/lib/testAccount.js';

const input = { firstName: ' Test ', lastName: ' Owner ', email: ' TEST@example.com ', password: 'test-password-123' };

test('test accounts have a usable password, approval, owner membership, and an audit entry', async () => {
  const saved = {};
  const tx = Object.fromEntries(['user', 'account', 'membership', 'accountActivity'].map((model) => [model, {
    create: async ({ data }) => { saved[model] = data; return { id: `${model}-id` }; },
  }]));
  const result = await createTestAccount({ $transaction: (fn) => fn(tx) }, input, 'admin-id', { manageBookings: true });
  assert.deepEqual(result, { id: 'account-id' });
  assert.equal(saved.user.email, 'test@example.com');
  assert.equal(saved.user.firstName, 'Test');
  assert.equal(await bcrypt.compare(input.password, saved.user.passwordHash), true);
  assert.equal(saved.user.isPlatformAdmin, undefined);
  assert.equal(saved.account.signupSource, 'test');
  assert.ok(saved.account.approvedAt instanceof Date);
  assert.equal(saved.account.approvedById, 'admin-id');
  assert.equal(saved.membership.role, 'owner');
  assert.equal(saved.membership.accountId, 'account-id');
  assert.equal(saved.accountActivity.actorUserId, 'admin-id');
  assert.ok(!JSON.stringify(result).includes(input.password));
});

test('invalid details are rejected before creating any records', async () => {
  const db = { $transaction: () => assert.fail('must not create records') };
  for (const change of [{ firstName: '' }, { lastName: 123 }, { email: 'invalid' }, { password: 'short' }, { password: 'a'.repeat(73) }]) {
    await assert.rejects(createTestAccount(db, { ...input, ...change }, 'admin', {}), { status: 400 });
  }
});

test('existing email reports a conflict without modifying the existing user', async () => {
  const db = { $transaction: async () => { throw Object.assign(new Error('duplicate'), { code: 'P2002' }); } };
  await assert.rejects(createTestAccount(db, input, 'admin', {}), { status: 409 });
});
