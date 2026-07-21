import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { sendMail, buildFromHeader } from '../lib/mailer.js';
import { hashToken, generateToken } from '../lib/resetToken.js';

const router = Router();

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

function serializeForOwner(contract) {
  return {
    id: contract.id,
    bookingId: contract.bookingId,
    snapshot: contract.snapshot,
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
  };
}

function serializeForPublic(contract, role) {
  return {
    role,
    snapshot: contract.snapshot,
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
  const { bookingId, recipientEmail, recipientName, snapshot } = req.body || {};
  if (!bookingId?.trim() || !recipientEmail?.trim() || !snapshot) {
    return res.status(400).json({ error: 'bookingId, recipientEmail, and snapshot are required.' });
  }

  const owner = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } });
  const clientToken = generateToken();
  // Generated up front (not only once the client signs) so the owner can
  // grab their own sign-from-anywhere link immediately too, e.g. to sign
  // right away before the client even opens theirs.
  const ownerToken = generateToken();

  const contract = await prisma.contract.create({
    data: {
      accountId: req.membership.accountId,
      bookingId,
      snapshot,
      status: 'sent',
      recipientEmail,
      recipientName: recipientName || null,
      ownerEmail: owner.email,
      clientTokenHash: hashToken(clientToken),
      ownerTokenHash: hashToken(ownerToken),
      sentAt: new Date(),
    },
  });

  const signUrl = `${frontendUrl()}/sign/${clientToken}`;
  const ownerSignUrl = `${frontendUrl()}/sign/${ownerToken}`;
  const fromName = snapshot.businessInfo?.name || 'GigWorks';
  // The client's raw token only ever exists here and in the email we're
  // about to send — only its hash is persisted (see model comment). If the
  // send fails, still return the link in the response rather than losing it
  // outright; the owner can share it manually and there's no resend route.
  let emailError = null;
  try {
    await sendMail({
      from: buildFromHeader(fromName),
      to: recipientEmail,
      subject: `Contract for your event — ${fromName}`,
      html: `<p>Hi ${recipientName || 'there'},</p><p>Your contract is ready to review and sign. This link is unique to you — please don't forward it.</p><p><a href="${signUrl}">${signUrl}</a></p><p>${fromName}</p>`,
    });
  } catch {
    emailError = 'Contract was created, but the email could not be sent — copy the link below to share it manually.';
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

  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: {
      ownerSignedAt: new Date(),
      ownerSignatureName: signatureName.trim(),
      ownerSignatureImage: signatureImage,
      status: statusFor({ clientSigned: !!contract.clientSignedAt, ownerSigned: true }),
    },
  });
  res.json({ contract: serializeForOwner(updated) });
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
          html: `<p>Good news — ${contract.recipientName || contract.recipientEmail} just signed the contract.</p><p>Countersign it in the app, or from this link:</p><p><a href="${ownerSignUrl}">${ownerSignUrl}</a></p>`,
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
    },
  });
  res.json({ contract: serializeForPublic(updated, role) });
}));

export default router;
