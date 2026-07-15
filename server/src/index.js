import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import { prisma } from './lib/prisma.js';
import authRouter from './routes/auth.js';
import teamRouter from './routes/team.js';
import emailRouter from './routes/email.js';
import emailThreadsRouter from './routes/emailThreads.js';
import emailWebhooksRouter from './routes/emailWebhooks.js';

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
// Mounted before express.json() — Svix signature verification needs the
// exact raw request bytes, not a parsed/re-serialized body.
app.use('/api/webhooks', express.raw({ type: '*/*' }), emailWebhooksRouter);

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
app.use('/api/email/threads', emailThreadsRouter);
app.use('/api/email', emailRouter);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server listening on ${port}`));
