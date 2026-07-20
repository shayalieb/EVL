import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

router.get('/', asyncHandler(async (req, res) => {
  const row = await prisma.accountData.findUnique({ where: { accountId: req.membership.accountId } });
  res.json({ data: row?.data ?? null });
}));

router.put('/', asyncHandler(async (req, res) => {
  const { data } = req.body || {};
  if (typeof data !== 'object' || data === null) {
    return res.status(400).json({ error: 'data is required.' });
  }
  const row = await prisma.accountData.upsert({
    where: { accountId: req.membership.accountId },
    update: { data },
    create: { accountId: req.membership.accountId, data },
  });
  res.json({ data: row.data });
}));

export default router;
