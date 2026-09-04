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
   localhost is always allowed automatically), `FRONTEND_URL` (the deployed
   frontend's base URL, used to build password-reset/invite email links),
   `SUPPORT_NOTIFICATION_EMAIL` (where new support messages notify the
   platform admin). Leave `PORT` unset.
4. Deploy, then confirm `GET https://<service>.up.railway.app/api/health`
   returns `{"ok":true}`.

Point the frontend's `VITE_API_BASE` at the deployed URL (or
`http://localhost:4000/api` for local dev).

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
