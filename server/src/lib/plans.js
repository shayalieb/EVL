// GigWorks' own subscription tiers — what a business pays GigWorks, not
// what their clients pay them (that's Stripe Connect, see lib/stripe.js's
// usage in billing.js/invoices.js). Pricing here is provisional — edit
// freely before running scripts/setupBillingPlans.js, especially before
// ever running it in live mode.
//
// priceEnvVar values name the env vars that hold each tier's actual Stripe
// Price ID (set by scripts/setupBillingPlans.js, or by hand for an existing
// Stripe setup) — the IDs themselves are per-Stripe-mode (test vs. live)
// and never hardcoded here.
export const PLAN_TIERS = [
  {
    id: 'solo',
    label: 'Solo',
    seatLimit: 1,
    monthly: { amountCents: 2500, priceEnvVar: 'STRIPE_PRICE_SOLO_MONTHLY' },
    annual: { amountCents: 24000, priceEnvVar: 'STRIPE_PRICE_SOLO_ANNUAL' },
  },
  {
    id: 'team',
    label: 'Team',
    seatLimit: 2,
    monthly: { amountCents: 4500, priceEnvVar: 'STRIPE_PRICE_TEAM_MONTHLY' },
    annual: { amountCents: 45600, priceEnvVar: 'STRIPE_PRICE_TEAM_ANNUAL' },
  },
  {
    id: 'studio',
    label: 'Studio',
    seatLimit: 5,
    monthly: { amountCents: 8900, priceEnvVar: 'STRIPE_PRICE_STUDIO_MONTHLY' },
    annual: { amountCents: 90000, priceEnvVar: 'STRIPE_PRICE_STUDIO_ANNUAL' },
  },
];

export function planById(tierId) {
  return PLAN_TIERS.find((t) => t.id === tierId) || null;
}

export function priceIdFor(tierId, interval) {
  const tier = planById(tierId);
  if (!tier) return null;
  const bucket = interval === 'year' ? tier.annual : interval === 'month' ? tier.monthly : null;
  if (!bucket) return null;
  return process.env[bucket.priceEnvVar] || null;
}

// Reverse lookup used by subscriptionWebhooks.js — a subscription's Price
// ID is the only thing Stripe hands back, so this is how a webhook resolves
// which tier/interval an account actually landed on.
export function tierForPriceId(priceId) {
  for (const tier of PLAN_TIERS) {
    if (process.env[tier.monthly.priceEnvVar] === priceId) return { tier, interval: 'month' };
    if (process.env[tier.annual.priceEnvVar] === priceId) return { tier, interval: 'year' };
  }
  return null;
}
