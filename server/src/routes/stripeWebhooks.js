import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { getStripeClient } from '../lib/stripe.js';
import { invoiceTotal } from './invoices.js';

const router = Router();

// Unauthenticated (no session) — verified via Stripe's own signature
// instead. Body must be the exact raw bytes Stripe sent, so this route is
// mounted with express.raw() ahead of the app's global express.json() in
// index.js — same reasoning as the Resend webhook in emailWebhooks.js.
//
// Requires a Stripe Dashboard webhook endpoint pointed at this route with
// "Listen to events on Connected accounts" enabled, subscribed to
// checkout.session.completed and account.updated — both are connected-
// account events (the Checkout Session is created *as* the connected
// account via {stripeAccount}, and Connect onboarding updates are reported
// the same way), so without that toggle neither would ever arrive here.
router.post('/stripe', asyncHandler(async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Payments are not configured yet.' });
  }

  let event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const invoiceId = session.metadata?.invoiceId;
    if (invoiceId) {
      // Checkout was created for either the full total ('sent') or the
      // remaining balance ('partial') — either way, completion means the
      // invoice is now fully paid, so paidAmount is always set to the full
      // total rather than added to whatever was there before.
      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      // Status-guarded rather than a unique-constraint-collision check
      // (nothing here would collide on a redelivery) — a repeated delivery
      // of the same event just no-ops the second time, which is the
      // natural idempotency key for this shape.
      if (invoice && invoice.status !== 'paid') {
        await prisma.invoice.update({
          where: { id: invoiceId },
          data: { status: 'paid', paidAmount: invoiceTotal(invoice), paidAt: new Date(), stripePaymentIntentId: session.payment_intent },
        });
      }
    }
  } else if (event.type === 'account.updated') {
    const account = event.data.object;
    await prisma.account.updateMany({
      where: { stripeAccountId: account.id },
      data: {
        stripeDetailsSubmitted: !!account.details_submitted,
        stripeChargesEnabled: !!account.charges_enabled,
        stripePayoutsEnabled: !!account.payouts_enabled,
      },
    });
  }

  res.json({ ok: true });
}));

export default router;
