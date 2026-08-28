import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_WEBSITE_CONFIG, normalizeWebsiteConfig, publicWebsiteConfig } from '../src/lib/websiteConfig.js';

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
  assert.equal(config.features.comparison.categories.length, 4);
  assert.equal(config.features.comparison.categories[0].rows[0].solo, 'Included');
  assert.equal(config.testimonials.enabled, false);
  assert.deepEqual(config.testimonials.reviews, []);
  assert.equal(config.faq.items.length, 7);
  assert.equal(config.waitlist.namePlaceholder, 'Your name');
});

test('website configuration safely stores controlled customer reviews and stories', () => {
  const config = normalizeWebsiteConfig({
    testimonials: {
      enabled: true,
      reviews: [{ id: 'group-one', groupName: 'Group One', quote: 'It keeps every gig together.', rating: 9, published: true, featured: true, storyPublished: true, storyTitle: 'A better workflow', storyBody: 'We replaced three tools.' }],
    },
  });
  assert.equal(config.testimonials.enabled, true);
  assert.equal(config.testimonials.reviews[0].rating, 5);
  assert.equal(config.testimonials.reviews[0].published, true);
  assert.equal(config.testimonials.reviews[0].storyTitle, 'A better workflow');
});

test('public website configuration excludes unpublished reviews and story drafts', () => {
  const config = normalizeWebsiteConfig({ testimonials: { enabled: true, reviews: [
    { id: 'public', groupName: 'Public Group', quote: 'Published review', published: true, storyPublished: false, storyBody: 'Private draft' },
    { id: 'draft', groupName: 'Draft Group', quote: 'Unpublished review', published: false, storyPublished: true, storyBody: 'Unpublished story' },
  ] } });
  const publicConfig = publicWebsiteConfig(config);
  assert.deepEqual(publicConfig.testimonials.reviews.map((review) => review.id), ['public']);
  assert.equal(publicConfig.testimonials.reviews[0].storyBody, '');
});

test('website configuration rejects unsafe price ranges and unknown tiers', () => {
  const config = normalizeWebsiteConfig({
    pricing: { tiers: [{ id: 'solo', monthlyAmountCents: -1 }, { id: 'fake', monthlyAmountCents: 9999 }] },
  });
  assert.equal(config.pricing.tiers[0].monthlyAmountCents, DEFAULT_WEBSITE_CONFIG.pricing.tiers[0].monthlyAmountCents);
  assert.deepEqual(config.pricing.tiers.map((tier) => tier.id), ['solo', 'team', 'studio']);
});
