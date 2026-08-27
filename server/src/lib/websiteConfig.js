import { prisma } from './prisma.js';
import { PLAN_TIERS } from './plans.js';

export const DEFAULT_WEBSITE_CONFIG = {
  publicSignupsEnabled: false,
  hero: {
    eyebrow: 'For bands, DJs & orchestras booking out a roster',
    headline: 'Built by a musician who spent 20 years chasing confirmations instead of chasing gigs.',
    description: "GigWorks is the business software for entertainment agencies and bandleaders who book out multiple musicians — proposals, contracts, and invoicing for your clients, plus the day-of details connected to who's actually on the gig.",
  },
  pricing: {
    heading: 'Every plan runs the whole gig',
    description: 'Choose based on the size of your team—not which tools you’re allowed to use.',
    trialDays: 14,
    tiers: PLAN_TIERS.map((tier) => ({
      id: tier.id,
      name: tier.label,
      seatLimit: tier.seatLimit,
      monthlyAmountCents: tier.monthly.amountCents,
      annualAmountCents: tier.annual.amountCents,
      description: tier.id === 'solo'
        ? 'For independent bandleaders and performers running their own calendar.'
        : tier.id === 'team'
          ? 'For small teams sharing bookings, staffing, and client follow-up.'
          : 'For growing entertainment companies coordinating multiple people.',
      featured: tier.id === 'team',
    })),
  },
};

function text(value, fallback, max = 500) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
}

function amount(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 1000000 ? parsed : fallback;
}

export function normalizeWebsiteConfig(input = {}) {
  const pricing = input.pricing || {};
  return {
    publicSignupsEnabled: input.publicSignupsEnabled === true,
    hero: {
      eyebrow: text(input.hero?.eyebrow, DEFAULT_WEBSITE_CONFIG.hero.eyebrow, 120),
      headline: text(input.hero?.headline, DEFAULT_WEBSITE_CONFIG.hero.headline, 180),
      description: text(input.hero?.description, DEFAULT_WEBSITE_CONFIG.hero.description, 600),
    },
    pricing: {
      heading: text(pricing.heading, DEFAULT_WEBSITE_CONFIG.pricing.heading, 140),
      description: text(pricing.description, DEFAULT_WEBSITE_CONFIG.pricing.description, 300),
      trialDays: Math.min(60, Math.max(0, Number.parseInt(pricing.trialDays, 10) || 14)),
      tiers: DEFAULT_WEBSITE_CONFIG.pricing.tiers.map((fallback) => {
        const incoming = pricing.tiers?.find((tier) => tier?.id === fallback.id) || {};
        return {
          ...fallback,
          name: text(incoming.name, fallback.name, 40),
          description: text(incoming.description, fallback.description, 220),
          featured: incoming.featured === true,
          monthlyAmountCents: amount(incoming.monthlyAmountCents, fallback.monthlyAmountCents),
          annualAmountCents: amount(incoming.annualAmountCents, fallback.annualAmountCents),
          seatLimit: fallback.seatLimit,
          monthlyPriceId: typeof incoming.monthlyPriceId === 'string' ? incoming.monthlyPriceId : null,
          annualPriceId: typeof incoming.annualPriceId === 'string' ? incoming.annualPriceId : null,
        };
      }),
    },
  };
}

export async function getWebsiteAdminConfig() {
  const row = await prisma.websiteSetting.findUnique({ where: { id: 'main' } });
  return normalizeWebsiteConfig(row?.config || DEFAULT_WEBSITE_CONFIG);
}

export async function getWebsiteConfig() {
  const config = await getWebsiteAdminConfig();
  return {
    ...config,
    pricing: {
      ...config.pricing,
      tiers: config.pricing.tiers.map(({ monthlyPriceId: _monthly, annualPriceId: _annual, ...tier }) => tier),
    },
  };
}

export async function getBillingTier(tierId) {
  const config = await getWebsiteAdminConfig();
  return config.pricing.tiers.find((tier) => tier.id === tierId) || null;
}
