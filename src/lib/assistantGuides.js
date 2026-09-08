// Short, task-oriented training paths for the Assistant. The Help Center remains
// the detailed source of truth; these guides give new users a manageable order
// in which to learn the product and deep-link every step to the real screen.
export const ASSISTANT_GUIDES = [
  {
    id: 'first-booking',
    title: 'Take a lead from inquiry to signed gig',
    description: 'Learn the complete sales workflow without skipping an important handoff.',
    permission: 'manageBookings',
    duration: '10 min',
    steps: [
      { title: 'Understand Bookings and Events', description: 'Learn why sales work and day-of work are separate.', path: '/help?article=bookings-vs-events', articleId: 'bookings-vs-events' },
      { title: 'Review an inquiry', description: 'Compare possible clients and turn the inquiry into a Booking.', path: '/help?article=review-inquiry', articleId: 'review-inquiry' },
      { title: 'Build and send the proposal', description: 'Add offerings, verify pricing, preview, and send.', path: '/help?article=proposals', articleId: 'proposals' },
      { title: 'Send the contract', description: 'Prepare signatures and understand automatic Event conversion.', path: '/help?article=contracts', articleId: 'contracts' },
    ],
  },
  {
    id: 'staff-event',
    title: 'Staff and communicate for an event',
    description: 'Build a roster, confirm contractors, and keep communication attached to the gig.',
    permission: 'manageEvents',
    duration: '8 min',
    steps: [
      { title: 'Build the event roster', description: 'Add contractors or a saved ensemble to the Event.', path: '/help?article=event-roster', articleId: 'event-roster' },
      { title: 'Track confirmations', description: 'Use roster statuses and buckets consistently.', path: '/help?article=roster-statuses', articleId: 'roster-statuses' },
      { title: 'Send event communication', description: 'Use templates and keep contact history with the contractor row.', path: '/help?article=email-templates', articleId: 'email-templates' },
      { title: 'Share the gig calendar', description: 'Give each contractor a secure view of their own gigs.', path: '/help?article=gig-calendar-link', articleId: 'gig-calendar-link' },
    ],
  },
  {
    id: 'invoice-payment',
    title: 'Invoice a client and track payment',
    description: 'Create a clean payment workflow from invoice through reconciliation.',
    permission: 'viewFinancials',
    duration: '7 min',
    steps: [
      { title: 'Connect online payments', description: 'Connect Stripe before sending a payable invoice.', path: '/help?article=connect-stripe', articleId: 'connect-stripe' },
      { title: 'Create and send an invoice', description: 'Build the invoice from the correct Booking or Event.', path: '/help?article=create-invoice', articleId: 'create-invoice' },
      { title: 'Record other payment methods', description: 'Keep checks, cash, and bank transfers accurate.', path: '/help?article=manual-payments', articleId: 'manual-payments' },
      { title: 'Review the financial picture', description: 'Understand what is collected, outstanding, and still owed.', path: '/help?article=financials-overview', articleId: 'financials-overview' },
    ],
  },
  {
    id: 'pay-contractors',
    title: 'Review and pay contractors',
    description: 'Handle contractor rates and payment requests without accounting jargon.',
    permission: 'viewFinancials',
    duration: '5 min',
    steps: [
      { title: 'Understand contractor payments', description: 'See how gig rates, requests, approvals, and paid status connect.', path: '/help?article=contractor-payments', articleId: 'contractor-payments' },
      { title: 'Open Financials', description: 'Review requests and payments that need attention.', path: '/financials?section=requests' },
      { title: 'Prepare a bookkeeper export', description: 'Export clean records when outside accounting help is needed.', path: '/help?article=bookkeeper-export', articleId: 'bookkeeper-export' },
    ],
  },
  {
    id: 'day-of',
    title: 'Prepare the day-of materials',
    description: 'Create the documents your performers and production team actually need.',
    permission: 'manageEvents',
    duration: '8 min',
    steps: [
      { title: 'Build a stage plot', description: 'Place equipment and maintain Production and Backline lists.', path: '/help?article=stage-plot', articleId: 'stage-plot' },
      { title: 'Prepare the set list', description: 'Create and reuse performance-ready song orders.', path: '/help?article=set-lists', articleId: 'set-lists' },
      { title: 'Create prep sheets', description: 'Bring the final event information together for the team.', path: '/help?article=prep-sheets', articleId: 'prep-sheets' },
    ],
  },
  {
    id: 'setup-business',
    title: 'Set up GigWorks correctly',
    description: 'A guided first-run checklist for branding, roster, offerings, and inquiries.',
    duration: '12 min',
    steps: [
      { title: 'Set up your business', description: 'Add business details, branding, and reusable defaults.', path: '/help?article=setup', articleId: 'setup' },
      { title: 'Add a contractor', description: 'Build your roster with contact details and pricing.', path: '/help?article=add-contractor', articleId: 'add-contractor' },
      { title: 'Create offerings', description: 'Define what you sell so proposals remain consistent.', path: '/help?article=adding-offerings', articleId: 'adding-offerings' },
      { title: 'Turn on inquiry collection', description: 'Set up the link prospects use to contact you.', path: '/help?article=inquiries', articleId: 'inquiries' },
    ],
  },
];

