import { formatCurrency, formatEventDate as formatDate, formatEventTime as formatTime } from './format';
import { getTierPrice } from './pricingTiers';
import { escapeHtml } from './htmlEscape';

// Field names here must match the {{Token}} names shown in the Email
// Templates "Insert Fields" reference panel. Every leaf value pulled from a
// free-text field (contractor/venue/event names, notes, phone numbers) is
// escapeHtml'd before being folded into an HTML fragment — the fragments
// themselves (the <ul>/<li>/<a> markup below) are deliberately real HTML,
// substituted as-is into the business's own template (see substitute()
// below), so only the leaf text needs escaping, not the wrapper tags.
function buildFieldMap({ event, contractor, booking, contractors, pricingTierId }) {
  const eventDate = formatDate(event.eventDate);
  const venue = event.venue || {};
  const cityStateZip = venue.city && venue.state ? `${venue.city}, ${venue.state}${venue.zip ? ` ${venue.zip}` : ''}` : '';
  const venueFullAddress = [venue.name, venue.address1, venue.address2, cityStateZip].filter(Boolean).map(escapeHtml).join('<br>');
  // A ready-to-send location block: the address as a normal postal address,
  // a Google Maps / Waze link built from that address, then the location
  // note and load-in info as their own lines — but only when set, so a venue
  // without either doesn't leave blank lines in the email. The href itself
  // is already URL-safe via encodeURIComponent; the link text is hardcoded,
  // not user content, so neither needs escapeHtml.
  const addressQuery = [venue.address1, venue.address2, cityStateZip].filter(Boolean).join(', ');
  const mapsLinks = addressQuery
    ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}">Open in Google Maps</a> · <a href="https://waze.com/ul?q=${encodeURIComponent(addressQuery)}&navigate=yes">Open in Waze</a>`
    : '';
  const locationExtras = [
    venue.locationNote ? escapeHtml(venue.locationNote) : '',
    venue.loadInInfo ? `Load-in: ${escapeHtml(venue.loadInInfo)}` : '',
  ].filter(Boolean);
  const locationBlock = [venue.name, venue.address1, venue.address2, cityStateZip].filter(Boolean).map(escapeHtml)
    .concat([mapsLinks, ...locationExtras].filter(Boolean))
    .join('<br>');
  // Every other contractor booked to the event in the same category as this
  // email's recipient (e.g. a musician's email lists the rest of the band,
  // not the photographers) — "that group" is the recipient's own category.
  const crewRows = (event.contractorBookings || [])
    .map((b) => (contractors || []).find((c) => c.id === b.contractorId))
    .filter((c) => c && c.contractorType1 === contractor.contractorType1)
    .map((c) => `<li>${escapeHtml(c.contractorType2 || c.contractorType1)} - ${escapeHtml(`${c.firstName} ${c.lastName}`)}</li>`)
    .join('');
  // list-style is set inline (not left to the browser default) because this
  // HTML also gets rendered inside the app itself (template preview, send
  // preview, sent-message thread view), where Tailwind's preflight resets
  // `ul { list-style: none }` — without this the bullets vanish in-app even
  // though they'd show fine in a real email client.
  const crewList = crewRows ? `<ul style="margin:0;padding-left:18px;list-style-type:disc;">${crewRows}</ul>` : '';
  // One link, used the same way in every email, because the update-in-place
  // behavior depends on it: /calendar/invite.ics carries a UID stable per
  // event+contractor and a sequence number set to the send time in epoch
  // seconds (always higher on a later send). When the recipient adds it via
  // this same link from a later email (e.g. Gig Info, after Gig Inquiry
  // already added it), Google/Apple/Outlook Calendar all recognize the
  // repeated UID and update the existing entry instead of creating a
  // duplicate — the same mechanism real "meeting time changed" invites use.
  // A separate Google "instant add" button was tried and dropped: it opens
  // faster (no file to import) but creates a disconnected event with no
  // shared UID, so a later resend can't update it on Google specifically —
  // one universal link that updates everywhere beats a faster link that
  // only creates.
  const bookingStart = booking?.startTime || event.startTime;
  const bookingEnd = booking?.endTime || event.endTime;
  let addToCalendar = '';
  if (event.id && event.eventDate && bookingStart && bookingEnd) {
    const toIcsDateTime = (time) => `${event.eventDate.replace(/-/g, '')}T${time.replace(':', '')}00`;
    const params = new URLSearchParams({
      uid: `${event.id}-${contractor.id || 'contractor'}@gigworks.app`,
      sequence: String(Math.floor(Date.now() / 1000)),
      summary: event.name || 'Gig',
      start: toIcsDateTime(bookingStart),
      end: toIcsDateTime(bookingEnd),
    });
    if (addressQuery) params.set('location', addressQuery);
    if (event.eventNote) params.set('description', event.eventNote);
    if (contractor.email) params.set('attendeeEmail', contractor.email);
    if (contractor.firstName || contractor.lastName) params.set('attendeeName', `${contractor.firstName} ${contractor.lastName}`.trim());
    addToCalendar = `<a href="${import.meta.env.VITE_API_BASE}/calendar/invite.ics?${params.toString()}">Add to Calendar</a>`;
  }
  return {
    ContractorFirstName: escapeHtml(contractor.firstName),
    ContractorLastName: escapeHtml(contractor.lastName),
    ContractorEmail: escapeHtml(contractor.email),
    ContractorPhone: escapeHtml(contractor.phone),
    ContractorType1: escapeHtml(contractor.contractorType1),
    ContractorType2: escapeHtml(contractor.contractorType2),
    ContractorPrice: formatCurrency(getTierPrice(contractor, pricingTierId)),
    ContractorPriceNotes: escapeHtml(contractor.priceNotes),
    EventName: escapeHtml(event.name),
    EventType: escapeHtml(event.eventType),
    EventDate: eventDate,
    EventDayOfTheWeek: escapeHtml(event.eventDayOfTheWeek),
    GigDate: eventDate,
    EventStartTime: formatTime(event.startTime),
    EventEndTime: formatTime(event.endTime),
    ContractorStartTime: formatTime(booking?.startTime || event.startTime),
    ContractorEndTime: formatTime(booking?.endTime || event.endTime),
    EventNote: escapeHtml(event.eventNote),
    VenueName: escapeHtml(event.venue?.name),
    VenueAddress1: escapeHtml(event.venue?.address1),
    VenueAddress2: escapeHtml(event.venue?.address2),
    VenueCity: escapeHtml(event.venue?.city),
    VenueState: escapeHtml(event.venue?.state),
    VenueZip: escapeHtml(event.venue?.zip),
    VenueFullAddress: venueFullAddress,
    LocationBlock: locationBlock,
    LocationNote: escapeHtml(event.venue?.locationNote),
    LoadInInfo: escapeHtml(event.venue?.loadInInfo),
    ContactPhone: escapeHtml(event.contactPhone),
    ContactPhoneExt: escapeHtml(event.contactPhoneExt),
    ContactEmail: escapeHtml(event.contactEmail),
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
