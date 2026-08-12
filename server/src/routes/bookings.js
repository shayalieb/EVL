import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { createWithPreservedId } from '../lib/idPreservingCreate.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

function serializeBooking(b) {
  return {
    id: b.id,
    eventName: b.eventName,
    clientId: b.clientId,
    eventDate: b.eventDate,
    eventType: b.eventType,
    brideName: b.brideName,
    groomName: b.groomName,
    guestCount: b.guestCount,
    depositAmount: b.depositAmount,
    depositDueDate: b.depositDueDate,
    depositPaid: b.depositPaid,
    depositType: b.depositType,
    depositPercent: b.depositPercent,
    bookingStatus: b.bookingStatus,
    priority: b.priority,
    nextFollowUpDate: b.nextFollowUpDate,
    contractSignedDate: b.contractSignedDate,
    referralSource: b.referralSource,
    notes: b.notes,
    convertedEventId: b.convertedEventId,
    deletedAt: b.deletedAt,
    completedAt: b.completedAt,
    venue: b.venue,
    schedule: b.schedule,
    activityLog: b.activityLog,
    proposal: b.proposal,
    history: b.history,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

// Fields a caller may set — deliberately excludes id/accountId/createdAt/
// updatedAt, which are handled separately by each route below.
const WRITABLE_FIELDS = [
  'eventName', 'clientId', 'eventDate', 'eventType', 'brideName', 'groomName', 'guestCount',
  'depositAmount', 'depositDueDate', 'depositPaid', 'depositType', 'depositPercent',
  'bookingStatus', 'priority', 'nextFollowUpDate', 'contractSignedDate', 'referralSource', 'notes',
  'convertedEventId', 'deletedAt', 'completedAt',
  'venue', 'schedule', 'activityLog', 'proposal', 'history',
];

router.get('/', asyncHandler(async (req, res) => {
  const bookings = await prisma.booking.findMany({
    where: { accountId: req.membership.accountId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ bookings: bookings.map(serializeBooking) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { id, ...rest } = req.body || {};
  if (!id?.trim()) {
    return res.status(400).json({ error: 'id is required.' });
  }

  const data = { id, accountId: req.membership.accountId };
  for (const field of WRITABLE_FIELDS) {
    if (rest[field] !== undefined) data[field] = rest[field];
  }
  // Historical blob records predate some of these fields entirely (e.g. the
  // seed sample event has no `history`) — default defensively rather than
  // assuming presence, since the blob-migration path (AuthContext.jsx)
  // passes raw historical records straight through to this route.
  if (data.venue === undefined) data.venue = {};
  if (data.schedule === undefined) data.schedule = [];
  if (data.activityLog === undefined) data.activityLog = [];
  if (data.history === undefined) data.history = [];

  const booking = await createWithPreservedId(prisma.booking, data, req.membership.accountId);
  res.status(201).json({ booking: serializeBooking(booking) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  const data = {};
  for (const field of WRITABLE_FIELDS) {
    if (req.body?.[field] !== undefined) data[field] = req.body[field];
  }

  const booking = await prisma.booking.update({ where: { id: existing.id }, data });
  res.json({ booking: serializeBooking(booking) });
}));

export default router;
