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

  // Stripe API/config failures here (e.g. a Connect capability not enabled
  // on our platform account) are an upstream/ops problem, not something the
  // business owner clicking this button can do anything about — caught
  // separately from the generic error handler so they get a message that
  // says "try again later," not a bare "something went wrong," and so this
  // shows up in logs tagged as a Stripe failure rather than a stack trace
  // with no context. Non-Stripe errors (actual bugs) still rethrow to the
  // normal 500 path.
  try {
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

    // Once onboarding has actually finished, re-clicking Connect should let
    // the business edit what they already submitted (bank account, business
    // info, etc.) rather than restart the same onboarding flow — Stripe's
    // 'account_update' link type is the edit-mode equivalent of
    // 'account_onboarding'. Our cached stripeChargesEnabled can lag Stripe's
    // own view of "fully done", and Stripe rejects 'account_update' for an
    // account that still has open requirements — so try it when our cache
    // says charges are enabled, and fall back to 'account_onboarding' if
    // Stripe still disagrees, rather than 400ing the whole request.
    const linkParams = {
      account: account.stripeAccountId,
      refresh_url: `${frontendUrl()}/settings?stripeRefresh=1`,
      return_url: `${frontendUrl()}/settings?stripeReturn=1`,
    };
    let accountLink;
    if (account.stripeChargesEnabled) {
      try {
        accountLink = await stripe.accountLinks.create({ ...linkParams, type: 'account_update' });
      } catch (err) {
        if (!err?.message?.includes('Valid types for this account')) throw err;
      }
    }
    if (!accountLink) {
      accountLink = await stripe.accountLinks.create({ ...linkParams, type: 'account_onboarding' });
    }

    res.json({ url: accountLink.url });
  } catch (err) {
    if (!err?.type?.startsWith('Stripe')) throw err;
    console.error(`Stripe Connect setup failed for account ${account.id}:`, err);
    return res.status(502).json({ error: 'Stripe is temporarily unavailable. Please try again shortly, or contact support if this continues.' });
  }
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
