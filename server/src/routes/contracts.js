import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { sendMail, resolveFromHeader, escapeHtml, buildActionEmailHtml } from '../lib/mailer.js';
import { hashToken, generateToken } from '../lib/resetToken.js';
import { withSerializableTransaction } from '../lib/serializableTransaction.js';
import { normalizeValidEmail } from '../lib/emailAddress.js';
import { resolveLinkExpiration, linkAvailability } from '../lib/linkExpiration.js';
import { ESIGN_CONSENT_VERSION, buildDocumentHash, buildFinalRecord, requestEvidence } from '../lib/contractEvidence.js';
import { nextDocumentDisplayNumber } from '../lib/documentDisplayNumber.js';

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
    documentNumber: contract.documentNumber,
    displayNumber: contract.displayNumber,
    rootDisplayNumber: contract.rootDisplayNumber,
    bookingId: contract.bookingId,
    snapshot: contract.snapshot,
    terms: contract.terms,
    status: contract.status,
    documentType: contract.documentType,
    documentHash: contract.documentHash,
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
    clientLinkExpiresAt: contract.clientLinkExpiresAt,
    ownerLinkExpiresAt: contract.ownerLinkExpiresAt,
    log: contract.log,
    revisionNumber: contract.revisionNumber,
    previousContractId: contract.previousContractId,
    rootContractId: contract.rootContractId,
    completedAt: contract.completedAt,
    finalRecordHash: contract.finalRecordHash,
  };
}

function serializeForPublic(contract, role) {
  return {
    role,
    id: contract.id,
    documentNumber: contract.documentNumber,
    displayNumber: contract.displayNumber,
    rootDisplayNumber: contract.rootDisplayNumber,
    snapshot: contract.snapshot,
    terms: contract.terms,
    status: contract.status,
    documentType: contract.documentType,
    revisionNumber: contract.revisionNumber,
    documentHash: contract.documentHash,
    recipientName: contract.recipientName,
    clientSignedAt: contract.clientSignedAt,
    clientSignatureName: contract.clientSignatureName,
    clientSignatureImage: contract.clientSignatureImage,
    ownerSignedAt: contract.ownerSignedAt,
    ownerSignatureName: contract.ownerSignatureName,
    ownerSignatureImage: contract.ownerSignatureImage,
    completedAt: contract.completedAt,
    finalRecordHash: contract.finalRecordHash,
    expiresAt: role === 'client' ? contract.clientLinkExpiresAt : contract.ownerLinkExpiresAt,
  };
}

// ---- Authenticated (owner-side) ----

router.use(requireAuth, asyncHandler(attachMembership));

// bookingId scopes to that one booking's most recent contract (existing
// shape: a single `contract`, possibly null). Omitting it returns every
// contract on the account instead (`contracts`, an array) — used by
// BookingsPage.jsx's Stage column, which needs to know each booking's
// contract status without a query per row. A booking can have more than one
// Contract row (e.g. a resend creates a new one), so the list form can't
// just be the single-booking query with the filter dropped — findMany, not
// findFirst.
router.get('/', asyncHandler(async (req, res) => {
  const { bookingId } = req.query;
  if (!bookingId) {
    const contracts = await prisma.contract.findMany({
      where: { accountId: req.membership.accountId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ contracts: contracts.map(serializeForOwner) });
  }

  const contract = await prisma.contract.findFirst({
    where: { accountId: req.membership.accountId, bookingId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ contract: contract ? serializeForOwner(contract) : null });
}));

// All contracts ever sent for a booking, including independent historical
// roots as well as replacements and addenda. The contract tab uses this for
// its permanent document stack; /:id/history remains the linked-chain view.
router.get('/documents', asyncHandler(async (req, res) => {
  const bookingId = String(req.query.bookingId || '').trim();
  if (!bookingId) return res.status(400).json({ error: 'bookingId is required.' });
  const contracts = await prisma.contract.findMany({
    where: { accountId: req.membership.accountId, bookingId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  res.json({ contracts: contracts.map(serializeForOwner) });
}));

// Walks previousContractId back from the given contract to build the full
// revision chain, oldest first. Bounded loop as a safety net against any
// data corruption forming a cycle — the chain is otherwise always linear
// (POST / rejects revising a contract that's already been revised).
router.get('/:id/history', asyncHandler(async (req, res) => {
  const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
  if (!contract || contract.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Contract not found.' });
  }

  const chain = [contract];
  let cursor = contract;
  for (let hop = 0; hop < 50 && cursor.previousContractId; hop += 1) {
    const previous = await prisma.contract.findUnique({ where: { id: cursor.previousContractId } });
    if (!previous) break;
    chain.push(previous);
    cursor = previous;
  }
  chain.reverse();
  res.json({ contracts: chain.map(serializeForOwner) });
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

async function deliverCompletedContract(contract) {
  const clientToken = generateToken();
  const ownerToken = generateToken();
  await prisma.contract.update({
    where: { id: contract.id },
    data: { clientTokenHash: hashToken(clientToken), ownerTokenHash: hashToken(ownerToken) },
  });
  const fromName = contract.snapshot?.businessInfo?.name || 'GigWorks';
  const recipients = [
    { to: contract.recipientEmail, url: `${frontendUrl()}/sign/${clientToken}`, name: contract.recipientName || 'there' },
    { to: contract.ownerEmail, url: `${frontendUrl()}/sign/${ownerToken}`, name: fromName },
  ];
  await Promise.allSettled(recipients.map(async ({ to, url, name }) => sendMail({
    tracking: { accountId: contract.accountId, bookingId: contract.bookingId },
    from: await resolveFromHeader({ accountId: contract.accountId, fromName, localPart: 'contracts' }),
    to,
    subject: `Completed contract #${contract.displayNumber} — ${fromName}`,
    html: buildActionEmailHtml({
      businessInfo: contract.snapshot?.businessInfo,
      heading: 'Your completed contract is ready',
      bodyHtml: `<p>Hi ${escapeHtml(name)},</p><p>Both parties have signed contract #${contract.displayNumber}. Use the secure link below to view it and download a PDF copy. GigWorks has preserved an integrity-checked completion record.</p>`,
      buttonText: 'View completed contract',
      buttonUrl: url,
    }),
  })));
}

router.post('/', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const { bookingId, recipientEmail, recipientName, snapshot, terms, manual, reason, expiration, previousContractId } = req.body || {};
  const normalizedRecipientEmail = normalizeValidEmail(recipientEmail);
  if (!bookingId?.trim() || !normalizedRecipientEmail || !snapshot) {
    return res.status(400).json({ error: 'bookingId, a valid recipient email, and snapshot are required.' });
  }
  if (manual && !reason?.trim()) {
    return res.status(400).json({ error: 'A reason is required to mark a contract as sent manually.' });
  }
  const resolvedExpiration = resolveLinkExpiration(expiration, { defaultPreset: '30_days' });
  if (resolvedExpiration.error) return res.status(400).json({ error: resolvedExpiration.error });

  let previousContract = null;
  if (previousContractId) {
    previousContract = await prisma.contract.findUnique({ where: { id: previousContractId } });
    if (!previousContract || previousContract.accountId !== req.membership.accountId || previousContract.bookingId !== bookingId) {
      return res.status(400).json({ error: 'Invalid contract to revise.' });
    }
    if (previousContract.clientSignedAt && previousContract.status !== 'fully_signed') {
      return res.status(409).json({ error: 'The client has signed this version. Complete or resolve it before creating another version.' });
    }
    if (previousContract.status === 'superseded') {
      return res.status(409).json({ error: 'This contract already has a newer version.' });
    }
    const alreadyRevised = await prisma.contract.findFirst({ where: { previousContractId } });
    if (alreadyRevised) {
      return res.status(409).json({ error: 'This contract has already been revised.' });
    }
  }

  const owner = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } });
  const normalizedOwnerEmail = normalizeValidEmail(owner?.email);
  if (!normalizedOwnerEmail) return res.status(400).json({ error: 'Your account needs a valid owner email address before contracts can be created.' });
  const clientToken = generateToken();
  // Generated up front (not only once the client signs) so the owner can
  // grab their own sign-from-anywhere link immediately too, e.g. to sign
  // right away before the client even opens theirs.
  const ownerToken = generateToken();
  const sentAt = new Date();
  const revisionNumber = previousContract ? previousContract.revisionNumber + 1 : 1;
  const documentType = !previousContract ? 'contract' : previousContract.status === 'fully_signed' ? 'addendum' : 'replacement';
  const documentHash = buildDocumentHash({ snapshot, terms, documentType, revisionNumber, previousContractId: previousContract?.id });
  const id = randomUUID();
  const rootContractId = previousContract?.rootContractId || previousContract?.id || id;
  const displayNumber = await nextDocumentDisplayNumber();
  const rootDisplayNumber = previousContract?.rootDisplayNumber || previousContract?.displayNumber || displayNumber;
  const documentNumber = String(displayNumber);

  const contract = await prisma.contract.create({
    data: {
      id,
      accountId: req.membership.accountId,
      bookingId,
      snapshot,
      rootContractId,
      documentNumber,
      displayNumber,
      rootDisplayNumber,
      documentType,
      documentHash,
      terms: terms || null,
      status: 'sent',
      recipientEmail: normalizedRecipientEmail,
      recipientName: recipientName || null,
      ownerEmail: normalizedOwnerEmail,
      clientTokenHash: hashToken(clientToken),
      ownerTokenHash: hashToken(ownerToken),
      clientLinkExpiresAt: resolvedExpiration.expiresAt,
      ownerLinkExpiresAt: resolvedExpiration.expiresAt,
      sentAt,
      revisionNumber,
      previousContractId: previousContract ? previousContract.id : null,
      // Delivered outside GigWorks (printed, texted, signed in person,
      // etc.) skips the actual email below, but still gets sign tokens so
      // the client can come sign online later if that's still useful.
      log: manual
        ? withLogEntry([], { type: 'manual_sent', actorEmail: normalizedOwnerEmail, note: reason.trim() })
        : withLogEntry([], { type: 'sent', actorEmail: normalizedOwnerEmail, note: null }),
    },
  });

  if (previousContract && documentType === 'replacement') {
    await prisma.contract.update({
      where: { id: previousContract.id },
      data: {
        status: 'superseded',
        log: withLogEntry(previousContract.log, { type: 'superseded', actorEmail: normalizedOwnerEmail, note: `Superseded in full by unsigned replacement version ${contract.revisionNumber}.` }),
      },
    });
  }

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
        tracking: { accountId: req.membership.accountId, bookingId },
        from: await resolveFromHeader({ accountId: req.membership.accountId, fromName, localPart: 'contracts' }),
        to: normalizedRecipientEmail,
        subject: `${documentType === 'addendum' ? 'Addendum' : 'Contract'} #${displayNumber} for your event — ${fromName}`,
        html: buildActionEmailHtml({
          businessInfo: snapshot.businessInfo,
          heading: 'Your contract is ready',
          bodyHtml: `<p>Hi ${escapeHtml(recipientName) || 'there'},</p><p>${documentType === 'addendum' ? `Addendum #${displayNumber} to contract #${rootDisplayNumber}` : `Contract #${displayNumber}`} is ready to review and sign. This link is unique to you — please don't forward it.</p>`,
          buttonText: 'Click here to view and sign your contract',
          buttonUrl: signUrl,
        }),
      });
    } catch (err) {
      console.error(`Failed to email contract ${contract.id}:`, err);
      emailError = 'Contract was created, but the email could not be sent — copy the link below to share it manually.';
    }
  }

  res.status(201).json({ contract: serializeForOwner(contract), signLink: signUrl, ownerSignLink: ownerSignUrl, emailError });
}));

router.post('/:id/owner-sign', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const { signatureName, signatureImage, consentAccepted } = req.body || {};
  if (!signatureName?.trim() || !signatureImage || consentAccepted !== true) {
    return res.status(400).json({ error: 'A name, drawn signature, and electronic-signature consent are required.' });
  }

  const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
  if (!contract || contract.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Contract not found.' });
  }
  if (contract.ownerSignedAt) {
    return res.status(400).json({ error: "You've already signed this contract." });
  }
  if (contract.status === 'superseded') {
    return res.status(409).json({ error: 'This contract has been replaced by a newer version.' });
  }

  const owner = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } });
  const evidence = requestEvidence(req);
  const documentHash = contract.documentHash || buildDocumentHash(contract);
  let updated = await prisma.contract.update({
    where: { id: contract.id },
    data: {
      ownerSignedAt: new Date(),
      ownerSignatureName: signatureName.trim(),
      ownerSignatureImage: signatureImage,
      ownerConsentVersion: ESIGN_CONSENT_VERSION,
      ownerSignedIp: evidence.ip,
      ownerSignedUserAgent: evidence.userAgent,
      documentHash,
      status: statusFor({ clientSigned: !!contract.clientSignedAt, ownerSigned: true }),
      log: withLogEntry(contract.log, { type: 'owner_signed', actorEmail: owner.email, note: null }),
    },
  });
  if (updated.status === 'fully_signed') {
    const completedAt = new Date();
    const completed = buildFinalRecord({ ...updated, completedAt });
    updated = await prisma.contract.update({ where: { id: updated.id }, data: { completedAt, finalRecord: completed.record, finalRecordHash: completed.hash } });
    await deliverCompletedContract(updated);
  }
  res.json({ contract: serializeForOwner(updated) });
}));

// Sent contracts are immutable. Editing happens by creating a linked new
// version so the exact document originally sent always remains viewable.
router.patch('/:id/terms', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const { terms } = req.body || {};
  const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
  if (!contract || contract.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Contract not found.' });
  }
  void terms;
  return res.status(409).json({ error: contract.clientSignedAt ? 'This contract is locked because the client has signed it.' : 'Create and send a new contract version to make changes.' });
}));

// Manual free-text log entries — same idea as a booking's Activity Log,
// but persisted server-side since Contract has no client-editable blob.
router.post('/:id/log', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
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
  if (!effectivePermissions(req.membership).manageBookings) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
  if (!contract || contract.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Contract not found.' });
  }
  if (contract.clientSignedAt) {
    return res.status(400).json({ error: 'The client has already signed this contract.' });
  }
  if (contract.status === 'superseded') {
    return res.status(409).json({ error: 'This contract has been replaced by a newer version.' });
  }
  const owner = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } });
  const resolvedExpiration = resolveLinkExpiration(req.body?.expiration, { defaultPreset: '30_days' });
  if (resolvedExpiration.error) return res.status(400).json({ error: resolvedExpiration.error });
  const clientToken = generateToken();
  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: {
      clientTokenHash: hashToken(clientToken),
      clientLinkExpiresAt: resolvedExpiration.expiresAt,
      log: withLogEntry(contract.log, { type: 'client_link_regenerated', actorEmail: owner.email, note: null }),
    },
  });
  res.json({ contract: serializeForOwner(updated), signLink: `${frontendUrl()}/sign/${clientToken}` });
}));

// ---- Public (unauthenticated, token-based) ----
// Mounted separately in index.js under a distinct path prefix (see below)
// so it never passes through the requireAuth/attachMembership pair above.

export const publicContractsRouter = Router();

async function findByToken(token, database = prisma) {
  const hash = hashToken(token);
  const contract = await database.contract.findFirst({
    where: { OR: [{ clientTokenHash: hash }, { ownerTokenHash: hash }] },
  });
  if (!contract) return null;
  const role = contract.clientTokenHash === hash ? 'client' : 'owner';
  const expiresAt = role === 'client' ? contract.clientLinkExpiresAt : contract.ownerLinkExpiresAt;
  return { contract, role, availability: linkAvailability({ expiresAt }) };
}

function rejectUnavailable(found, res) {
  if (found.availability === 'active' || found.contract.status === 'fully_signed') return false;
  res.status(410).json({ error: 'This contract link has expired. Please contact the sender for a new link.', reason: found.availability });
  return true;
}

publicContractsRouter.get('/:token', asyncHandler(async (req, res) => {
  const found = await findByToken(req.params.token);
  if (!found) return res.status(404).json({ error: 'This link is invalid or has expired.' });
  return res.status(401).json({ error: 'Confirm the email address this contract was sent to.', requiresEmail: true });
}));

publicContractsRouter.post('/:token/view', asyncHandler(async (req, res) => {
  const found = await findByToken(req.params.token);
  if (!found) return res.status(404).json({ error: 'This link is invalid or has expired.' });
  if (rejectUnavailable(found, res)) return;

  const { contract, role } = found;
  const normalizedEmail = normalizeValidEmail(req.body?.email);
  if (!normalizedEmail) return res.status(400).json({ error: 'Enter the email address this contract was sent to.' });
  const expectedEmail = role === 'client' ? contract.recipientEmail : contract.ownerEmail;
  if (expectedEmail && normalizedEmail !== expectedEmail.toLowerCase()) {
    return res.status(403).json({ error: "That email doesn't match this link." });
  }

  res.json({ contract: serializeForPublic(contract, role) });
}));

publicContractsRouter.post('/:token/submit', asyncHandler(async (req, res) => {
  const { email, signatureName, signatureImage, consentAccepted } = req.body || {};
  const normalizedEmail = normalizeValidEmail(email);
  if (!normalizedEmail || !signatureName?.trim() || !signatureImage || consentAccepted !== true) {
    return res.status(400).json({ error: 'The matching email, full name, drawn signature, and electronic-signature consent are required.' });
  }

  const result = await withSerializableTransaction(prisma, async (tx) => {
    const found = await findByToken(req.params.token, tx);
    if (!found) return { error: { status: 404, message: 'This link is invalid or has expired.' } };
    if (found.availability !== 'active') return { error: { status: 410, message: 'This contract link has expired. Please contact the sender for a new link.' } };

    const { contract, role } = found;
    if (contract.status === 'superseded') return { error: { status: 409, message: 'This contract has been replaced by a newer version and can no longer be signed.' } };
    const expectedEmail = role === 'client' ? contract.recipientEmail : contract.ownerEmail;
    if (expectedEmail && normalizedEmail !== expectedEmail.toLowerCase()) {
      return { error: { status: 403, message: "That email doesn't match this link." } };
    }

    const signedAt = role === 'client' ? contract.clientSignedAt : contract.ownerSignedAt;
    if (signedAt) return { error: { status: 409, message: "You've already signed this contract." } };

    const ownerAlreadySigned = !!contract.ownerSignedAt;
    const evidence = requestEvidence(req);
    const documentHash = contract.documentHash || buildDocumentHash(contract);
    const data = role === 'client'
      ? {
          clientSignedAt: new Date(),
          clientSignatureName: signatureName.trim(),
          clientSignatureImage: signatureImage,
          clientConsentVersion: ESIGN_CONSENT_VERSION,
          clientSignedIp: evidence.ip,
          clientSignedUserAgent: evidence.userAgent,
          documentHash,
          status: statusFor({ clientSigned: true, ownerSigned: ownerAlreadySigned }),
          log: withLogEntry(contract.log, { type: 'client_signed', actorEmail: contract.recipientEmail, note: null }),
        }
      : {
          ownerSignedAt: new Date(),
          ownerSignatureName: signatureName.trim(),
          ownerSignatureImage: signatureImage,
          ownerConsentVersion: ESIGN_CONSENT_VERSION,
          ownerSignedIp: evidence.ip,
          ownerSignedUserAgent: evidence.userAgent,
          documentHash,
          status: statusFor({ clientSigned: !!contract.clientSignedAt, ownerSigned: true }),
          log: withLogEntry(contract.log, { type: 'owner_signed', actorEmail: contract.ownerEmail, note: null }),
        };
    let updated = await tx.contract.update({ where: { id: contract.id }, data });
    if (updated.status === 'fully_signed') {
      const completedAt = new Date();
      const completed = buildFinalRecord({ ...updated, completedAt });
      updated = await tx.contract.update({ where: { id: contract.id }, data: { completedAt, finalRecord: completed.record, finalRecordHash: completed.hash } });
    }
    return { contract, role, ownerAlreadySigned, updated };
  });

  if (result.error) return res.status(result.error.status).json({ error: result.error.message });
  const { contract, role, ownerAlreadySigned, updated } = result;
  if (updated.status === 'fully_signed' && updated.finalRecordHash) await deliverCompletedContract(updated);

  if (role === 'client') {

    // Only nudge the owner if they haven't already signed — nothing to do
    // once both signatures are in. Their sign token was generated at send
    // time but only its hash was ever persisted (never emailed), so a fresh
    // one has to be issued here to put a working link in this notification.
    if (!ownerAlreadySigned) {
      const ownerToken = generateToken();
      const tokenRotated = await prisma.contract.updateMany({
        where: { id: contract.id, ownerSignedAt: null },
        data: { ownerTokenHash: hashToken(ownerToken) },
      });
      // The owner may have countersigned just after the serializable signing
      // transaction committed. In that case, do not rotate their link or send
      // a stale "your signature is next" notification.
      if (tokenRotated.count !== 1) {
        return res.json({ contract: serializeForPublic(updated, role) });
      }

      const fromName = contract.snapshot?.businessInfo?.name || 'GigWorks';
      const ownerSignUrl = `${frontendUrl()}/sign/${ownerToken}`;
      try {
        await sendMail({
          tracking: { accountId: contract.accountId, bookingId: contract.bookingId },
          from: await resolveFromHeader({ accountId: contract.accountId, fromName, localPart: 'contracts' }),
          to: contract.ownerEmail,
          subject: `${contract.recipientName || contract.recipientEmail} signed your contract — your signature is next`,
          html: buildActionEmailHtml({
            businessInfo: contract.snapshot?.businessInfo,
            heading: 'Your signature is next',
            bodyHtml: `<p>Good news — ${escapeHtml(contract.recipientName || contract.recipientEmail)} just signed the contract. You can also countersign it from within the app.</p>`,
            buttonText: 'Click here to view and sign the contract',
            buttonUrl: ownerSignUrl,
          }),
        });
      } catch (err) {
        // best effort — the owner can still countersign in-app even if this notification fails to send
        console.error(`Failed to email owner-sign notification for contract ${contract.id}:`, err);
      }
    }

    return res.json({ contract: serializeForPublic(updated, role) });
  }

  res.json({ contract: serializeForPublic(updated, role) });
}));

export default router;
