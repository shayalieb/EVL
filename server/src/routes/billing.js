import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, requireRole } from '../lib/membership.js';
import { getStripeClient } from '../lib/stripe.js';

const router = Router();

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

// Connect setup is account-level configuration, not day-to-day invoicing —
// same owner/admin-only gate as team.js.
router.use(requireAuth, asyncHandler(attachMembership), requireRole('owner', 'admin'));

function serializeStatus(account) {
  return {
    connected: !!account.stripeAccountId,
    detailsSubmitted: account.stripeDetailsSubmitted,
    chargesEnabled: account.stripeChargesEnabled,
    payoutsEnabled: account.stripePayoutsEnabled,
  };
}

router.get('/connect-status', asyncHandler(async (req, res) => {
  const account = await prisma.account.findUnique({ where: { id: req.membership.accountId } });
  res.json(serializeStatus(account));
}));

// Idempotent start-or-resume: creates the Express account only once, then
// always mints a fresh Account Link — links expire after a short window, so
// re-requesting one (e.g. after the "refresh_url" bounce) is the normal path,
// not an error case.
router.post('/connect', asyncHandler(async (req, res) => {
  let account = await prisma.account.findUnique({ where: { id: req.membership.accountId } });
  const stripe = getStripeClient();

  if (!account.stripeAccountId) {
    const owner = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } });
    const stripeAccount = await stripe.accounts.create({
      type: 'express',
      email: owner.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    account = await prisma.account.update({
      where: { id: account.id },
      data: { stripeAccountId: stripeAccount.id },
    });
  }

  const accountLink = await stripe.accountLinks.create({
    account: account.stripeAccountId,
    refresh_url: `${frontendUrl()}/settings?stripeRefresh=1`,
    return_url: `${frontendUrl()}/settings?stripeReturn=1`,
    type: 'account_onboarding',
  });

  res.json({ url: accountLink.url });
}));

// Called once when the frontend detects it's back from the onboarding
// redirect — account.updated webhooks (server/src/routes/stripeWebhooks.js)
// keep this in sync going forward, but can lag the redirect by a few
// seconds, so this gives an immediate, accurate status right after.
router.post('/refresh-status', asyncHandler(async (req, res) => {
  const account = await prisma.account.findUnique({ where: { id: req.membership.accountId } });
  if (!account.stripeAccountId) return res.json(serializeStatus(account));

  const stripe = getStripeClient();
  const stripeAccount = await stripe.accounts.retrieve(account.stripeAccountId);
  const updated = await prisma.account.update({
    where: { id: account.id },
    data: {
      stripeDetailsSubmitted: !!stripeAccount.details_submitted,
      stripeChargesEnabled: !!stripeAccount.charges_enabled,
      stripePayoutsEnabled: !!stripeAccount.payouts_enabled,
    },
  });
  res.json(serializeStatus(updated));
}));

export default router;
