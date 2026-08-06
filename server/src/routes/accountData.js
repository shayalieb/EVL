import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

// Matches express.json()'s default body-size limit (see server/src/index.js)
// — a PUT past this actually fails with 413, not just slows down. Warning
// kicks in at 80% so there's runway to act (migrate a heavy list out of the
// blob, or reach out) before a save outright breaks.
const BODY_LIMIT_BYTES = 100 * 1024;
const WARNING_THRESHOLD_BYTES = Math.round(BODY_LIMIT_BYTES * 0.8);

function sizeWarningFor(data) {
  if (!data) return null;
  const bytes = Buffer.byteLength(JSON.stringify(data));
  if (bytes < WARNING_THRESHOLD_BYTES) return null;
  return {
    bytes,
    limitBytes: BODY_LIMIT_BYTES,
    message: `Account data is at ${Math.round(bytes / 1024)}KB of a ${Math.round(BODY_LIMIT_BYTES / 1024)}KB limit — new saves will start failing once it's full. Contact support to move some of your data to a more scalable format.`,
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const row = await prisma.accountData.findUnique({ where: { accountId: req.membership.accountId } });
  res.json({ data: row?.data ?? null, version: row?.version ?? null, sizeWarning: sizeWarningFor(row?.data) });
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
      return res.json({ data: row.data, version: row.version, sizeWarning: sizeWarningFor(row.data) });
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
  res.json({ data: row.data, version: row.version, sizeWarning: sizeWarningFor(row.data) });
}));

export default router;
