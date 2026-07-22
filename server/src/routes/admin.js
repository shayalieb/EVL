import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachUser, requirePlatformAdmin, allPermissions } from '../lib/membership.js';
import { hashToken, generateToken } from '../lib/resetToken.js';
import { sendMail, buildFromHeader } from '../lib/mailer.js';

const router = Router();
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 3;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES } });

function uploadFiles(req, res, next) {
  upload.array('files', MAX_FILES)(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'One or more files are too large (10MB max).' });
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: `You can attach at most ${MAX_FILES} files.` });
    }
    if (err) return next(err);
    next();
  });
}

function attachmentsData(files) {
  return (files || []).map((f) => ({
    filename: f.originalname,
    contentType: f.mimetype || 'application/octet-stream',
    size: f.size,
    data: f.buffer,
  }));
}

router.use(requireAuth, asyncHandler(attachUser), requirePlatformAdmin);

function ownerOf(account) {
  const owner = account.memberships.find((m) => m.role === 'owner');
  return owner
    ? { firstName: owner.user.firstName, lastName: owner.user.lastName, email: owner.user.email, hasPassword: !!owner.user.passwordHash }
    : null;
}

function dataSummary(accountData) {
  const data = accountData?.data || {};
  return {
    contractors: (data.contractors || []).length,
    clients: (data.clients || []).length,
    events: (data.events || []).length,
    bookings: (data.bookings || []).length,
  };
}

router.get('/accounts', asyncHandler(async (req, res) => {
  const accounts = await prisma.account.findMany({
    include: { memberships: { include: { user: true } }, accountData: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      disabledAt: a.disabledAt,
      owner: ownerOf(a),
      memberCount: a.memberships.length,
      dataSummary: dataSummary(a.accountData),
    })),
  });
}));

// Shared by POST /accounts and POST /platform-admins/invite — both create a
// brand-new User (+ their own Account/Membership, so they're never stuck on
// NoAccountAccessPage) with no password, then email a set-your-password
// link reusing the exact forgot-password reset mechanism.
async function createInvitedUser({ firstName, lastName, email }, { grantAdmin = false } = {}) {
  const normalizedEmail = email.trim().toLowerCase();

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: normalizedEmail,
          passwordHash: null,
          isPlatformAdmin: grantAdmin,
        },
      });
      const account = await tx.account.create({ data: {} });
      await tx.membership.create({
        data: { userId: newUser.id, accountId: account.id, role: 'owner', permissions: allPermissions() },
      });
      return newUser;
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw Object.assign(new Error('An account with that email already exists.'), { status: 409 });
    }
    throw err;
  }

  const token = generateToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });
  const setupUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
  try {
    await sendMail({
      from: buildFromHeader(),
      to: normalizedEmail,
      subject: grantAdmin ? "You've been invited to GigWorks as an admin" : "You've been invited to GigWorks",
      html: `<p>An account has been created for you${grantAdmin ? ' with admin access' : ''}. Click below to set your password and get started. This link expires in 1 hour.</p><p><a href="${setupUrl}">${setupUrl}</a></p>`,
    });
  } catch {
    // best effort — the account still exists even if the invite email fails to send
  }

  return user;
}

router.post('/accounts', asyncHandler(async (req, res) => {
  const { firstName, lastName, email } = req.body || {};
  if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'First name, last name, and email are required.' });
  }
  try {
    await createInvitedUser({ firstName, lastName, email });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
  res.status(201).json({ ok: true });
}));

router.patch('/accounts/:id', asyncHandler(async (req, res) => {
  const { disabled } = req.body || {};
  if (typeof disabled !== 'boolean') {
    return res.status(400).json({ error: 'disabled must be a boolean.' });
  }
  const account = await prisma.account.update({
    where: { id: req.params.id },
    data: { disabledAt: disabled ? new Date() : null },
  });
  res.json({ ok: true, disabledAt: account.disabledAt });
}));

router.delete('/accounts/:id', asyncHandler(async (req, res) => {
  // Deleting just the Account would cascade-remove its Memberships but leave
  // the member Users behind — since User.email is unique, that silently
  // blocks re-inviting the same email later. Delete the users first so their
  // email frees up.
  const memberships = await prisma.membership.findMany({
    where: { accountId: req.params.id },
    select: { userId: true },
  });
  await prisma.$transaction([
    prisma.user.deleteMany({ where: { id: { in: memberships.map((m) => m.userId) } } }),
    prisma.account.delete({ where: { id: req.params.id } }),
  ]);
  res.json({ ok: true });
}));

function serializeThread(thread) {
  const unreadFromUser = thread.messages.filter((m) => m.direction === 'user' && !m.readAt).length;
  return {
    id: thread.id,
    subject: thread.subject,
    status: thread.status,
    lastMessageAt: thread.lastMessageAt,
    createdAt: thread.createdAt,
    unreadFromUser,
    account: { id: thread.account.id, owner: ownerOf(thread.account) },
  };
}

const attachmentSelect = { select: { id: true, filename: true, contentType: true, size: true } };

router.get('/support/threads', asyncHandler(async (req, res) => {
  const threads = await prisma.supportThread.findMany({
    include: { messages: { include: { attachments: attachmentSelect } }, account: { include: { memberships: { include: { user: true } } } } },
    orderBy: { lastMessageAt: 'desc' },
  });
  res.json({ threads: threads.map(serializeThread) });
}));

function serializeNote(note) {
  return { id: note.id, body: note.body, createdAt: note.createdAt, author: { firstName: note.author.firstName, lastName: note.author.lastName } };
}

router.get('/support/threads/:id', asyncHandler(async (req, res) => {
  const thread = await prisma.supportThread.findUnique({
    where: { id: req.params.id },
    include: {
      messages: { orderBy: { createdAt: 'asc' }, include: { attachments: attachmentSelect } },
      notes: { orderBy: { createdAt: 'asc' }, include: { author: true } },
      account: { include: { memberships: { include: { user: true } } } },
    },
  });
  if (!thread) return res.status(404).json({ error: 'Thread not found.' });
  res.json({ thread: { ...serializeThread(thread), messages: thread.messages, notes: thread.notes.map(serializeNote) } });
}));

router.patch('/support/threads/:id/read', asyncHandler(async (req, res) => {
  const thread = await prisma.supportThread.findUnique({ where: { id: req.params.id } });
  if (!thread) return res.status(404).json({ error: 'Thread not found.' });
  await prisma.supportMessage.updateMany({
    where: { threadId: thread.id, direction: 'user', readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
}));

router.post('/support/threads/:id/notes', asyncHandler(async (req, res) => {
  const { body } = req.body || {};
  if (!body?.trim()) return res.status(400).json({ error: 'Note body is required.' });

  const thread = await prisma.supportThread.findUnique({ where: { id: req.params.id } });
  if (!thread) return res.status(404).json({ error: 'Thread not found.' });

  const note = await prisma.supportNote.create({
    data: { threadId: thread.id, authorUserId: req.session.userId, body: body.trim() },
    include: { author: true },
  });
  res.status(201).json({ note: serializeNote(note) });
}));

router.post('/support/threads/:id/messages', uploadFiles, asyncHandler(async (req, res) => {
  const { body } = req.body || {};
  if (!body?.trim()) return res.status(400).json({ error: 'Message body is required.' });

  let thread = await prisma.supportThread.findUnique({
    where: { id: req.params.id },
    include: { account: { include: { memberships: { include: { user: true } } } } },
  });
  if (!thread) return res.status(404).json({ error: 'Thread not found.' });

  if (!thread.replyToAlias && process.env.RESEND_INBOUND_DOMAIN) {
    thread = await prisma.supportThread.update({
      where: { id: thread.id },
      data: { replyToAlias: `reply+support-${thread.id}@${process.env.RESEND_INBOUND_DOMAIN}` },
      include: { account: { include: { memberships: { include: { user: true } } } } },
    });
  }

  const message = await prisma.supportMessage.create({
    data: {
      threadId: thread.id,
      direction: 'admin',
      senderUserId: req.session.userId,
      body: body.trim(),
      attachments: { create: attachmentsData(req.files) },
    },
    include: { attachments: attachmentSelect },
  });
  await prisma.supportThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });

  const owner = thread.account.memberships.find((m) => m.role === 'owner');
  if (owner) {
    const lastOutbound = await prisma.supportMessage.findFirst({
      where: { threadId: thread.id, direction: 'admin', resendMessageId: { not: null }, id: { not: message.id } },
      orderBy: { createdAt: 'desc' },
    });
    const headers = lastOutbound?.resendMessageId
      ? { 'In-Reply-To': lastOutbound.resendMessageId, References: lastOutbound.resendMessageId }
      : undefined;
    const attachments = (req.files || []).map((f) => ({
      content: f.buffer.toString('base64'),
      filename: f.originalname,
      contentType: f.mimetype || 'application/octet-stream',
    }));

    try {
      const sent = await sendMail({
        from: buildFromHeader(),
        to: owner.user.email,
        subject: `Re: ${thread.subject}`,
        html: `<p>You have a new reply to your support request "${thread.subject}":</p><p>${body.trim()}</p><p>Reply to this email to continue the conversation, or sign in to GigWorks.</p>`,
        replyTo: thread.replyToAlias || undefined,
        headers,
        attachments: attachments.length ? attachments : undefined,
      });
      if (sent?.data?.id) {
        await prisma.supportMessage.update({ where: { id: message.id }, data: { resendMessageId: sent.data.id } });
      }
    } catch {
      // best effort
    }
  }

  res.status(201).json({ message });
}));

router.patch('/support/threads/:id', asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!['open', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'status must be "open" or "closed".' });
  }
  const thread = await prisma.supportThread.update({ where: { id: req.params.id }, data: { status } });
  res.json({ ok: true, status: thread.status });
}));

router.get('/support/attachments/:id/download', asyncHandler(async (req, res) => {
  const attachment = await prisma.supportAttachment.findUnique({ where: { id: req.params.id } });
  if (!attachment) return res.status(404).json({ error: 'Attachment not found.' });
  res.setHeader('Content-Type', attachment.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename.replace(/"/g, '')}"`);
  res.send(attachment.data);
}));

function serializeAdmin(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    isPlatformOwner: user.isPlatformOwner,
    createdAt: user.createdAt,
  };
}

router.get('/platform-admins', asyncHandler(async (req, res) => {
  const admins = await prisma.user.findMany({
    where: { isPlatformAdmin: true },
    orderBy: { isPlatformOwner: 'desc' },
  });
  res.json({ admins: admins.map(serializeAdmin) });
}));

// Grants access to an email that already has an account — the account
// itself still isn't self-serve creatable through this route.
router.post('/platform-admins', asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required.' });

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return res.status(404).json({ error: 'No account exists with that email yet. Use "Invite New Admin" instead.' });

  const updated = await prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
  res.status(201).json({ admin: serializeAdmin(updated) });
}));

// Combines account creation + admin grant in one step, for someone who
// doesn't have an account yet.
router.post('/platform-admins/invite', asyncHandler(async (req, res) => {
  const { firstName, lastName, email } = req.body || {};
  if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'First name, last name, and email are required.' });
  }
  let user;
  try {
    user = await createInvitedUser({ firstName, lastName, email }, { grantAdmin: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
  res.status(201).json({ admin: serializeAdmin(user) });
}));

router.delete('/platform-admins/:id', asyncHandler(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'User not found.' });
  // The owner is permanently protected — checked on the target, not the
  // caller, so this holds no matter who's attempting the revoke.
  if (target.isPlatformOwner) {
    return res.status(403).json({ error: "The owner's access can't be removed." });
  }

  await prisma.user.update({ where: { id: target.id }, data: { isPlatformAdmin: false } });
  res.json({ ok: true });
}));

export default router;
