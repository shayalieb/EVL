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
  let client = findMatchingClient(clients, r);
  if (!client) {
    client = addClient({ firstName: r.firstName, lastName: r.lastName, phone: r.phone, email: r.email });
  }

  const booking = addBooking({
    ...emptyForm(),
    eventName: generateEventName(r),
    clientId: client.id,
    eventDate: r.eventDate,
    eventType: r.eventType,
    brideName: r.brideName,
    groomName: r.groomName,
    venue: {
      ...emptyVenue(),
      name: r.venueName,
      address1: r.address1,
      address2: r.address2,
      contactName: r.venueContactName,
      contactEmail: r.venueContactEmail,
    },
  });

  return { client, booking };
}
