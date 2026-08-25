import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { createWithPreservedId } from '../lib/idPreservingCreate.js';
import { paginationFromRequest, paginatedResponse } from '../lib/pagination.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

function serializeEvent(e) {
  return {
    id: e.id,
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

  const event = await prisma.event.update({ where: { id: existing.id }, data });
  res.json({ event: serializeEvent(event) });
}));

export default router;
