import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import { prisma } from './lib/prisma.js';
import authRouter from './routes/auth.js';
import teamRouter from './routes/team.js';
import accountDataRouter from './routes/accountData.js';
import emailRouter from './routes/email.js';
import emailThreadsRouter from './routes/emailThreads.js';
import emailWebhooksRouter from './routes/emailWebhooks.js';
import eventDocumentsRouter from './routes/eventDocuments.js';
import bookingDocumentsRouter from './routes/bookingDocuments.js';
import contractsRouter, { publicContractsRouter } from './routes/contracts.js';
import billingRouter from './routes/billing.js';
import invoicesRouter, { publicInvoicesRouter } from './routes/invoices.js';
import stripeWebhooksRouter from './routes/stripeWebhooks.js';
import calendarRouter from './routes/calendar.js';
import supportRouter from './routes/support.js';
import adminRouter from './routes/admin.js';

const app = express();
app.set('trust proxy', 1);

const extraOrigins = (process.env.EXTRA_CLIENT_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (isLocalhost || extraOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
// Mounted before express.json() — Svix/Stripe signature verification needs
// the exact raw request bytes, not a parsed/re-serialized body. Each raw()
// call only applies to the app.use() it's passed to, so it's repeated per
// webhook router rather than shared.
app.use('/api/webhooks', express.raw({ type: '*/*' }), emailWebhooksRouter);
app.use('/api/webhooks', express.raw({ type: '*/*' }), stripeWebhooksRouter);

app.use(express.json());

app.use(session({
  store: new PrismaSessionStore(prisma, { checkPeriodMs: 2 * 60 * 1000, dbRecordIdIsSessionId: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // Frontend and backend are always on different origins, so the session
    // cookie needs SameSite=None to survive cross-site fetch() calls —
    // which in turn requires Secure, hence gating both on NODE_ENV.
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/team', teamRouter);
app.use('/api/account-data', accountDataRouter);
app.use('/api/email/threads', emailThreadsRouter);
app.use('/api/email', emailRouter);
app.use('/api/documents', eventDocumentsRouter);
app.use('/api/booking-documents', bookingDocumentsRouter);
app.use('/api/contracts', contractsRouter);
// Public/unauthenticated — recipients click this link from an email, not
// while logged into the app (same reasoning as calendar.js below).
app.use('/api/contract-sign', publicContractsRouter);
app.use('/api/billing', billingRouter);
app.use('/api/invoices', invoicesRouter);
// Public/unauthenticated — same reasoning as /api/contract-sign above.
app.use('/api/invoice-pay', publicInvoicesRouter);
app.use('/api/support', supportRouter);
app.use('/api/admin', adminRouter);
// Public/unauthenticated — recipients click this link from an email, not
// while logged into the app, and it's fully stateless (see calendar.js).
app.use('/api/calendar', calendarRouter);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server listening on ${port}`));
