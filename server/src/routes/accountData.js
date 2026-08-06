import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

router.get('/', asyncHandler(async (req, res) => {
  const row = await prisma.accountData.findUnique({ where: { accountId: req.membership.accountId } });
  res.json({ data: row?.data ?? null, version: row?.version ?? null });
}));

// version is the value the client last read (null only for a brand-new
// account with no row yet). Updates are conditioned on it so two team
// members saving near-simultaneously can't silently clobber one another —
// see AccountData.version's doc comment in schema.prisma.
router.put('/', asyncHandler(async (req, res) => {
  const { data, version } = req.body || {};
  if (typeof data !== 'object' || data === null) {
    return res.status(400).json({ error: 'data is required.' });
  }

  if (version === null || version === undefined) {
    try {
      const row = await prisma.accountData.create({ data: { accountId: req.membership.accountId, data } });
      return res.json({ data: row.data, version: row.version });
    } catch (err) {
      if (err.code === 'P2002') {
        // Another request (e.g. a second tab) already created it — hand
        // back what's actually there instead of overwriting it.
        const existing = await prisma.accountData.findUnique({ where: { accountId: req.membership.accountId } });
        return res.status(409).json({ error: "This account's data already exists — retry with the latest version.", data: existing.data, version: existing.version });
      }
      throw err;
    }
  }

  const result = await prisma.accountData.updateMany({
    where: { accountId: req.membership.accountId, version },
    data: { data, version: { increment: 1 } },
  });

  if (result.count === 0) {
    const latest = await prisma.accountData.findUnique({ where: { accountId: req.membership.accountId } });
    return res.status(409).json({ error: "This account's data changed elsewhere — retry with the latest version.", data: latest?.data ?? null, version: latest?.version ?? null });
  }

  const row = await prisma.accountData.findUnique({ where: { accountId: req.membership.accountId } });
  res.json({ data: row.data, version: row.version });
}));

export default router;
