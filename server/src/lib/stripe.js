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
  client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}
