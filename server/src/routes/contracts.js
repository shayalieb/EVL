import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { sendMail, buildFromHeader, escapeHtml } from '../lib/mailer.js';
import { hashToken, generateToken } from '../lib/resetToken.js';

const router = Router();

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

// Appends a stamped entry to a contract's `log` Json array — Prisma has no
// partial-array-append for Json columns, so every write replaces the whole
// array. `existingLog` is whatever was read off the row before this update.
function withLogEntry(existingLog, entry) {
  const log = Array.isArray(existingLog) ? existingLog : [];
  return [...log, { id: randomUUID(), at: new Date().toISOString(), ...entry }];
}

function serializeForOwner(contract) {
  return {
    id: contract.id,
    bookingId: contract.bookingId,
    snapshot: contract.snapshot,
    terms: contract.terms,
    status: contract.status,
    recipientEmail: contract.recipientEmail,
    recipientName: contract.recipientName,
    clientSignedAt: contract.clientSignedAt,
    clientSignatureName: contract.clientSignatureName,
    clientSignatureImage: contract.clientSignatureImage,
    ownerSignedAt: contract.ownerSignedAt,
    ownerSignatureName: contract.ownerSignatureName,
    ownerSignatureImage: contract.ownerSignatureImage,
    sentAt: contract.sentAt,
    createdAt: contract.createdAt,
    log: contract.log,
  };
}

function serializeForPublic(contract, role) {
  return {
    role,
    snapshot: contract.snapshot,
    terms: contract.terms,
    status: contract.status,
    recipientName: contract.recipientName,
    clientSignedAt: contract.clientSignedAt,
    clientSignatureName: contract.clientSignatureName,
    clientSignatureImage: contract.clientSignatureImage,
    ownerSignedAt: contract.ownerSignedAt,
    ownerSignatureName: contract.ownerSignatureName,
    ownerSignatureImage: contract.ownerSignatureImage,
  };
}

// ---- Authenticated (owner-side) ----

router.use(requireAuth, asyncHandler(attachMembership));

router.get('/', asyncHandler(async (req, res) => {
  const { bookingId } = req.query;
  if (!bookingId) return res.status(400).json({ error: 'bookingId is required.' });

  const contract = await prisma.contract.findFirst({
    where: { accountId: req.membership.accountId, bookingId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ contract: contract ? serializeForOwner(contract) : null });
}));

// Derives status purely from which signatures are present so either party
// can sign in either order — a 'client_signed'/'owner_signed' gate would
// otherwise block whichever party didn't go first.
function statusFor({ clientSigned, ownerSigned }) {
  if (clientSigned && ownerSigned) return 'fully_signed';
  if (clientSigned) return 'client_signed';
  if (ownerSigned) return 'owner_signed';
  return 'sent';
}

router.post('/', asyncHandler(async (req, res) => {
  const { bookingId, recipientEmail, recipientName, snapshot, terms, manual, reason } = req.body || {};
  if (!bookingId?.trim() || !recipientEmail?.trim() || !snapshot) {
    return res.status(400).json({ error: 'bookingId, recipientEmail, and snapshot are required.' });
  }
  if (manual && !reason?.trim()) {
    return res.status(400).json({ error: 'A reason is required to mark a contract as sent manually.' });
  }

  const owner = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } });
  const clientToken = generateToken();
  // Generated up front (not only once the client signs) so the owner can
  // grab their own sign-from-anywhere link immediately too, e.g. to sign
  // right away before the client even opens theirs.
  const ownerToken = generateToken();
  const sentAt = new Date();

  const contract = await prisma.contract.create({
    data: {
      accountId: req.membership.accountId,
      bookingId,
      snapshot,
      terms: terms || null,
      status: 'sent',
      recipientEmail,
      recipientName: recipientName || null,
      ownerEmail: owner.email,
      clientTokenHash: hashToken(clientToken),
      ownerTokenHash: hashToken(ownerToken),
      sentAt,
      // Delivered outside GigWorks (printed, texted, signed in person,
      // etc.) skips the actual email below, but still gets sign tokens so
      // the client can come sign online later if that's still useful.
      log: manual
        ? withLogEntry([], { type: 'manual_sent', actorEmail: owner.email, note: reason.trim() })
        : withLogEntry([], { type: 'sent', actorEmail: owner.email, note: null }),
    },
  });

  const signUrl = `${frontendUrl()}/sign/${clientToken}`;
  const ownerSignUrl = `${frontendUrl()}/sign/${ownerToken}`;
  const fromName = snapshot.businessInfo?.name || 'GigWorks';
  let emailError = null;
  if (!manual) {
    // The client's raw token only ever exists here and in the email we're
    // about to send — only its hash is persisted (see model comment). If
    // the send fails, still return the link in the response rather than
    // losing it outright; the owner can share it manually and there's no
    // resend route.
    try {
      await sendMail({
        from: buildFromHeader(fromName),
        to: recipientEmail,
        subject: `Contract for your event — ${fromName}`,
        html: `<p>Hi ${escapeHtml(recipientName) || 'there'},</p><p>Your contract is ready to review and sign. This link is unique to you — please don't forward it.</p><p><a href="${signUrl}">${signUrl}</a></p><p>${escapeHtml(fromName)}</p>`,
      });
    } catch {
      emailError = 'Contract was created, but the email could not be sent — copy the link below to share it manually.';
    }
  }

  res.status(201).json({ contract: serializeForOwner(contract), signLink: signUrl, ownerSignLink: ownerSignUrl, emailError });
}));

router.post('/:id/owner-sign', asyncHandler(async (req, res) => {
  const { signatureName, signatureImage } = req.body || {};
  if (!signatureName?.trim() || !signatureImage) {
    return res.status(400).json({ error: 'signatureName and signatureImage are required.' });
  }

  const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
  if (!contract || contract.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Contract not found.' });
  }
  if (contract.ownerSignedAt) {
    return res.status(400).json({ error: "You've already signed this contract." });
  }

  const owner = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } });
  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: {
      ownerSignedAt: new Date(),
      ownerSignatureName: signatureName.trim(),
      ownerSignatureImage: signatureImage,
      status: statusFor({ clientSigned: !!contract.clientSignedAt, ownerSigned: true }),
      log: withLogEntry(contract.log, { type: 'owner_signed', actorEmail: owner.email, note: null }),
    },
  });
  res.json({ contract: serializeForOwner(updated) });
}));

// Terms is deliberately editable regardless of status — unlike the frozen
// snapshot, it's meant to be touched up any time (before or after signing).
router.patch('/:id/terms', asyncHandler(async (req, res) => {
  const { terms } = req.body || {};
  const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
  if (!contract || contract.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Contract not found.' });
  }
  const owner = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } });
  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: {
      terms: terms || null,
      log: withLogEntry(contract.log, { type: 'terms_edited', actorEmail: owner.email, note: null }),
    },
  });
  res.json({ contract: serializeForOwner(updated) });
}));

// Manual free-text log entries — same idea as a booking's Activity Log,
// but persisted server-side since Contract has no client-editable blob.
router.post('/:id/log', asyncHandler(async (req, res) => {
  const { note } = req.body || {};
  if (!note?.trim()) return res.status(400).json({ error: 'note is required.' });

  const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
  if (!contract || contract.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Contract not found.' });
  }
  const owner = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } });
  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: { log: withLogEntry(contract.log, { type: 'note', actorEmail: owner.email, note: note.trim() }) },
  });
  res.json({ contract: serializeForOwner(updated) });
}));

// Regenerate the client's sign link at any time. A manually-sent contract's
// original link is never emailed anywhere and only its hash persists (same
// reasoning as clientTokenHash itself) — if it's lost there is no way to
// recover it, so this issues a fresh one instead. The old link (if any)
// stops working the moment this runs, since it's a full replace, not an
// additional valid token.
router.post('/:id/regenerate-client-link', asyncHandler(async (req, res) => {
  const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
  if (!contract || contract.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Contract not found.' });
  }
  if (contract.clientSignedAt) {
    return res.status(400).json({ error: 'The client has already signed this contract.' });
  }
  const owner = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } });
  const clientToken = generateToken();
  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: {
      clientTokenHash: hashToken(clientToken),
      log: withLogEntry(contract.log, { type: 'client_link_regenerated', actorEmail: owner.email, note: null }),
    },
  });
  res.json({ contract: serializeForOwner(updated), signLink: `${frontendUrl()}/sign/${clientToken}` });
}));

// ---- Public (unauthenticated, token-based) ----
// Mounted separately in index.js under a distinct path prefix (see below)
// so it never passes through the requireAuth/attachMembership pair above.

export const publicContractsRouter = Router();

async function findByToken(token) {
  const hash = hashToken(token);
  const contract = await prisma.contract.findFirst({
    where: { OR: [{ clientTokenHash: hash }, { ownerTokenHash: hash }] },
  });
  if (!contract) return null;
  const role = contract.clientTokenHash === hash ? 'client' : 'owner';
  return { contract, role };
}

publicContractsRouter.post('/:token/view', asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required.' });

  const found = await findByToken(req.params.token);
  if (!found) return res.status(404).json({ error: 'This link is invalid or has expired.' });

  const { contract, role } = found;
  const expectedEmail = role === 'client' ? contract.recipientEmail : contract.ownerEmail;
  if (email.trim().toLowerCase() !== expectedEmail.toLowerCase()) {
    return res.status(403).json({ error: "That email doesn't match this link." });
  }

  res.json({ contract: serializeForPublic(contract, role) });
}));

publicContractsRouter.post('/:token/submit', asyncHandler(async (req, res) => {
  const { email, signatureName, signatureImage } = req.body || {};
  if (!email?.trim() || !signatureName?.trim() || !signatureImage) {
    return res.status(400).json({ error: 'Email, signatureName, and signatureImage are required.' });
  }

  const found = await findByToken(req.params.token);
  if (!found) return res.status(404).json({ error: 'This link is invalid or has expired.' });

  const { contract, role } = found;
  const expectedEmail = role === 'client' ? contract.recipientEmail : contract.ownerEmail;
  if (email.trim().toLowerCase() !== expectedEmail.toLowerCase()) {
    return res.status(403).json({ error: "That email doesn't match this link." });
  }

  if (role === 'client') {
    if (contract.clientSignedAt) {
      return res.status(400).json({ error: "You've already signed this contract." });
    }
    const ownerAlreadySigned = !!contract.ownerSignedAt;
    const updated = await prisma.contract.update({
      where: { id: contract.id },
      data: {
        clientSignedAt: new Date(),
        clientSignatureName: signatureName.trim(),
        clientSignatureImage: signatureImage,
        status: statusFor({ clientSigned: true, ownerSigned: ownerAlreadySigned }),
        log: withLogEntry(contract.log, { type: 'client_signed', actorEmail: contract.recipientEmail, note: null }),
      },
    });

    // Only nudge the owner if they haven't already signed — nothing to do
    // once both signatures are in. Their sign token was generated at send
    // time but only its hash was ever persisted (never emailed), so a fresh
    // one has to be issued here to put a working link in this notification.
    if (!ownerAlreadySigned) {
      const ownerToken = generateToken();
      await prisma.contract.update({ where: { id: contract.id }, data: { ownerTokenHash: hashToken(ownerToken) } });

      const fromName = contract.snapshot?.businessInfo?.name || 'GigWorks';
      const ownerSignUrl = `${frontendUrl()}/sign/${ownerToken}`;
      try {
        await sendMail({
          from: buildFromHeader(fromName),
          to: contract.ownerEmail,
          subject: `${contract.recipientName || contract.recipientEmail} signed your contract — your signature is next`,
          html: `<p>Good news — ${escapeHtml(contract.recipientName || contract.recipientEmail)} just signed the contract.</p><p>Countersign it in the app, or from this link:</p><p><a href="${ownerSignUrl}">${ownerSignUrl}</a></p>`,
        });
      } catch {
        // best effort — the owner can still countersign in-app even if this notification fails to send
      }
    }

    return res.json({ contract: serializeForPublic(updated, role) });
  }

  // role === 'owner'
  if (contract.ownerSignedAt) {
    return res.status(400).json({ error: "You've already signed this contract." });
  }
  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: {
      ownerSignedAt: new Date(),
      ownerSignatureName: signatureName.trim(),
      ownerSignatureImage: signatureImage,
      status: statusFor({ clientSigned: !!contract.clientSignedAt, ownerSigned: true }),
      log: withLogEntry(contract.log, { type: 'owner_signed', actorEmail: contract.ownerEmail, note: null }),
    },
  });
  res.json({ contract: serializeForPublic(updated, role) });
}));

export default router;
