# EVL Server

Express + Prisma + PostgreSQL backend. Handles authentication
(signup/login/logout/session/change-password/forgot-password), team
membership, email threads, the shared account data (contractors/clients/
events/bookings/settings) that used to live only in the frontend's
localStorage, and a two-way support inbox between accounts and the
platform admin (`server/src/routes/support.js` + `admin.js`).

## Local dev

```
cp .env.example .env   # then fill in DATABASE_URL and SESSION_SECRET
npm install
npm run prisma:migrate # creates/applies the initial migration
npm run dev
```

No local Postgres install required — point `DATABASE_URL` at a Railway
Postgres instance's public connection string (or any Postgres you have
access to).

## Deploying (Railway)

No deploy config files needed — Railway auto-detects Node via
`package.json` and runs `npm install` → `npm run build` (`prisma generate`)
→ `npm run start` (`prisma migrate deploy && node src/index.js`).

1. Railway dashboard → New Project → Provision PostgreSQL and Redis.
2. New Service → Deploy from this GitHub repo → set **Root Directory** to
   `server`.
3. Set env vars on that service: `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   and `REDIS_URL` = `${{Redis.REDIS_URL}}` (reference variables),
   `SESSION_SECRET` (long random string), `NODE_ENV=production`,
   `EXTRA_CLIENT_ORIGINS` (comma-separated deployed frontend origins,
   localhost is allowed automatically only outside production), `FRONTEND_URL` (the deployed
   frontend's base URL, used to build password-reset/invite email links),
   `SUPPORT_NOTIFICATION_EMAIL` (where new support messages notify the
   platform admin). Leave `PORT` unset.
4. Deploy, then confirm `GET https://<service>.up.railway.app/api/health`
   returns `{"ok":true}`.

Point the frontend's `VITE_API_BASE` at the deployed URL (or
`http://localhost:4000/api` for local dev).

## Venue lookup

Set `GEOAPIFY_API_KEY` on the backend service to enable **Find venue details**
under Venue Name in booking and event forms. The key stays on the server.
Search uses Geoapify Places name search within the selected country, with
amenity geocoding as a fallback; choosing a result retrieves its place details. Users review the match and fill only empty name/address/phone/email
fields. Missing data remains blank. Existing fields and event-specific notes
are preserved. Coverage varies by location; this is not a complete wedding
venue directory. The lookup displays Geoapify and OpenStreetMap attribution.

## Dedicated-number SMS

Gigworks owns the Twilio connection; customers request a number from
**Settings → Messaging** and never need a Twilio account. To activate SMS:

1. Add `API_PUBLIC_URL`, `TWILIO_ACCOUNT_SID`, and `TWILIO_AUTH_TOKEN` to the
   Railway service variables.
2. Complete the customer's carrier registration in the Gigworks Twilio
   account and purchase/assign its dedicated number.
3. Configure that number's incoming-message webhook as
   `https://<api-host>/api/webhooks/twilio/sms/inbound` using HTTP POST.
4. In **Admin → Accounts → account profile → Messaging**, enter the E.164
   number and optional Twilio Number/Messaging Service SIDs, set its monthly
   allowance, and change the status to Active.

Delivery callbacks are added automatically when Gigworks sends a message.
Twilio webhook signatures are required and contractor STOP/START keywords
update the account's consent record automatically.

### Additional venue sources

**Search Google** uses Places API (New) Text Search, only on explicit clicks.
Set `GOOGLE_PLACES_API_KEY` on the API service, restricted to Places API (New).
Set `REDIS_URL` and optionally `GOOGLE_VENUE_DAILY_LIMIT` (default 25 searches
per UTC day, shared across all users and replicas). The budget fails closed
without Redis, counts failed provider requests, and survives API restarts.
Also configure Google Cloud quotas as a second cost safeguard. No key is sent
to the browser. The field mask uses Text Search Pro fields; there is no polling,
autocomplete billing, pagination, or automatic paid fallback.

Google results are country-checked and displayed with Google Maps attribution
and provider credits, with links to Google Maps. They are not copied into
bookings or persisted/cached. Public terms and privacy pages disclose this use.

**Import from venue website** requires no provider key. It reads JSON-LD
published on the supplied HTTPS page; it does not infer missing fields or crawl
the site. Users review the match (including country) and fill only empty fields.
Some websites do not publish this structured information and require manual
entry. Robots exclusions are respected; blocked/unavailable sites are not
bypassed. Imports validate public IPv4 DNS and pin the connection, validate each
redirect, cap response size/time, and do not execute page scripts.

## Shared business inbox

The shared inbox migration adds `InboxThread`, `InboxMessage`, and
`InboxAttachment`. Deploy the migration before running the updated API; the
normal Railway start command applies it automatically. No existing contractor
conversation records are migrated or removed.

Receiving uses the existing signed `/api/webhooks/resend` endpoint and the
`email.received` event. Configure `RESEND_WEBHOOK_SECRET` and a Resend API key
with access to received email bodies and attachments. Accounts receive new mail
on their verified Email Domain; tracked replies can also use the platform's
`RESEND_INBOUND_DOMAIN`. Do not change the customer's existing primary mailbox
MX records when connecting a dedicated GigWorks subdomain.

Only members with booking-management permission can read or reply in Inbox.
New mail creates an unread notification and optionally emails the owner.
Provider webhook retries are deduplicated, unknown shared-domain addresses are
not assigned to accounts, and HTML is sanitized before storage/display.
Attachments are downloaded on demand from the provider; outbound reply files
are saved with the conversation (three files, 5 MB each). Secure sign/pay links
are omitted from stored outbound message bodies.

Verify setup through Settings → Email Domain → Send a test, then reply and
open the returned conversation. The test reports sending-only configurations
without claiming replies are active. Existing Google/Outlook mailboxes are not
synchronized by this feature.
