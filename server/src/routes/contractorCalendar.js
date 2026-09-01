import { Router } from 'express';
import { createRateLimiter } from '../lib/rateLimiter.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { hashToken } from '../lib/resetToken.js';
import { statusBucket } from '../lib/inquiryStatusBucket.js';
import { contractorAssignmentCost, contractorPaymentTiming } from '../lib/financialReports.js';
import { contractorCalendarPaymentInfo } from '../lib/contractorCalendarPayment.js';

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
const calendarViewLimiter = createRateLimiter('contractor-calendar-view', {
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: { error: 'Too many requests. Please try again shortly.' },
});

async function findLinkByToken(token) {
  return prisma.contractorCalendarLink.findUnique({ where: { tokenHash: hashToken(token) } });
}

// Only what a contractor needs to see their own gig on the calendar — same
// "narrow projection for a public route" reasoning as guests.js's
// publicEventInfo, plus the derived `bucket` this route computes.
function publicGigInfo(event, booking, bucket, expectedAmount, paymentRequest) {
  const paymentTiming = contractorPaymentTiming({ dueDate: booking?.paymentDueDate, eventDate: event.eventDate });
  return {
    id: event.id,
    name: event.name || '',
    eventDate: event.eventDate || '',
    startTime: booking?.startTime || event.startTime || '',
    endTime: booking?.endTime || event.endTime || '',
    callTime: booking?.callTime || '',
    venue: {
      name: event.venue?.name || '',
      address: event.venue?.address || '',
      city: event.venue?.city || '',
      state: event.venue?.state || '',
      zipCode: event.venue?.zipCode || '',
      notes: event.venue?.notes || '',
    },
    bucket,
    // This token is scoped to one contractor, so it can show that person's
    // own payment details. Internal bookkeeping memos remain private.
    ...contractorCalendarPaymentInfo(booking, expectedAmount, paymentTiming),
    paymentRequest: paymentRequest ? {
      status: paymentRequest.status,
      amount: paymentRequest.amountCents / 100,
      invoiceNumber: paymentRequest.invoiceNumber,
      note: paymentRequest.note,
      submittedAt: paymentRequest.submittedAt,
    } : null,
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

  const [contractor, accountData, events, paymentRequests] = await Promise.all([
    prisma.contractor.findUnique({ where: { id: link.contractorId }, select: { id: true, firstName: true, accountId: true, pricingTiers: true } }),
    prisma.accountData.findUnique({ where: { accountId: link.accountId } }),
    prisma.event.findMany({
      where: { accountId: link.accountId, deletedAt: null },
      select: { id: true, name: true, eventDate: true, startTime: true, endTime: true, venue: true, contractorBookings: true },
    }),
    prisma.contractorPaymentRequest.findMany({ where: { accountId: link.accountId, contractorId: link.contractorId } }),
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
    const paymentRequest = paymentRequests.find((request) => request.eventId === event.id);
    gigs.push(publicGigInfo(event, booking, bucket, contractorAssignmentCost(booking, contractor), paymentRequest));
  }
  gigs.sort((a, b) => (a.eventDate || '').localeCompare(b.eventDate || ''));

  res.json({
    contractor: { firstName: contractor.firstName },
    businessInfo: accountData?.data?.businessInfo || null,
    gigs,
  });
}));

const paymentRequestLimiter = createRateLimiter('contractor-payment-request', {
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'Too many payment requests. Please try again later.' },
});

publicContractorCalendarRouter.post('/:token/gigs/:eventId/payment-request', paymentRequestLimiter, asyncHandler(async (req, res) => {
  const link = await findLinkByToken(req.params.token);
  if (!link) return res.status(404).json({ error: 'This link is invalid.' });

  const [event, contractor] = await Promise.all([
    prisma.event.findUnique({ where: { id: req.params.eventId } }),
    prisma.contractor.findUnique({ where: { id: link.contractorId } }),
  ]);
  if (!event || event.accountId !== link.accountId) return res.status(404).json({ error: 'Event not found.' });
  if (!contractor || contractor.accountId !== link.accountId) return res.status(404).json({ error: 'Contractor not found.' });
  const assignment = (event.contractorBookings || []).find((booking) => booking.contractorId === link.contractorId);
  if (!assignment) return res.status(404).json({ error: 'This gig is not assigned to you.' });
  if (assignment.paymentStatus === 'paid') return res.status(409).json({ error: 'This gig is already marked paid.' });
  if (!event.eventDate || event.eventDate > new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ error: 'Payment can be requested on or after the event date.' });
  }
  if (req.body?.certified !== true) return res.status(400).json({ error: 'Confirm that the services were completed and the request is accurate.' });

  const amount = contractorAssignmentCost(assignment, contractor);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'An agreed rate greater than $0 must be set before payment can be requested.' });
  const invoiceNumber = String(req.body?.invoiceNumber || '').trim().slice(0, 100) || null;
  const note = String(req.body?.note || '').trim().slice(0, 1000) || null;
  const existing = await prisma.contractorPaymentRequest.findUnique({ where: { eventId_contractorId: { eventId: event.id, contractorId: contractor.id } } });
  if (existing && existing.status !== 'disputed') return res.status(409).json({ error: 'A payment request has already been submitted for this gig.' });

  const paymentRequest = existing
    ? await prisma.contractorPaymentRequest.update({ where: { id: existing.id }, data: { amountCents: Math.round(amount * 100), invoiceNumber, note, status: 'submitted', submittedAt: new Date(), reviewedAt: null } })
    : await prisma.contractorPaymentRequest.create({ data: { accountId: link.accountId, eventId: event.id, contractorId: contractor.id, assignmentId: assignment.id || contractor.id, amountCents: Math.round(amount * 100), invoiceNumber, note } });

  const owner = await prisma.membership.findFirst({ where: { accountId: link.accountId, role: 'owner' } });
  if (owner) {
    // Notification failure must not turn a successfully stored request into a
    // misleading error that encourages the contractor to submit it again.
    await prisma.reminder.create({ data: {
      accountId: link.accountId,
      createdByUserId: owner.userId,
      relatedType: 'event',
      relatedId: event.id,
      relatedName: event.name || 'Event',
      autoGenerated: true,
      note: `${contractor.firstName} ${contractor.lastName} requested ${amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} for ${event.name || 'an event'}.`,
      remindAt: new Date(),
      emailEnabled: true,
    } }).catch(() => null);
  }

  res.status(201).json({ paymentRequest: { status: paymentRequest.status, amount: paymentRequest.amountCents / 100, invoiceNumber: paymentRequest.invoiceNumber, note: paymentRequest.note, submittedAt: paymentRequest.submittedAt } });
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
