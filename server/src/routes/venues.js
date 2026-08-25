import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { createWithPreservedId } from '../lib/idPreservingCreate.js';
import { paginationFromRequest, paginatedResponse, listPageFromRequest, listPageResponse } from '../lib/pagination.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

const FIELDS = ['address1', 'address2', 'city', 'state', 'zip', 'contactName', 'contactPhone', 'contactPhoneExt', 'contactEmail', 'locationNote', 'loadInInfo'];

function serializeVenue(venue) {
  return { id: venue.id, name: venue.name, ...Object.fromEntries(FIELDS.map((field) => [field, venue[field]])), createdAt: venue.createdAt, updatedAt: venue.updatedAt };
}

router.get('/', asyncHandler(async (req, res) => {
  if (req.query.page !== undefined) {
    const pagination = listPageFromRequest(req, ['createdAt', 'name', 'updatedAt'], 'name');
    const search = String(req.query.search || '').trim();
    const where = {
      accountId: req.membership.accountId,
      ...(search ? { OR: ['name', 'address1', 'city', 'state', 'contactName', 'contactPhone', 'contactEmail'].map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.venue.findMany({ where, orderBy: [{ [pagination.sort]: pagination.direction }, { id: pagination.direction }], skip: pagination.skip, take: pagination.pageSize }),
      prisma.venue.count({ where }),
    ]);
    return res.json({ venues: listPageResponse(items.map(serializeVenue), total, pagination) });
  }
  const pagination = paginationFromRequest(req);
  if (!pagination) return res.status(400).json({ error: 'Invalid pagination cursor.' });
  const venues = await prisma.venue.findMany({ where: { accountId: req.membership.accountId, ...pagination.cursorWhere }, orderBy: pagination.orderBy, take: pagination.limit + 1 });
  const { page, nextCursor } = paginatedResponse(venues, pagination.limit);
  res.json({ venues: page.map(serializeVenue), nextCursor });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const venue = await prisma.venue.findUnique({ where: { id: req.params.id } });
  if (!venue || venue.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Venue not found.' });
  res.json({ venue: serializeVenue(venue) });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageVenues) return res.status(403).json({ error: 'Not authorized.' });
  const { id, name } = req.body || {};
  if (!id?.trim()) return res.status(400).json({ error: 'id is required.' });
  if (!name?.trim()) return res.status(400).json({ error: 'Venue name is required.' });
  const data = { id, accountId: req.membership.accountId, name: name.trim() };
  for (const field of FIELDS) data[field] = req.body?.[field]?.trim() || null;
  const venue = await createWithPreservedId(prisma.venue, data, req.membership.accountId);
  res.status(201).json({ venue: serializeVenue(venue) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageVenues) return res.status(403).json({ error: 'Not authorized.' });
  const existing = await prisma.venue.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Venue not found.' });
  const data = {};
  if (req.body?.name !== undefined) {
    if (!req.body.name.trim()) return res.status(400).json({ error: 'Venue name is required.' });
    data.name = req.body.name.trim();
  }
  for (const field of FIELDS) if (req.body?.[field] !== undefined) data[field] = req.body[field]?.trim() || null;
  const venue = await prisma.venue.update({ where: { id: existing.id }, data });
  res.json({ venue: serializeVenue(venue) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageVenues) return res.status(403).json({ error: 'Not authorized.' });
  const existing = await prisma.venue.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Venue not found.' });
  await prisma.venue.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

export default router;
