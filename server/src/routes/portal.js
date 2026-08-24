import { Router } from 'express';
import { createRateLimiter } from '../lib/rateLimiter.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { hashToken, generateToken } from '../lib/resetToken.js';
import { sendMail, resolveFromHeader, escapeHtml, buildActionEmailHtml } from '../lib/mailer.js';
import { invoiceTotal } from './invoices.js';
import { establishSession } from '../lib/sessionAuth.js';

const router = Router();
const LOGIN_TOKEN_TTL_MS = 30 * 60 * 1000;

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

// Same bound as auth.js's forgot-password limiter — this is the same class
// of endpoint (accepts an arbitrary email, emails a login link), same abuse
// shape to guard against (token guessing, using someone's inbox as a spam
// target).
const requestLinkLimiter = createRateLimiter('portal-request-link', {
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { error: 'Too many attempts. Please try again later.' },
});

function serializeClient(c) {
  return { id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone };
}

// ---- Public (magic-link request/verify) ----

router.post('/request-link', requestLinkLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required.' });
  const normalizedEmail = email.trim().toLowerCase();

  // Every matching Client, across every account and (rarely) more than one
  // within the same account — see the ClientPortalToken model comment for
  // why there's no uniqueness to rely on here. One email, one link per match.
  const clients = await prisma.client.findMany({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    include: { account: { include: { accountData: true } } },
  });

  if (clients.length) {
    // Batched rather than a per-client delete+create loop — same end state
    // (each client's stale unused token gone, one fresh one issued), but two
    // round trips total instead of 2*N, regardless of how many accounts
    // share this email.
    const tokenByClientId = new Map(clients.map((c) => [c.id, generateToken()]));
    const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MS);
    await prisma.clientPortalToken.deleteMany({ where: { clientId: { in: clients.map((c) => c.id) }, usedAt: null } });
    await prisma.clientPortalToken.createMany({
      data: clients.map((c) => ({ clientId: c.id, tokenHash: hashToken(tokenByClientId.get(c.id)), expiresAt })),
    });

    const links = clients.map((client) => {
      const businessInfo = client.account?.accountData?.data?.businessInfo;
      return {
        url: `${frontendUrl()}/portal/verify?token=${tokenByClientId.get(client.id)}`,
        // Both the business name and the client's own name — two Client
        // rows in the same account can share an email, so business name
        // alone wouldn't always disambiguate which link is which.
        label: `${businessInfo?.name || 'GigWorks'} — ${client.firstName} ${client.lastName}`,
      };
    });

    const bodyHtml = `<p>Click below to view your event details${links.length > 1 ? ' — we found more than one account associated with this email' : ''}:</p>`
      + links.map((l) => `<p><a href="${l.url}">${escapeHtml(l.label)}</a></p>`).join('');
    try {
      await sendMail({
        from: await resolveFromHeader({ fromName: 'GigWorks', localPart: 'portal' }),
        to: normalizedEmail,
        subject: 'Your GigWorks portal link',
        html: buildActionEmailHtml({ businessInfo: null, heading: 'Portal Access', bodyHtml }),
      });
    } catch (err) {
      // best effort — same reasoning as auth.js's forgot-password: don't let
      // a mail-provider hiccup change the response below.
      console.error(`Failed to email portal link to ${normalizedEmail}:`, err);
    }
  }

  // Always the same response whether or not the email matched any Client —
  // avoids confirming/denying which businesses someone is a client of.
  res.json({ ok: true });
}));

router.get('/verify', asyncHandler(async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'A token is required.' });

  const record = await prisma.clientPortalToken.findUnique({ where: { tokenHash: hashToken(String(token)) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return res.status(400).json({ error: 'This link is invalid or has expired.' });
  }

  const consumed = await prisma.clientPortalToken.updateMany({
    where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) {
    return res.status(400).json({ error: 'This link is invalid or has expired.' });
  }
  await establishSession(req, { clientId: record.clientId });
  res.json({ ok: true });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ---- Authenticated (client-scoped) ----

async function requireClientAuth(req, res, next) {
  if (!req.session.clientId) return res.status(401).json({ error: 'Not authenticated.' });
  const client = await prisma.client.findUnique({ where: { id: req.session.clientId } });
  // No soft-delete on Client today — a hard-deleted row just means the
  // session no longer resolves to anyone; treat it the same as never
  // having logged in rather than a 500.
  if (!client) return res.status(401).json({ error: 'Not authenticated.' });
  req.clientAuth = { clientId: client.id, accountId: client.accountId };
  req.client = client;
  next();
}

router.use(asyncHandler(requireClientAuth));

router.get('/me', asyncHandler(async (req, res) => {
  const accountData = await prisma.accountData.findUnique({ where: { accountId: req.clientAuth.accountId } });
  res.json({
    client: serializeClient(req.client),
    businessInfo: accountData?.data?.businessInfo || null,
  });
}));

router.get('/events', asyncHandler(async (req, res) => {
  const [events, accountData] = await Promise.all([
    prisma.event.findMany({
      where: { accountId: req.clientAuth.accountId, clientId: req.clientAuth.clientId, deletedAt: null },
      orderBy: { eventDate: 'asc' },
    }),
    prisma.accountData.findUnique({ where: { accountId: req.clientAuth.accountId } }),
  ]);
  const eventStatuses = accountData?.data?.eventStatuses || [];
  res.json({
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      eventType: e.eventType,
      eventDate: e.eventDate,
      startTime: e.startTime,
      endTime: e.endTime,
      venue: e.venue,
      status: eventStatuses.find((s) => s.id === e.eventStatus) || null,
    })),
  });
}));

router.get('/bookings', asyncHandler(async (req, res) => {
  const [bookings, accountData] = await Promise.all([
    prisma.booking.findMany({
      where: { accountId: req.clientAuth.accountId, clientId: req.clientAuth.clientId, deletedAt: null },
      orderBy: { eventDate: 'asc' },
    }),
    prisma.accountData.findUnique({ where: { accountId: req.clientAuth.accountId } }),
  ]);
  const bookingStatuses = accountData?.data?.bookingStatuses || [];
  res.json({
    bookings: bookings.map((b) => ({
      id: b.id,
      eventName: b.eventName,
      eventType: b.eventType,
      eventDate: b.eventDate,
      convertedEventId: b.convertedEventId,
      status: bookingStatuses.find((s) => s.id === b.bookingStatus) || null,
    })),
  });
}));

// Invoice.bookingId is an opaque string, not a Prisma relation (same
// non-FK pattern as everywhere else in this schema) — two-step lookup
// rather than a single query with an include.
router.get('/invoices', asyncHandler(async (req, res) => {
  const bookings = await prisma.booking.findMany({
    where: { accountId: req.clientAuth.accountId, clientId: req.clientAuth.clientId },
    select: { id: true },
  });
  const bookingIds = bookings.map((b) => b.id);
  if (!bookingIds.length) return res.json({ invoices: [] });

  const invoices = await prisma.invoice.findMany({
    where: { bookingId: { in: bookingIds }, status: { not: 'draft' } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    invoices: invoices.map((inv) => ({
      id: inv.id,
      number: inv.number,
      dueDate: inv.dueDate,
      status: inv.status,
      total: invoiceTotal(inv),
      paidAmount: inv.paidAmount ?? 0,
      paidAt: inv.paidAt,
      sentAt: inv.sentAt,
    })),
  });
}));

export default router;
