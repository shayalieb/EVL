import { withSerializableTransaction } from '../lib/serializableTransaction.js';
import { Router } from 'express';
import multer from 'multer';
import { requireCsrfHeader } from '../lib/csrf.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { attachMembership } from '../lib/membership.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { emailSendLimiter, requireEmailSendPermission } from '../lib/emailSendPolicy.js';
import { resolveFromHeader, resolveReplyDomain, sendMail, buildActionEmailHtml } from '../lib/mailer.js';
import { plainEmailHtml } from '../lib/inboxContent.js';
import { getResendClient } from '../lib/resend.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership), requireEmailSendPermission);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const attachmentSelect = { id: true, filename: true, contentType: true, size: true };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 3, fieldSize: 50000, fields: 2 } });
const unread = { direction: 'inbound', readAt: null };
const ownedThread = (req) => prisma.inboxThread.findFirst({ where: { id: req.params.id, accountId: req.membership.accountId } });

router.get('/summary', asyncHandler(async (req, res) => {
  const unreadCount = await prisma.inboxMessage.count({ where: { ...unread, thread: { accountId: req.membership.accountId, archivedAt: null } } });
  res.json({ unreadCount });
}));
router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(0, Math.min(100000, Number.parseInt(req.query.page, 10) || 0));
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 200) : '';
  const where = { accountId: req.membership.accountId, ...(req.query.archived === 'true' ? { archivedAt: { not: null } } : { archivedAt: null }),
    ...(req.query.unread === 'true' ? { messages: { some: unread } } : {}),
    ...(search ? { OR: [{ subject: { contains: search, mode: 'insensitive' } }, { contactEmail: { contains: search, mode: 'insensitive' } }] } : {}),
  };
  const threads = await prisma.inboxThread.findMany({ where, orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }], skip: page * 50, take: 51,
    include: { _count: { select: { messages: { where: unread } } } },
  });
  const domain = await prisma.emailDomain.findUnique({ where: { accountId: req.membership.accountId } });
  const replyDomain = await resolveReplyDomain(req.membership.accountId);
  res.json({ threads: threads.slice(0, 50).map(({ _count, ...thread }) => ({ ...thread, unreadCount: _count.messages })), hasMore: threads.length > 50,
    receivingAddress: domain?.receivingStatus === 'verified' ? `${domain.senderLocalPart || 'hello'}@${domain.domain}` : null,
    replyTrackingActive: !!replyDomain,
  });
}));
router.get('/:id', asyncHandler(async (req, res) => {
  const thread = await ownedThread(req);
  if (!thread) return res.status(404).json({ error: 'Conversation not found.' });
  const before = req.query.before ? new Date(req.query.before) : null;
  if (before && !Number.isFinite(before.getTime())) return res.status(400).json({ error: 'Invalid message cursor.' });
  const messages = await prisma.inboxMessage.findMany({ where: { threadId: thread.id, ...(before ? { createdAt: { lt: before } } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 101, include: { attachments: { select: attachmentSelect } } });
  res.json({ thread: { ...thread, messages: messages.slice(0, 100).reverse() }, hasMore: messages.length > 100 });
}));
router.patch('/:id', asyncHandler(async (req, res) => {
  const thread = await ownedThread(req);
  if (!thread) return res.status(404).json({ error: 'Conversation not found.' });
  const data = {};
  for (const [field, model] of [['bookingId', 'booking'], ['clientId', 'client']]) {
    if (req.body[field] === undefined) continue;
    const value = req.body[field];
    if (value !== null && (typeof value !== 'string' || !await prisma[model].findFirst({ where: { id: value, accountId: req.membership.accountId } }))) return res.status(400).json({ error: 'Choose a record from this account.' });
    data[field] = value;
  }
  if (typeof req.body.archived === 'boolean') data.archivedAt = req.body.archived ? new Date() : null;
  const updated = await prisma.inboxThread.update({ where: { id: thread.id }, data });
  if (req.body.archived === true) await prisma.reminder.updateMany({ where: { accountId: thread.accountId, relatedId: thread.id, ruleKey: 'inbox-unread' }, data: { completedAt: new Date(), emailEnabled: false } });
  res.json({ thread: updated });
}));
router.post('/:id/read', asyncHandler(async (req, res) => {
  const thread = await ownedThread(req);
  if (!thread) return res.status(404).json({ error: 'Conversation not found.' });
  // Read only the messages the browser actually displayed; a concurrent
  // incoming message stays unread and keeps its notification.
  const ids = Array.isArray(req.body.messageIds) ? req.body.messageIds.filter((id) => typeof id === 'string').slice(0, 100) : [];
  await withSerializableTransaction(prisma, async (tx) => {
    await tx.inboxMessage.updateMany({ where: { id: { in: ids }, threadId: thread.id, ...unread }, data: { readAt: new Date() } });
    if (!await tx.inboxMessage.count({ where: { threadId: thread.id, ...unread } })) {
      await tx.reminder.updateMany({ where: { accountId: thread.accountId, relatedId: thread.id, ruleKey: 'inbox-unread' }, data: { completedAt: new Date(), emailEnabled: false } });
    }
  });
  res.json({ ok: true });
}));
router.post('/:id/reply', requireCsrfHeader, emailSendLimiter, asyncHandler(async (req, res, next) => {
  if (!await ownedThread(req)) return res.status(404).json({ error: 'Conversation not found.' });
  next();
}), upload.array('attachments', 3), asyncHandler(async (req, res) => {
  const thread = await ownedThread(req);
  if (!thread) return res.status(404).json({ error: 'Conversation not found.' });
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > 50000) return res.status(400).json({ error: 'Enter a reply of at most 50,000 characters.' });
  const domain = await resolveReplyDomain(thread.accountId);
  if (!domain) return res.status(409).json({ error: 'Configure a receiving domain in Email Domain settings before replying from the inbox.' });
  const accountData = await prisma.accountData.findUnique({ where: { accountId: thread.accountId } });
  const businessInfo = accountData?.data?.businessInfo || {};
  const from = await resolveFromHeader({ accountId: thread.accountId, fromName: businessInfo.name, localPart: 'hello' });
  const files = req.files || [];
  const htmlBody = plainEmailHtml(body);
  const result = await sendMail({ from, to: thread.contactEmail, subject: /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`,
    html: buildActionEmailHtml({ businessInfo, bodyHtml: htmlBody }),
    attachments: files.map((f) => ({ filename: f.originalname, content: f.buffer, contentType: f.mimetype })),
    tracking: { accountId: thread.accountId, threadId: thread.id, body: htmlBody, storedAttachments: files.map((f) => ({ filename: f.originalname, contentType: f.mimetype, size: f.size, data: f.buffer })) },
  });
  res.json({ ok: true, replyTrackingActive: result.replyTrackingActive });
}));
router.get('/:id/attachments/:attachmentId', asyncHandler(async (req, res) => {
  const thread = await ownedThread(req);
  if (!thread) return res.status(404).json({ error: 'Conversation not found.' });
  const attachment = await prisma.inboxAttachment.findFirst({ where: { id: req.params.attachmentId, message: { threadId: thread.id } }, include: { message: { select: { providerMessageId: true } } } });
  if (!attachment) return res.status(404).json({ error: 'Attachment not found.' });
  res.set('Cache-Control', 'no-store');
  if (attachment.data) return res.json({ filename: attachment.filename, base64: attachment.data.toString('base64') });
  const { data, error } = await getResendClient().get(`/emails/receiving/${encodeURIComponent(attachment.message.providerMessageId)}/attachments/${encodeURIComponent(attachment.providerAttachmentId)}`);
  if (error || !data?.download_url) return res.status(502).json({ error: 'Attachment is unavailable. Please try again.' });
  const url = new URL(data.download_url);
  if (url.protocol !== 'https:') return res.status(502).json({ error: 'Attachment is unavailable.' });
  // URL comes from the authenticated provider API, never from email content.
  res.json({ url: url.href, filename: attachment.filename });
}));
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: 'Attach at most 3 files, up to 5 MB each.' });
  next(error);
});
export default router;
