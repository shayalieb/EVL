import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRuntimeConfig } from '../src/lib/runtimeConfig.js';

test('runtime configuration requires database and session settings', () => {
  assert.throws(() => validateRuntimeConfig({}), /DATABASE_URL is required/);
});

test('production configuration rejects weak or insecure settings', () => {
  assert.throws(() => validateRuntimeConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://database',
    SESSION_SECRET: 'short',
    FRONTEND_URL: 'http://example.com',
  }), /SESSION_SECRET must be at least 32 characters/);
});

test('production configuration requires shared rate-limit storage', () => {
  assert.throws(() => validateRuntimeConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://database',
    SESSION_SECRET: 'a'.repeat(32),
    FRONTEND_URL: 'https://app.example.com',
    EXTRA_CLIENT_ORIGINS: 'https://app.example.com',
  }), /REDIS_URL is required/);
});

test('valid production configuration passes', () => {
  assert.doesNotThrow(() => validateRuntimeConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://database',
    SESSION_SECRET: 'a'.repeat(32),
    FRONTEND_URL: 'https://app.example.com',
    EXTRA_CLIENT_ORIGINS: 'https://app.example.com',
    REDIS_URL: 'redis://redis.internal:6379',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  }));
});
