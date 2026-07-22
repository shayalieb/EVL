import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { sendMail, buildFromHeader } from '../lib/mailer.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 3;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES } });

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

router.get('/threads', asyncHandler(async (req, res) => {
  const threads = await prisma.supportThread.findMany({
    where: { accountId: req.membership.accountId },
    include: { messages: { orderBy: { createdAt: 'asc' }, include: { attachments: { select: { id: true, filename: true, contentType: true, size: true } } } } },
    orderBy: { lastMessageAt: 'desc' },
  });
  res.json({ threads });
}));

router.post('/threads', uploadFiles, asyncHandler(async (req, res) => {
  const { subject, body } = req.body || {};
  if (!subject?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'Subject and message are required.' });
  }

  let thread = await prisma.supportThread.create({
    data: {
      accountId: req.membership.accountId,
      subject: subject.trim(),
      messages: {
        create: {
          direction: 'user',
          senderUserId: req.session.userId,
          body: body.trim(),
          attachments: { create: attachmentsData(req.files) },
        },
      },
    },
    include: { messages: { include: { attachments: { select: { id: true, filename: true, contentType: true, size: true } } } } },
  });

  if (!thread.replyToAlias && process.env.RESEND_INBOUND_DOMAIN) {
    thread = await prisma.supportThread.update({
      where: { id: thread.id },
      data: { replyToAlias: `reply+support-${thread.id}@${process.env.RESEND_INBOUND_DOMAIN}` },
      include: { messages: { include: { attachments: { select: { id: true, filename: true, contentType: true, size: true } } } } },
    });
  }

  await notifyAdmin(thread, body.trim());
  res.status(201).json({ thread });
}));

router.post('/threads/:id/messages', uploadFiles, asyncHandler(async (req, res) => {
  const { body } = req.body || {};
  if (!body?.trim()) return res.status(400).json({ error: 'Message body is required.' });

  const thread = await prisma.supportThread.findUnique({ where: { id: req.params.id } });
  if (!thread || thread.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Thread not found.' });
  }

  const message = await prisma.supportMessage.create({
    data: {
      threadId: thread.id,
      direction: 'user',
      senderUserId: req.session.userId,
      body: body.trim(),
      attachments: { create: attachmentsData(req.files) },
    },
    include: { attachments: { select: { id: true, filename: true, contentType: true, size: true } } },
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

router.get('/attachments/:id/download', asyncHandler(async (req, res) => {
  const attachment = await prisma.supportAttachment.findUnique({
    where: { id: req.params.id },
    include: { message: { include: { thread: true } } },
  });
  if (!attachment || attachment.message.thread.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Attachment not found.' });
  }
  res.setHeader('Content-Type', attachment.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename.replace(/"/g, '')}"`);
  res.send(attachment.data);
}));

export default router;
