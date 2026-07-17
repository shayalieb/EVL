import { formatCurrency, formatEventDate as formatDate, formatEventTime as formatTime } from './format';
import { getTierPrice } from './pricingTiers';

// Field names here must match the {{Token}} names shown in the Email
// Templates "Insert Fields" reference panel.
function buildFieldMap({ event, contractor, booking, contractors, pricingTierId }) {
  const eventDate = formatDate(event.eventDate);
  const venue = event.venue || {};
  const cityStateZip = venue.city && venue.state ? `${venue.city}, ${venue.state}${venue.zip ? ` ${venue.zip}` : ''}` : '';
  const venueFullAddress = [venue.name, venue.address1, venue.address2, cityStateZip].filter(Boolean).join('<br>');
  // A ready-to-send location block: the address as a normal postal address,
  // a Google Maps / Waze link built from that address, then the location
  // note and load-in info as their own lines — but only when set, so a venue
  // without either doesn't leave blank lines in the email.
  const addressQuery = [venue.address1, venue.address2, cityStateZip].filter(Boolean).join(', ');
  const mapsLinks = addressQuery
    ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}">Open in Google Maps</a> · <a href="https://waze.com/ul?q=${encodeURIComponent(addressQuery)}&navigate=yes">Open in Waze</a>`
    : '';
  const locationExtras = [
    venue.locationNote,
    venue.loadInInfo ? `Load-in: ${venue.loadInInfo}` : '',
  ].filter(Boolean);
  const locationBlock = [venue.name, venue.address1, venue.address2, cityStateZip, mapsLinks, ...locationExtras]
    .filter(Boolean)
    .join('<br>');
  // Every other contractor booked to the event in the same category as this
  // email's recipient (e.g. a musician's email lists the rest of the band,
  // not the photographers) — "that group" is the recipient's own category.
  const crewRows = (event.contractorBookings || [])
    .map((b) => (contractors || []).find((c) => c.id === b.contractorId))
    .filter((c) => c && c.contractorType1 === contractor.contractorType1)
    .map((c) => `<li>${c.contractorType2 || c.contractorType1} - ${c.firstName} ${c.lastName}</li>`)
    .join('');
  // list-style is set inline (not left to the browser default) because this
  // HTML also gets rendered inside the app itself (template preview, send
  // preview, sent-message thread view), where Tailwind's preflight resets
  // `ul { list-style: none }` — without this the bullets vanish in-app even
  // though they'd show fine in a real email client.
  const crewList = crewRows ? `<ul style="margin:0;padding-left:18px;list-style-type:disc;">${crewRows}</ul>` : '';
  // Two links, not one, because no single link both opens instantly *and*
  // supports the update-in-place trick below:
  // - Google Calendar's own "render" URL opens straight into Google
  //   Calendar (browser or the mobile app, via its universal link) with no
  //   download step — but it creates a disconnected event with no shared
  //   ID, so a later resend can't update it; each click makes a new event.
  // - The /calendar/invite.ics link (Apple Calendar, Outlook, Android's
  //   default calendar app) carries a UID stable per event+contractor and a
  //   sequence number set to the send time in epoch seconds (always higher
  //   on a later send) — clicking it again from a later email (e.g. Gig
  //   Info, after Gig Inquiry already added it) updates the existing
  //   calendar entry instead of creating a duplicate, the same mechanism
  //   real "meeting time changed" invite emails use. Google Calendar users
  //   don't get that update-in-place behavior — accepted tradeoff for the
  //   instant-open link.
  const bookingStart = booking?.startTime || event.startTime;
  const bookingEnd = booking?.endTime || event.endTime;
  let addToCalendar = '';
  if (event.id && event.eventDate && bookingStart && bookingEnd) {
    const toIcsDateTime = (time) => `${event.eventDate.replace(/-/g, '')}T${time.replace(':', '')}00`;
    const start = toIcsDateTime(bookingStart);
    const end = toIcsDateTime(bookingEnd);
    const summary = event.name || 'Gig';

    const gcalParams = new URLSearchParams({ action: 'TEMPLATE', text: summary, dates: `${start}/${end}` });
    if (addressQuery) gcalParams.set('location', addressQuery);
    if (event.eventNote) gcalParams.set('details', event.eventNote);
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?${gcalParams.toString()}`;

    const icsParams = new URLSearchParams({
      uid: `${event.id}-${contractor.id || 'contractor'}@gigworks.app`,
      sequence: String(Math.floor(Date.now() / 1000)),
      summary,
      start,
      end,
    });
    if (addressQuery) icsParams.set('location', addressQuery);
    if (event.eventNote) icsParams.set('description', event.eventNote);
    if (contractor.email) icsParams.set('attendeeEmail', contractor.email);
    if (contractor.firstName || contractor.lastName) icsParams.set('attendeeName', `${contractor.firstName} ${contractor.lastName}`.trim());
    const icsUrl = `${import.meta.env.VITE_API_BASE}/calendar/invite.ics?${icsParams.toString()}`;

    addToCalendar = `<a href="${googleCalendarUrl}">Add to Google Calendar</a> · <a href="${icsUrl}">Add to Apple/Outlook Calendar</a>`;
  }
  return {
    ContractorFirstName: contractor.firstName || '',
    ContractorLastName: contractor.lastName || '',
    ContractorEmail: contractor.email || '',
    ContractorPhone: contractor.phone || '',
    ContractorType1: contractor.contractorType1 || '',
    ContractorType2: contractor.contractorType2 || '',
    ContractorPrice: formatCurrency(getTierPrice(contractor, pricingTierId)),
    ContractorPriceNotes: contractor.priceNotes || '',
    EventName: event.name || '',
    EventType: event.eventType || '',
    EventDate: eventDate,
    EventDayOfTheWeek: event.eventDayOfTheWeek || '',
    GigDate: eventDate,
    EventStartTime: formatTime(event.startTime),
    EventEndTime: formatTime(event.endTime),
    ContractorStartTime: formatTime(booking?.startTime || event.startTime),
    ContractorEndTime: formatTime(booking?.endTime || event.endTime),
    EventNote: event.eventNote || '',
    VenueName: event.venue?.name || '',
    VenueAddress1: event.venue?.address1 || '',
    VenueAddress2: event.venue?.address2 || '',
    VenueCity: event.venue?.city || '',
    VenueState: event.venue?.state || '',
    VenueZip: event.venue?.zip || '',
    VenueFullAddress: venueFullAddress,
    LocationBlock: locationBlock,
    LocationNote: event.venue?.locationNote || '',
    LoadInInfo: event.venue?.loadInInfo || '',
    ContactPhone: event.contactPhone || '',
    ContactPhoneExt: event.contactPhoneExt || '',
    ContactEmail: event.contactEmail || '',
    CrewList: crewList,
    AddToCalendar: addToCalendar,
  };
}

function substitute(text, fieldMap) {
  return (text || '').replace(/\{\{(\w+)\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(fieldMap, key) ? fieldMap[key] : match
  ));
}

export function renderEmailTemplate({ template, event, contractor, booking, contractors, pricingTierId }) {
  const fieldMap = buildFieldMap({ event, contractor, booking, contractors, pricingTierId });
  return {
    subject: substitute(template.subject, fieldMap),
    body: substitute(template.body, fieldMap),
  };
}
