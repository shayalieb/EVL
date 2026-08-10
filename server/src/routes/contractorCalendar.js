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
function publicGigInfo(event, bucket) {
  return {
    id: event.id,
    name: event.name || '',
    eventDate: event.eventDate || '',
    startTime: event.startTime || '',
    endTime: event.endTime || '',
    venue: {
      name: event.venue?.name || '',
      city: event.venue?.city || '',
      state: event.venue?.state || '',
    },
    bucket,
  };
}

publicContractorCalendarRouter.get('/:token/manifest.webmanifest', calendarViewLimiter, asyncHandler(async (req, res) => {
  const link = await findLinkByToken(req.params.token);
  if (!link) return res.status(404).json({ error: 'This link is invalid.' });

  const accountData = await prisma.accountData.findUnique({ where: { accountId: link.accountId } });
  const businessName = accountData?.data?.businessInfo?.name || 'GigWorks';

  // start_url/scope MUST be this contractor's own token URL, not a shared
  // generic one — a static manifest would give every contractor's home
  // screen icon the same fixed launch target, which defeats the feature
  // (found during design review, see plan notes).
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
      select: { id: true, name: true, eventDate: true, startTime: true, endTime: true, venue: true, contractorBookings: true },
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
    if (bucket === 'unavailable') continue; // not really "their" gig anymore
    if (bucket === 'confirmed' && !link.showConfirmed) continue;
    if (bucket === 'tentative' && !link.showTentative) continue;
    gigs.push(publicGigInfo(event, bucket));
  }
  gigs.sort((a, b) => (a.eventDate || '').localeCompare(b.eventDate || ''));

  res.json({
    contractor: { firstName: contractor.firstName },
    businessInfo: accountData?.data?.businessInfo || null,
    gigs,
  });
}));

export default publicContractorCalendarRouter;
