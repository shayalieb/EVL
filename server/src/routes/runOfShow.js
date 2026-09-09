import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { requireVertical } from '../lib/verticals.js';
import { createRateLimiter } from '../lib/rateLimiter.js';
import { generateToken, hashToken } from '../lib/resetToken.js';
import { linkAvailability, resolveLinkExpiration } from '../lib/linkExpiration.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership), requireVertical('band_orchestra'));

function shareUrl(token) {
  return `${process.env.FRONTEND_URL || 'http://localhost:5173'}/run-of-show/${token}`;
}

function serializeShare(share) {
  if (!share) return null;
  return {
    id: share.id,
    url: shareUrl(share.publicToken),
    expiresAt: share.expiresAt,
    status: linkAvailability(share),
    lastViewedAt: share.lastViewedAt,
    viewCount: share.viewCount,
    updatedAt: share.updatedAt,
  };
}

async function loadOwnedEvent(accountId, eventId) {
  return prisma.event.findFirst({ where: { id: eventId, accountId, deletedAt: null }, select: { id: true, schedule: true, updatedAt: true } });
}

router.get('/:eventId/share', asyncHandler(async (req, res) => {
  const event = await loadOwnedEvent(req.membership.accountId, req.params.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  const share = await prisma.runOfShowShare.findUnique({ where: { eventId: event.id } });
  res.json({ share: serializeShare(share) });
}));

router.post('/:eventId/share', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageEvents) return res.status(403).json({ error: 'Not authorized.' });
  const event = await loadOwnedEvent(req.membership.accountId, req.params.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  const expiration = resolveLinkExpiration(req.body?.expiration, { defaultPreset: '30_days' });
  if (expiration.error) return res.status(400).json({ error: expiration.error });
  const token = generateToken();
  const share = await prisma.runOfShowShare.upsert({
    where: { eventId: event.id },
    update: { tokenHash: hashToken(token), publicToken: token, expiresAt: expiration.expiresAt, revokedAt: null },
    create: { accountId: req.membership.accountId, eventId: event.id, tokenHash: hashToken(token), publicToken: token, expiresAt: expiration.expiresAt },
  });
  res.status(201).json({ share: serializeShare(share) });
}));

router.delete('/:eventId/share', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageEvents) return res.status(403).json({ error: 'Not authorized.' });
  const event = await loadOwnedEvent(req.membership.accountId, req.params.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  const share = await prisma.runOfShowShare.findUnique({ where: { eventId: event.id } });
  if (share) await prisma.runOfShowShare.update({ where: { id: share.id }, data: { revokedAt: new Date() } });
  res.json({ ok: true });
}));

export const publicRunOfShowRouter = Router();
const publicRunOfShowLimiter = createRateLimiter('public-run-of-show', { windowMs: 60 * 1000, limit: 90 });

// Always reads the event's live schedule — a Run of Show keeps changing
// right up to showtime, so unlike Stage Plot's published-revision snapshot,
// there's no publish step and nothing to go stale waiting to be republished.
publicRunOfShowRouter.get('/:token', publicRunOfShowLimiter, asyncHandler(async (req, res) => {
  const share = await prisma.runOfShowShare.findUnique({ where: { tokenHash: hashToken(req.params.token) } });
  if (!share) return res.status(404).json({ error: 'This run of show link is invalid.' });
  const availability = linkAvailability(share);
  if (availability !== 'active') return res.status(410).json({ error: availability === 'revoked' ? 'This run of show link has been revoked.' : 'This run of show link has expired.', reason: availability });

  const event = await prisma.event.findFirst({ where: { id: share.eventId, accountId: share.accountId, deletedAt: null }, select: { name: true, eventType: true, eventDate: true, venue: true, schedule: true, updatedAt: true } });
  if (!event) return res.status(404).json({ error: 'This event no longer exists.' });

  const updated = await prisma.runOfShowShare.update({ where: { id: share.id }, data: { lastViewedAt: new Date(), viewCount: { increment: 1 } } });
  res.json({
    event: { name: event.name, eventType: event.eventType, eventDate: event.eventDate, venue: event.venue, schedule: event.schedule, updatedAt: event.updatedAt },
    share: { expiresAt: updated.expiresAt, viewCount: updated.viewCount },
  });
}));

export default router;
