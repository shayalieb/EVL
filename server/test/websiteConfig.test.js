import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_WEBSITE_CONFIG, normalizeWebsiteConfig } from '../src/lib/websiteConfig.js';

test('website configuration preserves safe editable pricing and copy', () => {
  const config = normalizeWebsiteConfig({
    publicSignupsEnabled: true,
    hero: { headline: 'A better headline' },
    pricing: {
      trialDays: 21,
      tiers: [{ id: 'solo', name: 'Starter', monthlyAmountCents: 2900, annualAmountCents: 27600, monthlyPriceId: 'price_new' }],
    },
  });
  assert.equal(config.publicSignupsEnabled, true);
  assert.equal(config.hero.headline, 'A better headline');
  assert.equal(config.pricing.trialDays, 21);
  assert.equal(config.pricing.tiers[0].name, 'Starter');
  assert.equal(config.pricing.tiers[0].monthlyAmountCents, 2900);
  assert.equal(config.pricing.tiers[0].monthlyPriceId, 'price_new');
  assert.equal(config.pricing.tiers.length, 3);
  assert.equal(config.navigation.signup, 'Start Free Trial');
  assert.equal(config.story.paragraphs.length, 2);
  assert.equal(config.painPoints.items.length, 6);
  assert.equal(config.features.groups.length, 4);
  assert.equal(config.faq.items.length, 7);
  assert.equal(config.waitlist.namePlaceholder, 'Your name');
});

test('website configuration rejects unsafe price ranges and unknown tiers', () => {
  const config = normalizeWebsiteConfig({
    pricing: { tiers: [{ id: 'solo', monthlyAmountCents: -1 }, { id: 'fake', monthlyAmountCents: 9999 }] },
  });
  assert.equal(config.pricing.tiers[0].monthlyAmountCents, DEFAULT_WEBSITE_CONFIG.pricing.tiers[0].monthlyAmountCents);
  assert.deepEqual(config.pricing.tiers.map((tier) => tier.id), ['solo', 'team', 'studio']);
});
