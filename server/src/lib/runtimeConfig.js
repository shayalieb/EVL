function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateRuntimeConfig(env = process.env) {
  const errors = [];
  if (!env.DATABASE_URL) errors.push('DATABASE_URL is required.');
  if (!env.SESSION_SECRET) errors.push('SESSION_SECRET is required.');

  if (env.NODE_ENV === 'production') {
    if ((env.SESSION_SECRET || '').length < 32) errors.push('SESSION_SECRET must be at least 32 characters in production.');
    if (!isHttpsUrl(env.FRONTEND_URL)) errors.push('FRONTEND_URL must be a valid HTTPS URL in production.');
    if (!(env.EXTRA_CLIENT_ORIGINS || '').trim()) errors.push('EXTRA_CLIENT_ORIGINS must list at least one production frontend origin.');
    if (!(env.REDIS_URL || '').trim()) errors.push('REDIS_URL is required in production for shared rate limiting.');
    if (!isHttpsUrl(env.SUPABASE_URL)) errors.push('SUPABASE_URL must be a valid HTTPS URL in production.');
    if (!(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) errors.push('SUPABASE_SERVICE_ROLE_KEY is required in production.');
  }

  if (errors.length) {
    throw new Error(`Invalid runtime configuration:\n- ${errors.join('\n- ')}`);
  }
}
