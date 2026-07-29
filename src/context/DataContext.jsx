import { createContext, useCallback, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { uid } from '../lib/storage';
import { getTierPrice } from '../lib/pricingTiers';
import { statusBucket } from '../lib/inquiryStatusBucket';

const DataContext = createContext(null);

const LIST_FIELDS = {
  contractors: 'contractors',
  clients: 'clients',
  venues: 'venues',
  events: 'events',
  bookings: 'bookings',
  contractorTypes: 'contractorTypes',
  eventTypes: 'eventTypes',
  eventStatuses: 'eventStatuses',
  inquiryStatuses: 'inquiryStatuses',
  bookingStatuses: 'bookingStatuses',
  emailTemplates: 'emailTemplates',
  offerings: 'offerings',
  proposalTemplates: 'proposalTemplates',
  contractTemplates: 'contractTemplates',
};

export function DataProvider({ children }) {
  const { currentUser, updateCurrentUser } = useAuth();

  const patchList = useCallback((field, nextList) => {
    updateCurrentUser({ [field]: nextList });
  }, [updateCurrentUser]);

  // System-generated create/edit/delete trail for Bookings and Events
  // (record.history) — who did what, when. Separate from Booking's own
  // free-text "Activity Log" notes field, an older, unrelated feature.
  const historyEntry = useCallback((type) => ({
    id: uid('hist'),
    at: new Date().toISOString(),
    type,
    actorEmail: currentUser?.email || null,
    actorName: currentUser ? ([currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ') || currentUser.email) : null,
  }), [currentUser]);

  // ---- Contractors ----
  const addContractor = useCallback((contractor) => {
    if (!currentUser) return;
    const record = { id: uid('con'), createdAt: new Date().toISOString(), ...contractor };
    patchList(LIST_FIELDS.contractors, [...currentUser.contractors, record]);
    return record;
  }, [currentUser, patchList]);

  const updateContractor = useCallback((id, patch) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.contractors, currentUser.contractors.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, [currentUser, patchList]);

  const deleteContractor = useCallback((id) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.contractors, currentUser.contractors.filter((c) => c.id !== id));
    // Also remove this contractor from any event bookings so events don't
    // reference a contractor that no longer exists.
    patchList(LIST_FIELDS.events, currentUser.events.map((e) => ({
      ...e,
      contractorBookings: e.contractorBookings.filter((b) => b.contractorId !== id),
    })));
  }, [currentUser, patchList]);

  // ---- Clients ----
  const addClient = useCallback((client) => {
    if (!currentUser) return;
    const record = { id: uid('cli'), createdAt: new Date().toISOString(), ...client };
    patchList(LIST_FIELDS.clients, [...(currentUser.clients || []), record]);
    return record;
  }, [currentUser, patchList]);

  const updateClient = useCallback((id, patch) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.clients, (currentUser.clients || []).map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, [currentUser, patchList]);

  const deleteClient = useCallback((id) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.clients, (currentUser.clients || []).filter((c) => c.id !== id));
    // Unlink this client from any events/bookings that referenced it.
    patchList(LIST_FIELDS.events, currentUser.events.map((e) => (
      e.clientId === id ? { ...e, clientId: null } : e
    )));
    patchList(LIST_FIELDS.bookings, (currentUser.bookings || []).map((b) => (
      b.clientId === id ? { ...b, clientId: null } : b
    )));
  }, [currentUser, patchList]);

  // ---- Venues ----
  // Deliberately denormalized — Booking/Event each keep their own copied
  // venue object (see BookingFormPage's emptyVenue), not a live venueId
  // reference. This list is just a reusable "address book" the venue
  // picker (VenueCombobox) reads from and ensureVenueSaved below writes
  // to; editing or deleting a saved venue here never touches past
  // bookings/events, since they hold their own frozen copy.
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

  // ---- Bookings ----
  const addBooking = useCallback((booking) => {
    if (!currentUser) return;
    const record = { id: uid('bkg'), createdAt: new Date().toISOString(), convertedEventId: null, activityLog: [], deletedAt: null, ...booking, history: [historyEntry('created')] };
    patchList(LIST_FIELDS.bookings, [...(currentUser.bookings || []), record]);
    if (record.venue) ensureVenueSaved(record.venue);
    return record;
  }, [currentUser, patchList, historyEntry, ensureVenueSaved]);

  const updateBooking = useCallback((id, patch) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.bookings, (currentUser.bookings || []).map((b) => (
      b.id === id ? { ...b, ...patch, history: [...(b.history || []), historyEntry('edited')] } : b
    )));
    if (patch.venue) ensureVenueSaved(patch.venue);
  }, [currentUser, patchList, historyEntry, ensureVenueSaved]);

  // Soft delete — hides the booking from normal views (see `bookings` below)
  // but keeps the record, and its history, around so "who deleted this and
  // when" stays answerable.
  const deleteBooking = useCallback((id) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.bookings, (currentUser.bookings || []).map((b) => (
      b.id === id ? { ...b, deletedAt: new Date().toISOString(), history: [...(b.history || []), historyEntry('deleted')] } : b
    )));
  }, [currentUser, patchList, historyEntry]);

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

  // ---- Events ----
  const addEvent = useCallback((event) => {
    if (!currentUser) return;
    const record = { id: uid('evt'), createdAt: new Date().toISOString(), contractorBookings: [], deletedAt: null, ...event, history: [historyEntry('created')] };
    patchList(LIST_FIELDS.events, [...currentUser.events, record]);
    if (record.venue) ensureVenueSaved(record.venue);
    return record;
  }, [currentUser, patchList, historyEntry, ensureVenueSaved]);

  const updateEvent = useCallback((id, patch) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.events, currentUser.events.map((e) => (
      e.id === id ? { ...e, ...patch, history: [...(e.history || []), historyEntry('edited')] } : e
    )));
    if (patch.venue) ensureVenueSaved(patch.venue);
  }, [currentUser, patchList, historyEntry, ensureVenueSaved]);

  // Soft delete — same reasoning as deleteBooking above.
  const deleteEvent = useCallback((id) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.events, currentUser.events.map((e) => (
      e.id === id ? { ...e, deletedAt: new Date().toISOString(), history: [...(e.history || []), historyEntry('deleted')] } : e
    )));
  }, [currentUser, patchList, historyEntry]);

  // Spins up the linked Event once a booking is ready to move into staffing —
  // carries over client/date/type and records the link back on the booking.
  const convertBookingToEvent = useCallback((bookingId) => {
    if (!currentUser) return;
    const booking = (currentUser.bookings || []).find((b) => b.id === bookingId);
    if (!booking || booking.convertedEventId) return;
    const client = (currentUser.clients || []).find((c) => c.id === booking.clientId);
    const name = booking.eventName || [client ? `${client.firstName} ${client.lastName}` : '', booking.eventType]
      .filter(Boolean).join(' ') || 'New Event';
    const event = addEvent({
      name,
      eventType: booking.eventType || '',
      eventDate: booking.eventDate || '',
      clientId: booking.clientId || '',
      brideName: booking.brideName || '',
      groomName: booking.groomName || '',
      // Full shape (not just whatever keys the booking happens to have) —
      // EventFormPage reads form.venue.<field> directly, so a partial object
      // here would leave some fields undefined instead of controlled empty strings.
      venue: {
        name: '', address1: '', address2: '', city: '', state: '', zip: '', locationNote: '', loadInInfo: '',
        contactName: '', contactEmail: '',
        ...booking.venue,
      },
      schedule: booking.schedule || [],
    });
    const convertedStatus = (currentUser.bookingStatuses || []).find((s) => s.label.toLowerCase() === 'converted');
    updateBooking(bookingId, {
      convertedEventId: event.id,
      ...(convertedStatus ? { bookingStatus: convertedStatus.id } : {}),
    });
    return event;
  }, [currentUser, addEvent, updateBooking]);

  // ---- Derived helpers ----
  const getContractorById = useCallback((id) => currentUser?.contractors.find((c) => c.id === id), [currentUser]);

  const computeDurationHours = useCallback((startTime, endTime) => {
    if (!startTime || !endTime) return null;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let minutes = (eh * 60 + em) - (sh * 60 + sm);
    if (minutes < 0) minutes += 24 * 60; // crosses midnight
    return minutes / 60;
  }, []);

  // Not Avail contractors don't count toward cost — they're not actually
  // being booked/paid, so their rate shouldn't inflate the event total.
  const computeEventTotalCost = useCallback((event) => {
    return event.contractorBookings.reduce((sum, b) => {
      const status = currentUser?.inquiryStatuses?.find((s) => s.id === b.inquiryStatusId);
      if (statusBucket(status) === 'unavailable') return sum;
      const contractor = getContractorById(b.contractorId);
      return sum + (contractor ? getTierPrice(contractor, b.pricingTierId) : 0);
    }, 0);
  }, [getContractorById, currentUser]);

  const computeClientEventCounts = useCallback((clientId) => {
    const clientEvents = (currentUser?.events || []).filter((e) => e.clientId === clientId);
    const counts = { pending: 0, confirmed: 0, declined: 0 };
    for (const e of clientEvents) {
      const status = currentUser?.eventStatuses.find((s) => s.id === e.eventStatus);
      const label = (status?.label || '').toLowerCase();
      if (label === 'cancelled' || label === 'declined') counts.declined++;
      else if (label === 'confirmed' || label === 'completed') counts.confirmed++;
      else counts.pending++;
    }
    return counts;
  }, [currentUser]);

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
    contractors: currentUser?.contractors || [],
    clients: currentUser?.clients || [],
    venues: currentUser?.venues || [],
    events: (currentUser?.events || []).filter((e) => !e.deletedAt),
    bookings: (currentUser?.bookings || []).filter((b) => !b.deletedAt),
    contractorTypes: currentUser?.contractorTypes || [],
    eventTypes: currentUser?.eventTypes || [],
    eventStatuses: currentUser?.eventStatuses || [],
    inquiryStatuses: currentUser?.inquiryStatuses || [],
    bookingStatuses: currentUser?.bookingStatuses || [],
    emailTemplates: currentUser?.emailTemplates || [],
    offerings: currentUser?.offerings || [],
    proposalTemplates: currentUser?.proposalTemplates || [],
    contractTemplates: currentUser?.contractTemplates || [],
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
    addEvent,
    updateEvent,
    deleteEvent,
    getContractorById,
    computeDurationHours,
    computeEventTotalCost,
    computeVendorStatus,
  }), [
    currentUser,
    addContractor, updateContractor, deleteContractor,
    addClient, updateClient, deleteClient, computeClientEventCounts,
    addVenue, updateVenue, deleteVenue,
    addBooking, updateBooking, deleteBooking, convertBookingToEvent,
    addBookingStatus, updateBookingStatus, removeBookingStatus,
    addContractorType, removeContractorType,
    addEventType, removeEventType,
    addEventStatus, updateEventStatus, removeEventStatus,
    addInquiryStatus, updateInquiryStatus, removeInquiryStatus,
    addEmailTemplate, updateEmailTemplate, removeEmailTemplate,
    addProposalTemplate, updateProposalTemplate, removeProposalTemplate,
    addContractTemplate, updateContractTemplate, removeContractTemplate,
    addOffering, updateOffering, deleteOffering,
    addEvent, updateEvent, deleteEvent,
    getContractorById, computeDurationHours, computeEventTotalCost, computeVendorStatus,
  ]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
