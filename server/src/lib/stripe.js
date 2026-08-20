import Stripe from 'stripe';

// Constructed lazily (not at module load) — mirrors resend.js's reasoning:
// throwing synchronously here would otherwise crash the entire server on
// boot whenever STRIPE_SECRET_KEY isn't set yet, not just the billing
// feature.
let client = null;

export function getStripeClient() {
  if (client) return client;
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Payments are not configured yet (STRIPE_SECRET_KEY is missing).');
  }
  // 15s, not the SDK's default (much longer) — a hung Stripe call shouldn't
  // hold a request handler's DB connection open indefinitely under load.
  client = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 15000 });
  return client;
}
