import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

const OFFERING_TYPES = new Set(['general', 'perUnit']);

function validOffering(item) {
  return typeof item?.id === 'string' && !!item.id.trim()
    && typeof item?.name === 'string' && !!item.name.trim()
    && OFFERING_TYPES.has(item.type)
    && (item.details == null || typeof item.details === 'string')
    && ['amount', 'unitCount', 'ratePerUnit'].every((field) => item[field] == null || ['string', 'number'].includes(typeof item[field]));
}

function validGroup(item) {
  return typeof item?.id === 'string' && !!item.id.trim()
    && typeof item?.name === 'string' && !!item.name.trim()
    && Array.isArray(item.contractorIds)
    && item.contractorIds.every((id) => typeof id === 'string')
    && (item.price == null || ['string', 'number'].includes(typeof item.price));
}

// Phase 5C's legacy cleanup. The blob is authoritative for this
// request: upsert its current records and remove table rows deleted during
// the 5A compatibility window. Only after this succeeds does the client
// remove the legacy arrays from AccountData.
router.post('/sync', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageOfferings) return res.status(403).json({ error: 'Not authorized.' });
  const offerings = req.body?.offerings;
  const contractorGroups = req.body?.contractorGroups;
  if (!Array.isArray(offerings) || !offerings.every(validOffering)) return res.status(400).json({ error: 'Invalid offerings.' });
  if (!Array.isArray(contractorGroups) || !contractorGroups.every(validGroup)) return res.status(400).json({ error: 'Invalid ensembles.' });

  const accountId = req.membership.accountId;
  const allIds = [...offerings.map(({ id }) => id), ...contractorGroups.map(({ id }) => id)];
  if (new Set(allIds).size !== allIds.length) return res.status(400).json({ error: 'Catalog IDs must be unique.' });
  const [existingOfferings, existingGroups] = await Promise.all([
    prisma.offering.findMany({ where: { id: { in: offerings.map(({ id }) => id) } }, select: { accountId: true } }),
    prisma.contractorGroup.findMany({ where: { id: { in: contractorGroups.map(({ id }) => id) } }, select: { accountId: true } }),
  ]);
  if ([...existingOfferings, ...existingGroups].some((item) => item.accountId !== accountId)) return res.status(409).json({ error: 'A catalog ID is already in use.' });

  await prisma.$transaction([
    ...offerings.map((item) => prisma.offering.upsert({
      where: { id: item.id },
      create: {
        id: item.id, accountId, name: item.name.trim(), details: item.details?.trim() || null, type: item.type,
        amount: item.amount === '' || item.amount == null ? null : String(item.amount),
        unitCount: item.unitCount === '' || item.unitCount == null ? null : String(item.unitCount),
        ratePerUnit: item.ratePerUnit === '' || item.ratePerUnit == null ? null : String(item.ratePerUnit),
      },
      update: {
        name: item.name.trim(), details: item.details?.trim() || null, type: item.type,
        amount: item.amount === '' || item.amount == null ? null : String(item.amount),
        unitCount: item.unitCount === '' || item.unitCount == null ? null : String(item.unitCount),
        ratePerUnit: item.ratePerUnit === '' || item.ratePerUnit == null ? null : String(item.ratePerUnit),
      },
    })),
    ...contractorGroups.map((item) => prisma.contractorGroup.upsert({
      where: { id: item.id },
      create: { id: item.id, accountId, name: item.name.trim(), contractorIds: item.contractorIds, price: item.price === '' || item.price == null ? null : String(item.price) },
      update: { name: item.name.trim(), contractorIds: item.contractorIds, price: item.price === '' || item.price == null ? null : String(item.price) },
    })),
    prisma.offering.deleteMany({ where: { accountId, ...(offerings.length ? { id: { notIn: offerings.map(({ id }) => id) } } : {}) } }),
    prisma.contractorGroup.deleteMany({ where: { accountId, ...(contractorGroups.length ? { id: { notIn: contractorGroups.map(({ id }) => id) } } : {}) } }),
  ]);
  res.json({ ok: true });
}));

export default router;
