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

// Keep in sync with ICON_KEYS below and src/components/ui/icons.jsx's
// exports (each key here is that component's name minus "Icon", lowercased).
export const ICON_KEYS = ['file', 'users', 'clipboard', 'bell', 'calendar', 'clock', 'dollar', 'wrench', 'alert', 'info', 'mappin', 'note', 'search', 'star', 'shield', 'chart', 'bolt'];
function iconKey(value, fallback) { return ICON_KEYS.includes(value) ? value : fallback; }

const featureGroups = [
  ['clients', 'file', 'For your clients', ['Inquiry-to-booking pipeline', 'Proposals your client accepts online', 'Contracts with e-signature', 'Invoicing with built-in Stripe payments']],
  ['roster', 'users', 'For your roster', ['Contractor roster & availability', 'Per-event confirm/decline tracking', 'Ensembles — save a group once, add its whole lineup in one click', 'A home-screen link every contractor can check themselves']],
  ['dayOf', 'clipboard', 'For the day of', ['Stage plots with a live drag-and-drop canvas', 'Set lists with email + PDF export', 'Backline & production lists', 'Prep sheets & crew schedules']],
  ['oversight', 'bell', 'For staying on top of it', ['A dashboard that surfaces what actually needs attention', 'Automatic alerts for at-risk events and overdue invoices', 'Email templates with merge fields for real event details', 'Manual reminders tied to any client or contractor', 'A Financials page tracking money in, money out, contractor payments due, and bookkeeper-ready exports']],
].map(([id, icon, title, items]) => ({ id, icon, title, items }));

// True variable-length list (an admin can add/remove cards from
// src/pages/admin/AdminWebsitePage.jsx's Features tab), same pattern as
// comparison() below for categories/rows — NOT the fixed-length
// map-over-the-default shape most other sections use, since the whole point
// here is the count itself is admin-controlled, capped at a sane maximum.
function featureGroupsList(input, fallback) {
  const incoming = Array.isArray(input) && input.length ? input.slice(0, 8) : fallback;
  return incoming.map((group, i) => {
    const fb = fallback[i] || fallback[0];
    return {
      id: text(group?.id, `feature-${i + 1}`, 60),
      icon: iconKey(group?.icon, fb?.icon || 'file'),
      title: text(group?.title, fb?.title || 'Feature', 120),
      items: stringList(group?.items, fb?.items || [], 8),
    };
  });
}

const faqItems = [
  ['Who is GigWorks actually built for?', "Bands, DJs, orchestras, and the agencies or bandleaders who book them out — anyone staffing more than one musician against a calendar of gigs. If you're assembling a roster for each event rather than just showing up yourself, this is built around that specific problem."],
  ['How do my musicians confirm or decline a gig without me chasing them down?', "Every contractor gets their own gig calendar link — a bookmarkable page showing just their own upcoming gigs, no app account or login required. They can accept or decline right from their phone, and their status updates on your roster the moment they do."],
  ["What happens if I need to swap a musician after the contract's already signed?", 'A signed contract lists an ensemble by instrumentation — "Sax, Drums, Keys" — never the specific musicians\' names. Swapping a player for a gig later never contradicts what the client actually agreed to.'],
  ['Is the client-facing proposal and contract actually legally binding?', "The proposal is something a client reviews and accepts (or sends back with requested changes) — it's a decision, not a signature. The contract is the real e-signature step: both sides draw a signature and type a legal name, and an Electronic Signature Consent clause citing the U.S. E-SIGN Act is included automatically."],
  ['How does getting paid actually work — does GigWorks touch the money?', "Invoices are paid directly into your own bank account through Stripe Connect — GigWorks never touches the money. If a client pays outside the app instead (check, cash), you log that manually and it's tracked the same way."],
  ['Do I have to run every gig through the full proposal-and-contract pipeline?', 'No. That pipeline is there for a formal booking with a paper trail, but you can also add an event directly for a one-off or word-of-mouth gig with no sales process attached at all.'],
  ['How do I keep track of money in and out for bookkeeping or taxes?', "The Financials page shows everything at a glance — cash received, cash paid out, who owes you, who you still owe contractors — and lets you log any payment that didn't go through Stripe (cash, check, a card run outside the app) with an optional receipt attached. When it's time to hand things off to a bookkeeper or accountant, one export button builds a ZIP with a plain-language summary, the full payment history as a CSV, a list of anything missing documentation, and every receipt you've attached."],
  ['Can I bring over the clients, contractors, and venues I already have?', "Yes. You can add existing records as you set up the account. A self-serve bulk importer isn't currently available, so established businesses moving from spreadsheets or another system should contact us first to plan the cleanest migration path."],
  ['Who owns my business data, and how is it protected?', "You do. Your client, contractor, booking, event, and financial data remains yours. GigWorks uses authenticated access, encrypted connections, password hashing, account-level data separation, and managed infrastructure to protect it. We don't sell your information or use your business data to market to your contacts."],
  ['What happens to my information if I cancel?', "You can export key operational and financial records before leaving. After cancellation, access ends at the close of the billing period and data is retained for a reasonable recovery period before deletion, subject to the Privacy Policy. You can also contact support to request deletion."],
  ['Can an agency manage several bands or groups from one account?', "Yes. The Agency tier is designed for management companies and offices running multiple acts. Shared clients, contractors, venues, and search stay available at the agency level, while each group keeps its own bookings, dashboard view, logo, stationery, and document branding. Pricing scales with the number of groups managed."],
  ['What help is available when I first set up GigWorks?', "You won't be left to figure out the workflow alone. We can help with account setup, data migration planning, templates, and mapping your current booking process into GigWorks. Ongoing questions can be sent through the in-app support area."],
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
    ['Financial tracking with receipts and bookkeeper exports', 'Included', 'Included', 'Included'],
    ['Team members', '1', '2', '5'],
  ]],
].map(([name, rows], categoryIndex) => ({
  id: `category-${categoryIndex + 1}`,
  name,
  rows: rows.map(([feature, solo, team, studio], rowIndex) => ({ id: `feature-${categoryIndex + 1}-${rowIndex + 1}`, feature, solo, team, studio, agency: feature === 'Team members' ? 'Custom' : 'Included' })),
}));

const privacyPolicyContent = `This Privacy Policy explains how {entityName} ("we," "us," or "our") collects, uses, and shares information when you use GigWorks (the "Service"). It covers both your own account information and the business data you enter into the Service.

## 1. Information We Collect
We collect a few different kinds of information:
- Account information you give us directly: your name, email, phone number, business name, and a securely hashed password. We never store your password in readable form.
- Business data you enter to use the Service: your clients' and contractors' contact details, bookings, events, proposals, contracts, invoices, and financial records. This data belongs to you—see our Terms of Service at /terms.
- Payment information: when you or your clients pay through the Service, card details are entered directly into Stripe's secure checkout. We never see or store full card numbers.
- Usage information: basic technical information such as IP address and browser type, collected for security and reliability.

## 2. How We Use Information
We use this information to operate and provide the Service: to run your account, process payments, send transactional emails, respond to support requests, and keep the Service secure and reliable. We don't sell your information or use your business data to advertise to your clients or contractors.

## 3. Third-Party Service Providers
We rely on trusted service providers to run GigWorks. Each processes information only as needed to provide its service to us, including payment processing, transactional email, infrastructure hosting, database and file storage, and error monitoring. We don't share information with other third parties except as needed to provide the Service, comply with law, or protect our rights.

## 4. Data Retention and Deletion
We retain account and business data while an account is active, plus a reasonable period afterward. To request deletion, contact {contactEmail}.

## 5. Your Rights
You can request access to, correction of, or deletion of your personal information by contacting {contactEmail}. If your information was entered by one of our business customers, contact that business directly or contact us and we'll help route the request.

## 6. Data Security
We take reasonable steps to protect information, including encryption in transit, password hashing, and authenticated sessions. No system is perfectly secure, but we work to keep the Service safe.

## 7. Children's Privacy
GigWorks is a business tool and isn't directed at children. We don't knowingly collect information from anyone under 18.

## 8. Changes to This Policy
We may update this Privacy Policy from time to time. If we make material changes, we'll take reasonable steps to notify you.

## 9. Contact
Questions about this Privacy Policy? Contact {contactEmail}.`;

const termsOfServiceContent = `These Terms of Service ("Terms") govern your access to and use of GigWorks, a booking, staffing, and event-management platform for entertainment businesses (the "Service"), provided by {entityName}. By creating an account or using the Service, you agree to these Terms. If you agree on behalf of a business, you confirm that you have authority to bind that business.

## 1. Description of the Service
The Service helps entertainment businesses manage the lifecycle of a gig, including inquiries, proposals, electronic-signature contracts, invoicing, payments, contractor rosters, confirmations, production tools, and financial tracking.

## 2. Eligibility
The Service is intended for business and professional use. You must be at least 18 years old and able to form a binding contract.

## 3. Your Account
You are responsible for your credentials and all activity under your account. Provide accurate information and contact {contactEmail} promptly if you believe your account has been compromised. Account owners may invite team members and control their access.

## 4. Subscription Plans, Billing, and Free Trial
Paid plans recur monthly or annually through Stripe. New accounts may receive a {trialDays}-day free trial. You may cancel at any time, effective at the end of the billing period. We do not provide refunds or credits for partial billing periods. Prices and plan features may change with notice.

## 5. Payments for Your Clients and Contractors
The Service may let you invoice clients and collect payment through your connected Stripe account. {entityName} is not a party to your transactions, does not take custody of those funds, and is not responsible for your tax or legal compliance. Stripe's terms also apply.

## 6. Your Business Data
You retain ownership of data you enter into the Service. You are responsible for its accuracy and for having the right to process it. We process it on your behalf as described in the Privacy Policy at /privacy.

## 7. Acceptable Use
You may not use the Service illegally or fraudulently, gain unauthorized access, disrupt its operation, reverse-engineer its source code, or send unlawful unsolicited communications.

## 8. Intellectual Property
{entityName} owns the Service, software, design, and branding. You retain rights to your data and content.

## 9. Electronic Signatures
Contracts sent through the Service include electronic-signature consent at signing. That consent governs the document being signed.

## 10. Availability and Disclaimers
We aim to keep the Service reliable but do not guarantee uninterrupted or error-free operation. The Service is provided "as is" and "as available" to the fullest extent permitted by law.

## 11. Limitation of Liability
To the fullest extent permitted by law, {entityName} is not liable for indirect, incidental, special, consequential, or punitive damages or lost profits. Total liability is limited to the amount paid to us in the twelve months before the claim.

## 12. Suspension and Termination
We may suspend an account that violates these Terms. Access may be restricted if a subscription lapses. When access ends, data may be retained for a reasonable period, subject to the Privacy Policy.

## 13. Changes to These Terms
We may update these Terms. For material changes, we'll take reasonable steps to notify you. Continued use after changes take effect means you accept the updated Terms.

## 14. Governing Law
These Terms are governed by the laws of {governingLaw}, without regard to conflict-of-law principles.

## 15. Contact
Questions about these Terms? Contact {contactEmail}.`;

export const DEFAULT_WEBSITE_CONFIG = {
  publicSignupsEnabled: false,
  navigation: { story: 'Story', features: 'Features', pricing: 'Pricing', faq: 'FAQ', login: 'Log In', waitlist: 'Join Waitlist', signup: 'Start Free Trial' },
  hero: { eyebrow: 'For bands, DJs & orchestras booking out a roster', headline: 'Built by a musician who spent 20 years chasing confirmations instead of chasing gigs.', description: "GigWorks is the business software for entertainment agencies and bandleaders who book out multiple musicians — proposals, contracts, and invoicing for your clients, plus the day-of details connected to who's actually on the gig.", contactButton: 'Get in Touch' },
  story: { label: 'Built from the gig, not a guess', paragraphs: ["I've been a gigging musician for over 20 years — playing my own gigs, working for other bandleaders and offices, and staffing musicians out to weddings and events booked through agencies. I've been on every side of this business: the player waiting to hear if a gig is actually confirmed, the bandleader chasing five people for a stage plot two days before a wedding, and the office trying to keep a whole roster straight through a busy season.", "GigWorks is what I wished existed the entire time. Every feature in it came from a real pain point I've personally run into over two decades of doing this work — not a guess at what musicians need from someone who's never had to load in at 4pm and be ready by 6."] },
  painPoints: { heading: 'Sound familiar?', description: "These aren't hypothetical problems — they're what running an entertainment business actually feels like without the right tools.", items: painItems },
  features: { heading: 'One place for the whole gig', groups: featureGroups, comparison: { eyebrow: 'Compare plans', heading: 'Everything you need, at every tier', description: 'Core workflow features are included on every plan. Choose based on how many people need access.', featureColumnLabel: 'Feature', footer: 'All plans include a 14-day free trial. Prices and team limits are shown in the pricing section below.', categories: comparisonCategories } },
  agency: { enabled: true, label: 'Built for multi-group agencies', heading: 'One agency workspace. Every group keeps its own identity.', description: 'Run shared contacts, venues, contractors, and search at the agency level while each band or act keeps its own bookings, events, logo, stationery, and performance view.', ctaLabel: 'Calculate Agency pricing', features: ['Portfolio dashboard across every managed group', 'Per-group logos, stationery, and document branding', 'Shared agency-wide clients, venues, contractors, and search', 'Group-level booking, event, and completion reporting', 'Automatic pricing as managed groups are added'] },
  pricing: { label: 'Simple pricing', heading: 'Every plan runs the whole gig', description: 'Choose based on the size and structure of your operation—not which tools you’re allowed to use.', monthlyLabel: 'Monthly', annualLabel: 'Annual', annualSavingsLabel: 'Save up to 20%', featuredLabel: 'Most popular', perMonthLabel: '/month', billedAnnuallyLabel: 'billed annually', billedMonthlyLabel: 'Billed monthly', trialButtonLabel: 'Start {days}-day free trial', trialFooterLabel: '{days}-day free trial at launch.', trialDays: 14, footer: 'Cancel anytime. Secure billing through Stripe.', includedFeatures: ['Unlimited clients, bookings, and events', 'Proposals, e-sign contracts, and invoices', 'Contractor confirmations and availability', 'Stage plots, set lists, and production details', 'Templates, reminders, and client payment tools'], tiers: [...PLAN_TIERS.map((tier) => ({ id: tier.id, name: tier.label, seatLimit: tier.seatLimit, monthlyAmountCents: tier.monthly.amountCents, annualAmountCents: tier.annual.amountCents, description: tier.id === 'solo' ? 'For independent bandleaders and performers running their own calendar.' : tier.id === 'team' ? 'For small teams sharing bookings, staffing, and client follow-up.' : 'For growing entertainment companies coordinating multiple people.', featured: tier.id === 'team' })), { id: 'agency', name: 'Agency', seatLimit: null, monthlyAmountCents: 14900, annualAmountCents: 142800, includedGroupCount: 2, monthlyAdditionalGroupCents: 3500, annualAdditionalGroupCents: 33600, description: 'For management companies coordinating multiple bands or acts, each with its own workflow and brand.', featured: false }] },
  testimonials: { enabled: false, heading: 'Trusted by people who run the gig', description: 'Real stories from entertainment professionals using GigWorks.', pageHeading: 'Customer stories', pageDescription: 'See how entertainment businesses are bringing bookings, people, and production details together.', reviews: [] },
  faq: { heading: 'Questions bandleaders actually ask', description: 'Most critical first — scroll down for the smaller stuff.', items: faqItems },
  waitlist: { heading: 'Get Waitlisted', description: "GigWorks is currently onboarding a small first group of agencies and bandleaders directly. Join the waitlist and I'll reach out personally.", success: "You're on the list — thanks for the interest. I'll be in touch soon.", submitLabel: 'Join the Waitlist', namePlaceholder: 'Your name', emailPlaceholder: 'Email address', businessPlaceholder: 'Business or band name (optional)' },
  contact: { heading: 'Get in Touch', description: 'Have a question, or want to talk through whether this fits how your business runs? Send a message directly.', success: "Got it — thanks for reaching out. I'll reply personally as soon as I can.", submitLabel: 'Send Message', namePlaceholder: 'Your name', emailPlaceholder: 'Email address', messagePlaceholder: "What's on your mind?" },
  footer: { tagline: 'GigWorks — built for the gig.' },
  // Backs the Terms of Service / Privacy Policy / Cookie Policy pages
  // (src/pages/TermsOfServicePage.jsx etc.) — kept admin-editable rather
  // than hardcoded into those pages, same reasoning as every other section
  // here. The prose on those pages itself stays static; only these
  // identifying details are configurable.
  legal: { entityName: 'GigWorks', governingLaw: 'New York', contactEmail: 'shaya.gigworks@gmail.com', effectiveDate: '2026-08-31', privacyPolicyContent, termsOfServiceContent },
};

function text(value, fallback, max = 1000) { return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback; }
function optionalText(value, max = 1000) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
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
          agency: text(row?.agency, 'Included', 80),
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
    features: { heading: text(input.features?.heading, d.features.heading, 120), groups: featureGroupsList(input.features?.groups, d.features.groups), comparison: comparison(input.features?.comparison, d.features.comparison) },
    agency: { enabled: input.agency?.enabled !== false, label: text(input.agency?.label, d.agency.label, 100), heading: text(input.agency?.heading, d.agency.heading, 180), description: text(input.agency?.description, d.agency.description, 600), ctaLabel: text(input.agency?.ctaLabel, d.agency.ctaLabel, 80), features: stringList(input.agency?.features, d.agency.features, 10) },
    pricing: { label: text(pricing.label, d.pricing.label, 60), heading: text(pricing.heading, d.pricing.heading, 140), description: text(pricing.description, d.pricing.description, 300), monthlyLabel: text(pricing.monthlyLabel, d.pricing.monthlyLabel, 30), annualLabel: text(pricing.annualLabel, d.pricing.annualLabel, 30), annualSavingsLabel: text(pricing.annualSavingsLabel, d.pricing.annualSavingsLabel, 60), featuredLabel: text(pricing.featuredLabel, d.pricing.featuredLabel, 40), perMonthLabel: text(pricing.perMonthLabel, d.pricing.perMonthLabel, 30), billedAnnuallyLabel: text(pricing.billedAnnuallyLabel, d.pricing.billedAnnuallyLabel, 50), billedMonthlyLabel: text(pricing.billedMonthlyLabel, d.pricing.billedMonthlyLabel, 50), trialButtonLabel: text(pricing.trialButtonLabel, d.pricing.trialButtonLabel, 80), trialFooterLabel: text(pricing.trialFooterLabel, d.pricing.trialFooterLabel, 100), trialDays: Math.min(60, Math.max(0, Number.parseInt(pricing.trialDays, 10) || 14)), footer: text(pricing.footer, d.pricing.footer, 200), includedFeatures: stringList(pricing.includedFeatures, d.pricing.includedFeatures, 12), tiers: d.pricing.tiers.map((fallback) => { const incoming = pricing.tiers?.find((tier) => tier?.id === fallback.id) || {}; return { ...fallback, name: text(incoming.name, fallback.name, 40), description: text(incoming.description, fallback.description, 220), featured: incoming.featured === true, monthlyAmountCents: amount(incoming.monthlyAmountCents, fallback.monthlyAmountCents), annualAmountCents: amount(incoming.annualAmountCents, fallback.annualAmountCents), ...(fallback.id === 'agency' ? { includedGroupCount: Math.min(100, Math.max(2, Number.parseInt(incoming.includedGroupCount, 10) || fallback.includedGroupCount)), monthlyAdditionalGroupCents: amount(incoming.monthlyAdditionalGroupCents, fallback.monthlyAdditionalGroupCents), annualAdditionalGroupCents: amount(incoming.annualAdditionalGroupCents, fallback.annualAdditionalGroupCents) } : {}), seatLimit: fallback.seatLimit, monthlyPriceId: typeof incoming.monthlyPriceId === 'string' ? incoming.monthlyPriceId : null, annualPriceId: typeof incoming.annualPriceId === 'string' ? incoming.annualPriceId : null }; }) },
    testimonials: {
      enabled: input.testimonials?.enabled === true,
      heading: text(input.testimonials?.heading, d.testimonials.heading, 140),
      description: text(input.testimonials?.description, d.testimonials.description, 400),
      pageHeading: text(input.testimonials?.pageHeading, d.testimonials.pageHeading, 140),
      pageDescription: text(input.testimonials?.pageDescription, d.testimonials.pageDescription, 500),
      reviews: (Array.isArray(input.testimonials?.reviews) ? input.testimonials.reviews : []).slice(0, 30).map((review, index) => ({
        id: text(review?.id, `review-${index + 1}`, 80),
        groupName: text(review?.groupName, 'Customer group', 140),
        reviewerName: optionalText(review?.reviewerName, 120),
        groupType: optionalText(review?.groupType, 100),
        quote: text(review?.quote, 'Add the customer review here.', 1200),
        rating: Math.min(5, Math.max(1, Number.parseInt(review?.rating, 10) || 5)),
        published: review?.published === true,
        featured: review?.featured === true,
        storyPublished: review?.storyPublished === true,
        storyTitle: optionalText(review?.storyTitle, 180),
        storySummary: optionalText(review?.storySummary, 600),
        storyBody: optionalText(review?.storyBody, 8000),
      })),
    },
    faq: { heading: text(input.faq?.heading, d.faq.heading, 140), description: text(input.faq?.description, d.faq.description, 300), items: d.faq.items.map((fallback, i) => ({ question: text(input.faq?.items?.[i]?.question, fallback.question, 240), answer: text(input.faq?.items?.[i]?.answer, fallback.answer, 1000) })) },
    waitlist: section(input.waitlist, d.waitlist),
    contact: section(input.contact, d.contact),
    footer: section(input.footer, d.footer),
    legal: section(input.legal, d.legal, { entityName: 200, governingLaw: 100, contactEmail: 200, effectiveDate: 20, privacyPolicyContent: 30000, termsOfServiceContent: 30000 }),
  };
}

export async function getWebsiteAdminConfig() { const row = await prisma.websiteSetting.findUnique({ where: { id: 'main' } }); return normalizeWebsiteConfig(row?.config || DEFAULT_WEBSITE_CONFIG); }
export function publicWebsiteConfig(config) {
  const publicReviews = config.testimonials.enabled
    ? config.testimonials.reviews.filter((review) => review.published).map((review) => review.storyPublished ? review : { ...review, storyTitle: '', storySummary: '', storyBody: '' })
    : [];
  return {
    ...config,
    pricing: { ...config.pricing, tiers: config.pricing.tiers.map(({ monthlyPriceId: _monthly, annualPriceId: _annual, ...tier }) => tier) },
    testimonials: { ...config.testimonials, reviews: publicReviews },
  };
}
export async function getWebsiteConfig() { return publicWebsiteConfig(await getWebsiteAdminConfig()); }
export async function getBillingTier(tierId) { const config = await getWebsiteAdminConfig(); return config.pricing.tiers.find((tier) => tier.id === tierId) || null; }
