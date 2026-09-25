import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { createRateLimiter } from '../lib/rateLimiter.js';
import { generateToken, hashToken } from '../lib/resetToken.js';
import { normalizeValidEmail } from '../lib/emailAddress.js';
import { buildActionEmailHtml, escapeHtml, resolveFromHeader, sendMail } from '../lib/mailer.js';
import { normalizePrepFormSubmission } from '../lib/prepForms.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

function frontendUrl() { return process.env.FRONTEND_URL || 'http://localhost:5173'; }
function formUrl(link) { return `${frontendUrl()}/prep-request/${link.publicToken}`; }

async function ownedEvent(req, id) {
  const event = await prisma.event.findUnique({ where: { id } });
  return event?.accountId === req.membership.accountId ? event : null;
}

router.get('/:eventId', asyncHandler(async (req, res) => {
  const event = await ownedEvent(req, req.params.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  let link = await prisma.eventPrepFormLink.findUnique({ where: { eventId: event.id } });
  if (!link) {
    const token = generateToken();
    link = await prisma.eventPrepFormLink.create({ data: { accountId: event.accountId, eventId: event.id, tokenHash: hashToken(token), publicToken: token } });
  }
  res.json({ url: formUrl(link), unreadCount: event.prepFormUnreadCount, lastSubmittedAt: event.prepFormLastSubmittedAt });
}));

router.post('/:eventId/regenerate', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageEvents) return res.status(403).json({ error: 'Not authorized.' });
  const event = await ownedEvent(req, req.params.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  const token = generateToken();
  const link = await prisma.eventPrepFormLink.upsert({
    where: { eventId: event.id },
    update: { tokenHash: hashToken(token), publicToken: token },
    create: { accountId: event.accountId, eventId: event.id, tokenHash: hashToken(token), publicToken: token },
  });
  res.json({ url: formUrl(link) });
}));

router.post('/:eventId/email', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageEvents) return res.status(403).json({ error: 'Not authorized.' });
  const event = await ownedEvent(req, req.params.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  const email = normalizeValidEmail(req.body?.email || event.contactEmail);
  if (!email) return res.status(400).json({ error: 'Enter a valid recipient email address.' });
  let link = await prisma.eventPrepFormLink.findUnique({ where: { eventId: event.id } });
  if (!link) {
    const token = generateToken();
    link = await prisma.eventPrepFormLink.create({ data: { accountId: event.accountId, eventId: event.id, tokenHash: hashToken(token), publicToken: token } });
  }
  const accountData = await prisma.accountData.findUnique({ where: { accountId: event.accountId } });
  const businessInfo = accountData?.data?.businessInfo || {};
  const bandName = businessInfo.name || 'the band';
  try {
    await sendMail({
      tracking: { accountId: event.accountId, eventId: event.id },
      from: await resolveFromHeader({ accountId: event.accountId, fromName: bandName, localPart: 'events' }),
      to: email,
      subject: `${event.name || 'Your event'} — requests and preparation details`,
      html: buildActionEmailHtml({ businessInfo, heading: 'Share your event requests', bodyHtml: `<p>Please use this form to send your requests and preparation notes for ${escapeHtml(event.name || 'your event')}.</p><p>If you would rather discuss anything over the phone, please reach out directly to ${escapeHtml(bandName)}.</p>`, buttonText: 'Open request form', buttonUrl: formUrl(link) }),
    });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'The email could not be sent.' });
  }
  res.json({ ok: true, url: formUrl(link), email });
}));

router.post('/:eventId/reviewed', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageEvents) return res.status(403).json({ error: 'Not authorized.' });
  const event = await ownedEvent(req, req.params.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  await prisma.event.update({ where: { id: event.id }, data: { prepFormUnreadCount: 0 } });
  res.json({ ok: true });
}));

export const publicPrepFormsRouter = Router();
const submitLimiter = createRateLimiter('prep-form-submit', { windowMs: 60 * 60 * 1000, limit: 20, message: { error: 'Too many submissions from this network. Please try again later.' } });

async function publicContext(token) {
  const link = await prisma.eventPrepFormLink.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!link) return null;
  const [event, accountData] = await Promise.all([
    prisma.event.findUnique({ where: { id: link.eventId } }),
    prisma.accountData.findUnique({ where: { accountId: link.accountId } }),
  ]);
  if (!event || event.accountId !== link.accountId || event.deletedAt) return null;
  return { link, event, businessInfo: accountData?.data?.businessInfo || {} };
}

publicPrepFormsRouter.get('/:token', asyncHandler(async (req, res) => {
  const context = await publicContext(req.params.token);
  if (!context) return res.status(404).json({ error: 'This request form is no longer available.' });
  const { event, businessInfo } = context;
  res.json({
    businessInfo,
    event: { name: event.name || '', eventDate: event.eventDate || '', venueName: event.venue?.name || '' },
    prompts: (event.requests || []).filter((item) => item?.name).slice(0, 30).map((item) => ({ name: item.name, details: item.details || '' })),
  });
}));

publicPrepFormsRouter.post('/:token', submitLimiter, asyncHandler(async (req, res) => {
  const context = await publicContext(req.params.token);
  if (!context) return res.status(404).json({ error: 'This request form is no longer available.' });
  const normalized = normalizePrepFormSubmission(req.body);
  if (normalized.error) return res.status(400).json({ error: normalized.error });
  const { submitterName, items, notes } = normalized;

  const submissionId = randomUUID();
  const submittedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const current = await tx.event.findUnique({ where: { id: context.event.id } });
    const incoming = items.map((item) => ({ id: `req_${randomUUID()}`, ...item, documentId: null, documentName: null, source: 'client_prep_form', submittedBy: submitterName, submittedAt: submittedAt.toISOString(), submissionId }));
    if (notes) incoming.push({ id: `req_${randomUUID()}`, name: 'Client notes', details: notes, link: '', documentId: null, documentName: null, source: 'client_prep_form', submittedBy: submitterName, submittedAt: submittedAt.toISOString(), submissionId });
    await tx.event.update({ where: { id: current.id }, data: { requests: [...(Array.isArray(current.requests) ? current.requests : []), ...incoming], prepFormUnreadCount: { increment: 1 }, prepFormLastSubmittedAt: submittedAt } });
  });
  res.status(201).json({ ok: true });
}));

export default router;
