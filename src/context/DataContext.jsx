import { createContext, useCallback, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { uid } from '../lib/storage';

const DataContext = createContext(null);

const LIST_FIELDS = {
  contractors: 'contractors',
  events: 'events',
  contractorTypes: 'contractorTypes',
  eventTypes: 'eventTypes',
  eventStatuses: 'eventStatuses',
  inquiryStatuses: 'inquiryStatuses',
  emailTemplates: 'emailTemplates',
};

export function DataProvider({ children }) {
  const { currentUser, updateCurrentUser } = useAuth();

  const patchList = useCallback((field, nextList) => {
    updateCurrentUser({ [field]: nextList });
  }, [updateCurrentUser]);

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
    patchList(LIST_FIELDS.inquiryStatuses, [...currentUser.inquiryStatuses, { id: uid('inq'), ...status }]);
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

  // ---- Events ----
  const addEvent = useCallback((event) => {
    if (!currentUser) return;
    const record = { id: uid('evt'), createdAt: new Date().toISOString(), contractorBookings: [], ...event };
    patchList(LIST_FIELDS.events, [...currentUser.events, record]);
    return record;
  }, [currentUser, patchList]);

  const updateEvent = useCallback((id, patch) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.events, currentUser.events.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, [currentUser, patchList]);

  const deleteEvent = useCallback((id) => {
    if (!currentUser) return;
    patchList(LIST_FIELDS.events, currentUser.events.filter((e) => e.id !== id));
  }, [currentUser, patchList]);

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

  const computeEventTotalCost = useCallback((event) => {
    return event.contractorBookings.reduce((sum, b) => {
      const contractor = getContractorById(b.contractorId);
      return sum + (contractor ? Number(contractor.price) || 0 : 0);
    }, 0);
  }, [getContractorById]);

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
    events: currentUser?.events || [],
    contractorTypes: currentUser?.contractorTypes || [],
    eventTypes: currentUser?.eventTypes || [],
    eventStatuses: currentUser?.eventStatuses || [],
    inquiryStatuses: currentUser?.inquiryStatuses || [],
    emailTemplates: currentUser?.emailTemplates || [],
    addContractor,
    updateContractor,
    deleteContractor,
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
    addContractorType, removeContractorType,
    addEventType, removeEventType,
    addEventStatus, updateEventStatus, removeEventStatus,
    addInquiryStatus, updateInquiryStatus, removeInquiryStatus,
    addEmailTemplate, updateEmailTemplate, removeEmailTemplate,
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
