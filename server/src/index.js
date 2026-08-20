import 'dotenv/config';
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import { prisma } from './lib/prisma.js';
import { withTouchThrottle } from './lib/touchThrottledStore.js';
import authRouter from './routes/auth.js';
import teamRouter from './routes/team.js';
import accountDataRouter from './routes/accountData.js';
import emailRouter from './routes/email.js';
import emailThreadsRouter from './routes/emailThreads.js';
import emailWebhooksRouter from './routes/emailWebhooks.js';
import eventDocumentsRouter, { publicSongSheetsRouter } from './routes/eventDocuments.js';
import bookingDocumentsRouter from './routes/bookingDocuments.js';
import contractsRouter, { publicContractsRouter } from './routes/contracts.js';
import proposalResponsesRouter, { publicProposalResponsesRouter } from './routes/proposalResponses.js';
import billingRouter from './routes/billing.js';
import invoicesRouter, { publicInvoicesRouter } from './routes/invoices.js';
import inquiryLinksRouter, { publicInquiryLinksRouter } from './routes/inquiryLinks.js';
import stripeWebhooksRouter from './routes/stripeWebhooks.js';
import calendarRouter from './routes/calendar.js';
import supportRouter from './routes/support.js';
import { publicLandingRouter } from './routes/landing.js';
import adminRouter from './routes/admin.js';
import remindersRouter from './routes/reminders.js';
import emailDomainsRouter from './routes/emailDomains.js';
import stagePlotsRouter from './routes/stagePlots.js';
import floorPlansRouter from './routes/floorPlans.js';
import guestsRouter, { publicRsvpRouter } from './routes/guests.js';
import contractorsRouter from './routes/contractors.js';
import { publicContractorCalendarRouter } from './routes/contractorCalendar.js';
import clientsRouter from './routes/clients.js';
import bookingsRouter from './routes/bookings.js';
import eventsRouter from './routes/events.js';
import portalRouter from './routes/portal.js';
import { startReminderScheduler } from './lib/reminderScheduler.js';
import { startReminderRuleEngine } from './lib/reminderRuleEngine.js';
import { startDeletedRecordPurger } from './lib/deletedRecordPurger.js';
import { startInquiryLinkPurger } from './lib/inquiryLinkPurger.js';
import { ensureCsrfCookie, requireCsrfHeader } from './lib/csrf.js';

// No-ops safely with no DSN set — nothing breaks in dev/test environments
// or before SENTRY_DSN is added to Railway's env vars, this just silently
// doesn't report anything until it's configured.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  // Light performance sampling — this is a small internal-tools API, not a
  // high-traffic service, so no need to sample down further than this.
  tracesSampleRate: 0.1,
});

const app = express();
app.set('trust proxy', 1);

const extraOrigins = (process.env.EXTRA_CLIENT_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

class CorsOriginError extends Error {
  constructor() {
    super('Not allowed by CORS');
    this.status = 403;
  }
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (isLocalhost || extraOrigins.includes(origin)) return callback(null, true);
    callback(new CorsOriginError());
  },
  credentials: true,
}));
// Mounted before express.json() — Svix/Stripe signature verification needs
// the exact raw request bytes, not a parsed/re-serialized body. Each raw()
// call only applies to the app.use() it's passed to, so it's repeated per
// webhook router rather than shared.
app.use('/api/webhooks', express.raw({ type: '*/*' }), emailWebhooksRouter);
app.use('/api/webhooks', express.raw({ type: '*/*' }), stripeWebhooksRouter);

// Also mounted ahead of the global express.json() below, same reasoning —
// once a body-parsing middleware has consumed the request and set req.body,
// body-parser's json() no-ops rather than re-parsing, so the global 100kb
// limit never applies to these two paths. Sending an email carries a full
// PDF (and, since the Stage Plot composer, page thumbnail PNGs) as base64
// in the JSON body — routinely well past 100kb — while every other route
// keeps the smaller default, including accountData.js's own blob-size
// warning, which deliberately assumes that limit for its own math.
app.use('/api/email/threads', express.json({ limit: '20mb' }));
app.use('/api/email', express.json({ limit: '20mb' }));

app.use(express.json());

// Deliberately a *separate* PrismaSessionStore instance per session()
// middleware below (see portalSession), not one shared instance — both end
// up persisting to the same underlying Session table (schema.prisma) either
// way, but sharing one JS store instance between two differently-configured
// session() middlewares was observed to leak config between them: the
// business session's cookie ended up with the portal session's `path`
// applied to it. Two independent store instances avoids that entirely,
// whatever the exact mechanism.
function newSessionStore() {
  return withTouchThrottle(new PrismaSessionStore(prisma, { checkPeriodMs: 2 * 60 * 1000, dbRecordIdIsSessionId: true }));
}

// Also a fresh cookie-options object per session() call, same reasoning —
// don't give express-session's Cookie constructor two configs to potentially
// cross-mutate.
function baseSessionCookie() {
  return {
    httpOnly: true,
    // Frontend and backend are always on different origins, so the session
    // cookie needs SameSite=None to survive cross-site fetch() calls — which
    // in turn requires Secure, hence gating both on NODE_ENV.
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

app.use(session({
  store: newSessionStore(),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: baseSessionCookie(),
}));

// Separate cookie (distinct name + path) for the client-portal login (see
// routes/portal.js) — critical, not cosmetic: without this, a client
// logging into the portal in one browser tab would silently log the
// business owner out of their own dashboard in another tab of the same
// browser, since both would otherwise share one `connect.sid` cookie/
// session document. Scoping cookie.path to /api/portal means the browser
// only ever sends this cookie on portal requests, keeping the two
// completely separate regardless of tab/session ordering. Mounted only on
// the portal router below, so no other route is affected by it.
const portalSession = session({
  name: 'portal.sid',
  store: newSessionStore(),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { ...baseSessionCookie(), path: '/api/portal' },
});

// Global — every response carries a CSRF cookie, so it's already in place
// by the time a multipart upload route needs to check it (see lib/csrf.js).
app.use(ensureCsrfCookie);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/team', teamRouter);
app.use('/api/account-data', accountDataRouter);
app.use('/api/email/threads', emailThreadsRouter);
app.use('/api/email', emailRouter);
app.use('/api/documents', eventDocumentsRouter);
// Public/unauthenticated — a band member clicks this from an emailed Set
// List, not while logged into the app. See routes/eventDocuments.js.
app.use('/api/public/song-sheets', publicSongSheetsRouter);
app.use('/api/booking-documents', bookingDocumentsRouter);
app.use('/api/contracts', contractsRouter);
// Public/unauthenticated — recipients click this link from an email, not
// while logged into the app (same reasoning as calendar.js below).
app.use('/api/contract-sign', publicContractsRouter);
app.use('/api/proposal-responses', proposalResponsesRouter);
// Public/unauthenticated — same reasoning as /api/contract-sign above.
app.use('/api/proposal-respond', publicProposalResponsesRouter);
app.use('/api/billing', billingRouter);
app.use('/api/invoices', invoicesRouter);
// Public/unauthenticated — same reasoning as /api/contract-sign above.
app.use('/api/invoice-pay', publicInvoicesRouter);
app.use('/api/inquiry-links', inquiryLinksRouter);
// Public/unauthenticated — same reasoning as /api/contract-sign above.
app.use('/api/inquiry', publicInquiryLinksRouter);
app.use('/api/support', supportRouter);
// Public/unauthenticated — submissions from the marketing site, from
// someone who doesn't have an account yet. See routes/landing.js.
app.use('/api/landing', publicLandingRouter);
app.use('/api/admin', adminRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/email-domains', emailDomainsRouter);
app.use('/api/stage-plots', stagePlotsRouter);
app.use('/api/floor-plans', floorPlansRouter);
app.use('/api/guests', guestsRouter);
app.use('/api/contractors', contractorsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/events', eventsRouter);
// Client-facing self-service portal — public/token-login, own session
// scope (portalSession above), see routes/portal.js.
app.use('/api/portal', portalSession, portalRouter);
// Public/unauthenticated — same reasoning as /api/contract-sign above.
app.use('/api/rsvp', publicRsvpRouter);
// Public/unauthenticated — a contractor opens this from a bookmarked/
// home-screen link, not while logged into the app. See routes/
// contractorCalendar.js.
app.use('/api/contractor-calendar', publicContractorCalendarRouter);
// Public/unauthenticated — recipients click this link from an email, not
// while logged into the app, and it's fully stateless (see calendar.js).
app.use('/api/calendar', calendarRouter);

// Reports to Sentry (a no-op if SENTRY_DSN isn't set) and forwards to the
// catch-all below, which is unchanged — it still decides the actual HTTP
// response, Sentry just gets a copy for reporting first.
Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof CorsOriginError) {
    return res.status(err.status).json({ error: 'Not allowed by CORS.' });
  }
  // body-parser (oversized body, malformed JSON, unsupported charset, etc.)
  // throws via the `http-errors` package, which sets `expose: true` on 4xx
  // errors it considers safe to surface verbatim — forward those as their
  // real status instead of flattening every error to a 500, so a client
  // mistake reports as a client error (e.g. 413) rather than looking like a
  // server bug in logs/monitoring.
  const status = err.status || err.statusCode;
  if (err.expose && status && status < 500) {
    return res.status(status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const port = process.env.PORT || 4000;
// Background jobs only start once listen actually succeeds. Previously these
// ran unconditionally right after the call — but a port-bind failure surfaces
// as an async 'error' event, not a synchronous throw, so a crashed watch-mode
// process (e.g. EADDRINUSE) would silently keep running its own copies of all
// four intervals against the same database forever.
app.listen(port, () => {
  console.log(`Server listening on ${port}`);
  startReminderScheduler();
  startReminderRuleEngine();
  startDeletedRecordPurger();
  startInquiryLinkPurger();
});
