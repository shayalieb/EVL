# Release runbook

## Before deployment

1. Confirm CI is green: lint, unit tests, PostgreSQL integration tests,
   browser workflows, and production build.
2. Confirm the target has `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`,
   `FRONTEND_URL`, `EXTRA_CLIENT_ORIGINS`, `SUPABASE_URL`, and
   `SUPABASE_SERVICE_ROLE_KEY` configured. Production startup rejects a
   release missing these values.
3. Confirm PostgreSQL automated backups and point-in-time recovery are
   enabled. Record the latest successful backup time and perform a restore
   drill in a disposable database at least quarterly.
4. Review pending Prisma migrations. Migrations must be backward-compatible
   with the currently running application because rolling deployments can
   briefly run both versions.

## Deploy and verify

1. Deploy the API before the frontend when the API change is backward-compatible.
2. Run the `Staging smoke test` GitHub workflow with the staging API origin
   and expected commit SHA.
3. Check `/api/health` and `/api/ready`. Both must return 200 and the expected
   12-character release identifier.
4. Complete one authenticated browser smoke test: sign in, open clients,
   create/edit a disposable booking, and upload/download/delete a small test
   document. This validates PostgreSQL, Redis-backed middleware, sessions,
   Supabase Storage, CORS, and cookies together.
5. Deploy the frontend, then repeat sign-in and the document smoke test through
   the public frontend origin.

## Alert policy

- Page: readiness fails for two consecutive minutes.
- Page: 5xx responses exceed 2% for five minutes.
- Warn: p95 API latency exceeds 750 ms for ten minutes.
- Warn: PostgreSQL pool wait time or connection utilization exceeds 80%.
- Warn: Redis or object-storage errors occur more than five times in five minutes.
- Warn: no successful PostgreSQL backup within 24 hours.

All alerts should include environment, release identifier, request ID when
available, and a link to logs/traces.

## Rollback

1. Stop the frontend rollout first if it requires the new API.
2. Redeploy the previous known-good API artifact; do not reverse a database
   migration unless a tested down-migration exists.
3. Re-run the smoke workflow with the previous release SHA.
4. If data was corrupted, isolate writes before restoring. Restore into a new
   database first, verify row counts and critical workflows, then switch the
   connection string during a controlled maintenance window.
5. Record impact, timeline, release SHAs, recovery actions, and follow-up work.
