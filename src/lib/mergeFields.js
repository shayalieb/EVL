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
