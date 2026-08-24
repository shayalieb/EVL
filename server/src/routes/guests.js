import { Router } from 'express';
import { createRateLimiter } from '../lib/rateLimiter.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { requireVertical } from '../lib/verticals.js';
import { hashToken, generateToken } from '../lib/resetToken.js';
import { sendMail, resolveFromHeader, escapeHtml, buildActionEmailHtml } from '../lib/mailer.js';

const router = Router();

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

function serializeGuest(g) {
  return {
    id: g.id,
    eventId: g.eventId,
    name: g.name,
    email: g.email,
    phone: g.phone,
    partySize: g.partySize,
    rsvpStatus: g.rsvpStatus,
    notes: g.notes,
    source: g.source,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

// ---- Authenticated (owner-side) ----

router.use(requireAuth, asyncHandler(attachMembership), requireVertical('party_planning'));

router.get('/', asyncHandler(async (req, res) => {
  const { eventId } = req.query;
  if (!eventId) return res.status(400).json({ error: 'eventId is required.' });
  const guests = await prisma.guest.findMany({
    where: { accountId: req.membership.accountId, eventId },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ guests: guests.map(serializeGuest) });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageEvents) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const { eventId, name, email, phone, partySize, rsvpStatus, notes } = req.body || {};
  if (!eventId) return res.status(400).json({ error: 'eventId is required.' });
  if (!name?.trim()) return res.status(400).json({ error: 'Guest name is required.' });

  const guest = await prisma.guest.create({
    data: {
      accountId: req.membership.accountId,
      eventId,
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      partySize: Number.isFinite(Number(partySize)) && Number(partySize) > 0 ? Math.trunc(Number(partySize)) : 1,
      rsvpStatus: ['invited', 'confirmed', 'declined'].includes(rsvpStatus) ? rsvpStatus : 'invited',
      notes: notes?.trim() || null,
      source: 'manual',
    },
  });
  res.status(201).json({ guest: serializeGuest(guest) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageEvents) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const existing = await prisma.guest.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Guest not found.' });
  }

  const { name, email, phone, partySize, rsvpStatus, notes } = req.body || {};
  const data = {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'Guest name is required.' });
    data.name = name.trim();
  }
  if (email !== undefined) data.email = email?.trim() || null;
  if (phone !== undefined) data.phone = phone?.trim() || null;
  if (partySize !== undefined) {
    data.partySize = Number.isFinite(Number(partySize)) && Number(partySize) > 0 ? Math.trunc(Number(partySize)) : 1;
  }
  if (rsvpStatus !== undefined) {
    if (!['invited', 'confirmed', 'declined'].includes(rsvpStatus)) return res.status(400).json({ error: 'Invalid RSVP status.' });
    data.rsvpStatus = rsvpStatus;
  }
  if (notes !== undefined) data.notes = notes?.trim() || null;

  const guest = await prisma.guest.update({ where: { id: existing.id }, data });
  res.json({ guest: serializeGuest(guest) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageEvents) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const existing = await prisma.guest.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Guest not found.' });
  }
  await prisma.guest.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

// Get-or-create — always returns a usable link, same shape as
// inquiryLinks.js's GET /reusable-link. One link per event (unique
// [accountId, eventId]), always reusable — see the EventRsvpLink model
// comment for why there's no per-recipient/single-use variant here.
router.get('/rsvp-link', asyncHandler(async (req, res) => {
  const { eventId } = req.query;
  if (!eventId) return res.status(400).json({ error: 'eventId is required.' });

  let link = await prisma.eventRsvpLink.findUnique({
    where: { accountId_eventId: { accountId: req.membership.accountId, eventId } },
  });
  if (!link) {
    const token = generateToken();
    link = await prisma.eventRsvpLink.create({
      data: { accountId: req.membership.accountId, eventId, tokenHash: hashToken(token), publicToken: token },
    });
  }
  res.json({ rsvpLink: `${frontendUrl()}/rsvp/${link.publicToken}` });
}));

// Rotates the link's token — the previously-shared URL stops working (e.g.
// if it leaked somewhere it shouldn't have), a fresh one is returned.
router.post('/rsvp-link/regenerate', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageEvents) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const { eventId } = req.body || {};
  if (!eventId) return res.status(400).json({ error: 'eventId is required.' });

  const token = generateToken();
  const link = await prisma.eventRsvpLink.upsert({
    where: { accountId_eventId: { accountId: req.membership.accountId, eventId } },
    update: { tokenHash: hashToken(token), publicToken: token },
    create: { accountId: req.membership.accountId, eventId, tokenHash: hashToken(token), publicToken: token },
  });
  res.json({ rsvpLink: `${frontendUrl()}/rsvp/${link.publicToken}` });
}));

// ---- Public (unauthenticated, token-based) ----
// Mounted separately in index.js under a distinct path prefix — see
// inquiryLinks.js/publicInquiryLinksRouter for the identical pattern.

export const publicRsvpRouter = Router();

// Generous but bounded — a shared link posted on a wedding website/invite
// can legitimately see many submissions from the same network (a venue's
// wifi, a family gathered in one house), so this is sized for that rather
// than auth.js's much tighter per-attempt limiters.
const rsvpSubmitLimiter = createRateLimiter('rsvp-submit', {
  windowMs: 60 * 60 * 1000,
  limit: 40,
  message: { error: 'Too many submissions from this network. Please try again later.' },
});

async function findLinkByToken(token) {
  return prisma.eventRsvpLink.findUnique({ where: { tokenHash: hashToken(token) } });
}

// Only what a public page needs to display — never contactPhone/
// contactEmail/eventNote/clientId or anything financial, regardless of what
// else lives on the stored event.
function publicEventInfo(event) {
  if (!event) return null;
  return {
    name: event.name || '',
    eventType: event.eventType || '',
    eventDate: event.eventDate || '',
    startTime: event.startTime || '',
    endTime: event.endTime || '',
    venue: {
      name: event.venue?.name || '',
      address1: event.venue?.address1 || '',
      address2: event.venue?.address2 || '',
      city: event.venue?.city || '',
      state: event.venue?.state || '',
      zip: event.venue?.zip || '',
    },
  };
}

publicRsvpRouter.get('/:token', asyncHandler(async (req, res) => {
  const link = await findLinkByToken(req.params.token);
  if (!link) return res.status(404).json({ error: 'This link is invalid.' });

  const accountData = await prisma.accountData.findUnique({ where: { accountId: link.accountId } });
  const event = await prisma.event.findUnique({ where: { id: link.eventId } });
  if (!event || event.accountId !== link.accountId) return res.status(404).json({ error: 'This event could not be found.' });

  res.json({
    businessInfo: accountData?.data?.businessInfo || null,
    event: publicEventInfo(event),
  });
}));

publicRsvpRouter.post('/:token', rsvpSubmitLimiter, asyncHandler(async (req, res) => {
  const link = await findLinkByToken(req.params.token);
  if (!link) return res.status(404).json({ error: 'This link is invalid.' });

  const { name, email, phone, partySize, attending, notes } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (attending !== true && attending !== false) return res.status(400).json({ error: 'Please let us know if you can make it.' });

  const guest = await prisma.guest.create({
    data: {
      accountId: link.accountId,
      eventId: link.eventId,
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      partySize: attending && Number.isFinite(Number(partySize)) && Number(partySize) > 0 ? Math.trunc(Number(partySize)) : 1,
      rsvpStatus: attending ? 'confirmed' : 'declined',
      notes: notes?.trim() || null,
      source: 'rsvp_link',
    },
  });

  // Best-effort nudge to the owner — the Guests tab itself is the real
  // source of truth, this is just a heads-up (same reasoning as
  // inquiryLinks.js's new-response notification).
  try {
    const accountData = await prisma.accountData.findUnique({ where: { accountId: link.accountId } });
    const businessInfo = accountData?.data?.businessInfo || {};
    const event = await prisma.event.findUnique({ where: { id: link.eventId } });
    const ownerMembership = await prisma.membership.findFirst({ where: { accountId: link.accountId, role: 'owner' }, include: { user: true } });
    const ownerEmail = ownerMembership?.user?.email;
    if (ownerEmail) {
      const fromName = businessInfo.name || 'GigWorks';
      await sendMail({
        from: await resolveFromHeader({ accountId: link.accountId, fromName, localPart: 'rsvp' }),
        to: ownerEmail,
        subject: `New RSVP — ${guest.name}${event?.name ? ` for ${event.name}` : ''}`,
        html: buildActionEmailHtml({
          businessInfo,
          heading: 'New RSVP',
          bodyHtml: `<p>${escapeHtml(guest.name)} just RSVP'd <strong>${attending ? `Yes (party of ${guest.partySize})` : 'No'}</strong>${event?.name ? ` for ${escapeHtml(event.name)}` : ''}.</p>`,
          buttonText: 'View guest list in GigWorks',
          buttonUrl: `${frontendUrl()}/events/${link.eventId}`,
        }),
      });
    }
  } catch (err) {
    console.error(`Failed to email RSVP notification for link ${link.id}:`, err);
  }

  res.status(201).json({ ok: true });
}));

export default router;
