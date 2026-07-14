# EVL Server

Express + Prisma + PostgreSQL backend. Currently handles authentication only
(signup/login/logout/session/change-password) — all other app data
(contractors/clients/events/etc.) still lives in the frontend's own
localStorage, per the same phased approach used by the sibling GigWorks app.

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

1. Railway dashboard → New Project → Provision PostgreSQL.
2. New Service → Deploy from this GitHub repo → set **Root Directory** to
   `server`.
3. Set env vars on that service: `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   (reference variable), `SESSION_SECRET` (long random string), `NODE_ENV=production`,
   `EXTRA_CLIENT_ORIGINS` (comma-separated deployed frontend origins,
   localhost is always allowed automatically). Leave `PORT` unset.
4. Deploy, then confirm `GET https://<service>.up.railway.app/api/health`
   returns `{"ok":true}`.

Point the frontend's `VITE_API_BASE` at the deployed URL (or
`http://localhost:4000/api` for local dev).
