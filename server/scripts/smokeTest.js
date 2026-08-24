const baseUrl = (process.env.SMOKE_TEST_BASE_URL || '').replace(/\/$/, '');
const expectedRelease = process.env.SMOKE_TEST_EXPECTED_RELEASE;
const timeoutMs = Number(process.env.SMOKE_TEST_TIMEOUT_MS || 5000);

if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
  throw new Error('SMOKE_TEST_BASE_URL must be an absolute API origin.');
}

async function check(path) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) throw new Error(`${path} failed with HTTP ${response.status}.`);
  if (response.headers.get('x-content-type-options') !== 'nosniff') throw new Error(`${path} is missing security headers.`);
  if (expectedRelease && !body.release.startsWith(expectedRelease.slice(0, 12))) {
    throw new Error(`${path} reports release ${body.release}, expected ${expectedRelease.slice(0, 12)}.`);
  }
  return { path, status: response.status, release: body.release, environment: body.environment };
}

const startedAt = Date.now();
const checks = [];
checks.push(await check('/api/health'));
checks.push(await check('/api/ready'));

const missing = await fetch(`${baseUrl}/api/__release_smoke_missing__`, { signal: AbortSignal.timeout(timeoutMs) });
if (missing.status < 400) throw new Error(`Unknown API route returned HTTP ${missing.status}; expected a client error.`);
checks.push({ path: '/api/__release_smoke_missing__', status: missing.status });

console.log(JSON.stringify({ ok: true, durationMs: Date.now() - startedAt, checks }, null, 2));
