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
    const storageProvider = (env.STORAGE_PROVIDER || 'supabase').trim().toLowerCase();
    const needsSupabase = storageProvider === 'supabase' || env.STORAGE_FALLBACK_SUPABASE === 'true';
    if (!['supabase', 'railway'].includes(storageProvider)) errors.push('STORAGE_PROVIDER must be supabase or railway.');
    if (needsSupabase && !isHttpsUrl(env.SUPABASE_URL)) errors.push('SUPABASE_URL must be a valid HTTPS URL when Supabase storage is enabled.');
    if (needsSupabase && !(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) errors.push('SUPABASE_SERVICE_ROLE_KEY is required when Supabase storage is enabled.');
    if (storageProvider === 'railway') {
      if (!isHttpsUrl(env.AWS_ENDPOINT_URL)) errors.push('AWS_ENDPOINT_URL must be a valid HTTPS URL for Railway storage.');
      for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME']) {
        if (!(env[key] || '').trim()) errors.push(`${key} is required for Railway storage.`);
      }
    }
  }

  if (errors.length) {
    throw new Error(`Invalid runtime configuration:\n- ${errors.join('\n- ')}`);
  }
}
