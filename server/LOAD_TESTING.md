# Load and failure testing

Run against a disposable environment containing a dedicated test account:

```sh
LOAD_TEST_BASE_URL=http://127.0.0.1:4000 \
LOAD_TEST_EMAIL=owner@e2e.test \
LOAD_TEST_PASSWORD=browser-test-password \
LOAD_TEST_CONCURRENCY=20 \
npm run test:load
```

The test repeatedly exercises the authenticated, database-backed client list
endpoint. It fails when p95 latency exceeds 500 ms or more than 1% of requests
fail. Both budgets can be overridden with `LOAD_TEST_P95_BUDGET_MS` and
`LOAD_TEST_MAX_ERROR_RATE`.

Local baseline recorded August 24, 2026:

| Concurrency | Requests/sec | p50 | p95 | p99 | Errors |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 6,125.9 | 3.1 ms | 4.6 ms | 6.1 ms | 0% |
| 100 | 6,928.0 | 14.0 ms | 17.0 ms | 19.2 ms | 0% |

These are development-machine baselines, not promises for production. Repeat
the same scenarios against a staging deployment after changing instance size,
database pool settings, indexes, Redis, or regional placement.

Failure checks for a release:

- Stop PostgreSQL: `/api/ready` must return 503 within two seconds.
- Block Redis: rate-limited requests must fail open promptly, while readiness
  returns 503 and logs the dependency error.
- Block object storage: document finalization must fail without creating a
  database record.
- Send SIGTERM during traffic: the process must stop accepting new requests,
  finish active requests, close Redis/PostgreSQL, and exit within ten seconds.
