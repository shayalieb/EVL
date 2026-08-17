import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { sendMail, resolveFromHeader, escapeHtml, buildActionEmailHtml } from '../lib/mailer.js';
import { hashToken, generateToken } from '../lib/resetToken.js';

const router = Router();

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

// Appends a stamped entry to a proposal response's `log` Json array — same
// reasoning/shape as contracts.js's withLogEntry (Prisma Json columns have
// no partial-array-append, every write replaces the whole array).
function withLogEntry(existingLog, entry) {
  const log = Array.isArray(existingLog) ? existingLog : [];
  return [...log, { id: randomUUID(), at: new Date().toISOString(), ...entry }];
}

function serializeForOwner(pr) {
  return {
    id: pr.id,
    bookingId: pr.bookingId,
    snapshot: pr.snapshot,
    status: pr.status,
    recipientEmail: pr.recipientEmail,
    recipientName: pr.recipientName,
    respondedAt: pr.respondedAt,
    responseNote: pr.responseNote,
    sentAt: pr.sentAt,
    createdAt: pr.createdAt,
    log: pr.log,
  };
}

function serializeForPublic(pr) {
  return {
    snapshot: pr.snapshot,
    status: pr.status,
    recipientName: pr.recipientName,
    respondedAt: pr.respondedAt,
    responseNote: pr.responseNote,
  };
}

// ---- Authenticated (owner-side) ----

router.use(requireAuth, asyncHandler(attachMembership));

// bookingId scopes to that one booking's most recent response (a resend —
// e.g. after a revision request — creates a new row rather than
// overwriting the old one, same as Contract). Omitting it returns every
// response on the account, for BookingsPage.jsx's list-wide banner/badges.
router.get('/', asyncHandler(async (req, res) => {
  const { bookingId } = req.query;
  if (!bookingId) {
    const list = await prisma.proposalResponse.findMany({
      where: { accountId: req.membership.accountId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ proposalResponses: list.map(serializeForOwner) });
  }

  const pr = await prisma.proposalResponse.findFirst({
    where: { accountId: req.membership.accountId, bookingId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ proposalResponse: pr ? serializeForOwner(pr) : null });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { bookingId, recipientEmail, recipientName, snapshot, manual, reason } = req.body || {};
  if (!bookingId?.trim() || !recipientEmail?.trim() || !snapshot) {
    return res.status(400).json({ error: 'bookingId, recipientEmail, and snapshot are required.' });
  }
  if (manual && !reason?.trim()) {
    return res.status(400).json({ error: 'A reason is required to mark a proposal as sent manually.' });
  }

  const owner = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } });
  const token = generateToken();
  const sentAt = new Date();

  const proposalResponse = await prisma.proposalResponse.create({
    data: {
      accountId: req.membership.accountId,
      bookingId,
      snapshot,
      status: 'sent',
      recipientEmail,
      recipientName: recipientName || null,
      ownerEmail: owner.email,
      tokenHash: hashToken(token),
      sentAt,
      log: manual
        ? withLogEntry([], { type: 'manual_sent', actorEmail: owner.email, note: reason.trim() })
        : withLogEntry([], { type: 'sent', actorEmail: owner.email, note: null }),
    },
  });

  res.status(201).json({
    proposalResponse: serializeForOwner(proposalResponse),
    respondLink: `${frontendUrl()}/proposal/${token}`,
  });
}));

// ---- Public (unauthenticated, token-based) ----
// Mounted separately in index.js under a distinct path prefix, same
// reasoning as publicContractsRouter — never passes through the
// requireAuth/attachMembership pair above.

export const publicProposalResponsesRouter = Router();

async function findByToken(token) {
  return prisma.proposalResponse.findUnique({ where: { tokenHash: hashToken(token) } });
}

publicProposalResponsesRouter.get('/:token', asyncHandler(async (req, res) => {
  const pr = await findByToken(req.params.token);
  if (!pr) return res.status(404).json({ error: 'This link is invalid or has expired.' });
  res.json({ proposalResponse: serializeForPublic(pr) });
}));

// Best-effort notification back to the owner — an in-app indicator
// (BookingsPage.jsx's banner/badge, plus an auto-created Reminder so it
// also surfaces in the bell) is the real notification; this email is just
// a heads-up if they're not looking at the app right now. Never fails the
// request if either side-effect errors.
async function notifyOwner(pr, { status, note }) {
  const actionLabel = status === 'accepted' ? 'accepted your proposal' : 'requested changes to your proposal';
  const clientLabel = pr.recipientName || pr.recipientEmail;

  try {
    const ownerMembership = await prisma.membership.findFirst({ where: { accountId: pr.accountId, role: 'owner' } });
    if (ownerMembership) {
      await prisma.reminder.create({
        data: {
          accountId: pr.accountId,
          createdByUserId: ownerMembership.userId,
          relatedType: 'booking',
          relatedId: pr.bookingId,
          relatedName: clientLabel,
          autoGenerated: true,
          note: status === 'accepted'
            ? `${clientLabel} ${actionLabel}${note ? `: "${note}"` : '.'}`
            : `${clientLabel} ${actionLabel}: "${note}"`,
          remindAt: new Date(),
          emailEnabled: true,
        },
      });
    }
  } catch (err) {
    console.error(`Failed to create owner reminder for proposal response ${pr.id}:`, err);
  }

  try {
    const fromName = pr.snapshot?.businessInfo?.name || 'GigWorks';
    await sendMail({
      from: await resolveFromHeader({ accountId: pr.accountId, fromName, localPart: 'proposals' }),
      to: pr.ownerEmail,
      subject: `${clientLabel} ${actionLabel}`,
      html: buildActionEmailHtml({
        businessInfo: pr.snapshot?.businessInfo,
        heading: status === 'accepted' ? 'Your proposal was accepted' : 'Changes requested on your proposal',
        bodyHtml: status === 'accepted'
          ? `<p>${escapeHtml(clientLabel)} accepted the proposal.</p>${note ? `<p><em>${escapeHtml(note)}</em></p>` : ''}`
          : `<p>${escapeHtml(clientLabel)} requested changes to the proposal:</p><p><em>${escapeHtml(note)}</em></p>`,
        buttonText: 'View in GigWorks',
        buttonUrl: frontendUrl(),
      }),
    });
  } catch (err) {
    console.error(`Failed to email proposal-response notification for ${pr.id}:`, err);
  }
}

publicProposalResponsesRouter.post('/:token/respond', asyncHandler(async (req, res) => {
  const { action, note } = req.body || {};
  if (action !== 'accept' && action !== 'request_revision') {
    return res.status(400).json({ error: 'action must be "accept" or "request_revision".' });
  }
  const trimmedNote = note?.trim() || '';
  if (action === 'request_revision' && !trimmedNote) {
    return res.status(400).json({ error: 'Please explain what needs to change.' });
  }

  const pr = await findByToken(req.params.token);
  if (!pr) return res.status(404).json({ error: 'This link is invalid or has expired.' });

  const status = action === 'accept' ? 'accepted' : 'revision_requested';
  const updated = await prisma.proposalResponse.update({
    where: { id: pr.id },
    data: {
      status,
      respondedAt: new Date(),
      responseNote: trimmedNote || null,
      log: withLogEntry(pr.log, { type: status, actorEmail: pr.recipientEmail, note: trimmedNote || null }),
    },
  });

  await notifyOwner(updated, { status, note: trimmedNote });

  res.json({ proposalResponse: serializeForPublic(updated) });
}));

export default router;
