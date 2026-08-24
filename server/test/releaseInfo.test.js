import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseInfo } from '../src/lib/releaseInfo.js';

test('release metadata prefers an explicit release SHA and truncates it', () => {
  assert.deepEqual(releaseInfo({ RELEASE_SHA: '1234567890abcdef', NODE_ENV: 'production' }), {
    service: 'evl-api',
    release: '1234567890ab',
    environment: 'production',
  });
});

test('release metadata has safe local defaults', () => {
  assert.equal(releaseInfo({}).release, 'local');
});
