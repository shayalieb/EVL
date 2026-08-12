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
export async function resolveClientForMerge(response, { clients, addClient, currentClientId }) {
  if (currentClientId) {
    return { clientId: currentClientId, client: clients.find((c) => c.id === currentClientId) || null, created: false };
  }
  let client = findMatchingClient(clients, response);
  const created = !client;
  if (!client) {
    client = await addClient({ firstName: response.firstName, lastName: response.lastName, phone: response.phone, email: response.email });
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

// Same case-insensitive name match DataContext's ensureVenueSaved uses to
// avoid creating duplicate venues — reused here so Apply recognizes "this is
// the same venue you already have on file," not just "don't duplicate it."
function matchVenueByName(venues, name) {
  const trimmed = (name || '').trim().toLowerCase();
  if (!trimmed) return null;
  return venues.find((v) => v.name?.trim().toLowerCase() === trimmed) || null;
}

function pick(...values) {
  for (const v of values) if (v) return v;
  return '';
}

// Resolves the venue object for a submitted response, preferring (in
// order): 1) whatever's already on the booking (never clobber data the
// agent deliberately entered — same policy as buildBookingMergePatch's
// other fields), 2) the matching saved Venue's fields, if the client's
// typed venue name matches one on file (that's the "verified" record —
// the client may only have bothered typing the name and skipped the rest,
// assuming the vendor already knows the venue), 3) whatever the client
// actually typed on the form. locationNote/loadInInfo aren't asked on the
// public form at all, so they only ever come from an existing/matched venue.
function resolveVenue(response, venues, existingVenue = {}) {
  const matched = matchVenueByName(venues, response.venueName);
  return {
    name: pick(existingVenue.name, matched?.name, response.venueName),
    address1: pick(existingVenue.address1, matched?.address1, response.address1),
    address2: pick(existingVenue.address2, matched?.address2, response.address2),
    city: pick(existingVenue.city, matched?.city, response.city),
    state: pick(existingVenue.state, matched?.state, response.state),
    zip: pick(existingVenue.zip, matched?.zip, response.zip),
    contactName: pick(existingVenue.contactName, matched?.contactName, response.venueContactName),
    contactEmail: pick(existingVenue.contactEmail, matched?.contactEmail, response.venueContactEmail),
    locationNote: pick(existingVenue.locationNote, matched?.locationNote),
    loadInInfo: pick(existingVenue.loadInInfo, matched?.loadInInfo),
  };
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

// The inquiry form only collects Bride's/Groom's Name for a wedding — every
// other event type collects a plain Event Name field instead (see
// InquiryFormPage's isWedding), which is used directly here. Falls back to
// the bride/groom mash-up when eventName wasn't collected (the wedding
// path), and gracefully handles older responses submitted before this field
// existed (neither present — generateEventName degrades to just eventType,
// or '' if that's blank too).
export function resolveEventName(response) {
  if (response.eventName?.trim()) return response.eventName.trim();
  return generateEventName(response);
}

// Turns a submitted InquiryLink.response into a real Client + Booking via
// the normal authenticated addClient/addBooking flow (never writes directly
// server-side — see InquiryLink's model comment in schema.prisma for why).
// Builds a full booking/venue shape (not just the inquiry-sourced fields) —
// addBooking does a flat spread with no deep-defaulting, so a partial venue
// object here would leave fields like city/state undefined instead of ''.
export async function applyInquiryResponse(response, { clients, venues, addClient, addBooking }) {
  const r = response;
  const { clientId, client } = await resolveClientForMerge(r, { clients, addClient, currentClientId: null });

  const booking = await addBooking({
    ...emptyForm(),
    eventName: resolveEventName(r),
    clientId,
    eventDate: r.eventDate,
    eventType: r.eventType,
    brideName: r.brideName,
    groomName: r.groomName,
    notes: mergeNotesWithDetails('', r.details),
    venue: {
      ...emptyVenue(),
      ...resolveVenue(r, venues || []),
    },
    // emptyForm()'s '' default is only safe for a controlled input's initial
    // render — BookingFormPage's own save handler coerces it to null before
    // ever sending to the server (the column is Float?, and Prisma rejects
    // an empty string for it outright). This path calls addBooking directly
    // and skips that coercion, so it has to redo it here — the inquiry form
    // never collects a deposit amount anyway, so null is always correct.
    depositAmount: null,
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
export function buildBookingMergePatch(response, currentBooking, venues = []) {
  const r = response;
  const venue = currentBooking.venue || {};
  const pickField = (next, prev) => (next ? next : prev);
  return {
    eventDate: pickField(r.eventDate, currentBooking.eventDate),
    eventType: pickField(r.eventType, currentBooking.eventType),
    brideName: pickField(r.brideName, currentBooking.brideName),
    groomName: pickField(r.groomName, currentBooking.groomName),
    eventName: currentBooking.eventName || resolveEventName(r),
    notes: mergeNotesWithDetails(currentBooking.notes, r.details),
    venue: {
      ...venue,
      ...resolveVenue(r, venues, venue),
    },
  };
}
