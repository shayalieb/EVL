import { emptyForm, emptyVenue } from '../pages/BookingFormPage';

// Match an existing Client against a submitted inquiry response, without
// fuzzy name-matching (which could conflate two different people who share
// a name). Email first (most reliable, case-insensitive), then phone
// (digits-only, so formatting differences like "(555) 555-0100" vs
// "5555550100" still match), else no match — a new Client gets created.
// A match is reused as-is; we never overwrite an existing client's fields,
// since those were presumably entered deliberately.
export function findMatchingClient(clients, response) {
  const email = response.email?.trim().toLowerCase();
  if (email) {
    const byEmail = clients.find((c) => c.email?.trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  const digits = (s) => (s || '').replace(/\D/g, '');
  const phone = digits(response.phone);
  if (phone) {
    const byPhone = clients.find((c) => digits(c.phone) === phone);
    if (byPhone) return byPhone;
  }
  return null;
}

// If the booking a response is being applied to/into already has a linked
// client, that link is left alone (it was presumably set deliberately —
// e.g. from a phone call before the inquiry link was even sent). Only when
// there's no existing link does this fall back to find-or-create.
export function resolveClientForMerge(response, { clients, addClient, currentClientId }) {
  if (currentClientId) {
    return { clientId: currentClientId, client: clients.find((c) => c.id === currentClientId) || null, created: false };
  }
  let client = findMatchingClient(clients, response);
  const created = !client;
  if (!client) {
    client = addClient({ firstName: response.firstName, lastName: response.lastName, phone: response.phone, email: response.email });
  }
  return { clientId: client.id, client, created };
}

// The client's free-text "Details" field lands in the booking's own Notes
// field (there's no dedicated slot for it) — clearly labeled and appended
// rather than overwriting whatever the agent already has there, since Notes
// is a general-purpose field that may already be in active use.
function mergeNotesWithDetails(existingNotes, details) {
  if (!details) return existingNotes || '';
  const labeled = `From inquiry form: ${details}`;
  return existingNotes ? `${existingNotes}\n\n${labeled}` : labeled;
}

function lastWord(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

// Bride's/Groom's Name stay single free-text fields on the inquiry form
// (matching the fields as the user described them) — "last name" for the
// event-name mash-up is just the last whitespace-separated token, a
// reasonable default for typically "First Last" input. This is only the
// *initial* value; the Event Name field on the booking stays freely
// editable afterward like it always has.
export function generateEventName({ groomName, brideName, eventType }) {
  const names = [lastWord(groomName), lastWord(brideName)].filter(Boolean).join(' & ');
  return [names, eventType].filter(Boolean).join(' — ');
}

// Turns a submitted InquiryLink.response into a real Client + Booking via
// the normal authenticated addClient/addBooking flow (never writes directly
// server-side — see InquiryLink's model comment in schema.prisma for why).
// Builds a full booking/venue shape (not just the inquiry-sourced fields) —
// addBooking does a flat spread with no deep-defaulting, so a partial venue
// object here would leave fields like city/state undefined instead of ''.
export function applyInquiryResponse(response, { clients, addClient, addBooking }) {
  const r = response;
  const { clientId, client } = resolveClientForMerge(r, { clients, addClient, currentClientId: null });

  const booking = addBooking({
    ...emptyForm(),
    eventName: generateEventName(r),
    clientId,
    eventDate: r.eventDate,
    eventType: r.eventType,
    brideName: r.brideName,
    groomName: r.groomName,
    notes: mergeNotesWithDetails('', r.details),
    venue: {
      ...emptyVenue(),
      name: r.venueName,
      address1: r.address1,
      address2: r.address2,
      city: r.city,
      state: r.state,
      zip: r.zip,
      contactName: r.venueContactName,
      contactEmail: r.venueContactEmail,
    },
  });

  return { client, booking };
}

// For a link sent FROM an existing, in-progress booking (InquiryLink.
// bookingId set) — the response fills in gaps rather than replacing the
// booking wholesale. Only overwrites a field when the response actually has
// a value for it, so blanks left on the public form (e.g. the client skipped
// venue contact info) never clobber something the agent already entered.
// eventName is the one exception: it's only ever set here if the booking's
// eventName is still blank, since a booking already underway may well have
// one the agent typed on purpose.
export function buildBookingMergePatch(response, currentBooking) {
  const r = response;
  const venue = currentBooking.venue || {};
  const pick = (next, prev) => (next ? next : prev);
  return {
    eventDate: pick(r.eventDate, currentBooking.eventDate),
    eventType: pick(r.eventType, currentBooking.eventType),
    brideName: pick(r.brideName, currentBooking.brideName),
    groomName: pick(r.groomName, currentBooking.groomName),
    eventName: currentBooking.eventName || generateEventName(r),
    notes: mergeNotesWithDetails(currentBooking.notes, r.details),
    venue: {
      ...venue,
      name: pick(r.venueName, venue.name),
      address1: pick(r.address1, venue.address1),
      address2: pick(r.address2, venue.address2),
      city: pick(r.city, venue.city),
      state: pick(r.state, venue.state),
      zip: pick(r.zip, venue.zip),
      contactName: pick(r.venueContactName, venue.contactName),
      contactEmail: pick(r.venueContactEmail, venue.contactEmail),
    },
  };
}
