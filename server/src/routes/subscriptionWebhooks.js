import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { getStripeClient } from '../lib/stripe.js';
import { tierForPriceId } from '../lib/plans.js';
import { getWebsiteAdminConfig } from '../lib/websiteConfig.js';

const router = Router();

// Unauthenticated (no session) — verified via Stripe's own signature
// instead, same pattern as stripeWebhooks.js. Deliberately a SEPARATE
// webhook endpoint/secret from that one: these are platform-level events
// (GigWorks' own Customers/Subscriptions, created without a {stripeAccount}
// option), not connected-account events, so they need their own Stripe
// Dashboard webhook endpoint with "listen to connected accounts" OFF — the
// opposite toggle from stripeWebhooks.js. See scripts/setupBillingPlans.js,
// which creates that endpoint.
router.post('/stripe-billing', asyncHandler(async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_BILLING_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Billing is not configured yet.' });
  }

  let event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_BILLING_WEBHOOK_SECRET);
  } catch {
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.mode !== 'subscription' || !session.customer || !session.subscription) return res.json({ ok: true });

    const account = await prisma.account.findUnique({ where: { stripeCustomerId: session.customer } });
    if (!account) return res.json({ ok: true });

    // The subscription-level fields (status/planTier/seatLimit/trialEndsAt)
    // are set by customer.subscription.updated below, which Stripe always
    // fires alongside this event for a brand-new subscription — this event
    // only has to handle what's unique to it: recording the subscription
    // id, and the one-time auto-approval moment.
    await prisma.$transaction(async (tx) => {
      await tx.account.update({ where: { id: account.id }, data: { stripeSubscriptionId: session.subscription, ...(account.approvedAt ? {} : { approvedAt: new Date() }) } });
      if (!account.approvedAt) await tx.accountActivity.create({ data: { accountId: account.id, type: 'account_approved', summary: 'Account approved after checkout', metadata: { source: 'stripe' } } });
      await tx.accountActivity.create({ data: { accountId: account.id, type: 'checkout_completed', summary: 'Subscription checkout completed', metadata: { subscriptionId: session.subscription } } });
    });
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
    const subscription = event.data.object;
    const account = await prisma.account.findUnique({ where: { stripeCustomerId: subscription.customer } });
    if (!account) return res.json({ ok: true });

    const priceId = subscription.items?.data?.[0]?.price?.id;
    let resolved = priceId ? tierForPriceId(priceId) : null;
    if (subscription.metadata?.gigworksTier === 'agency') resolved = { tier: { id: 'agency', seatLimit: null }, interval: subscription.metadata.gigworksInterval === 'year' ? 'year' : 'month', groupCount: Math.min(500, Math.max(2, Number.parseInt(subscription.metadata.gigworksGroupCount, 10) || 2)) };
    if (priceId && !resolved) {
      const websiteConfig = await getWebsiteAdminConfig();
      for (const tier of websiteConfig.pricing.tiers) {
        if (tier.monthlyPriceId === priceId) resolved = { tier: { id: tier.id, seatLimit: tier.seatLimit }, interval: 'month' };
        if (tier.annualPriceId === priceId) resolved = { tier: { id: tier.id, seatLimit: tier.seatLimit }, interval: 'year' };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.account.update({ where: { id: account.id }, data: {
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        ...(resolved ? { planTier: resolved.tier.id, seatLimit: resolved.tier.seatLimit, billingInterval: resolved.interval, ...(resolved.tier.id === 'agency' ? { agencyGroupLimit: resolved.groupCount } : {}) } : {}),
        trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        // First time this account's subscription is ever confirmed active/
        // trialing — same auto-approval moment as checkout.session.completed
        // above, kept here too since a redelivered/reordered webhook could
        // land this event before that one.
        ...(!account.approvedAt && ['trialing', 'active'].includes(subscription.status) ? { approvedAt: new Date() } : {}),
      } });
      if (account.subscriptionStatus !== subscription.status || (resolved && account.planTier !== resolved.tier.id)) await tx.accountActivity.create({ data: { accountId: account.id, type: 'subscription_changed', summary: `Subscription ${subscription.status}${resolved ? ` · ${resolved.tier.id}` : ''}`, metadata: { fromStatus: account.subscriptionStatus, toStatus: subscription.status, fromPlan: account.planTier, toPlan: resolved?.tier.id || account.planTier } } });
      if (!account.approvedAt && ['trialing', 'active'].includes(subscription.status)) await tx.accountActivity.create({ data: { accountId: account.id, type: 'account_approved', summary: 'Account approved after subscription activation', metadata: { source: 'stripe' } } });
    });
  } else if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    await prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({ where: { stripeCustomerId: subscription.customer } });
      if (!account) return;
      await tx.account.update({ where: { id: account.id }, data: { subscriptionStatus: 'canceled' } });
      if (account.subscriptionStatus !== 'canceled') await tx.accountActivity.create({ data: { accountId: account.id, type: 'subscription_canceled', summary: 'Subscription canceled', metadata: { fromStatus: account.subscriptionStatus } } });
    });
  }

  res.json({ ok: true });
}));

export default router;
