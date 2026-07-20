import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { sendMail, buildFromHeader } from '../lib/mailer.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

async function notifyAdmin(thread, message) {
  try {
    await sendMail({
      from: buildFromHeader(),
      to: process.env.SUPPORT_NOTIFICATION_EMAIL || 'shayalieberman@gmail.com',
      subject: `[Support] ${thread.subject}`,
      html: `<p>New support message:</p><p>${message}</p>`,
    });
  } catch {
    // best effort — the message is already saved regardless of whether this send succeeds
  }
}

router.get('/threads', asyncHandler(async (req, res) => {
  const threads = await prisma.supportThread.findMany({
    where: { accountId: req.membership.accountId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
    orderBy: { lastMessageAt: 'desc' },
  });
  res.json({ threads });
}));

router.post('/threads', asyncHandler(async (req, res) => {
  const { subject, body } = req.body || {};
  if (!subject?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'Subject and message are required.' });
  }

  const thread = await prisma.supportThread.create({
    data: {
      accountId: req.membership.accountId,
      subject: subject.trim(),
      messages: { create: { direction: 'user', senderUserId: req.session.userId, body: body.trim() } },
    },
    include: { messages: true },
  });

  await notifyAdmin(thread, body.trim());
  res.status(201).json({ thread });
}));

router.post('/threads/:id/messages', asyncHandler(async (req, res) => {
  const { body } = req.body || {};
  if (!body?.trim()) return res.status(400).json({ error: 'Message body is required.' });

  const thread = await prisma.supportThread.findUnique({ where: { id: req.params.id } });
  if (!thread || thread.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Thread not found.' });
  }

  const message = await prisma.supportMessage.create({
    data: { threadId: thread.id, direction: 'user', senderUserId: req.session.userId, body: body.trim() },
  });
  // A user replying to a closed thread means the issue isn't actually
  // resolved — reopen it so it doesn't sit invisible in the admin's closed list.
  await prisma.supportThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date(), status: 'open' } });

  await notifyAdmin(thread, body.trim());
  res.status(201).json({ message });
}));

router.patch('/threads/:id/read', asyncHandler(async (req, res) => {
  const thread = await prisma.supportThread.findUnique({ where: { id: req.params.id } });
  if (!thread || thread.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Thread not found.' });
  }
  await prisma.supportMessage.updateMany({
    where: { threadId: thread.id, direction: 'admin', readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
}));

export default router;
