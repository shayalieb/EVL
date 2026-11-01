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
    details: [
      {
        "heading": "Keep bookings separate from the musicians playing them",
        "body": "A band booking involves more than a date on the calendar. Keep client requirements, venue details, proposals, and payments connected to the event while tracking the musicians assigned to play it. Your office can review the booking without searching individual text threads."
      },
      {
        "heading": "Reuse your lineup without rebuilding it for every gig",
        "body": "Save regular groups as ensembles and add their members to an event together. Track each contractor’s confirmation status and keep the final lineup connected to the set list and production details. For wedding-specific preparation, explore the wedding band management workflow."
      },
      {
        "heading": "Carry the offer through to payment",
        "body": "Use your offerings to prepare a proposal, collect an electronic signature, and issue an invoice from the booking. Keep deposits and outstanding balances visible alongside the work your team still needs to do before the gig."
      }
    ],
    screenshot: {
      "src": "/landing/home-dashboard.png",
      "caption": "The GigWorks dashboard brings upcoming events and items needing attention into one view."
    },
    faqHeading: "Band management questions",
    faqs: [
      {
        "question": "What does band management software help organize?",
        "answer": "GigWorks brings bookings, client documents, contractor confirmations, payments, set lists, and stage plots into one workspace. It is designed for the operational work behind live performances."
      },
      {
        "question": "Can I save a regular band lineup?",
        "answer": "Yes. Ensembles let you save a group and add its members to an event together. Individual confirmation statuses remain connected to the event roster."
      },
      {
        "question": "Can I use it for wedding bands?",
        "answer": "Yes. The wedding band workflow connects client bookings and deposits with musician confirmations, set lists, venue details, and stage plots."
      }
    ],
    related: ["/wedding-band-management-software","/musician-scheduling-software","/stage-plot-software"],
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
    details: [
      {
        "heading": "Give every act its own identity",
        "body": "An agency can coordinate multiple groups while each band or act keeps its own bookings, events, logo, and document branding. Shared clients, venues, and contractors help the office work across the portfolio without rebuilding the same contact records."
      },
      {
        "heading": "Connect the sales desk with the people delivering the event",
        "body": "Match an inquiry to an offering, prepare the client documents, and track the contractors assigned to the gig. Proposal, signature, payment, and roster status remain part of the same workflow, giving agents and operations staff a shared record to work from."
      },
      {
        "heading": "Review the work across your groups",
        "body": "Use the agency workspace to review the managed groups and their booking activity. Keep each group’s event preparation with that group while sharing the business contacts and contractor directory the wider office needs."
      }
    ],
    screenshot: {
      "src": "/landing/contractors-list.png",
      "caption": "A searchable contractor roster keeps performer contact details and rates available to the team."
    },
    faqHeading: "Entertainment agency questions",
    faqs: [
      {
        "question": "Can one agency manage multiple bands or acts?",
        "answer": "Yes. The Agency plan supports managed groups with their own booking workflows and branding, alongside shared agency contacts, venues, contractors, and search."
      },
      {
        "question": "Can the office track performer confirmations?",
        "answer": "Yes. Event rosters show confirmation statuses so staff can review confirmed, declined, and outstanding responses for the performers assigned to a gig."
      },
      {
        "question": "Does GigWorks connect contracts and invoices to bookings?",
        "answer": "Yes. Client documents and payment tracking stay connected to the booking instead of living in separate tools and email threads."
      }
    ],
    related: ['/contractor-management-software', '/dj-booking-software', '/proposal-contract-invoice-software'],
  },
  {
    faqHeading: 'DJ booking questions',
    path: '/dj-booking-software',
    title: 'DJ Booking Software for Events, Contracts & Invoices | GigWorks',
    description: 'Organize DJ inquiries, packages, bookings, contracts, invoices, client details, and event timelines in one workspace.',
    eyebrow: 'For DJs and DJ companies',
    headline: 'DJ booking software from first inquiry to final payment',
    summary: 'Turn incoming requests into organized events with reusable offerings, clear client documents, payment tracking, and day-of details.',
    benefits: ['Respond to inquiries with consistent packages', 'Create proposals and contracts from booking details', 'Track deposits and open invoice balances', 'Keep venue, timeline, and contact information together'],
    workflow: ['Receive the request', 'Build and send the offer', 'Collect signatures and deposits', 'Run the event from one record'],
    details: [
      { heading: 'Build the offer around the event', body: 'Keep the client, venue, event date, and requested services together. Use your saved offerings to prepare a proposal with consistent pricing, then carry the booking details into the contract and invoice instead of retyping them in separate documents.' },
      { heading: 'Keep staffing connected to the booking', body: 'For a DJ company booking multiple performers, assign contractors to the event and track confirmed, declined, and pending replies. Keep the roster and event information in the same workspace so your office can see which assignments still need attention.' },
      { heading: 'Prepare the handoff before event day', body: 'Keep venue contacts, schedules, and production details attached to the event. When a booking needs extra performers or a specific setup, connect the roster and stage plot to the gig rather than maintaining a separate file for each team.' },
      { heading: 'Follow the money through the booking', body: 'Track deposits, invoice balances, and due dates alongside the client documents. Clients can accept proposals, sign contracts electronically, and pay invoices through Stripe, while your team keeps the payment status connected to the event.' },
    ],
    screenshot: { src: '/landing/event-roster.png', caption: 'The GigWorks event roster shows contractor confirmations alongside the event.' },
    faqs: [
      { question: 'Is GigWorks for a solo DJ or a company with several DJs?', answer: 'GigWorks supports independent performers and teams coordinating multiple contractors. The shared roster and event assignments are especially useful when your company staffs more than one performer. Compare the plans for team access and agency options.' },
      { question: 'Can I handle proposals, contracts, and invoices together?', answer: 'Yes. GigWorks connects these documents to the booking, keeping client, event, and pricing details in one workflow. Clients can accept a proposal online, sign electronically, and pay an invoice through Stripe.' },
      { question: 'Can I track which performers have confirmed?', answer: 'Yes. Each event has a contractor roster with confirmation statuses. Contractors can confirm or decline from their own link, helping the office see outstanding responses without maintaining a separate spreadsheet.' },
      { question: 'How can I try GigWorks?', answer: 'GigWorks is onboarding an initial group of agencies and bandleaders. Join the waitlist on the homepage or use the contact form to discuss your DJ business and availability.' },
    ],
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
    details: [
      {
        "heading": "Start with the roles the gig needs",
        "body": "Build the event roster around the musicians and instruments required for the performance. Keep contractor contacts and assignments in one workspace so the office can see who has been asked and which responses still need follow-up."
      },
      {
        "heading": "Turn outstanding replies into a clear confirmation list",
        "body": "Track confirmed, declined, and pending contractors against the event. Musicians can confirm or decline from their own link, while staff can review the status in the roster rather than reconstructing it from a collection of messages."
      },
      {
        "heading": "Keep the confirmed roster with the event details",
        "body": "The lineup is part of the gig’s operational record. Keep the venue, schedule, set list, and production preparation connected so the people organizing the performance can work from the event rather than a separate staffing spreadsheet."
      }
    ],
    screenshot: {
      "src": "/landing/event-roster.png",
      "caption": "The event roster makes individual contractor confirmation statuses visible alongside the gig."
    },
    faqHeading: "Musician scheduling questions",
    faqs: [
      {
        "question": "Can musicians confirm from their phone?",
        "answer": "Yes. Contractors can use their own confirmation link to accept or decline a gig, and the response is reflected in the event roster."
      },
      {
        "question": "Can I reuse a regular ensemble?",
        "answer": "Yes. Save an ensemble and add the group’s members to an event together, then track each member’s response for that performance."
      },
      {
        "question": "Is this a general employee shift scheduler?",
        "answer": "GigWorks focuses on live entertainment bookings and contractor rosters, connecting musician confirmations to client bookings and event preparation."
      }
    ],
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
    details: [
      {
        "heading": "Build the layout around the people playing the gig",
        "body": "Use the visual stage plot builder to place performers and production equipment. Keep the layout connected to the event and its lineup so production preparation has the same booking context as the office’s other work."
      },
      {
        "heading": "Start from a layout you already use",
        "body": "Save layouts in your stage plot library and reuse them for future events. Adjust the setup for the current gig rather than drawing a familiar band arrangement again every time the venue or lineup changes."
      },
      {
        "heading": "Share the current production view",
        "body": "Keep the stage layout and production input list with the event. Share a public view with the event team so the venue or sound engineer can review the setup without needing your private account access."
      }
    ],
    screenshot: {
      "src": "/landing/stage-plot.png",
      "caption": "The GigWorks stage plot builder connects a visual layout to the event’s production preparation."
    },
    faqHeading: "Stage plot questions",
    faqs: [
      {
        "question": "Can I reuse a stage plot?",
        "answer": "Yes. Save layouts in the stage plot library, then adjust a saved layout for a new event’s setup."
      },
      {
        "question": "Can the sound engineer view the stage plot?",
        "answer": "Yes. You can share a public stage plot view with the event team without giving them access to your private workspace."
      },
      {
        "question": "Is the stage plot connected to the booking?",
        "answer": "Yes. Stage plots sit within the event workflow alongside its roster, venue, schedule, and production requirements."
      }
    ],
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
{
  "path": "/wedding-band-management-software",
  "title": "Wedding Band Management Software for Bookings & Musicians | GigWorks",
  "description": "Manage wedding band bookings, musician confirmations, proposals, contracts, deposits, set lists, and stage plots in one connected workspace.",
  "eyebrow": "For wedding bandleaders and entertainment offices",
  "headline": "Wedding band management software from inquiry to last dance",
  "summary": "Keep the client booking and the band’s preparation together: proposals, contracts, payments, confirmed musicians, set lists, and production details for every wedding.",
  "benefits": [
    "Keep client and venue details with the wedding booking",
    "Send proposals, e-sign contracts, and invoices",
    "Confirm the musicians assigned to each wedding",
    "Prepare set lists, stage plots, and production details"
  ],
  "workflow": [
    "Capture the wedding inquiry and venue details",
    "Agree on the offering, contract, and deposit",
    "Confirm the band and prepare the music and setup",
    "Review the event details and outstanding balance"
  ],
  "details": [
    {
      "heading": "Move the wedding inquiry into a clear booking",
      "body": "Record the client, date, venue, and requested offering together. Build a proposal around your services and keep the accepted offer connected to the contract and invoice, so the office can follow the booking from the first conversation through the deposit."
    },
    {
      "heading": "Know which musicians are actually confirmed",
      "body": "Add your regular ensemble or assign individual contractors to the wedding. Track confirmed, declined, and pending responses on the event roster. When staffing changes, keep the current assignments attached to the gig instead of maintaining a separate lineup document."
    },
    {
      "heading": "Prepare the music and production together",
      "body": "Pull a saved set list into the event and adjust it for the performance. Keep stage plots, backline requirements, schedules, and venue contacts with the wedding, giving your team one place to prepare the handoff before load-in."
    },
    {
      "heading": "Keep deposits and balances in view",
      "body": "Follow invoice due dates and payment status alongside the wedding booking. Clients can pay through Stripe, and the office can review what remains outstanding while it finishes the staffing and production preparation."
    }
  ],
  "screenshot": {
    "src": "/landing/event-roster.png",
    "caption": "A wedding event roster keeps each musician’s confirmation status connected to the booking."
  },
  "faqHeading": "Wedding band management questions",
  "faqs": [
    {
      "question": "Is GigWorks built for wedding bands?",
      "answer": "Yes. GigWorks supports bandleaders and agencies booking musicians for weddings and other live events. It connects the client booking with contractor confirmations, payments, and performance preparation."
    },
    {
      "question": "Can I book the same ensemble for different weddings?",
      "answer": "Yes. Save your regular band as an ensemble and add its members to each event. Confirmation statuses are tracked for the individual wedding."
    },
    {
      "question": "Can I manage the contract and deposit together?",
      "answer": "Yes. Proposals, electronic signatures, invoices, and payment tracking are connected to the booking, keeping client documents and balances in the same workflow."
    },
    {
      "question": "How can my wedding band get started?",
      "answer": "Join the waitlist on the homepage or contact GigWorks to discuss your band’s booking and staffing workflow. GigWorks is onboarding an initial group of agencies and bandleaders."
    }
  ],
  "related": [
    "/band-management-software",
    "/musician-scheduling-software",
    "/proposal-contract-invoice-software"
  ]
}
];

export const SEO_PAGE_BY_PATH = Object.fromEntries(SEO_LANDING_PAGES.map((page) => [page.path, page]));

export const LEGAL_SEO_PAGES = {
  '/customer-stories': { title: 'Customer Stories | GigWorks', description: 'See how entertainment businesses use GigWorks to coordinate bookings, contractors, payments, and event production.' },
  '/privacy': { title: 'Privacy Policy | GigWorks', description: 'Learn how GigWorks collects, uses, protects, and retains account and business information.' },
  '/terms': { title: 'Terms of Service | GigWorks', description: 'Read the terms governing access to and use of the GigWorks entertainment-business platform.' },
  '/cookies': { title: 'Cookie Policy | GigWorks', description: 'Learn how GigWorks uses essential cookies and local browser storage.' },
};
