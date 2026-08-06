import { uid } from './storage';

// Also used to backfill accounts created before Bookings existed — see
// AuthContext's hydrate().
export function buildDefaultBookingStatuses() {
  return [
    { id: uid('bstatus'), label: 'Inquiry', color: '#94a3b8', isBooked: false },
    { id: uid('bstatus'), label: 'Quoted', color: '#eab308', isBooked: false },
    { id: uid('bstatus'), label: 'Booked', color: '#22c55e', isBooked: true },
    { id: uid('bstatus'), label: 'Converted', color: '#3b82f6', isBooked: true },
    { id: uid('bstatus'), label: 'Cancelled', color: '#ef4444', isBooked: false },
  ];
}

// Per-vertical defaults for the fields that actually read as vertical-
// specific (contractor/event type labels, email template copy) — everything
// else below (statuses, sample contractors/clients/events) stays the same
// shape across verticals, just seeded with these labels.
const VERTICAL_DEFAULTS = {
  band_orchestra: {
    contractorTypes: ['Musician', 'Supporting Photographer', 'Videographer', 'Sound Engineer', 'DJ'],
    eventTypes: ['Wedding', 'Corporate', 'Private Party', 'Birthday'],
    emailTemplates: [
      {
        name: 'Gig Inquiry',
        subject: 'Gig Inquiry {{GigDate}}',
        body: 'Hi {{ContractorFirstName}} {{ContractorLastName}} Are you available on {{EventDate}}? Please respond with your availability in timely manner. <br> Thank you <br> Suri.',
      },
      {
        name: 'Gig Update',
        subject: 'Gig Update {{GigDate}}',
        body: 'Hi {{ContractorFirstName}} {{ContractorLastName}}, <br> There\'s an update regarding your upcoming gig on {{EventDayOfTheWeek}}, {{EventDate}}. Please review the details below and let us know if you have any questions. <br> Thank you <br> Suri.',
      },
      {
        name: 'Gig Info',
        subject: 'Gig Info {{GigDate}}',
        body: 'Hi {{ContractorFirstName}} {{ContractorLastName}}, <br> Here are the details for your upcoming gig on {{EventDayOfTheWeek}}, {{EventDate}}. <br> Please reach out if you have any questions. <br> Thank you <br> Suri.',
      },
    ],
    offerings: [
      { name: '4-Hour Reception Package', details: 'Live band performance for cocktail hour and reception, includes sound system and MC services.', type: 'general', amount: 1200 },
      { name: 'Ceremony Add-On', details: 'Solo or duo acoustic performance during the ceremony.', type: 'general', amount: 300 },
      { name: 'Extra Hour', details: 'Additional performance time beyond the standard package.', type: 'perUnit', unitCount: 1, ratePerUnit: 150 },
    ],
    // Same head-start mechanism as party_planning/photography's
    // proposalSections — a fresh band_orchestra account was the only one
    // of the three still starting its first proposal from a blank page.
    // Technical/Hospitality Rider is the two-document standard attached to
    // a real band contract (confirmed via competitor research — Stage
    // Portal, Gigwell, and general industry guides all converge on this
    // split), and the composer's own "Riders, policies, or any other
    // custom content" placeholder was already inviting exactly this.
    proposalSections: [
      { title: 'Technical Rider', value: '', text: 'Backline, sound, and power requirements — see the attached stage plot and input list for exact placement and channel needs.' },
      { title: 'Hospitality Rider', value: '', text: 'Green room, food/beverage, and parking arrangements for the band.' },
      { title: 'Sound Check & Load-In', value: '', text: 'Expected arrival time, load-in access, and sound check window ahead of the performance.' },
      { title: 'Performance Breaks', value: '', text: 'Set length and break structure — e.g. three 45-minute sets with 15-minute breaks.' },
    ],
  },
  party_planning: {
    contractorTypes: ['Caterer', 'Event Planner', 'Florist', 'Rental Coordinator', 'Bartender'],
    eventTypes: ['Wedding', 'Corporate Event', 'Private Party', 'Gala'],
    emailTemplates: [
      {
        name: 'Vendor Inquiry',
        subject: 'Vendor Inquiry {{GigDate}}',
        body: 'Hi {{ContractorFirstName}} {{ContractorLastName}}, are you available on {{EventDate}}? Please respond with your availability in a timely manner. <br> Thank you <br> Suri.',
      },
      {
        name: 'Event Update',
        subject: 'Event Update {{GigDate}}',
        body: 'Hi {{ContractorFirstName}} {{ContractorLastName}}, <br> There\'s an update regarding the upcoming event on {{EventDayOfTheWeek}}, {{EventDate}}. Please review the details below and let us know if you have any questions. <br> Thank you <br> Suri.',
      },
      {
        name: 'Event Info',
        subject: 'Event Info {{GigDate}}',
        body: 'Hi {{ContractorFirstName}} {{ContractorLastName}}, <br> Here are the details for the upcoming event on {{EventDayOfTheWeek}}, {{EventDate}}. <br> Please reach out if you have any questions. <br> Thank you <br> Suri.',
      },
    ],
    // Pre-populates a new account's proposal template (BookingFormPage.jsx's
    // composer reads currentUser.proposalTemplate.sections) via the existing
    // SectionsEditor "arbitrary extra content" mechanism — no new component,
    // just a head start with section titles a party-planning proposal
    // actually needs, still fully editable like any other section.
    proposalSections: [
      { title: 'Menu Selections', value: '', text: 'Choose from our curated menu options — appetizers, entrées, and desserts tailored to your event.' },
      { title: 'Rental Items', value: '', text: 'Tables, chairs, linens, and other rental equipment included in this proposal.' },
      { title: 'Bar Service', value: '', text: 'Beverage packages and bar staffing details.' },
      { title: 'Day-of Logistics', value: '', text: 'Setup, breakdown, and timeline coordination for your event day.' },
    ],
    offerings: [
      { name: 'Full Event Coordination', details: 'End-to-end planning from initial concept through day-of execution.', type: 'general', amount: 2500 },
      { name: 'Day-Of Coordination', details: 'On-site coordination to keep an already-planned event running smoothly.', type: 'general', amount: 800 },
      { name: 'Additional Planning Hour', details: 'Extra consulting/planning time beyond the standard package.', type: 'perUnit', unitCount: 1, ratePerUnit: 75 },
    ],
  },
  photography: {
    contractorTypes: ['Lead Photographer', 'Second Shooter', 'Videographer', 'Photo Editor'],
    eventTypes: ['Wedding', 'Portrait Session', 'Corporate Event'],
    emailTemplates: [
      {
        name: 'Shoot Inquiry',
        subject: 'Shoot Inquiry {{GigDate}}',
        body: 'Hi {{ContractorFirstName}} {{ContractorLastName}}, are you available to shoot on {{EventDate}}? Please respond with your availability in a timely manner. <br> Thank you <br> Suri.',
      },
      {
        name: 'Shoot Update',
        subject: 'Shoot Update {{GigDate}}',
        body: 'Hi {{ContractorFirstName}} {{ContractorLastName}}, <br> There\'s an update regarding the upcoming shoot on {{EventDayOfTheWeek}}, {{EventDate}}. Please review the details below and let us know if you have any questions. <br> Thank you <br> Suri.',
      },
      {
        name: 'Shoot Info',
        subject: 'Shoot Info {{GigDate}}',
        body: 'Hi {{ContractorFirstName}} {{ContractorLastName}}, <br> Here are the details for the upcoming shoot on {{EventDayOfTheWeek}}, {{EventDate}}. <br> Please reach out if you have any questions. <br> Thank you <br> Suri.',
      },
    ],
    // Same head-start mechanism as party_planning's proposalSections above —
    // a fresh photography account otherwise starts its very first proposal
    // from a blank page.
    proposalSections: [
      { title: 'Coverage Details', value: '', text: 'Hours of coverage and number of photographers on-site for your event.' },
      { title: 'Deliverables', value: '', text: 'Edited image count, gallery format, and delivery turnaround time.' },
      { title: 'Add-Ons', value: '', text: 'Albums, prints, engagement sessions, and other optional extras.' },
      { title: 'Timeline & Delivery', value: '', text: 'When to expect your final gallery and how it will be delivered.' },
    ],
    offerings: [
      { name: '6-Hour Wedding Package', details: 'Full-day wedding coverage from getting-ready through reception, includes an edited digital gallery.', type: 'general', amount: 2800 },
      { name: '2-Hour Portrait Session', details: 'On-location portrait session with edited digital images.', type: 'general', amount: 450 },
      { name: 'Additional Photographer', details: 'A second shooter added to any package for extra coverage angles.', type: 'general', amount: 350 },
      { name: 'USB with All Edited Images', details: 'Physical USB drive delivery of the full edited gallery.', type: 'general', amount: 150 },
    ],
  },
};

// Sensible default custom-field lists + a couple of sample records so a
// freshly-created account isn't a completely blank slate. `vertical` should
// be the account's Account.vertical value (server/src/lib/verticals.js);
// falls back to the original band/orchestra defaults for anything
// unrecognized so this never throws on a stale/missing value.
export function buildSeedUserData(vertical) {
  const { contractorTypes, eventTypes, emailTemplates: emailTemplateDefs, proposalSections = [], offerings: offeringDefs = [] } =
    VERTICAL_DEFAULTS[vertical] || VERTICAL_DEFAULTS.band_orchestra;

  const eventStatuses = [
    { id: uid('estatus'), label: 'Draft', color: '#94a3b8' },
    { id: uid('estatus'), label: 'Confirmed', color: '#22c55e' },
    { id: uid('estatus'), label: 'Completed', color: '#3b82f6' },
    { id: uid('estatus'), label: 'Cancelled', color: '#ef4444' },
  ];

  const inquiryStatuses = [
    { id: uid('inq'), label: 'Added', color: '#94a3b8', isConfirmed: false, bucket: 'tentative' },
    { id: uid('inq'), label: 'Not Contacted', color: '#94a3b8', isConfirmed: false, bucket: 'tentative' },
    { id: uid('inq'), label: 'Emailed', color: '#eab308', isConfirmed: false, bucket: 'tentative' },
    { id: uid('inq'), label: 'Called', color: '#eab308', isConfirmed: false, bucket: 'tentative' },
    { id: uid('inq'), label: 'Confirmed', color: '#22c55e', isConfirmed: true, bucket: 'confirmed' },
    { id: uid('inq'), label: 'Not Available', color: '#ef4444', isConfirmed: false, bucket: 'unavailable' },
    { id: uid('inq'), label: 'Declined', color: '#ef4444', isConfirmed: false, bucket: 'unavailable' },
  ];

  const bookingStatuses = buildDefaultBookingStatuses();

  const emailTemplates = emailTemplateDefs.map((t) => ({ id: uid('tmpl'), ...t }));

  const c1 = uid('con');
  const c2 = uid('con');
  const c3 = uid('con');
  const c1Tier = uid('tier');
  const c2Tier = uid('tier');
  const c3Tier = uid('tier');

  // A secondary type/specialty for the first sample contractor — reads
  // sensibly per vertical rather than leaving the Role column blank on a
  // brand-new account's very first look at the Contractors page.
  const C1_SECONDARY_TYPE = {
    band_orchestra: 'Guitar',
    party_planning: 'Full-Service Catering',
    photography: 'Wedding & Portraits',
  };
  const c1Type2 = C1_SECONDARY_TYPE[vertical] || '';

  const contractors = [
    {
      id: c1,
      firstName: 'Alex',
      middleName: '',
      lastName: 'Rivera',
      email: 'alex.rivera@example.com',
      phone: '512-555-0110',
      contractorType1: contractorTypes[0],
      contractorType2: c1Type2,
      pricingTiers: [{ id: c1Tier, name: 'Standard', price: 450 }],
      priceNotes: 'Requires load-in access 1hr before start.',
      createdAt: new Date().toISOString(),
    },
    {
      id: c2,
      firstName: 'Jordan',
      middleName: '',
      lastName: 'Lee',
      email: 'jordan.lee@example.com',
      phone: '512-555-0133',
      contractorType1: contractorTypes[1],
      contractorType2: '',
      pricingTiers: [{ id: c2Tier, name: 'Standard', price: 350 }],
      priceNotes: '',
      createdAt: new Date().toISOString(),
    },
    {
      id: c3,
      firstName: 'Sam',
      middleName: 'T.',
      lastName: 'Nguyen',
      email: 'sam.nguyen@example.com',
      phone: '512-555-0177',
      contractorType1: contractorTypes[contractorTypes.length - 1],
      contractorType2: '',
      pricingTiers: [{ id: c3Tier, name: 'Standard', price: 600 }],
      priceNotes: 'Owns full PA system, no rental needed.',
      createdAt: new Date().toISOString(),
    },
  ];

  const cl1 = uid('cli');
  const cl2 = uid('cli');

  const clients = [
    {
      id: cl1,
      firstName: 'Harper',
      lastName: 'Morgan',
      phone: '(512) 555-0199',
      email: 'harper.morgan@example.com',
      address1: '410 Willow Creek Dr',
      address2: '',
      city: 'Austin',
      state: 'TX',
      zip: '78704',
      notes: 'Prefers text over email for last-minute updates.',
      createdAt: new Date().toISOString(),
    },
    {
      id: cl2,
      firstName: 'Priya',
      lastName: 'Shah',
      phone: '(512) 555-0164',
      email: 'events@riversidecorp.example',
      address1: '88 Riverside Ave',
      address2: 'Suite 300',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      notes: '',
      createdAt: new Date().toISOString(),
    },
  ];

  const sampleDate = new Date();
  sampleDate.setDate(sampleDate.getDate() + 21);

  const events = [
    {
      id: uid('evt'),
      name: 'Harper & Morgan Wedding',
      eventType: 'Wedding',
      eventDate: sampleDate.toISOString().slice(0, 10),
      venue: { name: 'The Garden Pavilion', address1: '120 Vine St', address2: '', city: 'Austin', state: 'TX', zip: '78701' },
      contactPhone: '512-555-0142',
      contactPhoneExt: '',
      contactEmail: 'venue@gardenpavilion.example',
      startTime: '17:00',
      endTime: '23:00',
      eventStatus: eventStatuses[1].id,
      clientId: cl1,
      contractorBookings: [
        { contractorId: c1, inquiryStatusId: inquiryStatuses[4].id, pricingTierId: c1Tier },
        { contractorId: c2, inquiryStatusId: inquiryStatuses[2].id, pricingTierId: c2Tier },
      ],
      createdAt: new Date().toISOString(),
    },
  ];

  const offerings = offeringDefs.map((o) => ({ id: uid('off'), createdAt: new Date().toISOString(), ...o }));

  return {
    contractorTypes, eventTypes, eventStatuses, inquiryStatuses, bookingStatuses,
    emailTemplates, contractors, clients, events, bookings: [], offerings,
    setListLibrary: [],
    proposalTemplate: { sections: proposalSections.map((s) => ({ id: uid('section'), ...s })) },
  };
}
