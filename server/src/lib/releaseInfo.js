export function releaseInfo(env = process.env) {
  const commit = env.RELEASE_SHA || env.RAILWAY_GIT_COMMIT_SHA || env.GITHUB_SHA || 'local';
  return {
    service: 'evl-api',
    release: commit.slice(0, 12),
    environment: env.NODE_ENV || 'development',
  };
}
