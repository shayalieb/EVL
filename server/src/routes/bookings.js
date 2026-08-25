import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { createWithPreservedId } from '../lib/idPreservingCreate.js';
import { paginationFromRequest, paginatedResponse, listPageFromRequest, listPageResponse } from '../lib/pagination.js';

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

// The list view (and every dashboard/table computation fed by it) never
// reads schedule/activityLog/history, and only ever reads proposal.sentAt
// (BookingsPage's pipeline-stage column, via lib/bookingPipeline.js) — not
// its sections/lineItems/offerings/log. Those are edit-form-only content
// that grows unboundedly with an account's history, so the list route ships
// this lighter shape and the form fetches the full record by id instead.
function serializeBookingLite(b) {
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
    proposal: b.proposal?.sentAt ? { sentAt: b.proposal.sentAt } : null,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

router.get('/', asyncHandler(async (req, res) => {
  if (req.query.page !== undefined) {
    const pagination = listPageFromRequest(req, ['createdAt', 'eventDate', 'eventName', 'updatedAt']);
    const search = String(req.query.search || '').trim();
    let statusValues;
    if (req.query.status) {
      const accountData = await prisma.accountData.findUnique({ where: { accountId: req.membership.accountId }, select: { data: true } });
      const legacy = accountData?.data?.bookingStatuses || [];
      const disposition = (label) => {
        const value = String(label || '').toLowerCase();
        if (value === 'cancelled' || value === 'canceled') return 'cancelled';
        if (value === 'lost' || value === 'declined') return 'lost';
        if (value === 'on hold' || value === 'paused') return 'on_hold';
        return 'active';
      };
      statusValues = [req.query.status, ...legacy.filter((item) => disposition(item.label) === req.query.status).map((item) => item.id)];
    }
    let clientIds;
    if (search) {
      const matchingClients = await prisma.client.findMany({
        where: { accountId: req.membership.accountId, OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ] },
        select: { id: true },
      });
      clientIds = matchingClients.map((client) => client.id);
    }
    const where = {
      accountId: req.membership.accountId,
      deletedAt: null,
      ...(req.query.view === 'completed' ? { completedAt: { not: null } } : { completedAt: null }),
      ...(statusValues ? { bookingStatus: { in: statusValues } } : {}),
      ...(req.query.priority ? { priority: req.query.priority } : {}),
      ...(req.query.eventType ? { eventType: req.query.eventType } : {}),
      ...(req.query.deposit === 'paid' ? { depositPaid: true } : {}),
      ...(req.query.deposit === 'due' ? { depositPaid: false, depositAmount: { gt: 0 } } : {}),
      ...(req.query.deposit === 'none' ? { OR: [{ depositAmount: null }, { depositAmount: 0 }] } : {}),
      ...(search ? { OR: [
        { eventName: { contains: search, mode: 'insensitive' } },
        { eventType: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        ...(clientIds.length ? [{ clientId: { in: clientIds } }] : []),
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.booking.findMany({ where, orderBy: [{ [pagination.sort]: pagination.direction }, { id: pagination.direction }], skip: pagination.skip, take: pagination.pageSize }),
      prisma.booking.count({ where }),
    ]);
    return res.json({ bookings: listPageResponse(items.map(serializeBookingLite), total, pagination) });
  }
  const pagination = paginationFromRequest(req);
  if (!pagination) return res.status(400).json({ error: 'Invalid pagination cursor.' });
  const bookings = await prisma.booking.findMany({
    where: { accountId: req.membership.accountId, deletedAt: null, ...pagination.cursorWhere },
    orderBy: pagination.orderBy,
    take: pagination.limit + 1,
  });
  const { page, nextCursor } = paginatedResponse(bookings, pagination.limit);
  res.json({ bookings: page.map(serializeBookingLite), nextCursor });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!booking || booking.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Booking not found.' });
  }
  res.json({ booking: serializeBooking(booking) });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
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
  if (!effectivePermissions(req.membership).manageBookings) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
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
