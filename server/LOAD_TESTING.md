# Load testing and capacity plan

Run load tests only against a disposable environment with a dedicated account.
The harness refuses non-local targets unless `LOAD_TEST_ALLOW_REMOTE=true` is
explicitly set. The `Staging load test` workflow adds a second `LOAD`
confirmation and reads credentials from the protected `load-test` environment.

```sh
LOAD_TEST_BASE_URL=http://127.0.0.1:4000 \
LOAD_TEST_EMAIL=owner@e2e.test \
LOAD_TEST_PASSWORD=browser-test-password \
LOAD_TEST_PROFILE=mixed \
LOAD_TEST_CONCURRENCY=20 \
npm run test:load
```

Profiles cover `clients`, `bookings`, `events`, `readiness`, or `mixed`. Mixed
uses a 30/30/30/10 split across the three authenticated list routes and
readiness. Every run has a warm-up period, a five-second per-request timeout,
status counts, and overall plus per-route p50/p95/p99 latency. It fails when
p95 exceeds 500 ms or more than 1% of measured requests fail. Override with
`LOAD_TEST_P95_BUDGET_MS`, `LOAD_TEST_MAX_ERROR_RATE`,
`LOAD_TEST_WARMUP_MS`, and `LOAD_TEST_REQUEST_TIMEOUT_MS` when a documented
scenario needs different limits.

## Capacity acceptance profile

The initial production target is 50 simultaneous dashboard requests, at least
25 requests/second sustained for five minutes, p95 below 500 ms, p99 below one
second, and less than 1% errors. Test in steps of 5, 20, 50, and 100 workers;
stop after the first failed step. Record release, instance sizes, region,
database plan, Redis plan, connection-string pool settings, dataset row counts,
throughput, latency, errors, CPU, memory, and database connections. A result
without that environment data is a comparison point, not a capacity claim.

The existing cursor indexes support the measured list routes:

- Client: `(accountId, createdAt, id)`
- Booking/Event: `(accountId, deletedAt, createdAt, id)`

For each API instance, start with PostgreSQL `connection_limit=10` and
`pool_timeout=20`. Keep total possible application connections—instance count
times connection limit—below 70% of the database plan's connection cap so
migrations, support access, and recovery retain headroom.

## Scaling triggers

Scale or investigate before demand exceeds the accepted profile when any of
these persist for ten minutes:

- p95 API latency above 500 ms or error rate above 1%.
- API CPU above 70% or memory above 80%.
- PostgreSQL connection use above 70%, pool timeouts, or sustained slow queries.
- Redis latency above 20 ms or repeated reconnects.

Scale API replicas only after confirming the database connection budget. Scale
PostgreSQL before adding replicas if connection or query pressure is already the
bottleneck. Re-run all four load steps after changing instance size, pool
settings, indexes, Redis, or regional placement.

## Failure checks

- Stop PostgreSQL: `/api/ready` must return 503 within two seconds.
- Block Redis: rate-limited requests must fail open promptly, while readiness
  returns 503 and logs the dependency error.
- Block object storage: document finalization must fail without creating a
  database record.
- Send SIGTERM during traffic: the process must stop accepting new requests,
  finish active requests, close Redis/PostgreSQL, and exit within ten seconds.
