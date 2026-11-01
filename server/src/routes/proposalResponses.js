import { bookingReferenceError } from '../lib/ownedReferences.js';
import { randomUUID } from 'node:crypto';
import { nextDocumentDisplayNumber } from '../lib/documentDisplayNumber.js';
import { Router } from 'express';
import { viewGuard } from '../lib/viewAccess.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { sendMail, resolveFromHeader, escapeHtml, buildActionEmailHtml } from '../lib/mailer.js';
import { hashToken, generateToken } from '../lib/resetToken.js';
import { normalizeValidEmail } from '../lib/emailAddress.js';
import { resolveLinkExpiration, linkAvailability } from '../lib/linkExpiration.js';

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
    documentNumber: pr.documentNumber,
    displayNumber: pr.displayNumber,
    bookingId: pr.bookingId,
    snapshot: pr.snapshot,
    status: pr.status,
    recipientEmail: pr.recipientEmail,
    recipientName: pr.recipientName,
    respondedAt: pr.respondedAt,
    responseNote: pr.responseNote,
    sentAt: pr.sentAt,
    createdAt: pr.createdAt,
    expiresAt: pr.expiresAt,
    log: pr.log,
  };
}

function serializeForPublic(pr) {
  return {
    id: pr.id,
    documentNumber: pr.documentNumber,
    displayNumber: pr.displayNumber,
    snapshot: pr.snapshot,
    status: pr.status,
    recipientName: pr.recipientName,
    respondedAt: pr.respondedAt,
    responseNote: pr.responseNote,
    expiresAt: pr.expiresAt,
  };
}

// ---- Authenticated (owner-side) ----

router.use(requireAuth, asyncHandler(attachMembership));
router.use(viewGuard('viewBookings'));

// Reading is open to the team; sending or withdrawing a proposal needs booking permission, like invoices.
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (!effectivePermissions(req.membership).manageBookings) return res.status(403).json({ error: 'Not authorized.' });
  next();
});

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

// Every response ever sent for one booking, oldest first — unlike GET /
// above (which only returns the most recent), this is for a "Proposal
// history" view showing each prior version's frozen snapshot.
router.get('/history', asyncHandler(async (req, res) => {
  const { bookingId } = req.query;
  if (!bookingId?.trim()) {
    return res.status(400).json({ error: 'bookingId is required.' });
  }
  const list = await prisma.proposalResponse.findMany({
    where: { accountId: req.membership.accountId, bookingId },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ proposalResponses: list.map(serializeForOwner) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { bookingId, recipientEmail, recipientName, snapshot, manual, reason, expiration } = req.body || {};
  const normalizedRecipientEmail = normalizeValidEmail(recipientEmail);
  if (!bookingId?.trim() || !normalizedRecipientEmail || !snapshot) {
    return res.status(400).json({ error: 'bookingId, a valid recipient email, and snapshot are required.' });
  }
  if (manual && !reason?.trim()) {
    return res.status(400).json({ error: 'A reason is required to mark a proposal as sent manually.' });
  }
  const resolvedExpiration = resolveLinkExpiration(expiration, { defaultPreset: '14_days' });
  if (resolvedExpiration.error) return res.status(400).json({ error: resolvedExpiration.error });

  { const referenceError = await bookingReferenceError(req.membership.accountId, bookingId); if (referenceError) return res.status(400).json({ error: referenceError }); }
  const owner = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } });
  const normalizedOwnerEmail = normalizeValidEmail(owner?.email);
  if (!normalizedOwnerEmail) return res.status(400).json({ error: 'Your account needs a valid owner email address before proposals can be created.' });
  const token = generateToken();
  const sentAt = new Date();
  const id = randomUUID();
  const displayNumber = await nextDocumentDisplayNumber();

  // Only the newest unanswered proposal may receive a response. Older
  // versions remain available as an accurate view-only record. The ids it
  // replaces are kept in the log entry so a delivery failure can restore them.
  const proposalResponse = await prisma.$transaction(async (tx) => {
    const replaced = await tx.proposalResponse.findMany({
      where: { accountId: req.membership.accountId, bookingId, status: 'sent' },
      select: { id: true },
    });
    await tx.proposalResponse.updateMany({
      where: { id: { in: replaced.map((row) => row.id) } },
      data: { status: 'superseded' },
    });
    const supersedes = replaced.map((row) => row.id);
    return tx.proposalResponse.create({ data: {
      id,
      documentNumber: String(displayNumber),
      displayNumber,
      accountId: req.membership.accountId,
      bookingId,
      snapshot,
      status: 'sent',
      recipientEmail: normalizedRecipientEmail,
      recipientName: recipientName || null,
      ownerEmail: normalizedOwnerEmail,
      tokenHash: hashToken(token),
      expiresAt: resolvedExpiration.expiresAt,
      sentAt,
      log: manual
        ? withLogEntry([], { type: 'manual_sent', actorEmail: normalizedOwnerEmail, note: reason.trim(), supersedes })
        : withLogEntry([], { type: 'sent', actorEmail: normalizedOwnerEmail, note: null, supersedes }),
    } });
  });

  res.status(201).json({
    proposalResponse: serializeForOwner(proposalResponse),
    respondLink: `${frontendUrl()}/proposal/${token}`,
  });
}));

// The proposal email is built and sent by the browser (the PDF is generated there), after the
// response row above exists. If that email fails, the owner must not be left looking at a
// proposal marked "Sent" that the client never received. This withdraws it, and puts back any
// earlier proposal it had replaced. Only an unanswered proposal sent moments ago can be withdrawn.
const ROLLBACK_WINDOW_MS = 15 * 60 * 1000;

router.post('/:id/rollback', asyncHandler(async (req, res) => {
  const accountId = req.membership.accountId;
  const result = await prisma.$transaction(async (tx) => {
    const pr = await tx.proposalResponse.findFirst({ where: { id: String(req.params.id), accountId } });
    if (!pr) return { status: 404, error: 'Proposal not found.' };
    const fresh = pr.sentAt && Date.now() - pr.sentAt.getTime() <= ROLLBACK_WINDOW_MS;
    if (pr.status !== 'sent' || pr.respondedAt || !fresh) {
      return { status: 409, error: 'This proposal can no longer be withdrawn.' };
    }
    const entry = (Array.isArray(pr.log) ? pr.log : []).find((item) => item?.type === 'sent' || item?.type === 'manual_sent');
    const supersedes = Array.isArray(entry?.supersedes) ? entry.supersedes.filter((value) => typeof value === 'string') : [];
    await tx.proposalResponse.delete({ where: { id: pr.id } });
    if (supersedes.length) {
      await tx.proposalResponse.updateMany({ where: { id: { in: supersedes }, accountId, bookingId: pr.bookingId, status: 'superseded' }, data: { status: 'sent' } });
    }
    return { status: 200 };
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
}));

// ---- Public (unauthenticated, token-based) ----
// Mounted separately in index.js under a distinct path prefix, same
// reasoning as publicContractsRouter — never passes through the
// requireAuth/attachMembership pair above.

export const publicProposalResponsesRouter = Router();

async function findByToken(token) {
  return prisma.proposalResponse.findUnique({ where: { tokenHash: hashToken(token) } });
}

function rejectUnavailable(pr, res) {
  const availability = linkAvailability({ expiresAt: pr.expiresAt });
  if (availability === 'active') return false;
  res.status(410).json({ error: 'This proposal link has expired. Please contact the sender for a new link.', reason: availability });
  return true;
}

publicProposalResponsesRouter.get('/:token', asyncHandler(async (req, res) => {
  const pr = await findByToken(req.params.token);
  if (!pr) return res.status(404).json({ error: 'This link is invalid or has expired.' });
  if (rejectUnavailable(pr, res)) return;
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
          // The direct email below is the one heads-up; a second "Reminder:" email for the same event was a duplicate.
          emailEnabled: false,
        },
      });
    }
  } catch (err) {
    console.error(`Failed to create owner reminder for proposal response ${pr.id}:`, err);
  }

  try {
    const fromName = pr.snapshot?.businessInfo?.name || 'GigWorks';
    await sendMail({
      tracking: { accountId: pr.accountId, bookingId: pr.bookingId },
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
  if (rejectUnavailable(pr, res)) return;
  if (pr.status !== 'sent') return res.status(409).json({ error: 'This proposal has already received a response.' });

  const status = action === 'accept' ? 'accepted' : 'revision_requested';
  const claimed = await prisma.proposalResponse.updateMany({
    where: { id: pr.id, status: 'sent' },
    data: {
      status,
      respondedAt: new Date(),
      responseNote: trimmedNote || null,
      log: withLogEntry(pr.log, { type: status, actorEmail: pr.recipientEmail, note: trimmedNote || null }),
    },
  });
  if (claimed.count !== 1) return res.status(409).json({ error: 'This proposal has already received a response.' });
  const updated = await prisma.proposalResponse.findUniqueOrThrow({ where: { id: pr.id } });

  await notifyOwner(updated, { status, note: trimmedNote });

  res.json({ proposalResponse: serializeForPublic(updated) });
}));

export default router;
