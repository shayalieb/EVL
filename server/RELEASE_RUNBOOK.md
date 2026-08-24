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

The scheduled `Production health monitor` workflow verifies liveness,
PostgreSQL/Redis readiness, security headers, and unknown-route handling every
15 minutes. Configure GitHub Actions failure notifications for the on-call
address; this monitor supplements Railway/Sentry alerts and is not a substitute
for the two-minute readiness page above.

## Incident response

1. Assign an incident lead and record the UTC start time, affected workflows,
   environment, and current release from `/api/health`.
2. Preserve evidence before changing anything: request IDs, the first and most
   recent errors, Railway deploy/runtime logs, Sentry event links, and database
   or Redis health indicators. Never paste session cookies, tokens, or request
   bodies into the incident record.
3. Stabilize service. For a bad release, follow Rollback below. For a dependency
   outage, stop nonessential background work or writes before attempting data
   recovery. Communicate user impact and the next update time.
4. Verify recovery with `/api/health`, `/api/ready`, the smoke workflow, and one
   authenticated critical workflow. Continue monitoring for at least 30 minutes.
5. Within two business days, document the timeline, root cause, detection gap,
   customer impact, and follow-up work with an owner and due date.

## Quarterly backup restore drill

1. Record the source database, latest successful backup timestamp, retention
   window, drill owner, and start time. Use a disposable destination database;
   never restore over production.
2. Restore the chosen backup or point-in-time snapshot. Record completion time
   and calculate recovery time and recovered-data age.
3. Apply pending migrations only if the restored snapshot predates them, then
   verify representative row counts for accounts, users, bookings, events,
   invoices, and sessions. Investigate unexpected differences before continuing.
4. Point a disposable API service at the restored database and verify readiness,
   sign-in, client/booking/event reads, and one reversible create/update/delete
   workflow. Do not connect live email, Stripe, or webhook credentials.
5. Delete the disposable service/database after evidence is saved. Record pass
   or fail, measured recovery time, data-loss window, issues, owners, and due
   dates. A drill is not complete until failed checks have tracked follow-ups.

## Rollback

1. Stop the frontend rollout first if it requires the new API.
2. Redeploy the previous known-good API artifact; do not reverse a database
   migration unless a tested down-migration exists.
3. Re-run the smoke workflow with the previous release SHA.
4. If data was corrupted, isolate writes before restoring. Restore into a new
   database first, verify row counts and critical workflows, then switch the
   connection string during a controlled maintenance window.
5. Record impact, timeline, release SHAs, recovery actions, and follow-up work.
