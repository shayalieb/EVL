import { uid } from './storage';

// Sensible default custom-field lists + a couple of sample records so a
// freshly-created account isn't a completely blank slate.
export function buildSeedUserData() {
  const contractorTypes = ['Musician', 'Supporting Photographer', 'Videographer', 'Sound Engineer', 'DJ'];
  const eventTypes = ['Wedding', 'Corporate', 'Private Party', 'Birthday'];

  const eventStatuses = [
    { id: uid('estatus'), label: 'Draft', color: '#94a3b8' },
    { id: uid('estatus'), label: 'Confirmed', color: '#22c55e' },
    { id: uid('estatus'), label: 'Completed', color: '#3b82f6' },
    { id: uid('estatus'), label: 'Cancelled', color: '#ef4444' },
  ];

  const inquiryStatuses = [
    { id: uid('inq'), label: 'Not Contacted', color: '#94a3b8', isConfirmed: false },
    { id: uid('inq'), label: 'Emailed', color: '#eab308', isConfirmed: false },
    { id: uid('inq'), label: 'Called', color: '#eab308', isConfirmed: false },
    { id: uid('inq'), label: 'Confirmed', color: '#22c55e', isConfirmed: true },
    { id: uid('inq'), label: 'Not Available', color: '#ef4444', isConfirmed: false },
    { id: uid('inq'), label: 'Declined', color: '#ef4444', isConfirmed: false },
  ];

  const emailTemplates = [
    {
      id: uid('tmpl'),
      name: 'Gig Inquiry',
      subject: 'Gig Inquiry {{GigDate}}',
      body: 'Hi {{ContractorFirstName}} {{ContractorLastName}} Are you available on {{EventDate}}? Please respond with your availability in timely manner. <br> Thank you <br> Suri.',
    },
    {
      id: uid('tmpl'),
      name: 'Gig Update',
      subject: 'Gig Update {{GigDate}}',
      body: 'Hi {{ContractorFirstName}} {{ContractorLastName}}, <br> There\'s an update regarding your upcoming gig on {{EventDayOfTheWeek}}, {{EventDate}}. Please review the details below and let us know if you have any questions. <br> Thank you <br> Suri.',
    },
    {
      id: uid('tmpl'),
      name: 'Gig Info',
      subject: 'Gig Info {{GigDate}}',
      body: 'Hi {{ContractorFirstName}} {{ContractorLastName}}, <br> Here are the details for your upcoming gig on {{EventDayOfTheWeek}}, {{EventDate}}. <br> Please reach out if you have any questions. <br> Thank you <br> Suri.',
    },
  ];

  const c1 = uid('con');
  const c2 = uid('con');
  const c3 = uid('con');

  const contractors = [
    {
      id: c1,
      firstName: 'Alex',
      middleName: '',
      lastName: 'Rivera',
      email: 'alex.rivera@example.com',
      phone: '512-555-0110',
      contractorType1: 'Musician',
      contractorType2: 'Guitar',
      price: 450,
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
      contractorType1: 'Supporting Photographer',
      contractorType2: '',
      price: 350,
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
      contractorType1: 'DJ',
      contractorType2: '',
      price: 600,
      priceNotes: 'Owns full PA system, no rental needed.',
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
      contractorBookings: [
        { contractorId: c1, inquiryStatusId: inquiryStatuses[3].id },
        { contractorId: c2, inquiryStatusId: inquiryStatuses[1].id },
      ],
      createdAt: new Date().toISOString(),
    },
  ];

  return { contractorTypes, eventTypes, eventStatuses, inquiryStatuses, emailTemplates, contractors, events };
}
