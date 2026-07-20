import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachUser, requirePlatformAdmin, allPermissions } from '../lib/membership.js';
import { hashToken, generateToken } from '../lib/resetToken.js';
import { sendMail, buildFromHeader } from '../lib/mailer.js';

const router = Router();
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

router.use(requireAuth, asyncHandler(attachUser), requirePlatformAdmin);

function ownerOf(account) {
  const owner = account.memberships.find((m) => m.role === 'owner');
  return owner ? { firstName: owner.user.firstName, lastName: owner.user.lastName, email: owner.user.email } : null;
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

router.post('/accounts', asyncHandler(async (req, res) => {
  const { firstName, lastName, email } = req.body || {};
  if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'First name, last name, and email are required.' });
  }
  const normalizedEmail = email.trim().toLowerCase();

  let user;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { firstName: firstName.trim(), lastName: lastName.trim(), email: normalizedEmail, passwordHash: null },
      });
      const account = await tx.account.create({ data: {} });
      await tx.membership.create({
        data: { userId: newUser.id, accountId: account.id, role: 'owner', permissions: allPermissions() },
      });
      return newUser;
    });
    user = created;
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'An account with that email already exists.' });
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
      subject: "You've been invited to GigWorks",
      html: `<p>An account has been created for you. Click below to set your password and get started. This link expires in 1 hour.</p><p><a href="${setupUrl}">${setupUrl}</a></p>`,
    });
  } catch {
    // best effort — the account still exists even if the invite email fails to send
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
  await prisma.account.delete({ where: { id: req.params.id } });
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

router.get('/support/threads', asyncHandler(async (req, res) => {
  const threads = await prisma.supportThread.findMany({
    include: { messages: true, account: { include: { memberships: { include: { user: true } } } } },
    orderBy: { lastMessageAt: 'desc' },
  });
  res.json({ threads: threads.map(serializeThread) });
}));

router.get('/support/threads/:id', asyncHandler(async (req, res) => {
  const thread = await prisma.supportThread.findUnique({
    where: { id: req.params.id },
    include: { messages: { orderBy: { createdAt: 'asc' } }, account: { include: { memberships: { include: { user: true } } } } },
  });
  if (!thread) return res.status(404).json({ error: 'Thread not found.' });
  res.json({ thread: { ...serializeThread(thread), messages: thread.messages } });
}));

router.post('/support/threads/:id/messages', asyncHandler(async (req, res) => {
  const { body } = req.body || {};
  if (!body?.trim()) return res.status(400).json({ error: 'Message body is required.' });

  const thread = await prisma.supportThread.findUnique({
    where: { id: req.params.id },
    include: { account: { include: { memberships: { include: { user: true } } } } },
  });
  if (!thread) return res.status(404).json({ error: 'Thread not found.' });

  const message = await prisma.supportMessage.create({
    data: { threadId: thread.id, direction: 'admin', senderUserId: req.session.userId, body: body.trim() },
  });
  await prisma.supportThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });

  const owner = thread.account.memberships.find((m) => m.role === 'owner');
  if (owner) {
    try {
      await sendMail({
        from: buildFromHeader(),
        to: owner.user.email,
        subject: `Re: ${thread.subject}`,
        html: `<p>You have a new reply to your support request "${thread.subject}":</p><p>${body.trim()}</p><p>Sign in to GigWorks to continue the conversation.</p>`,
      });
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

export default router;
