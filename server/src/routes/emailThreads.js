import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { buildFromHeader, sendMail } from '../lib/mailer.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

function serializeMessage(m) {
  return {
    id: m.id,
    direction: m.direction,
    fromAddress: m.fromAddress,
    toAddress: m.toAddress,
    subject: m.subject,
    body: m.body,
    templateId: m.templateId,
    sentByUserId: m.sentByUserId,
    readAt: m.readAt,
    createdAt: m.createdAt,
  };
}

router.post('/send', asyncHandler(async (req, res) => {
  const { eventId, contractorId, contractorEmail, subject, body, templateId, fromName, documentIds } = req.body || {};
  if (!eventId?.trim() || !contractorId?.trim() || !contractorEmail?.trim() || !subject?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'eventId, contractorId, contractorEmail, subject, and body are required.' });
  }

  const { accountId } = req.membership;

  let attachments;
  if (documentIds?.length) {
    const documents = await prisma.eventDocument.findMany({ where: { id: { in: documentIds }, accountId } });
    attachments = documents.map((d) => ({
      content: d.data.toString('base64'),
      filename: d.filename,
      contentType: d.contentType,
    }));
  }
  let thread = await prisma.emailThread.upsert({
    where: { accountId_eventId_contractorId: { accountId, eventId, contractorId } },
    update: { contractorEmail },
    create: { accountId, eventId, contractorId, contractorEmail },
  });

  if (!thread.replyToAlias && process.env.RESEND_INBOUND_DOMAIN) {
    thread = await prisma.emailThread.update({
      where: { id: thread.id },
      data: { replyToAlias: `reply+${thread.id}@${process.env.RESEND_INBOUND_DOMAIN}` },
    });
  }

  const lastMessage = await prisma.emailMessage.findFirst({
    where: { threadId: thread.id },
    orderBy: { createdAt: 'desc' },
  });

  const fromAddress = buildFromHeader(fromName);
  const headers = lastMessage?.resendMessageId
    ? { 'In-Reply-To': lastMessage.resendMessageId, References: lastMessage.resendMessageId }
    : undefined;

  let sent;
  try {
    sent = await sendMail({ from: fromAddress, to: contractorEmail, subject, html: body, replyTo: thread.replyToAlias, headers, attachments });
  } catch {
    return res.status(503).json({ error: 'Email sending is not configured yet.' });
  }
  if (sent.error) return res.status(502).json({ error: sent.error.message || 'Failed to send email.' });

  const message = await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      direction: 'outbound',
      fromAddress,
      toAddress: contractorEmail,
      subject,
      body,
      templateId: templateId || null,
      sentByUserId: req.session.userId,
      resendMessageId: sent.data?.id || null,
    },
  });
  await prisma.emailThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date(), subjectHint: thread.subjectHint || subject },
  });

  res.json({ ok: true, threadId: thread.id, messageId: message.id, resendId: sent.data?.id });
}));

router.get('/', asyncHandler(async (req, res) => {
  const { eventId, contractorId } = req.query;
  if (!eventId || !contractorId) {
    return res.status(400).json({ error: 'eventId and contractorId are required.' });
  }

  const thread = await prisma.emailThread.findUnique({
    where: { accountId_eventId_contractorId: { accountId: req.membership.accountId, eventId, contractorId } },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!thread) return res.json({ thread: null });

  const unreadCount = thread.messages.filter((m) => m.direction === 'inbound' && !m.readAt).length;
  res.json({
    thread: {
      id: thread.id,
      replyToAlias: thread.replyToAlias,
      unreadCount,
      lastMessageAt: thread.lastMessageAt,
      messages: thread.messages.map(serializeMessage),
    },
  });
}));

router.get('/summary', asyncHandler(async (req, res) => {
  const { eventId } = req.query;
  if (!eventId) return res.status(400).json({ error: 'eventId is required.' });

  const threads = await prisma.emailThread.findMany({
    where: { accountId: req.membership.accountId, eventId },
    include: { messages: { select: { direction: true, readAt: true } } },
  });

  const summaries = {};
  for (const thread of threads) {
    summaries[thread.contractorId] = {
      hasThread: true,
      unreadCount: thread.messages.filter((m) => m.direction === 'inbound' && !m.readAt).length,
      lastMessageAt: thread.lastMessageAt,
    };
  }
  res.json({ summaries });
}));

router.patch('/:threadId/read', asyncHandler(async (req, res) => {
  const thread = await prisma.emailThread.findUnique({ where: { id: req.params.threadId } });
  if (!thread || thread.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Thread not found.' });
  }
  await prisma.emailMessage.updateMany({
    where: { threadId: thread.id, direction: 'inbound', readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
}));

export default router;
