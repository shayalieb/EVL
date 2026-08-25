import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { createWithPreservedId } from '../lib/idPreservingCreate.js';
import { paginationFromRequest, paginatedResponse, listPageFromRequest, listPageResponse } from '../lib/pagination.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

function canManage(req) {
  return effectivePermissions(req.membership).manageEvents;
}

function validItems(items) {
  return Array.isArray(items) && items.every((item) => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.songTitle === 'string');
}

function validEventIds(eventIds) {
  return Array.isArray(eventIds) && eventIds.every((id) => typeof id === 'string');
}

function dateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function searchText(items) {
  return items.flatMap((item) => [item.songTitle, item.description]).filter(Boolean).join(' ') || null;
}

function recordData(body, partial = false) {
  const data = {};
  if (!partial || body.name !== undefined) data.name = body.name.trim();
  if (!partial || body.description !== undefined) data.description = body.description?.trim() || null;
  if (!partial || body.items !== undefined) {
    data.items = body.items;
    data.searchText = searchText(body.items);
  }
  if (!partial || body.eventIds !== undefined || body.eventId !== undefined) data.eventIds = body.eventIds || (body.eventId ? [body.eventId] : []);
  if (!partial || body.lastSentAt !== undefined) data.lastSentAt = dateValue(body.lastSentAt);
  if (!partial || body.lastSentCount !== undefined) data.lastSentCount = body.lastSentCount == null ? null : Number(body.lastSentCount);
  return data;
}

function serialize(item) {
  return {
    id: item.id,
    name: item.name,
    description: item.description || '',
    items: item.items,
    eventIds: item.eventIds,
    lastSentAt: item.lastSentAt,
    lastSentCount: item.lastSentCount,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function validateBody(body, partial = false) {
  if ((!partial || body.name !== undefined) && (typeof body.name !== 'string' || !body.name.trim())) return 'Set list name is required.';
  if ((!partial || body.items !== undefined) && !validItems(body.items)) return 'items must be a valid song list.';
  const eventIds = body.eventIds || (body.eventId ? [body.eventId] : []);
  if ((!partial || body.eventIds !== undefined || body.eventId !== undefined) && !validEventIds(eventIds)) return 'eventIds must be an array of IDs.';
  if (body.description != null && typeof body.description !== 'string') return 'description must be text.';
  if (body.lastSentAt && dateValue(body.lastSentAt) === undefined) return 'lastSentAt must be a valid date.';
  if (body.lastSentCount != null && (!Number.isInteger(Number(body.lastSentCount)) || Number(body.lastSentCount) < 0)) return 'lastSentCount must be a non-negative integer.';
  return null;
}

router.get('/', asyncHandler(async (req, res) => {
  if (req.query.page !== undefined) {
    const pagination = listPageFromRequest(req, ['createdAt', 'name', 'updatedAt'], 'name');
    const search = String(req.query.search || '').trim();
    const where = {
      accountId: req.membership.accountId,
      ...(search ? { OR: ['name', 'description', 'searchText'].map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.setListLibraryItem.findMany({ where, orderBy: [{ [pagination.sort]: pagination.direction }, { id: pagination.direction }], skip: pagination.skip, take: pagination.pageSize }),
      prisma.setListLibraryItem.count({ where }),
    ]);
    return res.json({ setListLibrary: listPageResponse(items.map(serialize), total, pagination) });
  }
  const pagination = paginationFromRequest(req);
  if (!pagination) return res.status(400).json({ error: 'Invalid pagination cursor.' });
  const items = await prisma.setListLibraryItem.findMany({ where: { accountId: req.membership.accountId, ...pagination.cursorWhere }, orderBy: pagination.orderBy, take: pagination.limit + 1 });
  const { page, nextCursor } = paginatedResponse(items, pagination.limit);
  res.json({ setListLibrary: page.map(serialize), nextCursor });
}));

router.post('/sync', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const items = req.body?.setListLibrary;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'setListLibrary must be an array.' });
  for (const item of items) {
    if (typeof item?.id !== 'string' || !item.id.trim()) return res.status(400).json({ error: 'Every set list requires an id.' });
    const error = validateBody(item);
    if (error) return res.status(400).json({ error });
  }
  if (new Set(items.map(({ id }) => id)).size !== items.length) return res.status(400).json({ error: 'Set list IDs must be unique.' });
  const accountId = req.membership.accountId;
  const existing = await prisma.setListLibraryItem.findMany({ where: { id: { in: items.map(({ id }) => id) } }, select: { accountId: true } });
  if (existing.some((item) => item.accountId !== accountId)) return res.status(409).json({ error: 'A set list ID is already in use.' });
  await prisma.$transaction([
    ...items.map((item) => prisma.setListLibraryItem.upsert({
      where: { id: item.id },
      create: { id: item.id, accountId, ...recordData(item) },
      update: recordData(item),
    })),
    prisma.setListLibraryItem.deleteMany({ where: { accountId, ...(items.length ? { id: { notIn: items.map(({ id }) => id) } } : {}) } }),
  ]);
  res.json({ ok: true });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const item = await prisma.setListLibraryItem.findUnique({ where: { id: req.params.id } });
  if (!item || item.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Set list not found.' });
  res.json({ setList: serialize(item) });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const body = req.body || {};
  if (typeof body.id !== 'string' || !body.id.trim()) return res.status(400).json({ error: 'id is required.' });
  const error = validateBody(body);
  if (error) return res.status(400).json({ error });
  const item = await createWithPreservedId(prisma.setListLibraryItem, { id: body.id, accountId: req.membership.accountId, ...recordData(body) }, req.membership.accountId);
  res.status(201).json({ setList: serialize(item) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const existing = await prisma.setListLibraryItem.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Set list not found.' });
  const error = validateBody(req.body || {}, true);
  if (error) return res.status(400).json({ error });
  const item = await prisma.setListLibraryItem.update({ where: { id: existing.id }, data: recordData(req.body || {}, true) });
  res.json({ setList: serialize(item) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const existing = await prisma.setListLibraryItem.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Set list not found.' });
  await prisma.setListLibraryItem.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

export default router;
