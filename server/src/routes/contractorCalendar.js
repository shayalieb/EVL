import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { hashToken } from '../lib/resetToken.js';
import { statusBucket } from '../lib/inquiryStatusBucket.js';

// Public (unauthenticated, token-based) — mounted separately in index.js,
// same separation as publicRsvpRouter. See contractors.js's
// GET /:id/calendar-link (the authenticated side that issues these links)
// and the ContractorCalendarLink model comment for why the link is
// persistent rather than a one-time magic link.
export const publicContractorCalendarRouter = Router();

// This route does a full-account event scan per hit (no reverse index from
// contractor -> events exists, see contractorBookings on the Event model),
// unlike a single indexed token lookup — a per-IP limiter on the GET itself
// is a deliberate deviation from publicRsvpRouter, which only rate-limits
// its POST (mutation) path.
const calendarViewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again shortly.' },
});

async function findLinkByToken(token) {
  return prisma.contractorCalendarLink.findUnique({ where: { tokenHash: hashToken(token) } });
}

// Only what a contractor needs to see their own gig on the calendar — same
// "narrow projection for a public route" reasoning as guests.js's
// publicEventInfo, plus the derived `bucket` this route computes.
function publicGigInfo(event, booking, bucket) {
  return {
    id: event.id,
    name: event.name || '',
    eventDate: event.eventDate || '',
    startTime: booking?.startTime || event.startTime || '',
    endTime: booking?.endTime || event.endTime || '',
    callTime: booking?.callTime || event.callTime || '',
    soundcheckTime: event.soundcheckTime || '',
    notes: event.notes || '',
    venue: {
      name: event.venue?.name || '',
      address: event.venue?.address || '',
      city: event.venue?.city || '',
      state: event.venue?.state || '',
      zipCode: event.venue?.zipCode || '',
      notes: event.venue?.notes || '',
    },
    bucket,
  };
}

publicContractorCalendarRouter.get('/:token/manifest.webmanifest', calendarViewLimiter, asyncHandler(async (req, res) => {
  const link = await findLinkByToken(req.params.token);
  if (!link) return res.status(404).json({ error: 'This link is invalid.' });

  const accountData = await prisma.accountData.findUnique({ where: { accountId: link.accountId } });
  const businessName = accountData?.data?.businessInfo?.name || 'GigWorks';

  const startUrl = `/gigs/${req.params.token}`;
  res.setHeader('Content-Type', 'application/manifest+json');
  res.json({
    name: `${businessName} — My Gigs`,
    short_name: 'My Gigs',
    start_url: startUrl,
    scope: startUrl,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#4f46e5',
    icons: [
      { src: '/icons/gig-calendar-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/gig-calendar-512.png', sizes: '512x512', type: 'image/png' },
    ],
  });
}));

publicContractorCalendarRouter.get('/:token', calendarViewLimiter, asyncHandler(async (req, res) => {
  const link = await findLinkByToken(req.params.token);
  if (!link) return res.status(404).json({ error: 'This link is invalid.' });

  const [contractor, accountData, events] = await Promise.all([
    prisma.contractor.findUnique({ where: { id: link.contractorId }, select: { id: true, firstName: true, accountId: true } }),
    prisma.accountData.findUnique({ where: { accountId: link.accountId } }),
    prisma.event.findMany({
      where: { accountId: link.accountId, deletedAt: null },
      select: { id: true, name: true, eventDate: true, startTime: true, endTime: true, callTime: true, soundcheckTime: true, notes: true, venue: true, contractorBookings: true },
    }),
  ]);
  if (!contractor || contractor.accountId !== link.accountId) return res.status(404).json({ error: 'This contractor could not be found.' });

  const inquiryStatuses = accountData?.data?.inquiryStatuses || [];
  const gigs = [];
  for (const event of events) {
    const booking = (event.contractorBookings || []).find((b) => b.contractorId === link.contractorId);
    if (!booking) continue;
    const status = inquiryStatuses.find((s) => s.id === booking.inquiryStatusId);
    const bucket = statusBucket(status);
    if (bucket === 'confirmed' && !link.showConfirmed) continue;
    if (bucket === 'tentative' && !link.showTentative) continue;
    gigs.push(publicGigInfo(event, booking, bucket));
  }
  gigs.sort((a, b) => (a.eventDate || '').localeCompare(b.eventDate || ''));

  res.json({
    contractor: { firstName: contractor.firstName },
    businessInfo: accountData?.data?.businessInfo || null,
    gigs,
  });
}));

// Contractor 1-tap Gig Response (Accept / Decline) directly via token link
publicContractorCalendarRouter.post('/:token/gigs/:eventId/respond', calendarViewLimiter, asyncHandler(async (req, res) => {
  const { action } = req.body; // 'confirm' | 'decline'
  if (action !== 'confirm' && action !== 'decline') {
    return res.status(400).json({ error: 'Action must be confirm or decline.' });
  }

  const link = await findLinkByToken(req.params.token);
  if (!link) return res.status(404).json({ error: 'This link is invalid.' });

  const [event, accountData] = await Promise.all([
    prisma.event.findUnique({ where: { id: req.params.eventId } }),
    prisma.accountData.findUnique({ where: { accountId: link.accountId } }),
  ]);

  if (!event || event.accountId !== link.accountId) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const inquiryStatuses = accountData?.data?.inquiryStatuses || [];
  const targetBucket = action === 'confirm' ? 'confirmed' : 'unavailable';
  const targetStatus = inquiryStatuses.find((s) => statusBucket(s) === targetBucket);

  if (!targetStatus) {
    return res.status(400).json({ error: `No status found for bucket "${targetBucket}".` });
  }

  const contractorBookings = (event.contractorBookings || []).map((b) => {
    if (b.contractorId === link.contractorId) {
      return { ...b, inquiryStatusId: targetStatus.id };
    }
    return b;
  });

  await prisma.event.update({
    where: { id: event.id },
    data: { contractorBookings },
  });

  res.json({ success: true, newBucket: targetBucket, statusId: targetStatus.id });
}));

export default publicContractorCalendarRouter;
