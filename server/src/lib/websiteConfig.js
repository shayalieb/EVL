import { prisma } from './prisma.js';
import { PLAN_TIERS } from './plans.js';

const painItems = [
  ['Confirmed? Tentative? Ghosted?', "Chasing contractors for a yes/no by text, with no single place to see who's actually locked in for Saturday.", "Every contractor's status is tracked per event, and they can confirm or decline from a link on their own phone — no more guessing."],
  ['The same quartet, rebuilt from scratch every single gig.', 'Adding the same trio or quartet to the roster one contractor at a time, for every wedding they play.', "Save it once as an Ensemble — add the whole group to any event's roster in one click, priced as a flat package or the sum of each member's own rate."],
  ['The stage plot lives in a different app than the gig.', 'Building it separately, emailing it around, hoping it reaches the sound engineer before load-in.', "A stage plot builder tied directly to the event and the real lineup booked on it — not a disconnected file."],
  ['Set lists get retyped for every gig.', 'Copy-pasting the same songs into a new doc each time, then emailing a PDF with no real way to grab the sheet music.', 'A saved set list library, pulled into any gig in one click, emailed with real downloadable links.'],
  ['Deposits tracked in a notebook (or not at all).', 'Proposals and contracts scattered across email threads, payments collected however works that week.', 'Clients accept proposals and e-sign contracts online, invoicing with real payment collection — all attached to the booking itself.'],
  ["No idea what's actually at risk until it's too late.", 'Realizing three days out that a client went quiet or a vendor never confirmed.', 'A real dashboard and automatic reminders that surface it before it becomes a crisis, not after.'],
].map(([title, problem, fix]) => ({ title, problem, fix }));

const featureGroups = [
  ['clients', 'For your clients', ['Inquiry-to-booking pipeline', 'Proposals your client accepts online', 'Contracts with e-signature', 'Invoicing with built-in Stripe payments']],
  ['roster', 'For your roster', ['Contractor roster & availability', 'Per-event confirm/decline tracking', 'Ensembles — save a group once, add its whole lineup in one click', 'A home-screen link every contractor can check themselves']],
  ['dayOf', 'For the day of', ['Stage plots with a live drag-and-drop canvas', 'Set lists with email + PDF export', 'Backline & production lists', 'Prep sheets & crew schedules']],
  ['oversight', 'For staying on top of it', ['A dashboard that surfaces what actually needs attention', 'Automatic alerts for at-risk events and overdue invoices', 'Email templates with merge fields for real event details', 'Manual reminders tied to any client or contractor']],
].map(([id, title, items]) => ({ id, title, items }));

const faqItems = [
  ['Who is GigWorks actually built for?', "Bands, DJs, orchestras, and the agencies or bandleaders who book them out — anyone staffing more than one musician against a calendar of gigs. If you're assembling a roster for each event rather than just showing up yourself, this is built around that specific problem."],
  ['How do my musicians confirm or decline a gig without me chasing them down?', "Every contractor gets their own gig calendar link — a bookmarkable page showing just their own upcoming gigs, no app account or login required. They can accept or decline right from their phone, and their status updates on your roster the moment they do."],
  ["What happens if I need to swap a musician after the contract's already signed?", 'A signed contract lists an ensemble by instrumentation — "Sax, Drums, Keys" — never the specific musicians\' names. Swapping a player for a gig later never contradicts what the client actually agreed to.'],
  ['Is the client-facing proposal and contract actually legally binding?', "The proposal is something a client reviews and accepts (or sends back with requested changes) — it's a decision, not a signature. The contract is the real e-signature step: both sides draw a signature and type a legal name, and an Electronic Signature Consent clause citing the U.S. E-SIGN Act is included automatically."],
  ['How does getting paid actually work — does GigWorks touch the money?', "Invoices are paid directly into your own bank account through Stripe Connect — GigWorks never touches the money. If a client pays outside the app instead (check, cash), you log that manually and it's tracked the same way."],
  ['Do I have to run every gig through the full proposal-and-contract pipeline?', 'No. That pipeline is there for a formal booking with a paper trail, but you can also add an event directly for a one-off or word-of-mouth gig with no sales process attached at all.'],
  ['When can I start using it, and what does it cost?', 'See the pricing section above for current plans and availability.'],
].map(([question, answer]) => ({ question, answer }));

const comparisonCategories = [
  ['Client & sales', [
    ['Unlimited clients, bookings, and events', 'Included', 'Included', 'Included'],
    ['Public inquiry and booking links', 'Included', 'Included', 'Included'],
    ['Online proposals and approvals', 'Included', 'Included', 'Included'],
    ['E-signature contracts', 'Included', 'Included', 'Included'],
    ['Invoices and Stripe payments', 'Included', 'Included', 'Included'],
  ]],
  ['Roster & staffing', [
    ['Contractor directory and availability', 'Included', 'Included', 'Included'],
    ['Mobile confirm and decline links', 'Included', 'Included', 'Included'],
    ['Saved ensembles and group pricing', 'Included', 'Included', 'Included'],
    ['Contractor gig calendars', 'Included', 'Included', 'Included'],
  ]],
  ['Event preparation', [
    ['Stage plot builder and global library', 'Included', 'Included', 'Included'],
    ['Set lists and reusable library', 'Included', 'Included', 'Included'],
    ['Backline and production lists', 'Included', 'Included', 'Included'],
    ['Prep sheets and crew schedules', 'Included', 'Included', 'Included'],
  ]],
  ['Business operations', [
    ['Dashboard and risk alerts', 'Included', 'Included', 'Included'],
    ['Reminders and recurring follow-up', 'Included', 'Included', 'Included'],
    ['Email templates and merge fields', 'Included', 'Included', 'Included'],
    ['Team members', '1', '2', '5'],
  ]],
].map(([name, rows], categoryIndex) => ({
  id: `category-${categoryIndex + 1}`,
  name,
  rows: rows.map(([feature, solo, team, studio], rowIndex) => ({ id: `feature-${categoryIndex + 1}-${rowIndex + 1}`, feature, solo, team, studio })),
}));

export const DEFAULT_WEBSITE_CONFIG = {
  publicSignupsEnabled: false,
  navigation: { story: 'Story', features: 'Features', pricing: 'Pricing', faq: 'FAQ', login: 'Log In', waitlist: 'Join Waitlist', signup: 'Start Free Trial' },
  hero: { eyebrow: 'For bands, DJs & orchestras booking out a roster', headline: 'Built by a musician who spent 20 years chasing confirmations instead of chasing gigs.', description: "GigWorks is the business software for entertainment agencies and bandleaders who book out multiple musicians — proposals, contracts, and invoicing for your clients, plus the day-of details connected to who's actually on the gig.", contactButton: 'Get in Touch' },
  story: { label: 'Built from the gig, not a guess', paragraphs: ["I've been a gigging musician for over 20 years — playing my own gigs, working for other bandleaders and offices, and staffing musicians out to weddings and events booked through agencies. I've been on every side of this business: the player waiting to hear if a gig is actually confirmed, the bandleader chasing five people for a stage plot two days before a wedding, and the office trying to keep a whole roster straight through a busy season.", "GigWorks is what I wished existed the entire time. Every feature in it came from a real pain point I've personally run into over two decades of doing this work — not a guess at what musicians need from someone who's never had to load in at 4pm and be ready by 6."] },
  painPoints: { heading: 'Sound familiar?', description: "These aren't hypothetical problems — they're what running an entertainment business actually feels like without the right tools.", items: painItems },
  features: { heading: 'One place for the whole gig', groups: featureGroups, comparison: { eyebrow: 'Compare plans', heading: 'Everything you need, at every tier', description: 'Core workflow features are included on every plan. Choose based on how many people need access.', featureColumnLabel: 'Feature', footer: 'All plans include a 14-day free trial. Prices and team limits are shown in the pricing section below.', categories: comparisonCategories } },
  pricing: { label: 'Simple pricing', heading: 'Every plan runs the whole gig', description: 'Choose based on the size of your team—not which tools you’re allowed to use.', monthlyLabel: 'Monthly', annualLabel: 'Annual', annualSavingsLabel: 'Save up to 20%', featuredLabel: 'Most popular', perMonthLabel: '/month', billedAnnuallyLabel: 'billed annually', billedMonthlyLabel: 'Billed monthly', trialButtonLabel: 'Start {days}-day free trial', trialFooterLabel: '{days}-day free trial at launch.', trialDays: 14, footer: 'Cancel anytime. Secure billing through Stripe.', includedFeatures: ['Unlimited clients, bookings, and events', 'Proposals, e-sign contracts, and invoices', 'Contractor confirmations and availability', 'Stage plots, set lists, and production details', 'Templates, reminders, and client payment tools'], tiers: PLAN_TIERS.map((tier) => ({ id: tier.id, name: tier.label, seatLimit: tier.seatLimit, monthlyAmountCents: tier.monthly.amountCents, annualAmountCents: tier.annual.amountCents, description: tier.id === 'solo' ? 'For independent bandleaders and performers running their own calendar.' : tier.id === 'team' ? 'For small teams sharing bookings, staffing, and client follow-up.' : 'For growing entertainment companies coordinating multiple people.', featured: tier.id === 'team' })) },
  faq: { heading: 'Questions bandleaders actually ask', description: 'Most critical first — scroll down for the smaller stuff.', items: faqItems },
  waitlist: { heading: 'Get Waitlisted', description: "GigWorks is currently onboarding a small first group of agencies and bandleaders directly. Join the waitlist and I'll reach out personally.", success: "You're on the list — thanks for the interest. I'll be in touch soon.", submitLabel: 'Join the Waitlist', namePlaceholder: 'Your name', emailPlaceholder: 'Email address', businessPlaceholder: 'Business or band name (optional)' },
  contact: { heading: 'Get in Touch', description: 'Have a question, or want to talk through whether this fits how your business runs? Send a message directly.', success: "Got it — thanks for reaching out. I'll reply personally as soon as I can.", submitLabel: 'Send Message', namePlaceholder: 'Your name', emailPlaceholder: 'Email address', messagePlaceholder: "What's on your mind?" },
  footer: { tagline: 'GigWorks — built for the gig.' },
};

function text(value, fallback, max = 1000) { return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback; }
function amount(value, fallback) { const parsed = Number.parseInt(value, 10); return Number.isInteger(parsed) && parsed >= 100 && parsed <= 1000000 ? parsed : fallback; }
function stringList(value, fallback, maxItems = 12) { return Array.isArray(value) && value.length ? value.slice(0, maxItems).map((item, i) => text(item, fallback[i] || 'Item', 500)) : fallback; }
function section(input, defaults, limits = {}) { return Object.fromEntries(Object.keys(defaults).map((key) => [key, text(input?.[key], defaults[key], limits[key] || 500)])); }
function comparison(input, fallback) {
  const incomingCategories = Array.isArray(input?.categories) && input.categories.length ? input.categories.slice(0, 12) : fallback.categories;
  return {
    eyebrow: text(input?.eyebrow, fallback.eyebrow, 80),
    heading: text(input?.heading, fallback.heading, 160),
    description: text(input?.description, fallback.description, 400),
    featureColumnLabel: text(input?.featureColumnLabel, fallback.featureColumnLabel, 50),
    footer: text(input?.footer, fallback.footer, 300),
    categories: incomingCategories.map((category, categoryIndex) => {
      const fallbackCategory = fallback.categories[categoryIndex] || fallback.categories[0];
      const incomingRows = Array.isArray(category?.rows) && category.rows.length ? category.rows.slice(0, 30) : fallbackCategory.rows;
      return {
        id: text(category?.id, `category-${categoryIndex + 1}`, 80),
        name: text(category?.name, fallbackCategory.name, 120),
        rows: incomingRows.map((row, rowIndex) => ({
          id: text(row?.id, `feature-${categoryIndex + 1}-${rowIndex + 1}`, 80),
          feature: text(row?.feature, fallbackCategory.rows[rowIndex]?.feature || 'Feature', 180),
          solo: text(row?.solo, 'Included', 80),
          team: text(row?.team, 'Included', 80),
          studio: text(row?.studio, 'Included', 80),
        })),
      };
    }),
  };
}

export function normalizeWebsiteConfig(input = {}) {
  const d = DEFAULT_WEBSITE_CONFIG;
  const pricing = input.pricing || {};
  return {
    publicSignupsEnabled: input.publicSignupsEnabled === true,
    navigation: section(input.navigation, d.navigation, {}),
    hero: section(input.hero, d.hero, { headline: 180, description: 700 }),
    story: { label: text(input.story?.label, d.story.label, 120), paragraphs: stringList(input.story?.paragraphs, d.story.paragraphs, 4) },
    painPoints: { heading: text(input.painPoints?.heading, d.painPoints.heading, 120), description: text(input.painPoints?.description, d.painPoints.description, 400), items: d.painPoints.items.map((fallback, i) => ({ title: text(input.painPoints?.items?.[i]?.title, fallback.title, 160), problem: text(input.painPoints?.items?.[i]?.problem, fallback.problem, 500), fix: text(input.painPoints?.items?.[i]?.fix, fallback.fix, 500) })) },
    features: { heading: text(input.features?.heading, d.features.heading, 120), groups: d.features.groups.map((fallback, i) => ({ id: fallback.id, title: text(input.features?.groups?.[i]?.title, fallback.title, 120), items: stringList(input.features?.groups?.[i]?.items, fallback.items, 8) })), comparison: comparison(input.features?.comparison, d.features.comparison) },
    pricing: { label: text(pricing.label, d.pricing.label, 60), heading: text(pricing.heading, d.pricing.heading, 140), description: text(pricing.description, d.pricing.description, 300), monthlyLabel: text(pricing.monthlyLabel, d.pricing.monthlyLabel, 30), annualLabel: text(pricing.annualLabel, d.pricing.annualLabel, 30), annualSavingsLabel: text(pricing.annualSavingsLabel, d.pricing.annualSavingsLabel, 60), featuredLabel: text(pricing.featuredLabel, d.pricing.featuredLabel, 40), perMonthLabel: text(pricing.perMonthLabel, d.pricing.perMonthLabel, 30), billedAnnuallyLabel: text(pricing.billedAnnuallyLabel, d.pricing.billedAnnuallyLabel, 50), billedMonthlyLabel: text(pricing.billedMonthlyLabel, d.pricing.billedMonthlyLabel, 50), trialButtonLabel: text(pricing.trialButtonLabel, d.pricing.trialButtonLabel, 80), trialFooterLabel: text(pricing.trialFooterLabel, d.pricing.trialFooterLabel, 100), trialDays: Math.min(60, Math.max(0, Number.parseInt(pricing.trialDays, 10) || 14)), footer: text(pricing.footer, d.pricing.footer, 200), includedFeatures: stringList(pricing.includedFeatures, d.pricing.includedFeatures, 12), tiers: d.pricing.tiers.map((fallback) => { const incoming = pricing.tiers?.find((tier) => tier?.id === fallback.id) || {}; return { ...fallback, name: text(incoming.name, fallback.name, 40), description: text(incoming.description, fallback.description, 220), featured: incoming.featured === true, monthlyAmountCents: amount(incoming.monthlyAmountCents, fallback.monthlyAmountCents), annualAmountCents: amount(incoming.annualAmountCents, fallback.annualAmountCents), seatLimit: fallback.seatLimit, monthlyPriceId: typeof incoming.monthlyPriceId === 'string' ? incoming.monthlyPriceId : null, annualPriceId: typeof incoming.annualPriceId === 'string' ? incoming.annualPriceId : null }; }) },
    faq: { heading: text(input.faq?.heading, d.faq.heading, 140), description: text(input.faq?.description, d.faq.description, 300), items: d.faq.items.map((fallback, i) => ({ question: text(input.faq?.items?.[i]?.question, fallback.question, 240), answer: text(input.faq?.items?.[i]?.answer, fallback.answer, 1000) })) },
    waitlist: section(input.waitlist, d.waitlist),
    contact: section(input.contact, d.contact),
    footer: section(input.footer, d.footer),
  };
}

export async function getWebsiteAdminConfig() { const row = await prisma.websiteSetting.findUnique({ where: { id: 'main' } }); return normalizeWebsiteConfig(row?.config || DEFAULT_WEBSITE_CONFIG); }
export async function getWebsiteConfig() { const config = await getWebsiteAdminConfig(); return { ...config, pricing: { ...config.pricing, tiers: config.pricing.tiers.map(({ monthlyPriceId: _monthly, annualPriceId: _annual, ...tier }) => tier) } }; }
export async function getBillingTier(tierId) { const config = await getWebsiteAdminConfig(); return config.pricing.tiers.find((tier) => tier.id === tierId) || null; }
