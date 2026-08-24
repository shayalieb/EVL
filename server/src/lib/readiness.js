import { withTimeout } from './withTimeout.js';

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function checkReadiness(checks, timeoutMs = 2000) {
  const startedAt = process.hrtime.bigint();
  const results = await Promise.all(Object.entries(checks).map(async ([dependency, check]) => {
    try {
      await withTimeout(Promise.resolve().then(check), timeoutMs, `${dependency} readiness check`);
      return { dependency, ok: true };
    } catch (error) {
      return { dependency, ok: false, error: errorMessage(error) };
    }
  }));

  return {
    ok: results.every((result) => result.ok),
    durationMs: Number((Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(1)),
    failures: results.filter((result) => !result.ok),
  };
}
