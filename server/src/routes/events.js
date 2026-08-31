import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { createWithPreservedId } from '../lib/idPreservingCreate.js';
import { paginationFromRequest, paginatedResponse, listPageFromRequest, listPageResponse } from '../lib/pagination.js';
import { randomUUID } from 'node:crypto';
import { dollarsToCents } from '../lib/financialLedger.js';
import { normalizeNoOutsideContractorsNeeded } from '../lib/eventStaffingState.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

async function normalizeStaffingFlag(accountId, value, contractorBookings) {
  if (!value || !contractorBookings?.length) return Boolean(value);
  const accountData = await prisma.accountData.findUnique({ where: { accountId }, select: { data: true } });
  return normalizeNoOutsideContractorsNeeded(value, contractorBookings, accountData?.data?.inquiryStatuses || []);
}

function serializeEvent(e) {
  return {
    id: e.id,
    groupId: e.groupId,
    name: e.name,
    eventType: e.eventType,
    eventDate: e.eventDate,
    eventDayOfTheWeek: e.eventDayOfTheWeek,
    clientId: e.clientId,
    brideName: e.brideName,
    groomName: e.groomName,
    guestCount: e.guestCount,
    contactPhone: e.contactPhone,
    contactPhoneExt: e.contactPhoneExt,
    contactEmail: e.contactEmail,
    startTime: e.startTime,
    endTime: e.endTime,
    eventNote: e.eventNote,
    prepNotes: e.prepNotes,
    eventStatus: e.eventStatus,
    noOutsideContractorsNeeded: e.noOutsideContractorsNeeded,
    deletedAt: e.deletedAt,
    completedAt: e.completedAt,
    venue: e.venue,
    contractorBookings: e.contractorBookings,
    categoryTabs: e.categoryTabs,
    schedule: e.schedule,
    prepGroups: e.prepGroups,
    requests: e.requests,
    shotList: e.shotList,
    secondShooters: e.secondShooters,
    otherExpenses: e.otherExpenses,
    history: e.history,
    setLists: e.setLists,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

// Fields a caller may set — deliberately excludes id/accountId/createdAt/
// updatedAt, which are handled separately by each route below.
const WRITABLE_FIELDS = [
  'groupId',
  'name', 'eventType', 'eventDate', 'eventDayOfTheWeek', 'clientId', 'brideName', 'groomName', 'guestCount',
  'contactPhone', 'contactPhoneExt', 'contactEmail', 'startTime', 'endTime', 'eventNote', 'prepNotes',
  'eventStatus', 'noOutsideContractorsNeeded', 'deletedAt', 'completedAt',
  'venue', 'contractorBookings', 'categoryTabs', 'schedule', 'prepGroups', 'requests', 'shotList',
  'secondShooters', 'otherExpenses', 'history', 'setLists',
];

// The list view (table rendering, Home's dashboard aggregates, the vendor-
// status/contractor-count filters) reads contractorBookings and venue, but
// never touches categoryTabs/schedule/prepGroups/requests/shotList/
// secondShooters/otherExpenses/history — those are edit-form-only content
// (see EventFormPage.jsx) that grows unboundedly with an account's history.
// The list route ships this lighter shape and the form fetches the full
// record by id instead.
function serializeEventLite(e) {
  return {
    id: e.id,
    groupId: e.groupId,
    name: e.name,
    eventType: e.eventType,
    eventDate: e.eventDate,
    eventDayOfTheWeek: e.eventDayOfTheWeek,
    clientId: e.clientId,
    brideName: e.brideName,
    groomName: e.groomName,
    guestCount: e.guestCount,
    contactPhone: e.contactPhone,
    contactPhoneExt: e.contactPhoneExt,
    contactEmail: e.contactEmail,
    startTime: e.startTime,
    endTime: e.endTime,
    eventNote: e.eventNote,
    prepNotes: e.prepNotes,
    eventStatus: e.eventStatus,
    noOutsideContractorsNeeded: e.noOutsideContractorsNeeded,
    deletedAt: e.deletedAt,
    completedAt: e.completedAt,
    venue: e.venue,
    contractorBookings: e.contractorBookings,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

router.get('/', asyncHandler(async (req, res) => {
  if (req.query.page !== undefined) {
    const pagination = listPageFromRequest(req, ['createdAt', 'eventDate', 'name', 'updatedAt'], 'eventDate');
    const search = String(req.query.search || '').trim();
    const where = {
      accountId: req.membership.accountId,
      ...(req.query.groupId ? { groupId: req.query.groupId } : {}),
      deletedAt: null,
      ...(req.query.view === 'completed' ? { completedAt: { not: null } } : { completedAt: null }),
      ...(req.query.status ? { eventStatus: req.query.status } : {}),
      ...(req.query.eventType ? { eventType: req.query.eventType } : {}),
      ...(req.query.from || req.query.to ? { eventDate: {
        ...(req.query.from ? { gte: String(req.query.from) } : {}),
        ...(req.query.to ? { lte: String(req.query.to) } : {}),
      } } : {}),
      ...(search ? { OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { eventType: { contains: search, mode: 'insensitive' } },
        { eventNote: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    };
    let items;
    let total;
    if (req.query.vendor || req.query.contractors) {
      const [matching, accountData] = await Promise.all([
        prisma.event.findMany({ where, orderBy: [{ [pagination.sort]: pagination.direction }, { id: pagination.direction }] }),
        prisma.accountData.findUnique({ where: { accountId: req.membership.accountId }, select: { data: true } }),
      ]);
      const statuses = accountData?.data?.inquiryStatuses || [];
      const filtered = matching.filter((event) => {
        const bookings = event.contractorBookings || [];
        if (req.query.contractors === 'has' && bookings.length === 0) return false;
        if (req.query.contractors === 'none' && bookings.length > 0) return false;
        if (req.query.vendor) {
          const vendor = bookings.length === 0 ? 'none' : bookings.every((booking) => statuses.find((status) => status.id === booking.inquiryStatusId)?.isConfirmed) ? 'confirmed' : 'pending';
          if (vendor !== req.query.vendor) return false;
        }
        return true;
      });
      total = filtered.length;
      items = filtered.slice(pagination.skip, pagination.skip + pagination.pageSize);
    } else {
      [items, total] = await Promise.all([
        prisma.event.findMany({ where, orderBy: [{ [pagination.sort]: pagination.direction }, { id: pagination.direction }], skip: pagination.skip, take: pagination.pageSize }),
        prisma.event.count({ where }),
      ]);
    }
    return res.json({ events: listPageResponse(items.map(serializeEventLite), total, pagination) });
  }
  const pagination = paginationFromRequest(req);
  if (!pagination) return res.status(400).json({ error: 'Invalid pagination cursor.' });
  const events = await prisma.event.findMany({
    where: { accountId: req.membership.accountId, deletedAt: null, ...pagination.cursorWhere },
    orderBy: pagination.orderBy,
    take: pagination.limit + 1,
  });
  const { page, nextCursor } = paginatedResponse(events, pagination.limit);
  res.json({ events: page.map(serializeEventLite), nextCursor });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const event = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!event || event.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Event not found.' });
  }
  res.json({ event: serializeEvent(event) });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageEvents) {
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
  if (data.groupId && !await prisma.agencyGroup.findFirst({ where: { id: data.groupId, accountId: req.membership.accountId, active: true } })) return res.status(400).json({ error: 'Invalid managed group.' });
  // groupId is a real foreign key (unlike clientId's loose-string pattern
  // elsewhere in this schema) — an empty string isn't "no group" to Postgres
  // the way it is to the check above, and fails the constraint outright.
  if (!data.groupId) data.groupId = null;
  // Historical blob records predate some of these fields entirely (e.g. the
  // seed sample event has no `history`) — default defensively rather than
  // assuming presence, since the blob-migration path (AuthContext.jsx)
  // passes raw historical records straight through to this route.
  if (data.venue === undefined) data.venue = {};
  if (data.contractorBookings === undefined) data.contractorBookings = [];
  if (data.categoryTabs === undefined) data.categoryTabs = [];
  if (data.schedule === undefined) data.schedule = [];
  if (data.prepGroups === undefined) data.prepGroups = [];
  if (data.requests === undefined) data.requests = [];
  if (data.shotList === undefined) data.shotList = [];
  if (data.secondShooters === undefined) data.secondShooters = [];
  if (data.otherExpenses === undefined) data.otherExpenses = [];
  if (data.history === undefined) data.history = [];
  if (data.setLists === undefined) data.setLists = [];
  data.noOutsideContractorsNeeded = await normalizeStaffingFlag(data.accountId, data.noOutsideContractorsNeeded, data.contractorBookings);

  const event = await createWithPreservedId(prisma.event, data, req.membership.accountId);
  res.status(201).json({ event: serializeEvent(event) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageEvents) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const existing = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const data = {};
  for (const field of WRITABLE_FIELDS) {
    if (req.body?.[field] !== undefined) data[field] = req.body[field];
  }
  if (data.groupId && !await prisma.agencyGroup.findFirst({ where: { id: data.groupId, accountId: req.membership.accountId, active: true } })) return res.status(400).json({ error: 'Invalid managed group.' });
  if (data.groupId === '') data.groupId = null;
  const effectiveBookings = data.contractorBookings ?? existing.contractorBookings ?? [];
  const effectiveNoOutsideStaffing = data.noOutsideContractorsNeeded ?? existing.noOutsideContractorsNeeded;
  if (effectiveNoOutsideStaffing) {
    data.noOutsideContractorsNeeded = await normalizeStaffingFlag(existing.accountId, effectiveNoOutsideStaffing, effectiveBookings);
  }

  const event = await prisma.$transaction(async (tx) => {
    const saved = await tx.event.update({ where: { id: existing.id }, data });
    if (data.contractorBookings !== undefined) {
      const previousById = new Map((existing.contractorBookings || []).map((booking) => [booking.id, booking]));
      const contractorIds = [...new Set((data.contractorBookings || []).map((booking) => booking.contractorId).filter(Boolean))];
      const contractors = contractorIds.length ? await tx.contractor.findMany({ where: { accountId: existing.accountId, id: { in: contractorIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
      const contractorById = new Map(contractors.map((contractor) => [contractor.id, contractor]));
      for (const booking of data.contractorBookings || []) {
        const previous = previousById.get(booking.id);
        const oldPaid = previous?.paymentStatus === 'paid' ? Number(previous.paidAmount) || 0 : 0;
        const newPaid = booking.paymentStatus === 'paid' ? Number(booking.paidAmount) || 0 : 0;
        const deltaCents = dollarsToCents(newPaid) - dollarsToCents(oldPaid);
        if (deltaCents === 0) continue;
        const postingDate = booking.paidAt ? new Date(`${booking.paidAt}T12:00:00.000Z`) : new Date();
        const contractor = contractorById.get(booking.contractorId);
        const contractorName = contractor ? `${contractor.firstName} ${contractor.lastName}`.trim() : 'Contractor';
        await tx.financialTransaction.create({ data: {
          accountId: existing.accountId,
          groupId: saved.groupId,
          eventId: saved.id,
          contractorId: booking.contractorId || null,
          category: deltaCents > 0 ? 'contractor_payment' : 'payment_adjustment',
          amountCents: -deltaCents,
          description: `${deltaCents > 0 ? 'Contractor paid' : 'Contractor payment correction'} · ${contractorName}`,
          occurredAt: postingDate,
          sourceType: 'event_contractor_payment',
          sourceId: randomUUID(),
          paymentMethod: booking.paymentMethod || null,
          reference: booking.paymentReference || null,
          memo: booking.paymentMemo || null,
          metadata: { contractorBookingId: booking.id, previousPaidAmount: oldPaid, newPaidAmount: newPaid },
          createdById: req.session.userId,
        } });
      }
    }
    return saved;
  });
  res.json({ event: serializeEvent(event) });
}));

export default router;
