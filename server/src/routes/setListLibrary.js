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

const MAX_LIBRARY_ITEMS = 500;
const MAX_SONGS = 500;
const MAX_LINKED_EVENTS = 100;

function validItems(items) {
  if (!Array.isArray(items) || items.length > MAX_SONGS) return false;
  const ids = new Set();
  return items.every((item) => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 200 || ids.has(item.id)) return false;
    ids.add(item.id);
    if (typeof item.songTitle !== 'string' || item.songTitle.length > 500) return false;
    if (item.description != null && (typeof item.description !== 'string' || item.description.length > 2000)) return false;
    if (item.link != null && (typeof item.link !== 'string' || item.link.length > 2048 || (item.link && !/^https?:\/\//i.test(item.link)))) return false;
    return ['documentId', 'documentName', 'documentContentType', 'documentShareToken'].every((key) => item[key] == null || (typeof item[key] === 'string' && item[key].length <= 500));
  });
}

function validEventIds(eventIds) {
  return Array.isArray(eventIds) && eventIds.length <= MAX_LINKED_EVENTS && new Set(eventIds).size === eventIds.length && eventIds.every((id) => typeof id === 'string' && id.trim() && id.length <= 200);
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

export function validateSetListBody(body, partial = false) {
  if ((!partial || body.name !== undefined) && (typeof body.name !== 'string' || !body.name.trim())) return 'Set list name is required.';
  if (typeof body.name === 'string' && body.name.length > 200) return 'Set list name is too long.';
  if ((!partial || body.items !== undefined) && !validItems(body.items)) return 'items must be a valid song list.';
  const eventIds = body.eventIds || (body.eventId ? [body.eventId] : []);
  if ((!partial || body.eventIds !== undefined || body.eventId !== undefined) && !validEventIds(eventIds)) return 'eventIds must be an array of IDs.';
  if (body.description != null && typeof body.description !== 'string') return 'description must be text.';
  if (typeof body.description === 'string' && body.description.length > 5000) return 'description is too long.';
  if (body.lastSentAt && dateValue(body.lastSentAt) === undefined) return 'lastSentAt must be a valid date.';
  if (body.lastSentCount != null && (!Number.isInteger(Number(body.lastSentCount)) || Number(body.lastSentCount) < 0)) return 'lastSentCount must be a non-negative integer.';
  return null;
}

async function validateOwnedReferences(accountId, body) {
  const eventIds = body.eventIds || (body.eventId ? [body.eventId] : []);
  const documentIds = [...new Set((body.items || []).map((item) => item.documentId).filter(Boolean))];
  const [eventCount, documentCount] = await Promise.all([
    eventIds.length ? prisma.event.count({ where: { accountId, id: { in: eventIds }, deletedAt: null } }) : 0,
    documentIds.length ? prisma.eventDocument.count({ where: { accountId, id: { in: documentIds } } }) : 0,
  ]);
  if (eventCount !== eventIds.length) return 'One or more linked events are invalid.';
  if (documentCount !== documentIds.length) return 'One or more attached documents are invalid.';
  return null;
}

router.get('/', asyncHandler(async (req, res) => {
  if (req.query.page !== undefined) {
    const pagination = listPageFromRequest(req, ['createdAt', 'name', 'updatedAt'], 'name');
    const search = String(req.query.search || '').trim().slice(0, 100);
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
  if (items.length > MAX_LIBRARY_ITEMS) return res.status(400).json({ error: `A maximum of ${MAX_LIBRARY_ITEMS} reusable set lists can be synced at once.` });
  for (const item of items) {
    if (typeof item?.id !== 'string' || !item.id.trim()) return res.status(400).json({ error: 'Every set list requires an id.' });
    const error = validateSetListBody(item);
    if (error) return res.status(400).json({ error });
  }
  if (new Set(items.map(({ id }) => id)).size !== items.length) return res.status(400).json({ error: 'Set list IDs must be unique.' });
  const accountId = req.membership.accountId;
  for (const item of items) {
    const referenceError = await validateOwnedReferences(accountId, item);
    if (referenceError) return res.status(400).json({ error: referenceError });
  }
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
  const error = validateSetListBody(body);
  if (error) return res.status(400).json({ error });
  const referenceError = await validateOwnedReferences(req.membership.accountId, body);
  if (referenceError) return res.status(400).json({ error: referenceError });
  const item = await createWithPreservedId(prisma.setListLibraryItem, { id: body.id, accountId: req.membership.accountId, ...recordData(body) }, req.membership.accountId);
  res.status(201).json({ setList: serialize(item) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Not authorized.' });
  const existing = await prisma.setListLibraryItem.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Set list not found.' });
  if (req.body?.expectedUpdatedAt && existing.updatedAt.toISOString() !== req.body.expectedUpdatedAt) return res.status(409).json({ error: 'This set list was updated by someone else. Reload it before saving.' });
  const error = validateSetListBody(req.body || {}, true);
  if (error) return res.status(400).json({ error });
  const referenceError = await validateOwnedReferences(req.membership.accountId, req.body || {});
  if (referenceError) return res.status(400).json({ error: referenceError });
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
