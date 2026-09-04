import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickBooksState, encryptedQuickBooksTokens, quickBooksAuthorizationUrl, quickBooksConfigured, verifyQuickBooksState } from '../src/lib/quickBooks.js';
import { decryptSecret, encryptSecret } from '../src/lib/secretBox.js';

const secret = 'a-development-secret-that-is-long-enough';

test('QuickBooks tokens are authenticated and encrypted at rest', () => {
  const encrypted = encryptSecret('refresh-token', secret);
  assert.notEqual(encrypted, 'refresh-token');
  assert.equal(decryptSecret(encrypted, secret), 'refresh-token');
  assert.throws(() => decryptSecret(`${encrypted}tampered`, secret));
});

test('QuickBooks OAuth state is signed, account-scoped, user-scoped, and expiring', () => {
  const state = createQuickBooksState({ accountId: 'account-1', userId: 'user-1', now: 1000 }, secret);
  assert.equal(verifyQuickBooksState(state, { userId: 'user-1', now: 2000 }, secret).accountId, 'account-1');
  assert.throws(() => verifyQuickBooksState(state, { userId: 'user-2', now: 2000 }, secret));
  assert.throws(() => verifyQuickBooksState(`${state}x`, { userId: 'user-1', now: 2000 }, secret));
  assert.throws(() => verifyQuickBooksState(state, { userId: 'user-1', now: 700000 }, secret));
});

test('QuickBooks stays safely unavailable until all credentials exist', () => {
  assert.equal(quickBooksConfigured({}), false);
  assert.equal(quickBooksConfigured({ QUICKBOOKS_CLIENT_ID: 'id', QUICKBOOKS_CLIENT_SECRET: 'secret', QUICKBOOKS_REDIRECT_URI: 'https://api.test/callback', QUICKBOOKS_TOKEN_ENCRYPTION_KEY: secret }), true);
});

test('QuickBooks authorization requests only the accounting scope', () => {
  const url = new URL(quickBooksAuthorizationUrl({ state: 'signed-state' }, { QUICKBOOKS_CLIENT_ID: 'client', QUICKBOOKS_REDIRECT_URI: 'https://api.test/callback' }));
  assert.equal(url.searchParams.get('scope'), 'com.intuit.quickbooks.accounting');
  assert.equal(url.searchParams.get('state'), 'signed-state');
});

test('QuickBooks token expiry values are stored without plaintext tokens', () => {
  const old = process.env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY;
  process.env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY = secret;
  try {
    const stored = encryptedQuickBooksTokens({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, x_refresh_token_expires_in: 7200 }, 1000);
    assert.equal(stored.accessTokenExpiresAt.toISOString(), new Date(3601000).toISOString());
    assert.equal(stored.refreshTokenExpiresAt.toISOString(), new Date(7201000).toISOString());
    assert.ok(!stored.accessTokenEncrypted.includes('access'));
  } finally {
    if (old === undefined) delete process.env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY; else process.env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY = old;
  }
});
