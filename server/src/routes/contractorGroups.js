import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { createWithPreservedId } from '../lib/idPreservingCreate.js';
import { paginationFromRequest, paginatedResponse, listPageFromRequest, listPageResponse } from '../lib/pagination.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

function serializeGroup(group) {
  return { id: group.id, name: group.name, contractorIds: group.contractorIds, price: group.price ?? '', createdAt: group.createdAt, updatedAt: group.updatedAt };
}

function groupData(body, partial = false) {
  const data = {};
  if (!partial || body.name !== undefined) data.name = body.name.trim();
  if (!partial || body.contractorIds !== undefined) data.contractorIds = body.contractorIds;
  if (!partial || body.price !== undefined) data.price = body.price === '' || body.price == null ? null : String(body.price);
  return data;
}

router.get('/', asyncHandler(async (req, res) => {
  if (req.query.page !== undefined) {
    const pagination = listPageFromRequest(req, ['createdAt', 'name', 'updatedAt'], 'name');
    const search = String(req.query.search || '').trim();
    const where = { accountId: req.membership.accountId, ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}) };
    const [items, total] = await Promise.all([
      prisma.contractorGroup.findMany({ where, orderBy: [{ [pagination.sort]: pagination.direction }, { id: pagination.direction }], skip: pagination.skip, take: pagination.pageSize }),
      prisma.contractorGroup.count({ where }),
    ]);
    return res.json({ contractorGroups: listPageResponse(items.map(serializeGroup), total, pagination) });
  }
  const pagination = paginationFromRequest(req);
  if (!pagination) return res.status(400).json({ error: 'Invalid pagination cursor.' });
  const groups = await prisma.contractorGroup.findMany({ where: { accountId: req.membership.accountId, ...pagination.cursorWhere }, orderBy: pagination.orderBy, take: pagination.limit + 1 });
  const { page, nextCursor } = paginatedResponse(groups, pagination.limit);
  res.json({ contractorGroups: page.map(serializeGroup), nextCursor });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const group = await prisma.contractorGroup.findUnique({ where: { id: req.params.id } });
  if (!group || group.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Ensemble not found.' });
  res.json({ contractorGroup: serializeGroup(group) });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageOfferings) return res.status(403).json({ error: 'Not authorized.' });
  const body = req.body || {};
  if (!body.id?.trim()) return res.status(400).json({ error: 'id is required.' });
  if (!body.name?.trim()) return res.status(400).json({ error: 'Ensemble name is required.' });
  if (!Array.isArray(body.contractorIds) || body.contractorIds.some((id) => typeof id !== 'string')) return res.status(400).json({ error: 'contractorIds must be an array of IDs.' });
  const group = await createWithPreservedId(prisma.contractorGroup, { id: body.id, accountId: req.membership.accountId, ...groupData(body) }, req.membership.accountId);
  res.status(201).json({ contractorGroup: serializeGroup(group) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageOfferings) return res.status(403).json({ error: 'Not authorized.' });
  const existing = await prisma.contractorGroup.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Ensemble not found.' });
  const body = req.body || {};
  if (body.name !== undefined && !body.name?.trim()) return res.status(400).json({ error: 'Ensemble name is required.' });
  if (body.contractorIds !== undefined && (!Array.isArray(body.contractorIds) || body.contractorIds.some((id) => typeof id !== 'string'))) return res.status(400).json({ error: 'contractorIds must be an array of IDs.' });
  const group = await prisma.contractorGroup.update({ where: { id: existing.id }, data: groupData(body, true) });
  res.json({ contractorGroup: serializeGroup(group) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageOfferings) return res.status(403).json({ error: 'Not authorized.' });
  const existing = await prisma.contractorGroup.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.accountId !== req.membership.accountId) return res.status(404).json({ error: 'Ensemble not found.' });
  await prisma.contractorGroup.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

export default router;
