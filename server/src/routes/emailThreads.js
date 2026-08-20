import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { resolveFromHeader, resolveReplyDomain, sendMail, buildActionEmailHtml, buildInlineImageAttachments } from '../lib/mailer.js';
import { downloadFileBuffer } from '../lib/fileStorage.js';

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
    aiClassification: m.aiClassification,
  };
}

router.post('/send', asyncHandler(async (req, res) => {
  const { eventId, contractorId, contractorEmail, subject, body, templateId, fromName, documentIds, pdfAttachment, inlineImages } = req.body || {};
  if (!eventId?.trim() || !contractorId?.trim() || !contractorEmail?.trim() || !subject?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'eventId, contractorId, contractorEmail, subject, and body are required.' });
  }

  const { accountId } = req.membership;

  let attachments;
  if (documentIds?.length) {
    const documents = await prisma.eventDocument.findMany({ where: { id: { in: documentIds }, accountId } });
    attachments = await Promise.all(documents.map(async (d) => ({
      content: (d.storageKey ? await downloadFileBuffer(d.storageKey) : d.data).toString('base64'),
      filename: d.filename,
      contentType: d.contentType,
    })));
  }
  // Ad hoc attachment (e.g. a freshly generated prep-sheet PDF) that isn't
  // stored as an EventDocument — sent as base64 straight from the client.
  if (pdfAttachment?.base64) {
    attachments = [...(attachments || []), {
      content: pdfAttachment.base64,
      filename: pdfAttachment.filename || 'prep-sheet.pdf',
      contentType: pdfAttachment.contentType || 'application/pdf',
    }];
  }
  // Inline images (e.g. a stage plot page thumbnail) the client's own HTML
  // body already references via cid: — see buildInlineImageAttachments.
  attachments = [...(attachments || []), ...buildInlineImageAttachments(inlineImages)];
  let thread = await prisma.emailThread.upsert({
    where: { accountId_eventId_contractorId: { accountId, eventId, contractorId } },
    update: { contractorEmail },
    create: { accountId, eventId, contractorId, contractorEmail },
  });

  if (!thread.replyToAlias) {
    const replyDomain = await resolveReplyDomain(accountId);
    if (replyDomain) {
      thread = await prisma.emailThread.update({
        where: { id: thread.id },
        data: { replyToAlias: `reply+${thread.id}@${replyDomain}` },
      });
    }
  }

  const lastMessage = await prisma.emailMessage.findFirst({
    where: { threadId: thread.id },
    orderBy: { createdAt: 'desc' },
  });

  // Both the From display name and local-part follow the sending template's
  // own configuration (see EmailTemplatesPage.jsx's "Sends As" fields) when
  // one was used — display name works regardless of whether the account has
  // a verified domain, local-part only takes effect once one's verified
  // (resolveFromHeader falls back to the platform default address
  // otherwise). Falls back to the request's own fromName/'hello' for ad hoc
  // (no template) sends.
  let localPart = 'hello';
  let effectiveFromName = fromName;
  const accountData = await prisma.accountData.findUnique({ where: { accountId } });
  if (templateId) {
    const template = accountData?.data?.emailTemplates?.find((t) => t.id === templateId);
    if (template?.fromLocalPart) localPart = template.fromLocalPart;
    if (template?.fromDisplayName) effectiveFromName = template.fromDisplayName;
  }
  const businessInfo = accountData?.data?.businessInfo || {};
  const fromAddress = await resolveFromHeader({ accountId, fromName: effectiveFromName, localPart });
  const headers = lastMessage?.resendMessageId
    ? { 'In-Reply-To': lastMessage.resendMessageId, References: lastMessage.resendMessageId }
    : undefined;

  let sent;
  try {
    // bodyHtml, not escapeHtml(body) — this is already-composed HTML from
    // the client (free text or a loaded email template), same trust
    // boundary as every other buildActionEmailHtml caller.
    // Wider than buildActionEmailHtml's 480px default — this route carries
    // richer content than a plain action-link notification (a prep sheet's
    // tables, a Stage Plot page image), which get uncomfortably squeezed
    // (or, for the image, can visibly clip in Outlook) at the narrower
    // width. See that function's own comment for the full reasoning.
    sent = await sendMail({ from: fromAddress, to: contractorEmail, subject, html: buildActionEmailHtml({ businessInfo, bodyHtml: body, maxWidth: 640 }), replyTo: thread.replyToAlias, headers, attachments });
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

// Logs a non-email touchpoint (phone call, text, in-person, etc.) into the
// same thread as a manual EmailMessage — reuses the existing model instead
// of a parallel table since `direction` is a plain string, not an enum.
router.post('/log', asyncHandler(async (req, res) => {
  const { eventId, contractorId, contractorEmail, channel, note } = req.body || {};
  if (!eventId?.trim() || !contractorId?.trim() || !contractorEmail?.trim() || !note?.trim()) {
    return res.status(400).json({ error: 'eventId, contractorId, contractorEmail, and note are required.' });
  }

  const { accountId } = req.membership;
  const thread = await prisma.emailThread.upsert({
    where: { accountId_eventId_contractorId: { accountId, eventId, contractorId } },
    update: { contractorEmail },
    create: { accountId, eventId, contractorId, contractorEmail },
  });

  const message = await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      direction: 'manual',
      fromAddress: 'internal',
      toAddress: contractorEmail,
      subject: channel?.trim() || 'Manual entry',
      body: note.trim(),
      sentByUserId: req.session.userId,
    },
  });
  await prisma.emailThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });

  res.json({ ok: true, threadId: thread.id, messageId: message.id });
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

// Same shape as GET /summary above, but account-wide instead of scoped to
// one event — the roster page (ContractorsPage.jsx) needs "was this
// contractor contacted at all, on any gig" at a glance, not "on this one
// event." A contractor can have threads on several events; this collapses
// them to one row per contractor (latest lastMessageAt across all of them,
// unread counts summed). Grouped in JS, not a Prisma groupBy — groupBy
// can't include the nested `messages` needed for the unread count in the
// same query, and GET /summary above already solves that the same way.
router.get('/roster-summary', asyncHandler(async (req, res) => {
  const threads = await prisma.emailThread.findMany({
    where: { accountId: req.membership.accountId },
    include: { messages: { select: { direction: true, readAt: true } } },
  });

  const summaries = {};
  for (const thread of threads) {
    const unread = thread.messages.filter((m) => m.direction === 'inbound' && !m.readAt).length;
    const existing = summaries[thread.contractorId];
    if (!existing) {
      summaries[thread.contractorId] = { hasThread: true, unreadCount: unread, lastMessageAt: thread.lastMessageAt, threadCount: 1 };
    } else {
      existing.unreadCount += unread;
      existing.threadCount += 1;
      if (thread.lastMessageAt > existing.lastMessageAt) existing.lastMessageAt = thread.lastMessageAt;
    }
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
