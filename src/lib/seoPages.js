export const SITE_URL = 'https://www.gigworks.io';
export const SOCIAL_IMAGE = `${SITE_URL}/og-gigworks.png`;

export const HOME_SEO = {
  path: '/',
  title: 'GigWorks — Booking Software for Bands, DJs & Entertainment Agencies',
  description: 'Manage inquiries, bookings, proposals, contracts, invoices, contractors, stage plots, and set lists in one workspace built for live entertainment.',
  headline: 'Booking and management software for live entertainment businesses',
  summary: 'GigWorks connects the client, financial, staffing, and production work behind every gig so bands, DJs, orchestras, and entertainment agencies can spend less time chasing details.',
};

export const SEO_LANDING_PAGES = [
  {
    path: '/band-management-software',
    title: 'Band Management Software for Bookings, Musicians & Payments | GigWorks',
    description: 'Manage band bookings, musician availability, proposals, contracts, invoices, set lists, and stage plots from one connected workspace.',
    eyebrow: 'For bandleaders and band managers',
    headline: 'Band management software that keeps every gig connected',
    summary: 'Move from inquiry to paid invoice without rebuilding the same event in spreadsheets, email threads, and separate production tools.',
    benefits: ['Track leads, holds, and confirmed bookings', 'Staff musicians and follow contractor replies', 'Send proposals, contracts, invoices, and reminders', 'Build reusable set lists and stage plots'],
    workflow: ['Capture an inquiry and client details', 'Price the event and send a proposal', 'Confirm the roster and contract', 'Share production details and collect payment'],
    related: ['/musician-scheduling-software', '/stage-plot-software', '/proposal-contract-invoice-software'],
  },
  {
    path: '/entertainment-agency-software',
    title: 'Entertainment Agency Software for Bookings & Rosters | GigWorks',
    description: 'Run entertainment agency bookings, client communication, performer staffing, contracts, invoices, and event details in one system.',
    eyebrow: 'For entertainment agencies',
    headline: 'Entertainment agency software for every booking and roster',
    summary: 'Give agents and operations teams a shared view of sales, staffing, documents, payments, and event details across multiple acts.',
    benefits: ['Manage multiple groups and offerings', 'Keep client and venue records organized', 'Coordinate contractors across events', 'See proposals, contracts, invoices, and balances together'],
    workflow: ['Qualify the inquiry', 'Match the right offering', 'Staff and confirm the event', 'Deliver documents and track payment'],
    related: ['/contractor-management-software', '/dj-booking-software', '/proposal-contract-invoice-software'],
  },
  {
    path: '/dj-booking-software',
    title: 'DJ Booking Software for Events, Contracts & Invoices | GigWorks',
    description: 'Organize DJ inquiries, packages, bookings, contracts, invoices, client details, and event timelines in one workspace.',
    eyebrow: 'For DJs and DJ companies',
    headline: 'DJ booking software from first inquiry to final payment',
    summary: 'Turn incoming requests into organized events with reusable offerings, clear client documents, payment tracking, and day-of details.',
    benefits: ['Respond to inquiries with consistent packages', 'Create proposals and contracts from booking details', 'Track deposits and open invoice balances', 'Keep venue, timeline, and contact information together'],
    workflow: ['Receive the request', 'Build and send the offer', 'Collect signatures and deposits', 'Run the event from one record'],
    related: ['/entertainment-agency-software', '/proposal-contract-invoice-software', '/contractor-management-software'],
  },
  {
    path: '/musician-scheduling-software',
    title: 'Musician Scheduling Software for Gigs & Availability | GigWorks',
    description: 'Schedule musicians, request availability, confirm rosters, and keep gig details connected to bookings, clients, and production.',
    eyebrow: 'For working ensembles',
    headline: 'Musician scheduling software built around real gigs',
    summary: 'Request availability, see replies, fill roles, and give each musician the details they need without maintaining a separate staffing spreadsheet.',
    benefits: ['Send availability requests by role', 'Track accepted, declined, and pending replies', 'Reuse contractor and instrument details', 'Connect the confirmed roster to the event'],
    workflow: ['Define the roles for the gig', 'Invite the right musicians', 'Follow outstanding replies', 'Publish the confirmed roster'],
    related: ['/band-management-software', '/contractor-management-software', '/stage-plot-software'],
  },
  {
    path: '/contractor-management-software',
    title: 'Contractor Management Software for Entertainment Teams | GigWorks',
    description: 'Keep contractor contacts, roles, availability, event assignments, communication, and payment details organized for every gig.',
    eyebrow: 'For contractor-based teams',
    headline: 'Contractor management software for live event teams',
    summary: 'Keep your roster searchable and your event assignments visible, from the first availability request through the final gig details.',
    benefits: ['Maintain one contractor directory', 'Match people to roles and events', 'Track confirmations and outstanding responses', 'Share the latest schedule and production information'],
    workflow: ['Build the contractor roster', 'Select roles for an event', 'Request and track availability', 'Keep confirmed people informed'],
    related: ['/musician-scheduling-software', '/entertainment-agency-software', '/proposal-contract-invoice-software'],
  },
  {
    path: '/stage-plot-software',
    title: 'Stage Plot Software Connected to Your Event | GigWorks',
    description: 'Create reusable stage plots and production lists, then connect them to the booking, venue, roster, and event details.',
    eyebrow: 'For production-ready events',
    headline: 'Stage plot software that stays connected to the gig',
    summary: 'Build visual stage layouts and production requirements without losing the client, venue, personnel, and schedule context around them.',
    benefits: ['Create and reuse stage plot templates', 'Place performers and production equipment visually', 'Maintain a production input list', 'Share a public view with the event team'],
    workflow: ['Start from a saved layout', 'Adjust it for the event', 'Review the production list', 'Share the current version'],
    related: ['/band-management-software', '/musician-scheduling-software', '/proposal-contract-invoice-software'],
  },
  {
    path: '/proposal-contract-invoice-software',
    title: 'Proposal, Contract & Invoice Software for Gigs | GigWorks',
    description: 'Create connected proposals, e-sign contracts, invoices, deposits, and automatic reminders for entertainment bookings.',
    eyebrow: 'One document flow for every booking',
    headline: 'Proposals, contracts, and invoices connected to the gig',
    summary: 'Carry the same client, event, pricing, and offering details from proposal through signature and payment, with fewer duplicate edits.',
    benefits: ['Build proposals from offerings and custom items', 'Collect electronic signatures', 'Track deposits, balances, and due dates', 'Configure automatic invoice reminders'],
    workflow: ['Create the priced proposal', 'Turn approval into a contract', 'Issue the invoice and collect a deposit', 'Follow open balances automatically'],
    related: ['/band-management-software', '/dj-booking-software', '/entertainment-agency-software'],
  },
];

export const SEO_PAGE_BY_PATH = Object.fromEntries(SEO_LANDING_PAGES.map((page) => [page.path, page]));

export const LEGAL_SEO_PAGES = {
  '/customer-stories': { title: 'Customer Stories | GigWorks', description: 'See how entertainment businesses use GigWorks to coordinate bookings, contractors, payments, and event production.' },
  '/privacy': { title: 'Privacy Policy | GigWorks', description: 'Learn how GigWorks collects, uses, protects, and retains account and business information.' },
  '/terms': { title: 'Terms of Service | GigWorks', description: 'Read the terms governing access to and use of the GigWorks entertainment-business platform.' },
  '/cookies': { title: 'Cookie Policy | GigWorks', description: 'Learn how GigWorks uses essential cookies and local browser storage.' },
};
