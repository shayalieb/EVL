import { performance } from 'node:perf_hooks';

const baseUrl = (process.env.LOAD_TEST_BASE_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
const email = process.env.LOAD_TEST_EMAIL;
const password = process.env.LOAD_TEST_PASSWORD;
const profile = process.env.LOAD_TEST_PROFILE || 'mixed';
const concurrency = numberSetting('LOAD_TEST_CONCURRENCY', 20, { min: 1, max: 200, integer: true });
const durationMs = numberSetting('LOAD_TEST_DURATION_MS', 10_000, { min: 1_000, max: 300_000, integer: true });
const warmupMs = numberSetting('LOAD_TEST_WARMUP_MS', 2_000, { min: 0, max: 60_000, integer: true });
const requestTimeoutMs = numberSetting('LOAD_TEST_REQUEST_TIMEOUT_MS', 5_000, { min: 250, max: 30_000, integer: true });
const p95BudgetMs = numberSetting('LOAD_TEST_P95_BUDGET_MS', 500, { min: 1, max: 60_000 });
const maxErrorRate = numberSetting('LOAD_TEST_MAX_ERROR_RATE', 0.01, { min: 0, max: 1 });

function numberSetting(name, fallback, { min, max, integer = false }) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} must be ${integer ? 'an integer ' : ''}between ${min} and ${max}.`);
  }
  return value;
}

if (!email || !password) throw new Error('LOAD_TEST_EMAIL and LOAD_TEST_PASSWORD are required.');
const target = new URL(baseUrl);
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(target.hostname);
if (!isLocal && process.env.LOAD_TEST_ALLOW_REMOTE !== 'true') {
  throw new Error('Remote load tests require LOAD_TEST_ALLOW_REMOTE=true. Use only a disposable staging environment.');
}

const profiles = {
  clients: ['/api/clients?limit=100'],
  bookings: ['/api/bookings?limit=100'],
  events: ['/api/events?limit=100'],
  readiness: ['/api/ready'],
  mixed: [
    '/api/clients?limit=100', '/api/clients?limit=100', '/api/clients?limit=100',
    '/api/bookings?limit=100', '/api/bookings?limit=100', '/api/bookings?limit=100',
    '/api/events?limit=100', '/api/events?limit=100', '/api/events?limit=100',
    '/api/ready',
  ],
};
const paths = profiles[profile];
if (!paths) throw new Error(`LOAD_TEST_PROFILE must be one of: ${Object.keys(profiles).join(', ')}.`);

const login = await fetch(`${baseUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
  signal: AbortSignal.timeout(requestTimeoutMs),
});
if (!login.ok) throw new Error(`Load-test login failed with HTTP ${login.status}.`);
const cookies = typeof login.headers.getSetCookie === 'function' ? login.headers.getSetCookie() : [login.headers.get('set-cookie')];
const cookie = cookies.filter(Boolean).map((value) => value.split(';', 1)[0]).join('; ');

let requestSequence = 0;
async function performRequest(workerId, path) {
  const startedAt = performance.now();
  let status = 0;
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { cookie, 'x-request-id': `load-${workerId}-${requestSequence++}` },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    status = response.status;
    await response.arrayBuffer();
  } catch {
    status = 0;
  }
  return { path, status, durationMs: performance.now() - startedAt };
}

async function runWindow(windowMs, collect) {
  const deadline = performance.now() + windowMs;
  const samples = [];
  async function worker(workerId) {
    let pathIndex = workerId;
    while (performance.now() < deadline) {
      const sample = await performRequest(workerId, paths[pathIndex++ % paths.length]);
      if (collect) samples.push(sample);
    }
  }
  const startedAt = performance.now();
  await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
  return { samples, elapsedMs: performance.now() - startedAt };
}

if (warmupMs) await runWindow(warmupMs, false);
const { samples, elapsedMs } = await runWindow(durationMs, true);

function summarize(selected) {
  const latencies = selected.map((sample) => sample.durationMs).sort((a, b) => a - b);
  const failures = selected.filter((sample) => sample.status < 200 || sample.status >= 400).length;
  const percentile = (value) => latencies[Math.max(0, Math.ceil(latencies.length * value) - 1)] || 0;
  return {
    requests: selected.length,
    errorRate: Number((failures / Math.max(selected.length, 1)).toFixed(4)),
    latencyMs: {
      p50: Number(percentile(0.50).toFixed(1)),
      p95: Number(percentile(0.95).toFixed(1)),
      p99: Number(percentile(0.99).toFixed(1)),
      max: Number((latencies.at(-1) || 0).toFixed(1)),
    },
  };
}

const statusCounts = {};
for (const sample of samples) statusCounts[sample.status || 'network_error'] = (statusCounts[sample.status || 'network_error'] || 0) + 1;
const uniquePaths = [...new Set(samples.map((sample) => sample.path))];
const byPath = Object.fromEntries(uniquePaths.map((path) => [path, summarize(samples.filter((sample) => sample.path === path))]));
const result = {
  target: target.origin,
  profile,
  concurrency,
  warmupMs,
  durationMs: Math.round(elapsedMs),
  requestsPerSecond: Number((samples.length / (elapsedMs / 1000)).toFixed(1)),
  ...summarize(samples),
  statusCounts,
  byPath,
};

console.log(JSON.stringify(result, null, 2));
if (result.errorRate > maxErrorRate || result.latencyMs.p95 > p95BudgetMs) {
  console.error(`Load-test budget failed (p95 <= ${p95BudgetMs}ms, error rate <= ${maxErrorRate}).`);
  process.exitCode = 1;
}
