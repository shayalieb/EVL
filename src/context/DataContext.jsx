import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { uid } from '../lib/storage';
import { getBookingTotal, computeDurationHours as computeDurationHoursUtil } from '../lib/pricingTiers';
import { statusBucket } from '../lib/inquiryStatusBucket';
import { formatEventDate, formatCurrency } from '../lib/format';
import { listContractors, createContractor as createContractorApi, updateContractorApi, deleteContractorApi } from '../lib/contractors';
import { listClients, createClient as createClientApi, updateClientApi, deleteClientApi } from '../lib/clients';
import { listBookings, getBooking, createBooking as createBookingApi, updateBookingApi } from '../lib/bookings';
import { listEvents, createEvent as createEventApi, updateEventApi } from '../lib/events';

function statusLabel(statuses, id) {
  return statuses?.find((s) => s.id === id)?.label || id || '(none)';
}

function contractorName(contractors, id) {
  const c = contractors?.find((c) => c.id === id);
  if (!c) return id;
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || id;
}

// Curated set of fields worth an explicit "what changed" history entry —
// deliberately NOT every field on Event/Booking, since logging every
// keystroke-level edit (notes text, minor toggles, etc.) would bury the
// changes someone actually wants to audit. See HistoryModal.jsx.
function diffEventFields(before, after, eventStatuses) {
  const changes = [];
  if ((before.name || '') !== (after.name || '')) {
    changes.push({ label: 'Name', from: before.name || '(none)', to: after.name || '(none)' });
  }
  if ((before.eventDate || '') !== (after.eventDate || '')) {
    changes.push({ label: 'Date', from: before.eventDate ? formatEventDate(before.eventDate) : '(none)', to: after.eventDate ? formatEventDate(after.eventDate) : '(none)' });
  }
  const beforeVenue = before.venue?.name || '';
  const afterVenue = after.venue?.name || '';
  if (beforeVenue !== afterVenue) {
    changes.push({ label: 'Venue', from: beforeVenue || '(none)', to: afterVenue || '(none)' });
  }
  if ((before.eventStatus || '') !== (after.eventStatus || '')) {
    changes.push({ label: 'Status', from: statusLabel(eventStatuses, before.eventStatus), to: statusLabel(eventStatuses, after.eventStatus) });
  }
  return changes;
}

// Contractor assignment (event.contractorBookings) is tracked as an
// add/remove event per contractor rather than a "from/to" pair — unlike the
// scalar fields above, it's a list, so "changed" means membership changed,
// not that a single value replaced another.
function diffContractorAssignments(before, after, contractors) {
  const beforeIds = new Set((before.contractorBookings || []).map((b) => b.contractorId));
  const afterIds = new Set((after.contractorBookings || []).map((b) => b.contractorId));
  const changes = [];
  for (const id of afterIds) {
    if (!beforeIds.has(id)) changes.push({ label: 'Contractor added', to: contractorName(contractors, id) });
  }
  for (const id of beforeIds) {
    if (!afterIds.has(id)) changes.push({ label: 'Contractor removed', to: contractorName(contractors, id) });
  }
  return changes;
}

function diffBookingFields(before, after, bookingStatuses) {
  const changes = [];
  if ((before.bookingStatus || '') !== (after.bookingStatus || '')) {
    changes.push({ label: 'Status', from: statusLabel(bookingStatuses, before.bookingStatus), to: statusLabel(bookingStatuses, after.bookingStatus) });
  }
  const beforeDeposit = Number(before.depositAmount) || 0;
  const afterDeposit = Number(after.depositAmount) || 0;
  if (beforeDeposit !== afterDeposit) {
    changes.push({ label: 'Deposit', from: formatCurrency(beforeDeposit), to: formatCurrency(afterDeposit) });
  }
  return changes;
}

const DataContext = createContext(null);

const LIST_FIELDS = {
  venues: 'venues',
  contractorTypes: 'contractorTypes',
  eventTypes: 'eventTypes',
  eventStatuses: 'eventStatuses',
  inquiryStatuses: 'inquiryStatuses',
  bookingStatuses: 'bookingStatuses',
  emailTemplates: 'emailTemplates',
  offerings: 'offerings',
  proposalTemplates: 'proposalTemplates',
  contractTemplates: 'contractTemplates',
  setListLibrary: 'setListLibrary',
};

export function DataProvider({ children }) {
  const { currentUser, updateCurrentUser } = useAuth();

  const patchList = useCallback((field, nextList) => {
    updateCurrentUser({ [field]: nextList });
  }, [updateCurrentUser]);

  // Contractors are real DB rows (see server/prisma/schema.prisma's
  // Contractor model comment for why — blob-size, not a public-route
  // requirement like Guest), fetched once per account rather than living in
  // the AccountData blob like everything else here. Blocks rendering
  // `children` until loaded, same as AuthProvider's own authLoading gate,
  // so every other page can keep assuming `contractors` is synchronously
  // populated exactly like before this migration.
  const [contractors, setContractors] = useState([]);
  const [contractorsLoaded, setContractorsLoaded] = useState(false);
  useEffect(() => {
    if (!currentUser) { setContractors([]); setContractorsLoaded(false); return; }
    let cancelled = false;
    listContractors()
      .then((list) => { if (!cancelled) setContractors(list); })
      .finally(() => { if (!cancelled) setContractorsLoaded(true); });
    return () => { cancelled = true; };
    // Deliberately keyed on accountId, not the whole currentUser object —
    // currentUser gets a new reference on every single blob autosave
    // elsewhere in the app, which would otherwise refetch on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.accountId]);

  // Same real-table-not-blob treatment as contractors above — see
  // server/prisma/schema.prisma's Client model comment.
  const [clients, setClients] = useState([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  useEffect(() => {
    if (!currentUser) { setClients([]); setClientsLoaded(false); return; }
    let cancelled = false;
    listClients()
      .then((list) => { if (!cancelled) setClients(list); })
      .finally(() => { if (!cancelled) setClientsLoaded(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.accountId]);

  // Same real-table-not-blob treatment as contractors/clients above — see
  // server/prisma/schema.prisma's Booking/Event model comments. Bookings and
  // Events are the two most actively-edited record types in the app
  // (autosave, proposals, contracts, invoices, RSVP, stage plots, floor
  // plans, set lists all hang off them), so this is the biggest
  // write-amplification win of the graduation-out-of-the-blob series.
  const [bookings, setBookings] = useState([]);
  const [bookingsLoaded, setBookingsLoaded] = useState(false);
  useEffect(() => {
    if (!currentUser) { setBookings([]); setBookingsLoaded(false); return; }
    let cancelled = false;
    listBookings()
      .then((list) => { if (!cancelled) setBookings(list); })
      .finally(() => { if (!cancelled) setBookingsLoaded(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.accountId]);

  const [events, setEvents] = useState([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  useEffect(() => {
    if (!currentUser) { setEvents([]); setEventsLoaded(false); return; }
    let cancelled = false;
    listEvents()
      .then((list) => { if (!cancelled) setEvents(list); })
      .finally(() => { if (!cancelled) setEventsLoaded(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.accountId]);

  // System-generated create/edit/delete trail for Bookings and Events
  // (record.history) — who did what, when. Separate from Booking's own
  // free-text "Activity Log" notes field, an older, unrelated feature.
  const historyEntry = useCallback((type, changes) => ({
    id: uid('hist'),
    at: new Date().toISOString(),
    type,
    actorEmail: currentUser?.email || null,
    actorName: currentUser ? ([currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ') || currentUser.email) : null,
    ...(changes?.length ? { changes } : {}),
  }), [currentUser]);

  // ---- Venues ----
  // Deliberately denormalized — Booking/Event each keep their own copied
  // venue object (see BookingFormPage's emptyVenue), not a live venueId
  // reference. This list is just a reusable "address book" the venue
  // picker (VenueCombobox) reads from and ensureVenueSaved below writes
  // to; editing or deleting a saved venue here never touches past
  // bookings/events, since they hold their own frozen copy. Defined ahead
  // of Contractors/Clients/Bookings/Events below — their delete handlers
  // reference updateBooking/updateEvent, so those (and everything they in
  // turn depend on, like ensureVenueSaved) have to exist first: a
  // useCallback dependency array is a plain array literal evaluated
  // immediately at render time, so referencing a later `const` before its
  // declaration throws (temporal dead zone), not just a stale-closure risk.
  const addVenue = useCallback((venue) => {
    if (!currentUser) return;
    const record = { id: uid('ven'), createdAt: new Date().toISOString(), ...venue };
    patchList(LIST_FIELDS.venues, [...(currentUser.venues || []), record]);
    return record;
  }, [currentUser, patchList]);

  const updateVenue = useCallback((id, patch) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.venues, (currentUser.venues || []).map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }, [currentUser, patchList]);

  const deleteVenue = useCallback((id) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.venues, (currentUser.venues || []).filter((v) => v.id !== id));
  }, [currentUser, patchList]);

  // Auto-save-on-input for venues: called from addBooking/updateBooking/
  // addEvent/updateEvent below with whatever venue object was just saved.
  // If its name doesn't case-insensitively match an already-saved venue,
  // it's appended to the venues list so it shows up in the picker next
  // time — matching venues are left untouched (never silently overwritten
  // by a booking's possibly-edited copy; the Venues page is the deliberate
  // place to edit a saved venue's own details).
  const ensureVenueSaved = useCallback((venue) => {
    if (!currentUser || !venue?.name?.trim()) return;
    const name = venue.name.trim();
    const exists = (currentUser.venues || []).some((v) => v.name?.trim().toLowerCase() === name.toLowerCase());
    if (exists) return;
    const record = { id: uid('ven'), createdAt: new Date().toISOString(), ...venue, name };
    patchList(LIST_FIELDS.venues, [...(currentUser.venues || []), record]);
  }, [currentUser, patchList]);

  // ---- Bookings (real API, not the blob — see the fetch effect above) ----
  // The id must already be set on `booking` — every caller generates one
  // up front (BookingFormPage's emptyForm(), same reasoning as the id-
  // preservation comment on the Booking model: it also has to be known
  // before the first save so document uploads on an unsaved booking have
  // somewhere to attach, and so Save-without-closing can swap the URL into
  // edit mode in place).
  const addBooking = useCallback(async (booking) => {
    if (!booking.id) throw new Error('addBooking requires booking.id to already be set.');
    const patch = { convertedEventId: null, activityLog: [], deletedAt: null, ...booking };
    patch.history = [historyEntry('created', diffBookingFields({}, patch, currentUser?.bookingStatuses))];
    const record = await createBookingApi(patch);
    setBookings((prev) => [...prev, record]);
    if (record.venue) ensureVenueSaved(record.venue);
    return record;
  }, [currentUser, historyEntry, ensureVenueSaved]);

  const updateBooking = useCallback(async (id, patch) => {
    const existing = bookings.find((b) => b.id === id);
    if (!existing) return;
    const next = { ...existing, ...patch };
    const changes = diffBookingFields(existing, next, currentUser?.bookingStatuses);
    const merged = changes.length ? { ...patch, history: [...(existing.history || []), historyEntry('edited', changes)] } : patch;
    const record = await updateBookingApi(id, merged);
    setBookings((prev) => prev.map((b) => (b.id === id ? record : b)));
    if (patch.venue) ensureVenueSaved(patch.venue);
    return record;
  }, [bookings, currentUser, historyEntry, ensureVenueSaved]);

  // Soft delete — hides the booking from normal views (filtered server-side
  // by GET /api/bookings) but keeps the record, and its history, around so
  // "who deleted this and when" stays answerable.
  const deleteBooking = useCallback(async (id) => {
    const existing = bookings.find((b) => b.id === id);
    if (!existing) return;
    const record = await updateBookingApi(id, {
      deletedAt: new Date().toISOString(),
      history: [...(existing.history || []), historyEntry('deleted')],
    });
    setBookings((prev) => prev.filter((b) => b.id !== id));
    return record;
  }, [bookings, historyEntry]);

  // Distinct from deleteBooking above — a completed booking stays fully
  // intact and visible (just filtered into BookingsPage's Completed tab
  // instead of the active list), not soft-deleted/purged. See
  // BookingsPage.jsx's Mark Complete action for the "this booking has a
  // linked event too" prompt that decides whether to also call
  // completeEvent alongside this.
  const completeBooking = useCallback(async (id) => {
    const existing = bookings.find((b) => b.id === id);
    if (!existing) return;
    const record = await updateBookingApi(id, {
      completedAt: new Date().toISOString(),
      history: [...(existing.history || []), historyEntry('completed')],
    });
    setBookings((prev) => prev.map((b) => (b.id === id ? record : b)));
    return record;
  }, [bookings, historyEntry]);

  const restoreBooking = useCallback(async (id) => {
    const existing = bookings.find((b) => b.id === id);
    if (!existing) return;
    const record = await updateBookingApi(id, {
      completedAt: null,
      history: [...(existing.history || []), historyEntry('restored')],
    });
    setBookings((prev) => prev.map((b) => (b.id === id ? record : b)));
    return record;
  }, [bookings, historyEntry]);

  // ---- Events (real API, not the blob — see the fetch effect above) ----
  // Same id-must-already-be-set contract as addBooking above.
  const addEvent = useCallback(async (event) => {
    if (!event.id) throw new Error('addEvent requires event.id to already be set.');
    const patch = { contractorBookings: [], deletedAt: null, ...event };
    patch.history = [historyEntry('created', diffEventFields({}, patch, currentUser?.eventStatuses))];
    const record = await createEventApi(patch);
    setEvents((prev) => [...prev, record]);
    if (record.venue) ensureVenueSaved(record.venue);
    return record;
  }, [currentUser, historyEntry, ensureVenueSaved]);

  const updateEvent = useCallback(async (id, patch) => {
    const existing = events.find((e) => e.id === id);
    if (!existing) return;
    const next = { ...existing, ...patch };
    const changes = [
      ...diffEventFields(existing, next, currentUser?.eventStatuses),
      ...diffContractorAssignments(existing, next, contractors),
    ];
    const merged = changes.length ? { ...patch, history: [...(existing.history || []), historyEntry('edited', changes)] } : patch;
    const record = await updateEventApi(id, merged);
    setEvents((prev) => prev.map((e) => (e.id === id ? record : e)));
    if (patch.venue) ensureVenueSaved(patch.venue);
    return record;
  }, [events, currentUser, historyEntry, ensureVenueSaved, contractors]);

  // Soft delete — same reasoning as deleteBooking above.
  const deleteEvent = useCallback(async (id) => {
    const existing = events.find((e) => e.id === id);
    if (!existing) return;
    const record = await updateEventApi(id, {
      deletedAt: new Date().toISOString(),
      history: [...(existing.history || []), historyEntry('deleted')],
    });
    setEvents((prev) => prev.filter((e) => e.id !== id));
    return record;
  }, [events, historyEntry]);

  // Same "stays intact, just moves tabs" reasoning as completeBooking below.
  const completeEvent = useCallback(async (id) => {
    const existing = events.find((e) => e.id === id);
    if (!existing) return;
    const record = await updateEventApi(id, {
      completedAt: new Date().toISOString(),
      history: [...(existing.history || []), historyEntry('completed')],
    });
    setEvents((prev) => prev.map((e) => (e.id === id ? record : e)));
    return record;
  }, [events, historyEntry]);

  const restoreEvent = useCallback(async (id) => {
    const existing = events.find((e) => e.id === id);
    if (!existing) return;
    const record = await updateEventApi(id, {
      completedAt: null,
      history: [...(existing.history || []), historyEntry('restored')],
    });
    setEvents((prev) => prev.map((e) => (e.id === id ? record : e)));
    return record;
  }, [events, historyEntry]);

  // Spins up the linked Event once a booking is ready to move into staffing —
  // carries over client/date/type and records the link back on the booking.
  // Pre-generates the event id and only links it onto the booking once the
  // event create actually succeeds, so a failure never leaves a booking
  // pointing at an event that doesn't exist.
  const convertBookingToEvent = useCallback(async (bookingId) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking || booking.convertedEventId) return;
    const client = clients.find((c) => c.id === booking.clientId);
    const name = booking.eventName || [client ? `${client.firstName} ${client.lastName}` : '', booking.eventType]
      .filter(Boolean).join(' ') || 'New Event';
    // `booking` here is the list-lite record (no schedule field, see
    // server/src/routes/bookings.js) — fetch the full record so a booking's
    // schedule actually carries over to the event it converts into.
    const fullBooking = await getBooking(bookingId);
    const event = await addEvent({
      id: uid('evt'),
      name,
      eventType: booking.eventType || '',
      eventDate: booking.eventDate || '',
      clientId: booking.clientId || '',
      brideName: booking.brideName || '',
      groomName: booking.groomName || '',
      guestCount: booking.guestCount ?? '',
      // Full shape (not just whatever keys the booking happens to have) —
      // EventFormPage reads form.venue.<field> directly, so a partial object
      // here would leave some fields undefined instead of controlled empty strings.
      venue: {
        name: '', address1: '', address2: '', city: '', state: '', zip: '', locationNote: '', loadInInfo: '',
        contactName: '', contactEmail: '',
        ...booking.venue,
      },
      schedule: fullBooking.schedule || [],
    });
    const convertedStatus = (currentUser?.bookingStatuses || []).find((s) => s.label.toLowerCase() === 'converted');
    await updateBooking(bookingId, {
      convertedEventId: event.id,
      ...(convertedStatus ? { bookingStatus: convertedStatus.id } : {}),
    });
    return event;
  }, [bookings, currentUser, addEvent, updateBooking, clients]);

  // ---- Contractors (real API, not the blob — see the fetch effect above) ----
  // Callers don't await these (matching the fire-and-forget feel of every
  // other add/update/delete here) — the UI updates once the request
  // resolves via setContractors, same eventual-consistency shape as the
  // blob's own optimistic saves.
  const addContractor = useCallback(async (contractor) => {
    const record = await createContractorApi({ id: uid('con'), ...contractor });
    setContractors((prev) => [...prev, record]);
    return record;
  }, []);

  const updateContractor = useCallback(async (id, patch) => {
    const record = await updateContractorApi(id, patch);
    setContractors((prev) => prev.map((c) => (c.id === id ? record : c)));
    return record;
  }, []);

  const deleteContractor = useCallback(async (id) => {
    await deleteContractorApi(id);
    setContractors((prev) => prev.filter((c) => c.id !== id));
    // Also remove this contractor from any events' contractorBookings so
    // they don't reference a contractor that no longer exists — events are
    // real table rows now too, so this is a per-record update call rather
    // than a single blob patch. allSettled (not all) so one failed unlink
    // doesn't abort the rest, matching this codebase's existing tolerance
    // for bulk best-effort ops (see AuthContext's migrate*OutOfBlob).
    const affected = events.filter((e) => e.contractorBookings?.some((b) => b.contractorId === id));
    await Promise.allSettled(affected.map((e) => (
      updateEvent(e.id, { contractorBookings: e.contractorBookings.filter((b) => b.contractorId !== id) })
    )));
  }, [events, updateEvent]);

  // ---- Clients (real API, not the blob — see the fetch effect above) ----
  // addClient's return value is actually awaited by callers (unlike most
  // add* here) — BookingFormPage auto-selects a just-created client by its
  // real id, so this has to resolve to the real record, not fire-and-forget.
  const addClient = useCallback(async (client) => {
    const record = await createClientApi({ id: uid('cli'), ...client });
    setClients((prev) => [...prev, record]);
    return record;
  }, []);

  const updateClient = useCallback(async (id, patch) => {
    const record = await updateClientApi(id, patch);
    setClients((prev) => prev.map((c) => (c.id === id ? record : c)));
    return record;
  }, []);

  const deleteClient = useCallback(async (id) => {
    await deleteClientApi(id);
    setClients((prev) => prev.filter((c) => c.id !== id));
    // Unlink this client from any events/bookings that referenced it — both
    // are real table rows now, so per-record update calls rather than a
    // single blob patch. allSettled so one failed unlink doesn't abort the
    // rest (same reasoning as deleteContractor above).
    const affectedEvents = events.filter((e) => e.clientId === id);
    const affectedBookings = bookings.filter((b) => b.clientId === id);
    await Promise.allSettled([
      ...affectedEvents.map((e) => updateEvent(e.id, { clientId: null })),
      ...affectedBookings.map((b) => updateBooking(b.id, { clientId: null })),
    ]);
  }, [events, bookings, updateEvent, updateBooking]);

  // ---- Booking statuses (color-coded + isBooked flag) ----
  const addBookingStatus = useCallback((status) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.bookingStatuses, [...(currentUser.bookingStatuses || []), { id: uid('bstatus'), ...status }]);
  }, [currentUser, patchList]);

  const updateBookingStatus = useCallback((id, patch) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.bookingStatuses, (currentUser.bookingStatuses || []).map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, [currentUser, patchList]);

  const removeBookingStatus = useCallback((id) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.bookingStatuses, (currentUser.bookingStatuses || []).filter((s) => s.id !== id));
  }, [currentUser, patchList]);

  // ---- Custom field lists (simple string lists) ----
  const addContractorType = useCallback((label) => {
    if (!currentUser || !label.trim()) return;
    if (currentUser.contractorTypes.includes(label.trim())) return;
    patchList(LIST_FIELDS.contractorTypes, [...currentUser.contractorTypes, label.trim()]);
  }, [currentUser, patchList]);

  const removeContractorType = useCallback((label) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.contractorTypes, currentUser.contractorTypes.filter((t) => t !== label));
  }, [currentUser, patchList]);

  const addEventType = useCallback((label) => {
    if (!currentUser || !label.trim()) return;
    if (currentUser.eventTypes.includes(label.trim())) return;
    patchList(LIST_FIELDS.eventTypes, [...currentUser.eventTypes, label.trim()]);
  }, [currentUser, patchList]);

  const removeEventType = useCallback((label) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.eventTypes, currentUser.eventTypes.filter((t) => t !== label));
  }, [currentUser, patchList]);

  // ---- Event statuses (color-coded) ----
  const addEventStatus = useCallback((status) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.eventStatuses, [...currentUser.eventStatuses, { id: uid('estatus'), ...status }]);
  }, [currentUser, patchList]);

  const updateEventStatus = useCallback((id, patch) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.eventStatuses, currentUser.eventStatuses.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, [currentUser, patchList]);

  const removeEventStatus = useCallback((id) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.eventStatuses, currentUser.eventStatuses.filter((s) => s.id !== id));
  }, [currentUser, patchList]);

  // ---- Inquiry statuses (color-coded + isConfirmed flag) ----
  const addInquiryStatus = useCallback((status) => {
    if (!currentUser) return;
    const record = { id: uid('inq'), ...status };
    patchList(LIST_FIELDS.inquiryStatuses, [...currentUser.inquiryStatuses, record]);
    return record;
  }, [currentUser, patchList]);

  const updateInquiryStatus = useCallback((id, patch) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.inquiryStatuses, currentUser.inquiryStatuses.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, [currentUser, patchList]);

  const removeInquiryStatus = useCallback((id) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.inquiryStatuses, currentUser.inquiryStatuses.filter((s) => s.id !== id));
  }, [currentUser, patchList]);

  // ---- Email templates ----
  const addEmailTemplate = useCallback((template) => {
    if (!currentUser) return;
    const record = { id: uid('tmpl'), name: '', subject: '', body: '', ...template };
    patchList(LIST_FIELDS.emailTemplates, [...(currentUser.emailTemplates || []), record]);
    return record;
  }, [currentUser, patchList]);

  const updateEmailTemplate = useCallback((id, patch) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.emailTemplates, (currentUser.emailTemplates || []).map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, [currentUser, patchList]);

  const removeEmailTemplate = useCallback((id) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.emailTemplates, (currentUser.emailTemplates || []).filter((t) => t.id !== id));
  }, [currentUser, patchList]);

  // ---- Proposal templates ----
  // Named, reusable sets of custom sections a business can load into a new
  // proposal — replaces the old single silently-auto-cached
  // currentUser.proposalTemplate object, which stays untouched in the blob
  // (harmless dead data) rather than being migrated automatically here; see
  // settings/TemplatesTab.jsx for the one-time opt-in migration.
  const addProposalTemplate = useCallback((template) => {
    if (!currentUser) return;
    const record = { id: uid('ptmpl'), name: '', sections: [], ...template };
    patchList(LIST_FIELDS.proposalTemplates, [...(currentUser.proposalTemplates || []), record]);
    return record;
  }, [currentUser, patchList]);

  const updateProposalTemplate = useCallback((id, patch) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.proposalTemplates, (currentUser.proposalTemplates || []).map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, [currentUser, patchList]);

  const removeProposalTemplate = useCallback((id) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.proposalTemplates, (currentUser.proposalTemplates || []).filter((t) => t.id !== id));
  }, [currentUser, patchList]);

  // ---- Contract templates ----
  // Same idea as proposal templates above, plus a `title` field (what shows
  // on the contract document itself, distinct from `name` which is just the
  // template's label in this management list).
  const addContractTemplate = useCallback((template) => {
    if (!currentUser) return;
    const record = { id: uid('ctmpl'), name: '', title: '', sections: [], ...template };
    patchList(LIST_FIELDS.contractTemplates, [...(currentUser.contractTemplates || []), record]);
    return record;
  }, [currentUser, patchList]);

  const updateContractTemplate = useCallback((id, patch) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.contractTemplates, (currentUser.contractTemplates || []).map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, [currentUser, patchList]);

  const removeContractTemplate = useCallback((id) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.contractTemplates, (currentUser.contractTemplates || []).filter((t) => t.id !== id));
  }, [currentUser, patchList]);

  // ---- Offerings (reusable line items for proposals/contracts) ----
  const addOffering = useCallback((offering) => {
    if (!currentUser) return;
    const record = { id: uid('off'), createdAt: new Date().toISOString(), ...offering };
    patchList(LIST_FIELDS.offerings, [...(currentUser.offerings || []), record]);
    return record;
  }, [currentUser, patchList]);

  const updateOffering = useCallback((id, patch) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.offerings, (currentUser.offerings || []).map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, [currentUser, patchList]);

  const deleteOffering = useCallback((id) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.offerings, (currentUser.offerings || []).filter((o) => o.id !== id));
  }, [currentUser, patchList]);

  // ---- Set List Library (reusable set lists, band/orchestra only —
  // pulled into a specific event's own setLists via a deep clone, see
  // SetListsEditorPage.jsx, so editing the event's copy never touches
  // these saved originals) ----
  const addSetListLibraryItem = useCallback((setList) => {
    if (!currentUser) return;
    const record = { id: uid('setlistlib'), createdAt: new Date().toISOString(), ...setList };
    patchList(LIST_FIELDS.setListLibrary, [...(currentUser.setListLibrary || []), record]);
    return record;
  }, [currentUser, patchList]);

  const updateSetListLibraryItem = useCallback((id, patch) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.setListLibrary, (currentUser.setListLibrary || []).map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, [currentUser, patchList]);

  const deleteSetListLibraryItem = useCallback((id) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.setListLibrary, (currentUser.setListLibrary || []).filter((s) => s.id !== id));
  }, [currentUser, patchList]);

  // ---- Derived helpers ----
  const getContractorById = useCallback((id) => contractors.find((c) => c.id === id), [contractors]);

  // Moved to lib/pricingTiers.js so getOvertimeHours there can share it —
  // re-exported here unchanged so existing useData().computeDurationHours
  // callers (EventFormPage) don't need to change.
  const computeDurationHours = computeDurationHoursUtil;

  // Not Avail contractors don't count toward cost — they're not actually
  // being booked/paid, so their rate shouldn't inflate the event total.
  // getBookingTotal folds in overtime (auto-calculated from the booking's
  // own start/end time against the tier's included hours, or a manual
  // override) alongside the base tier price.
  const computeEventTotalCost = useCallback((event) => {
    return event.contractorBookings.reduce((sum, b) => {
      const status = currentUser?.inquiryStatuses?.find((s) => s.id === b.inquiryStatusId);
      if (statusBucket(status) === 'unavailable') return sum;
      const contractor = getContractorById(b.contractorId);
      return sum + (contractor ? getBookingTotal(b, contractor) : 0);
    }, 0);
  }, [getContractorById, currentUser]);

  const computeClientEventCounts = useCallback((clientId) => {
    const clientEvents = events.filter((e) => e.clientId === clientId);
    const counts = { pending: 0, confirmed: 0, declined: 0 };
    for (const e of clientEvents) {
      const status = currentUser?.eventStatuses.find((s) => s.id === e.eventStatus);
      const label = (status?.label || '').toLowerCase();
      if (label === 'cancelled' || label === 'declined') counts.declined++;
      else if (label === 'confirmed' || label === 'completed') counts.confirmed++;
      else counts.pending++;
    }
    return counts;
  }, [events, currentUser]);

  const computeVendorStatus = useCallback((event) => {
    if (!event.contractorBookings.length) return { status: 'none', pending: [], confirmed: [] };
    const pending = [];
    const confirmed = [];
    for (const b of event.contractorBookings) {
      const contractor = getContractorById(b.contractorId);
      const inqStatus = currentUser?.inquiryStatuses.find((s) => s.id === b.inquiryStatusId);
      const entry = { contractor, inqStatus };
      if (inqStatus?.isConfirmed) confirmed.push(entry);
      else pending.push(entry);
    }
    return { status: pending.length === 0 ? 'confirmed' : 'pending', pending, confirmed };
  }, [currentUser, getContractorById]);

  const value = useMemo(() => ({
    contractors,
    clients,
    venues: currentUser?.venues || [],
    // Already filtered server-side (GET /api/events, /api/bookings both
    // exclude deletedAt rows) — no client-side filter needed anymore.
    events,
    bookings,
    contractorTypes: currentUser?.contractorTypes || [],
    eventTypes: currentUser?.eventTypes || [],
    eventStatuses: currentUser?.eventStatuses || [],
    inquiryStatuses: currentUser?.inquiryStatuses || [],
    bookingStatuses: currentUser?.bookingStatuses || [],
    emailTemplates: currentUser?.emailTemplates || [],
    offerings: currentUser?.offerings || [],
    proposalTemplates: currentUser?.proposalTemplates || [],
    contractTemplates: currentUser?.contractTemplates || [],
    setListLibrary: currentUser?.setListLibrary || [],
    addContractor,
    updateContractor,
    deleteContractor,
    addClient,
    updateClient,
    deleteClient,
    computeClientEventCounts,
    addVenue,
    updateVenue,
    deleteVenue,
    addBooking,
    updateBooking,
    deleteBooking,
    completeBooking,
    restoreBooking,
    convertBookingToEvent,
    addBookingStatus,
    updateBookingStatus,
    removeBookingStatus,
    addContractorType,
    removeContractorType,
    addEventType,
    removeEventType,
    addEventStatus,
    updateEventStatus,
    removeEventStatus,
    addInquiryStatus,
    updateInquiryStatus,
    removeInquiryStatus,
    addEmailTemplate,
    updateEmailTemplate,
    removeEmailTemplate,
    addProposalTemplate,
    updateProposalTemplate,
    removeProposalTemplate,
    addContractTemplate,
    updateContractTemplate,
    removeContractTemplate,
    addOffering,
    updateOffering,
    deleteOffering,
    addSetListLibraryItem,
    updateSetListLibraryItem,
    deleteSetListLibraryItem,
    addEvent,
    updateEvent,
    deleteEvent,
    completeEvent,
    restoreEvent,
    getContractorById,
    computeDurationHours,
    computeEventTotalCost,
    computeVendorStatus,
  }), [
    currentUser, contractors, clients, bookings, events,
    addContractor, updateContractor, deleteContractor,
    addClient, updateClient, deleteClient, computeClientEventCounts,
    addVenue, updateVenue, deleteVenue,
    addBooking, updateBooking, deleteBooking, completeBooking, restoreBooking, convertBookingToEvent,
    addBookingStatus, updateBookingStatus, removeBookingStatus,
    addContractorType, removeContractorType,
    addEventType, removeEventType,
    addEventStatus, updateEventStatus, removeEventStatus,
    addInquiryStatus, updateInquiryStatus, removeInquiryStatus,
    addEmailTemplate, updateEmailTemplate, removeEmailTemplate,
    addProposalTemplate, updateProposalTemplate, removeProposalTemplate,
    addContractTemplate, updateContractTemplate, removeContractTemplate,
    addOffering, updateOffering, deleteOffering,
    addSetListLibraryItem, updateSetListLibraryItem, deleteSetListLibraryItem,
    addEvent, updateEvent, deleteEvent, completeEvent, restoreEvent,
    getContractorById, computeDurationHours, computeEventTotalCost, computeVendorStatus,
  ]);

  // Same blank-while-loading behavior as AuthProvider's own authLoading gate
  // — every page here already assumes `contractors`/`clients`/`bookings`/
  // `events` are synchronously populated (.find(...) inline in render
  // bodies, no loading states of their own), so this keeps that assumption
  // true rather than pushing a loading state into every consuming file.
  if (currentUser && (!contractorsLoaded || !clientsLoaded || !bookingsLoaded || !eventsLoaded)) return null;

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
