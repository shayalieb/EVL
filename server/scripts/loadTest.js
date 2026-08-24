import { performance } from 'node:perf_hooks';

const baseUrl = process.env.LOAD_TEST_BASE_URL || 'http://127.0.0.1:4000';
const email = process.env.LOAD_TEST_EMAIL;
const password = process.env.LOAD_TEST_PASSWORD;
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || 20);
const durationMs = Number(process.env.LOAD_TEST_DURATION_MS || 10_000);
const p95BudgetMs = Number(process.env.LOAD_TEST_P95_BUDGET_MS || 500);
const maxErrorRate = Number(process.env.LOAD_TEST_MAX_ERROR_RATE || 0.01);

if (!email || !password) throw new Error('LOAD_TEST_EMAIL and LOAD_TEST_PASSWORD are required.');
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 200) throw new Error('LOAD_TEST_CONCURRENCY must be between 1 and 200.');

const login = await fetch(`${baseUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) throw new Error(`Load-test login failed with HTTP ${login.status}.`);
const cookies = typeof login.headers.getSetCookie === 'function' ? login.headers.getSetCookie() : [login.headers.get('set-cookie')];
const cookie = cookies.filter(Boolean).map((value) => value.split(';', 1)[0]).join('; ');

const samples = [];
let failures = 0;
const deadline = performance.now() + durationMs;

async function worker(workerId) {
  while (performance.now() < deadline) {
    const startedAt = performance.now();
    try {
      const response = await fetch(`${baseUrl}/api/clients?limit=100`, {
        headers: { cookie, 'x-request-id': `load-${workerId}-${samples.length}` },
      });
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      samples.push(performance.now() - startedAt);
    }
  }
}

const runStartedAt = performance.now();
await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
const elapsedMs = performance.now() - runStartedAt;
samples.sort((a, b) => a - b);
const percentile = (value) => samples[Math.min(samples.length - 1, Math.floor(samples.length * value))] || 0;
const result = {
  requests: samples.length,
  concurrency,
  durationMs: Math.round(elapsedMs),
  requestsPerSecond: Number((samples.length / (elapsedMs / 1000)).toFixed(1)),
  errorRate: Number((failures / Math.max(samples.length, 1)).toFixed(4)),
  latencyMs: {
    p50: Number(percentile(0.50).toFixed(1)),
    p95: Number(percentile(0.95).toFixed(1)),
    p99: Number(percentile(0.99).toFixed(1)),
    max: Number((samples.at(-1) || 0).toFixed(1)),
  },
};

console.log(JSON.stringify(result, null, 2));
if (result.errorRate > maxErrorRate || result.latencyMs.p95 > p95BudgetMs) {
  console.error(`Load-test budget failed (p95 <= ${p95BudgetMs}ms, error rate <= ${maxErrorRate}).`);
  process.exitCode = 1;
}
