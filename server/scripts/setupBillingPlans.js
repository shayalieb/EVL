// One-off, idempotent: creates the 3 subscription Products (+ monthly/
// annual Prices each) on Stripe for GigWorks' own billing (see
// src/lib/plans.js for the tier table this reads from), plus the platform
// billing webhook endpoint (src/routes/subscriptionWebhooks.js). Prints
// every ID/secret it creates — paste those into server/.env locally and
// into Railway's env vars for production. Nothing here is committed.
//
// Safe to re-run: existing Prices are matched by lookup_key and skipped,
// existing Products are matched by metadata.tierId and reused.
//
// Run once per Stripe mode — with the test STRIPE_SECRET_KEY first, and
// only after everything's verified working, again with the live key. Set
// SERVER_URL to this server's real public URL before running against
// production; it defaults to localhost, which is only useful for local
// testing.
//
// Usage: npm run setup:billing-plans   (from server/)
import 'dotenv/config';
import { getStripeClient } from '../src/lib/stripe.js';
import { PLAN_TIERS } from '../src/lib/plans.js';

async function findProductByTierId(stripe, tierId) {
  // Stripe has no server-side metadata filter for products.list — fine
  // here, since this only ever has to search a handful of hand-managed
  // products, not paginate a real catalog.
  const products = await stripe.products.list({ limit: 100, active: true });
  return products.data.find((p) => p.metadata?.tierId === tierId) || null;
}

async function findPriceByLookupKey(stripe, lookupKey) {
  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  return prices.data[0] || null;
}

async function ensurePrice(stripe, product, tier, interval, bucket) {
  const lookupKey = `${tier.id}_${interval === 'month' ? 'monthly' : 'annual'}`;
  const existing = await findPriceByLookupKey(stripe, lookupKey);
  if (existing) {
    console.log(`  ${lookupKey}: already exists (${existing.id}) — set ${bucket.priceEnvVar}=${existing.id}`);
    return existing;
  }
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: bucket.amountCents,
    recurring: { interval },
    lookup_key: lookupKey,
    nickname: `${tier.label} (${interval === 'month' ? 'Monthly' : 'Annual'})`,
  });
  console.log(`  ${lookupKey}: created ${price.id} — set ${bucket.priceEnvVar}=${price.id}`);
  return price;
}

async function ensureTier(stripe, tier) {
  let product = await findProductByTierId(stripe, tier.id);
  if (!product) {
    product = await stripe.products.create({
      name: `GigWorks ${tier.label}`,
      metadata: { tierId: tier.id, seatLimit: String(tier.seatLimit) },
    });
    console.log(`Product for ${tier.id}: created ${product.id}`);
  } else {
    console.log(`Product for ${tier.id}: already exists (${product.id})`);
  }
  await ensurePrice(stripe, product, tier, 'month', tier.monthly);
  await ensurePrice(stripe, product, tier, 'year', tier.annual);
}

async function ensureWebhookEndpoint(stripe) {
  const serverUrl = process.env.SERVER_URL || 'http://localhost:4000';
  if (!process.env.SERVER_URL) {
    console.log('SERVER_URL not set — defaulting to localhost. Set it to this server\'s real public URL before running this against production.');
  }
  const url = `${serverUrl}/api/webhooks/stripe-billing`;

  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const found = existing.data.find((e) => e.url === url);
  if (found) {
    console.log(`Webhook endpoint for ${url} already exists (${found.id}).`);
    console.log('  Its signing secret is only shown once, at creation — if STRIPE_BILLING_WEBHOOK_SECRET isn\'t already saved somewhere, delete this endpoint in the Stripe Dashboard and re-run this script.');
    return;
  }
  const endpoint = await stripe.webhookEndpoints.create({
    url,
    enabled_events: ['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted'],
  });
  console.log(`Created webhook endpoint for ${url} (${endpoint.id})`);
  console.log(`  Set STRIPE_BILLING_WEBHOOK_SECRET=${endpoint.secret}`);
}

async function main() {
  const stripe = getStripeClient();
  console.log('Setting up GigWorks subscription plans on Stripe...\n');
  for (const tier of PLAN_TIERS) {
    console.log(`--- ${tier.label} (${tier.id}, ${tier.seatLimit} seat${tier.seatLimit === 1 ? '' : 's'}) ---`);
    // eslint-disable-next-line no-await-in-loop
    await ensureTier(stripe, tier);
    console.log();
  }
  console.log('--- Webhook endpoint ---');
  await ensureWebhookEndpoint(stripe);
  console.log('\nDone. Copy every "set X=..." line above into server/.env (and Railway\'s env vars for production).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
