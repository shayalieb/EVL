import { Router } from 'express';
import { viewGuard } from '../lib/viewAccess.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { createWithPreservedId } from '../lib/idPreservingCreate.js';
import { paginationFromRequest, paginatedResponse, listPageFromRequest, listPageResponse } from '../lib/pagination.js';
import { normalizeValidEmail } from '../lib/emailAddress.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));
router.use(viewGuard('viewClients'));

function normalizedClientFields({ firstName, lastName, email, phone }) {
  const emailNormalized = String(email || '').trim().toLowerCase() || null;
  const phoneNormalized = String(phone || '').replace(/\D/g, '') || null;
  const nameNormalized = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim().toLowerCase() || null;
  return { emailNormalized, phoneNormalized, nameNormalized };
}

function serializeClient(c) {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    address1: c.address1,
    address2: c.address2,
    city: c.city,
    state: c.state,
    zip: c.zip,
    notes: c.notes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

const NOTE_TYPES = new Set(['general', 'call', 'meeting', 'preference', 'issue']);
const NOTE_MAX_LENGTH = 5000;

async function authorNameFor(req) {
  const user = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { firstName: true, lastName: true } });
  return user ? `${user.firstName} ${user.lastName}`.trim() || null : null;
}

function serializeNote(n) {
  return { id: n.id, clientId: n.clientId, type: n.type, body: n.body, pinned: n.pinned, authorName: n.authorName, authorUserId: n.authorUserId, createdAt: n.createdAt, updatedAt: n.updatedAt };
}

// Owners/admins may change any note; other members only their own.
function mayModifyNote(req, note) {
  if (req.membership.role === 'owner' || req.membership.role === 'admin') return true;
  return !!note.authorUserId && note.authorUserId === req.session.userId;
}

async function ownedClient(req, res) {
  const client = await prisma.client.findUnique({ where: { id: req.params.id }, select: { id: true, accountId: true } });
  if (!client || client.accountId !== req.membership.accountId) {
    res.status(404).json({ error: 'Client not found.' });
    return null;
  }
  return client;
}

function eventCountBucket(statuses, eventStatus) {
  const label = String(statuses.find((status) => status.id === eventStatus)?.label || '').toLowerCase();
  if (label === 'cancelled' || label === 'declined') return 'declined';
  if (label === 'confirmed' || label === 'completed') return 'confirmed';
  return 'pending';
}

router.get('/', asyncHandler(async (req, res) => {
  if (req.query.page !== undefined) {
    const pagination = listPageFromRequest(req, ['createdAt', 'firstName', 'lastName', 'updatedAt'], 'lastName');
    const search = String(req.query.search || '').trim();
    let engagementIds;
    if (req.query.engagement) {
      const [events, accountData] = await Promise.all([
        prisma.event.findMany({ where: { accountId: req.membership.accountId, deletedAt: null }, select: { clientId: true, eventStatus: true } }),
        prisma.accountData.findUnique({ where: { accountId: req.membership.accountId }, select: { data: true } }),
      ]);
      const statuses = accountData?.data?.eventStatuses || [];
      const buckets = new Map();
      for (const event of events) {
        if (!event.clientId) continue;
        const label = String(statuses.find((status) => status.id === event.eventStatus)?.label || '').toLowerCase();
        const bucket = label === 'cancelled' || label === 'declined' ? 'declined' : label === 'confirmed' || label === 'completed' ? 'confirmed' : 'pending';
        if (!buckets.has(event.clientId)) buckets.set(event.clientId, new Set());
        buckets.get(event.clientId).add(bucket);
      }
      if (req.query.engagement === 'has-confirmed') engagementIds = [...buckets].filter(([, set]) => set.has('confirmed')).map(([id]) => id);
      if (req.query.engagement === 'has-pending') engagementIds = [...buckets].filter(([, set]) => set.has('pending')).map(([id]) => id);
      if (req.query.engagement === 'no-events') engagementIds = { notIn: [...buckets.keys()] };
    }
    const where = {
      accountId: req.membership.accountId,
      ...(Array.isArray(engagementIds) ? { id: { in: engagementIds } } : engagementIds ? { id: engagementIds } : {}),
      ...(search ? { OR: [
        ...['firstName', 'lastName', 'email', 'phone'].map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })),
        { clientNotes: { some: { body: { contains: search, mode: 'insensitive' } } } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.client.findMany({ where, orderBy: [{ [pagination.sort]: pagination.direction }, { id: pagination.direction }], skip: pagination.skip, take: pagination.pageSize }),
      prisma.client.count({ where }),
    ]);
    const itemIds = items.map((item) => item.id);
    const [pinnedNotes, noteCounts, followUps] = await Promise.all([
      prisma.clientNote.findMany({ where: { accountId: req.membership.accountId, clientId: { in: itemIds }, pinned: true }, select: { clientId: true, body: true } }),
      prisma.clientNote.groupBy({ by: ['clientId'], where: { accountId: req.membership.accountId, clientId: { in: itemIds } }, _count: { _all: true } }),
      prisma.reminder.findMany({ where: { accountId: req.membership.accountId, relatedType: 'client', relatedId: { in: itemIds }, completedAt: null }, select: { relatedId: true, remindAt: true }, orderBy: { remindAt: 'asc' } }),
    ]);
    const pinnedByClient = new Map(pinnedNotes.map((note) => [note.clientId, note.body]));
    const noteCountByClient = new Map(noteCounts.map((row) => [row.clientId, row._count._all]));
    const followUpByClient = new Map();
    for (const reminder of followUps) if (!followUpByClient.has(reminder.relatedId)) followUpByClient.set(reminder.relatedId, reminder.remindAt);
    const [clientEvents, accountData] = await Promise.all([
      prisma.event.findMany({ where: { accountId: req.membership.accountId, deletedAt: null, clientId: { in: items.map((item) => item.id) } }, select: { clientId: true, eventStatus: true } }),
      prisma.accountData.findUnique({ where: { accountId: req.membership.accountId }, select: { data: true } }),
    ]);
    const statuses = accountData?.data?.eventStatuses || [];
    const countsByClient = new Map(items.map((item) => [item.id, { pending: 0, confirmed: 0, declined: 0 }]));
    for (const event of clientEvents) {
      const counts = countsByClient.get(event.clientId);
      if (counts) counts[eventCountBucket(statuses, event.eventStatus)] += 1;
    }
    return res.json({ clients: listPageResponse(items.map((item) => ({
      ...serializeClient(item),
      eventCounts: countsByClient.get(item.id),
      noteCount: noteCountByClient.get(item.id) || 0,
      pinnedNote: pinnedByClient.get(item.id) || null,
      nextFollowUpAt: followUpByClient.get(item.id) || null,
    })), total, pagination) });
  }
  const pagination = paginationFromRequest(req);
  if (!pagination) return res.status(400).json({ error: 'Invalid pagination cursor.' });
  const clients = await prisma.client.findMany({
    where: { accountId: req.membership.accountId, ...pagination.cursorWhere },
    orderBy: pagination.orderBy,
    take: pagination.limit + 1,
  });
  const { page, nextCursor } = paginatedResponse(clients, pagination.limit);
  res.json({ clients: page.map(serializeClient), nextCursor });
}));

// Indexed, bounded candidate lookup for inquiry reconciliation. Exact
// email/phone matches rank first; pg_trgm handles spelling differences in
// names without loading an account's entire client roster into the browser.
router.get('/matches/inquiry', asyncHandler(async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  const phone = String(req.query.phone || '').replace(/\D/g, '');
  const name = `${String(req.query.firstName || '').trim()} ${String(req.query.lastName || '').trim()}`.trim().toLowerCase();
  if (!email && !phone && !name) return res.json({ candidates: [] });
  const candidates = await prisma.$queryRaw`
    SELECT "id", "firstName", "lastName", "email", "phone", "address1", "address2", "city", "state", "zip", "notes", "createdAt", "updatedAt",
      CASE WHEN ${email || null}::text IS NOT NULL AND "emailNormalized" = ${email || null} THEN 1 ELSE 0 END AS "emailExact",
      CASE WHEN ${phone || null}::text IS NOT NULL AND "phoneNormalized" = ${phone || null} THEN 1 ELSE 0 END AS "phoneExact",
      CASE WHEN ${name || null}::text IS NOT NULL THEN similarity("nameNormalized", ${name || null}) ELSE 0 END AS "nameScore"
    FROM "Client"
    WHERE "accountId" = ${req.membership.accountId}
      AND (
        (${email || null}::text IS NOT NULL AND "emailNormalized" = ${email || null}) OR
        (${phone || null}::text IS NOT NULL AND "phoneNormalized" = ${phone || null}) OR
        (${name || null}::text IS NOT NULL AND "nameNormalized" % ${name || null})
      )
    ORDER BY "emailExact" DESC, "phoneExact" DESC, "nameScore" DESC, "updatedAt" DESC
    LIMIT 8
  `;
  res.json({ candidates: candidates.map((candidate) => ({
    ...serializeClient(candidate),
    match: { emailExact: !!candidate.emailExact, phoneExact: !!candidate.phoneExact, nameScore: Number(candidate.nameScore) },
  })) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client || client.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Client not found.' });
  res.json({ client: serializeClient(client) });
}));

router.get('/:id/notes', asyncHandler(async (req, res) => {
  const client = await ownedClient(req, res);
  if (!client) return;
  const notes = await prisma.clientNote.findMany({
    where: { accountId: client.accountId, clientId: client.id },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
  });
  res.json({ notes: notes.map(serializeNote) });
}));

router.post('/:id/notes', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageClients) return res.status(403).json({ error: 'Not authorized.' });
  const client = await ownedClient(req, res);
  if (!client) return;
  const body = String(req.body?.body || '').trim();
  const type = req.body?.type === undefined ? 'general' : req.body.type;
  if (!body) return res.status(400).json({ error: 'Note text is required.' });
  if (body.length > NOTE_MAX_LENGTH) return res.status(400).json({ error: `Notes are limited to ${NOTE_MAX_LENGTH} characters.` });
  if (!NOTE_TYPES.has(type)) return res.status(400).json({ error: 'Invalid note type.' });
  const pinned = req.body?.pinned === true;
  const authorName = await authorNameFor(req);
  const note = await prisma.$transaction(async (tx) => {
    if (pinned) await tx.clientNote.updateMany({ where: { clientId: client.id, pinned: true }, data: { pinned: false } });
    return tx.clientNote.create({ data: { accountId: client.accountId, clientId: client.id, authorUserId: req.session.userId, authorName, type, body, pinned } });
  });
  res.status(201).json({ note: serializeNote(note) });
}));

router.patch('/:id/notes/:noteId', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageClients) return res.status(403).json({ error: 'Not authorized.' });
  const client = await ownedClient(req, res);
  if (!client) return;
  const existing = await prisma.clientNote.findUnique({ where: { id: req.params.noteId } });
  if (!existing || existing.clientId !== client.id || existing.accountId !== client.accountId) return res.status(404).json({ error: 'Note not found.' });
  const { body, type, pinned } = req.body || {};
  const data = {};
  // Pinning is a shared, team-wide banner, so any member who can manage clients may pin/unpin;
  // editing the text or type is limited to the author (or an owner/admin).
  if (body !== undefined || type !== undefined) {
    if (!mayModifyNote(req, existing)) return res.status(403).json({ error: 'You can only edit your own notes.' });
    if (body !== undefined) {
      const trimmed = String(body).trim();
      if (!trimmed) return res.status(400).json({ error: 'Note text is required.' });
      if (trimmed.length > NOTE_MAX_LENGTH) return res.status(400).json({ error: `Notes are limited to ${NOTE_MAX_LENGTH} characters.` });
      data.body = trimmed;
    }
    if (type !== undefined) {
      if (!NOTE_TYPES.has(type)) return res.status(400).json({ error: 'Invalid note type.' });
      data.type = type;
    }
  }
  if (pinned !== undefined) data.pinned = pinned === true;
  const note = await prisma.$transaction(async (tx) => {
    if (data.pinned) await tx.clientNote.updateMany({ where: { clientId: client.id, pinned: true, id: { not: existing.id } }, data: { pinned: false } });
    return tx.clientNote.update({ where: { id: existing.id }, data });
  });
  res.json({ note: serializeNote(note) });
}));

router.delete('/:id/notes/:noteId', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageClients) return res.status(403).json({ error: 'Not authorized.' });
  const client = await ownedClient(req, res);
  if (!client) return;
  const existing = await prisma.clientNote.findUnique({ where: { id: req.params.noteId } });
  if (!existing || existing.clientId !== client.id || existing.accountId !== client.accountId) return res.status(404).json({ error: 'Note not found.' });
  if (!mayModifyNote(req, existing)) return res.status(403).json({ error: 'You can only delete your own notes.' });
  await prisma.clientNote.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageClients) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const { id, firstName, lastName, email, phone, address1, address2, city, state, zip, notes } = req.body || {};
  if (!id?.trim()) {
    return res.status(400).json({ error: 'id is required.' });
  }
  const normalizedEmail = normalizeValidEmail(email);
  if (!firstName?.trim() || !lastName?.trim() || !normalizedEmail) {
    return res.status(400).json({ error: 'First name, last name, and a valid email address are required.' });
  }

  const client = await createWithPreservedId(prisma.client, {
    id,
    accountId: req.membership.accountId,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: normalizedEmail,
    phone: phone?.trim() || null,
    address1: address1?.trim() || null,
    address2: address2?.trim() || null,
    city: city?.trim() || null,
    state: state?.trim() || null,
    zip: zip?.trim() || null,
    notes: notes?.trim() || null,
    ...normalizedClientFields({ firstName, lastName, email: normalizedEmail, phone }),
  }, req.membership.accountId);
  if (client.notes) {
    await prisma.clientNote.create({ data: { accountId: client.accountId, clientId: client.id, authorUserId: req.session.userId, authorName: await authorNameFor(req), type: 'general', body: client.notes } });
  }
  res.status(201).json({ client: serializeClient(client) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageClients) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Client not found.' });
  }

  const { firstName, lastName, email, phone, address1, address2, city, state, zip, notes } = req.body || {};
  const data = {};
  if (firstName !== undefined) {
    if (!firstName.trim()) return res.status(400).json({ error: 'First name is required.' });
    data.firstName = firstName.trim();
  }
  if (lastName !== undefined) {
    if (!lastName.trim()) return res.status(400).json({ error: 'Last name is required.' });
    data.lastName = lastName.trim();
  }
  if (email !== undefined) {
    const normalizedEmail = normalizeValidEmail(email);
    if (!normalizedEmail) return res.status(400).json({ error: 'A valid client email address is required.' });
    data.email = normalizedEmail;
  } else if (!existing.email) {
    return res.status(400).json({ error: 'Add a valid client email address before saving this legacy record.' });
  }
  if (phone !== undefined) data.phone = phone?.trim() || null;
  if (address1 !== undefined) data.address1 = address1?.trim() || null;
  if (address2 !== undefined) data.address2 = address2?.trim() || null;
  if (city !== undefined) data.city = city?.trim() || null;
  if (state !== undefined) data.state = state?.trim() || null;
  if (zip !== undefined) data.zip = zip?.trim() || null;
  if (notes !== undefined) data.notes = notes?.trim() || null;
  Object.assign(data, normalizedClientFields({
    firstName: firstName === undefined ? existing.firstName : firstName,
    lastName: lastName === undefined ? existing.lastName : lastName,
    email: email === undefined ? existing.email : email,
    phone: phone === undefined ? existing.phone : phone,
  }));

  const client = await prisma.client.update({ where: { id: existing.id }, data });
  res.json({ client: serializeClient(client) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageClients) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Client not found.' });
  }
  const [eventCount, bookingCount] = await Promise.all([
    prisma.event.count({ where: { accountId: req.membership.accountId, clientId: existing.id } }),
    prisma.booking.count({ where: { accountId: req.membership.accountId, clientId: existing.id } }),
  ]);
  if (eventCount || bookingCount) {
    return res.status(409).json({ error: `This client is linked to ${bookingCount} booking${bookingCount === 1 ? '' : 's'} and ${eventCount} event${eventCount === 1 ? '' : 's'}. Reassign those records before deleting the client.`, bookingCount, eventCount });
  }
  await prisma.client.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

export default router;
