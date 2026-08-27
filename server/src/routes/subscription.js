import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembershipForBilling, requireRole } from '../lib/membership.js';
import { getStripeClient } from '../lib/stripe.js';
import { priceIdFor } from '../lib/plans.js';
import { getBillingTier, getWebsiteConfig } from '../lib/websiteConfig.js';

const router = Router();

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

// GigWorks' own subscription is account-level configuration, not day-to-day
// work — same owner/admin-only gate as team.js/billing.js. Uses the lenient
// membership loader (not attachMembership) since an unapproved-because-no-
// plan-yet account, or one whose billing lapsed, both need to reach this
// router specifically in order to fix that.
router.use(requireAuth, asyncHandler(attachMembershipForBilling), requireRole('owner', 'admin'));

function serializeStatus(account) {
  return {
    planTier: account.planTier,
    billingInterval: account.billingInterval,
    subscriptionStatus: account.subscriptionStatus,
    seatLimit: account.seatLimit,
    trialEndsAt: account.trialEndsAt,
    hasStripeCustomer: !!account.stripeCustomerId,
  };
}

router.get('/status', asyncHandler(async (req, res) => {
  const [account, seatCount, websiteConfig] = await Promise.all([
    prisma.account.findUnique({ where: { id: req.membership.accountId } }),
    prisma.membership.count({ where: { accountId: req.membership.accountId } }),
    getWebsiteConfig(),
  ]);
  res.json({
    ...serializeStatus(account),
    seatCount,
    trialDays: websiteConfig.pricing.trialDays,
    // amountCents, not a Price ID — the picker just needs to display a
    // number, and this is the one config-level source of truth for it
    // (lib/plans.js) rather than a second hardcoded copy in the frontend.
    tiers: websiteConfig.pricing.tiers.map((t) => ({
      id: t.id,
      label: t.name,
      seatLimit: t.seatLimit,
      monthlyAmountCents: t.monthlyAmountCents,
      annualAmountCents: t.annualAmountCents,
    })),
  });
}));

// Starts (or restarts) a subscription checkout. A returning account with an
// existing stripeCustomerId reuses it — Stripe Customers persist across a
// canceled subscription, so re-subscribing shouldn't create a duplicate one.
router.post('/checkout', asyncHandler(async (req, res) => {
  const { tier: tierId, interval } = req.body || {};
  const tier = await getBillingTier(tierId);
  if (!tier) return res.status(400).json({ error: 'Unknown plan.' });
  const priceId = interval === 'month'
    ? (tier.monthlyPriceId || priceIdFor(tierId, interval))
    : interval === 'year'
      ? (tier.annualPriceId || priceIdFor(tierId, interval))
      : null;
  if (!priceId) return res.status(400).json({ error: 'Invalid billing interval.' });

  const stripe = getStripeClient();
  const account = await prisma.account.findUnique({ where: { id: req.membership.accountId } });

  try {
    let customerId = account.stripeCustomerId;
    if (!customerId) {
      const owner = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } });
      const customer = await stripe.customers.create({ email: owner.email, metadata: { accountId: account.id } });
      customerId = customer.id;
      await prisma.account.update({ where: { id: account.id }, data: { stripeCustomerId: customerId } });
    }

    const websiteConfig = await getWebsiteConfig();
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: websiteConfig.pricing.trialDays > 0
        ? { trial_period_days: websiteConfig.pricing.trialDays }
        : {},
      // This Stripe account has Managed Payments (automatic sales-tax
      // collection) on by default, which requires a tax_code on every
      // Product to work — deliberately left off in setupBillingPlans.js
      // since enabling real tax collection is its own decision (jurisdiction
      // registration, etc.), not something to configure silently as a side
      // effect of wiring up checkout. Revisit before going live.
      managed_payments: { enabled: false },
      // Both land on the same authenticated route — App.jsx's gate is a
      // conditional render off accountApproved/subscriptionStatus, not a
      // distinct URL, so either outcome naturally shows the right screen
      // once the app re-checks /auth/me.
      success_url: `${frontendUrl()}/home?subscriptionStarted=1`,
      cancel_url: `${frontendUrl()}/home?checkoutCanceled=1`,
    });
    res.json({ url: session.url });
  } catch (err) {
    if (!err?.type?.startsWith('Stripe')) throw err;
    console.error(`Stripe checkout creation failed for account ${account.id}:`, err);
    return res.status(502).json({ error: 'Stripe is temporarily unavailable. Please try again shortly, or contact support if this continues.' });
  }
}));

// The one place an account manages everything about its subscription —
// upgrade/downgrade tier, switch monthly/annual, update payment method,
// view invoice history, cancel. All handled by Stripe's own hosted portal,
// not custom UI here.
router.post('/portal', asyncHandler(async (req, res) => {
  const account = await prisma.account.findUnique({ where: { id: req.membership.accountId } });
  if (!account.stripeCustomerId) {
    return res.status(400).json({ error: "You haven't started a subscription yet." });
  }

  const stripe = getStripeClient();
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: account.stripeCustomerId,
      return_url: `${frontendUrl()}/settings?tab=plan`,
    });
    res.json({ url: session.url });
  } catch (err) {
    if (!err?.type?.startsWith('Stripe')) throw err;
    console.error(`Stripe billing portal session failed for account ${account.id}:`, err);
    return res.status(502).json({ error: 'Stripe is temporarily unavailable. Please try again shortly, or contact support if this continues.' });
  }
}));

export default router;
