import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembershipForBilling } from '../lib/membership.js';
import { withSerializableTransaction } from '../lib/serializableTransaction.js';

const router = Router();
// Deliberately attachMembershipForBilling, not attachMembership — the whole
// point of this route is to be reachable by an account that hasn't yet
// satisfied attachMembership's agreementsRequiredAt/agreementsSignedAt
// check (see membership.js). Its name is billing-specific but its actual
// behavior (skip approval/subscription/agreements checks, still block a
// platform-disabled account) is exactly what's needed here too.
router.use(requireAuth, asyncHandler(attachMembershipForBilling));

router.get('/', asyncHandler(async (req, res) => {
  const agreements = await prisma.designPartnerAgreement.findMany({
    where: { accountId: req.membership.accountId },
    orderBy: { type: 'asc' },
  });
  res.json({ agreements });
}));

router.post('/sign', asyncHandler(async (req, res) => {
  const { signatureName, signatureImage } = req.body || {};
  if (!signatureName?.trim() || !signatureImage) {
    return res.status(400).json({ error: 'Signature name and signature image are required.' });
  }
  const { accountId } = req.membership;

  const result = await withSerializableTransaction(prisma, async (tx) => {
    const account = await tx.account.findUnique({ where: { id: accountId } });
    if (!account.agreementsRequiredAt) return { error: { status: 400, message: 'This account does not require design partner agreements.' } };
    if (account.agreementsSignedAt) return { error: { status: 409, message: "You've already signed these agreements." } };

    const agreements = await tx.designPartnerAgreement.findMany({ where: { accountId } });
    if (!agreements.length) return { error: { status: 404, message: 'No agreements found for this account.' } };

    const signedAt = new Date();
    const updated = await Promise.all(agreements.map((agreement) => {
      const expiresAt = new Date(signedAt);
      expiresAt.setFullYear(expiresAt.getFullYear() + agreement.termYears);
      return tx.designPartnerAgreement.update({
        where: { id: agreement.id },
        data: { signedAt, signatureName: signatureName.trim(), signatureImage, expiresAt },
      });
    }));
    await tx.account.update({ where: { id: accountId }, data: { agreementsSignedAt: signedAt } });
    return { agreements: updated };
  });
  if (result.error) return res.status(result.error.status).json({ error: result.error.message });

  res.json({ agreements: result.agreements });
}));

export default router;
