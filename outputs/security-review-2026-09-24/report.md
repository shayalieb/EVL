# GigWorks application security review — September 24, 2026

## Result and scope

The local application security checks pass. The review found and fixed weaknesses in database access protections, settings authorization, private-link logging, email routing, and dependencies. Changes are in the working tree; they are not deployed. This is application-level verification, not a guarantee that the live service or every possible attack is secure.

Tests used an isolated PostgreSQL database, synthetic accounts, mocked email-provider calls, and local browser servers. No production customer data was used, and no test emails were sent to customers.

## Validation

| Check | Result |
| --- | --- |
| Backend unit suite | 191 passed |
| Database/API integration suite | 25 passed |
| Full Chromium browser suite | 12 passed, 1 pre-existing stage-plot save failure |
| Final focused inbox and malicious-email browser checks | 2 passed after final privacy changes |
| Frontend dependency audit, including development dependencies | 0 reported vulnerabilities |
| Backend dependency audit, including development dependencies | 0 reported vulnerabilities |
| Lint, production frontend build, bundle budget | Passed |
| Targeted scan for common committed credential/private-key patterns | No matches in tracked source; not an exhaustive secret-history scan |

The stage-plot browser failure is an existing storage/save error: the page does not reach “Saved.” The same failure was reproduced against unchanged HEAD in a separate temporary checkout before this security pass. It remains unresolved and prevents claiming that the entire browser suite is green.

## Findings addressed

| Finding | Risk and correction |
| --- | --- |
| Incomplete database row-level security | Added a migration enabling RLS on all 77 application model tables. A low-privilege test role, even with table grants, cannot read protected records, delete them, or insert rows. Exposure would depend on production database grants and access paths; this review did not establish that production data was publicly exposed. |
| Template editors could change unrelated settings | Restricted template-only access to template fields. Attempts to change business details, notification settings, and recipients are rejected. |
| Private links could appear in diagnostics | Redacted bearer-token URL paths and query strings in central request/error logs; scrubbed request data, exception messages, breadcrumbs, users, and span payloads from server/browser monitoring. |
| Email routing trusted visible recipients too broadly | Prefer the provider's delivery envelope when supplied, including on the fetched message. Legacy support/contractor replies now require the complete stored reply address, including its domain. |
| Spoofed sender could trigger contractor status changes | Automatic classification now requires a matching sender and a provider-reported DMARC pass. Missing authentication evidence leaves the reply available for manual handling without automatically changing status. |
| Dependency advisories | Updated backend body-parser/qs and frontend build dependencies nanoid/postcss. Both complete dependency audits report zero known advisories at review time. |
| Additional privacy/access hardening | Added no-store API responses, restricted production localhost CORS trust, checked inbox ownership before processing attachments, and added frontend no-referrer/nosniff headers. |

## Security behavior exercised

- Anonymous access to private APIs; limited members; disabled accounts.
- Cross-account list isolation and access to inbox conversations, attachments, message-read updates, and linked records.
- Attempts to assign account ownership or reply aliases through inbox updates.
- Direct database reads/writes with a deliberately untrusted role.
- CSRF rejection for missing/forged tokens and multipart attachment size/count limits.
- Signed webhook verification, provider retry handling, duplicate deliveries, and forged visible recipient headers.
- Session rotation, concurrent password-reset consumption, contract-signature replay, and duplicate invoice-payment webhooks.
- HTML payloads containing scripts, event handlers, SVG, frames, forms, unsafe URLs, and tracking images. The real browser rendering test passed.
- Existing unit coverage for SSRF protections, sanitization, public tokens, permissions, reminder claiming, and related security-sensitive helpers.

## Deployment and remaining verification

1. Deploy the application and apply the pending migrations for these protections to affect production. The inbox migration must precede the security migration. The trusted backend connection must own the tables or have the intended RLS bypass; no public policies were added.
2. Confirm live database network exposure, database roles/grants, storage bucket permissions, encryption at rest, backups and restore procedures, secrets access, and provider account permissions. These were outside this local test run.
3. Verify real inbound-provider envelope/authentication fields in staging. If no delivery envelope is supplied, routing falls back to the provider's recipient list; DMARC-dependent automatic contractor updates fail closed when evidence is missing.
4. Attachments remain untrusted files. These checks validate authorization and upload limits; they do not provide malware scanning.
5. Existing hosted logs and error reports were not retroactively scrubbed. Review retention and access if historical sensitive-link exposure is a concern.

Testing used local Node 24; the backend declares Node 22 for production. A production-version CI/staging run remains useful before deployment.

## Repeatable checks

Backend: `npm test`, `npm run test:security`, and `npm run test:integration` (or `npm run test:security:integration`). Integration tests require a disposable database and truncate test tables; never point them at production.

Frontend: `npm run lint`, `npm run build`, `npm run check:bundle`, and `npm run test:e2e`. Browser setup also requires a disposable database. Run `npm audit` in both the repository root and server directory.

Local run logs: `/tmp/evl-security-unit-final.log`, `/tmp/evl-security-integration-final.log`, `/tmp/evl-security-e2e-final.log`, `/tmp/evl-security-browser-focused.log`, and `/tmp/evl-security-build.log`.
