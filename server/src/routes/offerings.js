import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { createWithPreservedId } from '../lib/idPreservingCreate.js';
import { paginationFromRequest, paginatedResponse, listPageFromRequest, listPageResponse } from '../lib/pagination.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

const TYPES = new Set(['general', 'perUnit']);

function serializeOffering(offering) {
  return {
    id: offering.id,
    name: offering.name,
    details: offering.details || '',
    type: offering.type,
    amount: offering.amount ?? '',
    unitCount: offering.unitCount ?? '',
    ratePerUnit: offering.ratePerUnit ?? '',
    createdAt: offering.createdAt,
    updatedAt: offering.updatedAt,
  };
}

function offeringData(body, partial = false) {
  const data = {};
  if (!partial || body.name !== undefined) data.name = body.name.trim();
  if (!partial || body.details !== undefined) data.details = body.details?.trim() || null;
  if (!partial || body.type !== undefined) data.type = body.type;
  for (const field of ['amount', 'unitCount', 'ratePerUnit']) {
    if (!partial || body[field] !== undefined) data[field] = body[field] === '' || body[field] == null ? null : String(body[field]);
  }
  return data;
}

router.get('/', asyncHandler(async (req, res) => {
  const type = String(req.query.type || '').trim();
  if (type && !TYPES.has(type)) return res.status(400).json({ error: 'Invalid offering type.' });
  const baseWhere = { accountId: req.membership.accountId, ...(type ? { type } : {}) };
  if (req.query.page !== undefined) {
    const pagination = listPageFromRequest(req, ['createdAt', 'name', 'updatedAt'], 'name');
    const search = String(req.query.search || '').trim();
    const where = { ...baseWhere, ...(search ? { OR: ['name', 'details'].map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) } : {}) };
    const [items, total] = await Promise.all([
      prisma.offering.findMany({ where, orderBy: [{ [pagination.sort]: pagination.direction }, { id: pagination.direction }], skip: pagination.skip, take: pagination.pageSize }),
      prisma.offering.count({ where }),
    ]);
    return res.json({ offerings: listPageResponse(items.map(serializeOffering), total, pagination) });
  }
  const pagination = paginationFromRequest(req);
  if (!pagination) return res.status(400).json({ error: 'Invalid pagination cursor.' });
  const offerings = await prisma.offering.findMany({ where: { ...baseWhere, ...pagination.cursorWhere }, orderBy: pagination.orderBy, take: pagination.limit + 1 });
  const { page, nextCursor } = paginatedResponse(offerings, pagination.limit);
  res.json({ offerings: page.map(serializeOffering), nextCursor });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const offering = await prisma.offering.findUnique({ where: { id: req.params.id } });
  if (!offering || offering.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Offering not found.' });
  res.json({ offering: serializeOffering(offering) });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageOfferings) return res.status(403).json({ error: 'Not authorized.' });
  const body = req.body || {};
  if (!body.id?.trim()) return res.status(400).json({ error: 'id is required.' });
  if (!body.name?.trim()) return res.status(400).json({ error: 'Offering name is required.' });
  if (!TYPES.has(body.type)) return res.status(400).json({ error: 'Invalid offering type.' });
  const offering = await createWithPreservedId(prisma.offering, { id: body.id, accountId: req.membership.accountId, ...offeringData(body) }, req.membership.accountId);
  res.status(201).json({ offering: serializeOffering(offering) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageOfferings) return res.status(403).json({ error: 'Not authorized.' });
  const existing = await prisma.offering.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Offering not found.' });
  const body = req.body || {};
  if (body.name !== undefined && !body.name?.trim()) return res.status(400).json({ error: 'Offering name is required.' });
  if (body.type !== undefined && !TYPES.has(body.type)) return res.status(400).json({ error: 'Invalid offering type.' });
  const offering = await prisma.offering.update({ where: { id: existing.id }, data: offeringData(body, true) });
  res.json({ offering: serializeOffering(offering) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageOfferings) return res.status(403).json({ error: 'Not authorized.' });
  const existing = await prisma.offering.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Offering not found.' });
  await prisma.offering.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

export default router;
