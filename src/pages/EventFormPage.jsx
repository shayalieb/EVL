import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ContractorPickerRow from '../components/ContractorPickerRow';
import ContractorModal from '../components/ContractorModal';
import EmailPreviewModal from '../components/EmailPreviewModal';
import EmailThreadModal from '../components/EmailThreadModal';
import PrepEmailModal from '../components/PrepEmailModal';
import GroupChipSelector from '../components/GroupChipSelector';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { getThreadSummaries, sendThreadedEmail } from '../lib/email/threads';
import { renderEmailTemplate } from '../lib/mergeFields';
import { uid } from '../lib/storage';
import { formatCurrency as currency, formatEventDate, formatEventTime } from '../lib/format';
import { getPricingTiers, getTierPrice } from '../lib/pricingTiers';
import { getPrepContractors, renderPrepSheetEmail } from '../lib/prepSheet';
import { generatePrepSheetPdf, generatePrepSheetPdfAttachment } from '../lib/prepSheetPdf';
import { listDocuments, uploadDocument, deleteDocument, documentDownloadUrl } from '../lib/documents';
import { InfoIcon, MapPinIcon, ClockIcon, UsersIcon, ClipboardIcon, NoteIcon, FileIcon } from '../components/ui/icons';

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';
const cardClass = 'bg-white rounded-2xl border border-slate-200 p-6';
const cardTitleClass = 'text-base font-bold text-slate-800 mb-5';

// Gives each Prep tab widget (Event Details, Location, Schedule, Crew,
// Requests, Notes, Documents) its own color + icon so they read as distinct
// widgets instead of one undifferentiated stack of sections.
function PrepSection({ title, color, icon, action, children }) {
  return (
    <div className="relative rounded-xl border border-slate-200 overflow-hidden">
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} />
      <div className="p-4 pt-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a`, color }}>
              {icon}
            </div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</h4>
          </div>
          {action}
        </div>
        {children}
      </div>
    </div>
  );
}

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function dayOfWeekFromDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' });
}

function emptyForm() {
  return {
    // Generated up front (not left to addEvent()) so contractor emails sent
    // while composing a brand-new, not-yet-saved event still have a stable
    // eventId to log against — addEvent() preserves a pre-supplied id.
    id: uid('evt'),
    name: '', eventType: '', eventDate: '', eventDayOfTheWeek: '',
    clientId: '',
    venue: { name: '', address1: '', address2: '', city: '', state: '', zip: '', locationNote: '', loadInInfo: '' },
    contactPhone: '', contactPhoneExt: '', contactEmail: '',
    startTime: '', endTime: '',
    eventNote: '',
    contractorBookings: [],
    // Which category/group tabs have been added to this event's Contractors
    // tab — starts empty; tabs are added explicitly via the selector.
    categoryTabs: [],
    schedule: [emptyScheduleItem()],
    // Which category groups are included on the Prep tab's crew list —
    // independent of categoryTabs above (that's about Contractors-tab UI).
    prepGroups: [],
    prepNotes: '',
    requests: [emptyRequestItem()],
  };
}

function emptyScheduleItem() {
  return { id: uid('sched'), time: '', name: '', details: '' };
}

function emptyRequestItem() {
  return { id: uid('req'), name: '', details: '', link: '', documentId: null, documentName: null };
}

export default function EventFormPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const {
    events, eventTypes, addEventType, eventStatuses, inquiryStatuses, addInquiryStatus, emailTemplates,
    contractors, contractorTypes, clients, addEvent, updateEvent, computeDurationHours,
  } = useData();
  const { can, currentUser } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (!can('manageEvents')) navigate('/events', { replace: true });
  }, [can, navigate]);

  const isEditing = !!eventId;
  const event = isEditing ? events.find((e) => e.id === eventId) : null;

  const [form, setForm] = useState(emptyForm());
  const [addingType, setAddingType] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tierPickerContractor, setTierPickerContractor] = useState(null);
  const [editingContractor, setEditingContractor] = useState(null);
  const [bulkTemplateId, setBulkTemplateId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [previewState, setPreviewState] = useState(null);
  const [previewSending, setPreviewSending] = useState(false);
  const [threadSummaries, setThreadSummaries] = useState({});
  const [openThreadContractorId, setOpenThreadContractorId] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [activeCategoryTab, setActiveCategoryTab] = useState('');
  const [documents, setDocuments] = useState([]);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [docPendingDelete, setDocPendingDelete] = useState(null);
  const [prepEmailModalOpen, setPrepEmailModalOpen] = useState(false);
  const [sendingPrepEmail, setSendingPrepEmail] = useState(false);
  const [uploadingRequestId, setUploadingRequestId] = useState(null);

  const hasCategories = contractorTypes.length > 0;

  useEffect(() => {
    if (form.categoryTabs.length === 0) {
      if (activeCategoryTab !== '') setActiveCategoryTab('');
      return;
    }
    if (!form.categoryTabs.includes(activeCategoryTab)) {
      setActiveCategoryTab(form.categoryTabs[0]);
    }
  }, [form.categoryTabs, activeCategoryTab]);

  const draftStatus = eventStatuses.find((s) => s.label.toLowerCase() === 'draft') || eventStatuses[0];

  // Background refreshes (e.g. the window-focus refetch in AuthContext) hand
  // back a brand-new `event` object even when nothing changed, which would
  // otherwise re-run this effect and clobber whatever the user is mid-typing.
  // Only actually hydrate once per event id.
  const hydratedEventIdRef = useRef(null);

  useEffect(() => {
    if (event) {
      if (hydratedEventIdRef.current === event.id) return;
      hydratedEventIdRef.current = event.id;
      // Older saved events predate categoryTabs — derive an initial set from
      // whichever categories are already booked so nothing disappears.
      const categoryTabs = event.categoryTabs || Array.from(new Set(
        event.contractorBookings
          .map((b) => contractors.find((c) => c.id === b.contractorId)?.contractorType1)
          .filter(Boolean)
      ));
      setForm({
        id: event.id,
        name: event.name, eventType: event.eventType, eventDate: event.eventDate,
        eventDayOfTheWeek: event.eventDayOfTheWeek || dayOfWeekFromDate(event.eventDate),
        clientId: event.clientId || '',
        venue: { ...event.venue },
        contactPhone: event.contactPhone, contactPhoneExt: event.contactPhoneExt || '', contactEmail: event.contactEmail,
        startTime: event.startTime, endTime: event.endTime,
        eventNote: event.eventNote || '',
        contractorBookings: [...event.contractorBookings],
        categoryTabs,
        schedule: event.schedule || [emptyScheduleItem()],
        prepGroups: event.prepGroups || [],
        prepNotes: event.prepNotes || '',
        requests: event.requests || [emptyRequestItem()],
      });
    } else {
      // eventId is undefined for the whole time you're drafting a brand-new
      // event — guard on it (not just truthiness of `event`) so a background
      // refresh doesn't wipe that in-progress, not-yet-saved draft.
      if (hydratedEventIdRef.current === eventId) return;
      hydratedEventIdRef.current = eventId;
      setForm(emptyForm());
    }
    setError('');
    setAddingType(false);
    setPickerOpen(false);
  }, [eventId, event, contractors]);

  const latestSummariesEventIdRef = useRef(null);

  const refreshThreadSummaries = useCallback(async (eventIdForSummaries) => {
    latestSummariesEventIdRef.current = eventIdForSummaries;
    try {
      const summaries = await getThreadSummaries(eventIdForSummaries);
      // form.id transitions from a throwaway draft id to the real event id
      // once data hydrates — discard responses for whichever id is no longer
      // current so a slow, stale request can't clobber the correct result.
      if (latestSummariesEventIdRef.current === eventIdForSummaries) {
        setThreadSummaries(summaries);
      }
    } catch {
      // best-effort — history icons just show no badge if this fails
    }
  }, []);

  useEffect(() => {
    if (form.id) refreshThreadSummaries(form.id);
  }, [form.id, refreshThreadSummaries]);

  const latestDocumentsEventIdRef = useRef(null);

  const refreshDocuments = useCallback(async (eventIdForDocuments) => {
    latestDocumentsEventIdRef.current = eventIdForDocuments;
    try {
      const docs = await listDocuments(eventIdForDocuments);
      // Same stale-request guard as refreshThreadSummaries above.
      if (latestDocumentsEventIdRef.current === eventIdForDocuments) {
        setDocuments(docs);
      }
    } catch {
      // best-effort — documents list just stays empty if this fails
    }
  }, []);

  useEffect(() => {
    if (form.id) refreshDocuments(form.id);
  }, [form.id, refreshDocuments]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }
  function updateVenue(field, val) {
    setForm((f) => ({ ...f, venue: { ...f.venue, [field]: val } }));
  }

  function handleAddType() {
    if (!newTypeLabel.trim()) return;
    addEventType(newTypeLabel);
    update('eventType', newTypeLabel.trim());
    setNewTypeLabel('');
    setAddingType(false);
  }

  const duration = computeDurationHours(form.startTime, form.endTime);
  const availableContractors = contractors.filter((c) => !form.contractorBookings.some((b) => b.contractorId === c.id));
  const prepContractors = getPrepContractors(form, contractors);
  const prepEmailDraft = renderPrepSheetEmail(form, prepContractors, form.requests);
  // Documents attached directly to a request are shown inline on that
  // request's row, not duplicated in the general Documents widget/picker.
  const requestDocumentIds = new Set(form.requests.map((r) => r.documentId).filter(Boolean));
  const generalDocuments = documents.filter((d) => !requestDocumentIds.has(d.id));

  // If categories exist system-wide, at least one tab must be added before
  // any contractor can be added — otherwise (no categories defined at all)
  // fall back to the fully open, unrestricted behavior.
  const canAddContractor = !hasCategories || form.categoryTabs.length > 0;

  function matchesActiveCategoryTab(contractorId) {
    if (!hasCategories) return true; // no categories defined system-wide — fully flat, unrestricted
    if (form.categoryTabs.length === 0) return false; // categories exist, but none added to this event yet
    const contractor = contractors.find((c) => c.id === contractorId);
    return contractor?.contractorType1 === activeCategoryTab;
  }

  function addCategoryTab(type) {
    if (!type || form.categoryTabs.includes(type)) return;
    setForm((f) => ({ ...f, categoryTabs: [...f.categoryTabs, type] }));
    setActiveCategoryTab(type);
  }

  function removeCategoryTab(type) {
    setForm((f) => ({ ...f, categoryTabs: f.categoryTabs.filter((t) => t !== type) }));
  }

  function addPrepGroup(type) {
    if (!type || form.prepGroups.includes(type)) return;
    setForm((f) => ({ ...f, prepGroups: [...f.prepGroups, type] }));
  }

  function removePrepGroup(type) {
    setForm((f) => ({ ...f, prepGroups: f.prepGroups.filter((t) => t !== type) }));
  }

  // Original indices are kept (not the filtered position) so drag-and-drop
  // still splices the real contractorBookings array correctly.
  const visibleEntries = form.contractorBookings
    .map((booking, index) => ({ booking, index }))
    .filter(({ booking }) => matchesActiveCategoryTab(booking.contractorId));
  const availableContractorsForActiveTab = availableContractors.filter((c) => matchesActiveCategoryTab(c.id));

  const totalCost = form.contractorBookings.reduce((sum, b) => {
    const c = contractors.find((x) => x.id === b.contractorId);
    return sum + (c ? getTierPrice(c, b.pricingTierId) : 0);
  }, 0);

  function getOrCreateInquiryStatus(label, color) {
    const existing = inquiryStatuses.find((s) => s.label.toLowerCase() === label.toLowerCase());
    return existing || addInquiryStatus({ label, color, isConfirmed: false });
  }

  function addContractorToEvent(contractorId, pricingTierId) {
    const addedStatus = getOrCreateInquiryStatus('Added', '#94a3b8');
    setForm((f) => ({
      ...f,
      contractorBookings: [...f.contractorBookings, {
        contractorId, inquiryStatusId: addedStatus?.id, pricingTierId,
        startTime: f.startTime, endTime: f.endTime,
      }],
    }));
    setPickerOpen(false);
  }

  function handlePickContractorToAdd(contractor) {
    const tiers = getPricingTiers(contractor);
    setPickerOpen(false);
    if (tiers.length <= 1) {
      addContractorToEvent(contractor.id, tiers[0]?.id);
    } else {
      setTierPickerContractor(contractor);
    }
  }

  function confirmTierPick(tierId) {
    if (!tierPickerContractor) return;
    addContractorToEvent(tierPickerContractor.id, tierId);
    setTierPickerContractor(null);
  }

  function removeContractorFromEvent(contractorId) {
    setForm((f) => ({ ...f, contractorBookings: f.contractorBookings.filter((b) => b.contractorId !== contractorId) }));
  }

  function changeBookingStatus(contractorId, inquiryStatusId) {
    setForm((f) => ({
      ...f,
      contractorBookings: f.contractorBookings.map((b) => (b.contractorId === contractorId ? { ...b, inquiryStatusId } : b)),
    }));
  }

  function changeBookingTier(contractorId, pricingTierId) {
    setForm((f) => ({
      ...f,
      contractorBookings: f.contractorBookings.map((b) => (b.contractorId === contractorId ? { ...b, pricingTierId } : b)),
    }));
  }

  function changeBookingTime(contractorId, field, value) {
    setForm((f) => ({
      ...f,
      contractorBookings: f.contractorBookings.map((b) => (b.contractorId === contractorId ? { ...b, [field]: value } : b)),
    }));
  }

  function addScheduleItem() {
    setForm((f) => ({ ...f, schedule: [...f.schedule, emptyScheduleItem()] }));
  }

  function updateScheduleItem(id, patch) {
    setForm((f) => ({ ...f, schedule: f.schedule.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  }

  function removeScheduleItem(id) {
    setForm((f) => ({ ...f, schedule: f.schedule.filter((s) => s.id !== id) }));
  }

  function addRequestItem() {
    setForm((f) => ({ ...f, requests: [...f.requests, emptyRequestItem()] }));
  }

  function updateRequestItem(id, patch) {
    setForm((f) => ({ ...f, requests: f.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  }

  function removeRequestItem(id) {
    const item = form.requests.find((r) => r.id === id);
    setForm((f) => ({ ...f, requests: f.requests.filter((r) => r.id !== id) }));
    if (item?.documentId) {
      deleteDocument(item.documentId).then(() => refreshDocuments(form.id)).catch(() => {});
    }
  }

  const fromName = currentUser.businessInfo?.name || `${currentUser.firstName} ${currentUser.lastName}`;

  async function sendAndMarkEmailed(contractor, templateId, subject, body) {
    await sendThreadedEmail({
      eventId: form.id,
      contractorId: contractor.id,
      contractorEmail: contractor.email,
      subject, body, templateId, fromName,
    });
    const emailedStatus = getOrCreateInquiryStatus('Emailed', '#eab308');
    if (emailedStatus) changeBookingStatus(contractor.id, emailedStatus.id);
  }

  async function handleUploadDocument(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDocument(true);
    try {
      await uploadDocument(form.id, file);
      await refreshDocuments(form.id);
      showToast('Document uploaded');
    } catch (err) {
      showToast(err.message || 'Failed to upload document', 'error');
    } finally {
      setUploadingDocument(false);
      e.target.value = '';
    }
  }

  async function handleUploadRequestDocument(id, file) {
    if (!file) return;
    setUploadingRequestId(id);
    try {
      const existing = form.requests.find((r) => r.id === id);
      if (existing?.documentId) {
        await deleteDocument(existing.documentId).catch(() => {});
      }
      const doc = await uploadDocument(form.id, file);
      updateRequestItem(id, { documentId: doc.id, documentName: doc.filename });
      await refreshDocuments(form.id);
    } catch (err) {
      showToast(err.message || 'Failed to upload document', 'error');
    } finally {
      setUploadingRequestId(null);
    }
  }

  async function confirmDeleteDocument() {
    if (!docPendingDelete) return;
    try {
      await deleteDocument(docPendingDelete.id);
      await refreshDocuments(form.id);
      showToast('Document deleted');
    } catch (err) {
      showToast(err.message || 'Failed to delete document', 'error');
    } finally {
      setDocPendingDelete(null);
    }
  }

  async function handleDownloadPdf() {
    try {
      await generatePrepSheetPdf(form, prepContractors, form.requests);
    } catch (err) {
      showToast(err.message || 'Failed to generate PDF', 'error');
    }
  }

  async function handleSendPrepEmail({ subject, body, recipientIds, documentIds }) {
    setSendingPrepEmail(true);
    try {
      // Documents attached to individual requests ride along automatically —
      // they were never offered as a separate checkbox in the modal.
      const requestDocIds = form.requests.map((r) => r.documentId).filter(Boolean);
      const mergedDocumentIds = Array.from(new Set([...documentIds, ...requestDocIds]));
      const pdfAttachment = await generatePrepSheetPdfAttachment(form, prepContractors, form.requests);
      let successCount = 0;
      for (const contractorId of recipientIds) {
        const contractor = contractors.find((c) => c.id === contractorId);
        if (!contractor?.email) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          await sendThreadedEmail({
            eventId: form.id, contractorId, contractorEmail: contractor.email,
            subject, body, fromName, documentIds: mergedDocumentIds, pdfAttachment,
          });
          successCount++;
        } catch {
          // keep going — failures reflected in the summary toast below
        }
      }
      if (successCount === recipientIds.length) {
        showToast(`Sent to ${successCount} contractor${successCount === 1 ? '' : 's'}`);
      } else {
        showToast(`Sent ${successCount} of ${recipientIds.length} emails — some failed`, 'error');
      }
      setPrepEmailModalOpen(false);
      refreshThreadSummaries(form.id);
    } catch (err) {
      showToast(err.message || 'Failed to send prep sheet email', 'error');
    } finally {
      setSendingPrepEmail(false);
    }
  }

  function getBookingTierId(contractorId) {
    return form.contractorBookings.find((b) => b.contractorId === contractorId)?.pricingTierId;
  }

  function handleRequestSend(contractorId, templateId) {
    const contractor = contractors.find((c) => c.id === contractorId);
    const template = emailTemplates.find((t) => t.id === templateId);
    if (!contractor || !template) return;
    const booking = form.contractorBookings.find((b) => b.contractorId === contractorId);
    const rendered = renderEmailTemplate({ template, event: form, contractor, booking, contractors, pricingTierId: getBookingTierId(contractorId) });
    setPreviewState({ mode: 'single', contractorId, templateId, subject: rendered.subject, body: rendered.body });
  }

  function getRecipientsForActiveTab() {
    return visibleEntries
      .map(({ booking }) => contractors.find((c) => c.id === booking.contractorId))
      .filter((c) => c && c.email);
  }

  function openBulkPreview() {
    const template = emailTemplates.find((t) => t.id === bulkTemplateId);
    if (!template) return;
    const recipientCount = getRecipientsForActiveTab().length;
    if (recipientCount === 0) {
      showToast('No contractors with an email address to send to', 'error');
      return;
    }
    setPreviewState({ mode: 'bulk', templateId: bulkTemplateId, subject: template.subject, body: template.body, recipientCount });
  }

  async function confirmPreviewSend({ subject, body }) {
    if (!previewState) return;
    setPreviewSending(true);
    try {
      if (previewState.mode === 'single') {
        const contractor = contractors.find((c) => c.id === previewState.contractorId);
        await sendAndMarkEmailed(contractor, previewState.templateId, subject, body);
        showToast(`Email sent to ${contractor.firstName} ${contractor.lastName}`);
      } else {
        const recipients = getRecipientsForActiveTab();
        let successCount = 0;
        for (const contractor of recipients) {
          try {
            const booking = form.contractorBookings.find((b) => b.contractorId === contractor.id);
            const rendered = renderEmailTemplate({ template: { subject, body }, event: form, contractor, booking, contractors, pricingTierId: getBookingTierId(contractor.id) });
            // eslint-disable-next-line no-await-in-loop
            await sendAndMarkEmailed(contractor, previewState.templateId, rendered.subject, rendered.body);
            successCount++;
          } catch {
            // keep going — failures are reflected in the summary toast below
          }
        }
        if (successCount === recipients.length) {
          showToast(`Emailed ${successCount} contractor${successCount === 1 ? '' : 's'}`);
        } else {
          showToast(`Sent ${successCount} of ${recipients.length} emails — some failed`, 'error');
        }
      }
      setPreviewState(null);
      refreshThreadSummaries(form.id);
    } catch (err) {
      showToast(err.message || 'Failed to send email', 'error');
    } finally {
      setPreviewSending(false);
    }
  }

  function handleDrop(targetIndex) {
    const sourceIndex = dragIndex.current;
    dragIndex.current = null;
    setDragOverIndex(null);
    if (sourceIndex === null || sourceIndex === targetIndex) return;
    setForm((f) => {
      const next = [...f.contractorBookings];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return { ...f, contractorBookings: next };
    });
  }

  function validate() {
    if (!form.name.trim()) return 'Event name is required.';
    if (!form.eventType) return 'Event type is required.';
    if (!form.eventDate) return 'Event date is required.';
    return '';
  }

  function persistEvent(statusId) {
    const payload = { ...form, eventStatus: statusId };
    if (event) updateEvent(event.id, payload);
    else addEvent(payload);
  }

  function handleSaveDraft() {
    const err = validate();
    if (err) { setError(err); setActiveTab('details'); return; }
    persistEvent(draftStatus?.id);
    showToast('Saved as draft');
    navigate('/events');
  }

  function handleSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); setActiveTab('details'); return; }
    setSaving(true);
    setTimeout(() => {
      const confirmedStatus = eventStatuses.find((s) => s.label.toLowerCase() === 'confirmed');
      persistEvent(event?.eventStatus || confirmedStatus?.id || draftStatus?.id);
      setSaving(false);
      showToast(event ? 'Event updated' : 'Event added');
      navigate('/events');
    }, 600);
  }

  if (isEditing && !event) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-slate-500 mb-4">This event couldn't be found.</p>
        <button
          type="button"
          onClick={() => navigate('/events')}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
        >
          Back to Events
        </button>
      </div>
    );
  }

  const showBulkRow = visibleEntries.length > 0 && emailTemplates.length > 0;
  const addContractorButton = (
    <div className="relative">
      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        className="px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-600 text-xs font-semibold hover:bg-indigo-50"
      >
        + Add Contractor
      </button>
      {pickerOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
          <div className="absolute right-0 mt-1 w-72 max-h-64 overflow-y-auto bg-white rounded-lg shadow-lg border border-slate-100 z-20">
            {availableContractorsForActiveTab.length === 0 && (
              <div className="px-3 py-3 text-xs text-slate-400">
                {hasCategories ? 'No available contractors in this category.' : 'All contractors already added.'}
              </div>
            )}
            {availableContractorsForActiveTab.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handlePickContractorToAdd(c)}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
              >
                <div className="font-medium text-slate-700">{c.firstName} {c.lastName}</div>
                <div className="text-xs text-slate-400">{c.contractorType1}{c.contractorType2 ? ` · ${c.contractorType2}` : ''}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/events')}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100"
            aria-label="Back to Events"
          >
            ←
          </button>
          <h2 className="text-2xl font-bold text-slate-800 truncate">{isEditing ? event.name : 'Add Event'}</h2>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={() => navigate('/events')} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button type="button" onClick={handleSaveDraft} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Save as Draft
          </button>
          <button
            type="submit"
            form="event-form"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
          >
            {saving && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            {isEditing ? 'Save Changes' : 'Add Event'}
          </button>
        </div>
      </div>

      <div className="flex border-b border-slate-200 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('details')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${
            activeTab === 'details' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('contractors')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'contractors' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Contractors
          {form.contractorBookings.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
              {form.contractorBookings.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('prep')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${
            activeTab === 'prep' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Prep
        </button>
      </div>

      {error && <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

      <form id="event-form" onSubmit={handleSubmit} className="space-y-6">
        <div className={activeTab === 'details' ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : 'hidden'}>
          <div className={cardClass}>
            <h3 className={cardTitleClass}>Event Details</h3>
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Event Name *</label>
                <input required value={form.name} onChange={(e) => update('name', e.target.value)} className={inputClass} />
              </div>

              <div>
                <label className={labelClass}>Client</label>
                <select value={form.clientId} onChange={(e) => update('clientId', e.target.value)} className={inputClass}>
                  <option value="">No client linked</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Event Type *</label>
                  {!addingType ? (
                    <div className="flex gap-2">
                      <select required value={form.eventType} onChange={(e) => update('eventType', e.target.value)} className={inputClass}>
                        <option value="">Select a type…</option>
                        {eventTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button type="button" onClick={() => setAddingType(true)} className="shrink-0 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50">+ Add</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input autoFocus value={newTypeLabel} onChange={(e) => setNewTypeLabel(e.target.value)} placeholder="New event type" className={inputClass} />
                      <button type="button" onClick={handleAddType} className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Save</button>
                      <button type="button" onClick={() => setAddingType(false)} className="shrink-0 px-3 py-2 rounded-lg text-slate-500 text-sm">Cancel</button>
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Event Date *</label>
                  <div className="flex gap-2">
                    <div
                      className="shrink-0 min-w-[5.5rem] px-2 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-medium text-slate-500"
                      title="Day of the week, derived from the event date"
                    >
                      {form.eventDayOfTheWeek || '—'}
                    </div>
                    <input
                      type="date"
                      required
                      min={tomorrowISO()}
                      value={form.eventDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm((f) => ({ ...f, eventDate: val, eventDayOfTheWeek: dayOfWeekFromDate(val) }));
                      }}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelClass}>Contact Phone</label>
                    <input type="tel" value={form.contactPhone} onChange={(e) => update('contactPhone', e.target.value)} className={inputClass} />
                  </div>
                  <div className="w-20">
                    <label className={labelClass}>Ext.</label>
                    <input value={form.contactPhoneExt} onChange={(e) => update('contactPhoneExt', e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Contact Email</label>
                  <input type="email" value={form.contactEmail} onChange={(e) => update('contactEmail', e.target.value)} className={inputClass} />
                </div>
              </div>

              <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
                <div>
                  <label className={labelClass}>Event Start Time</label>
                  <input type="time" value={form.startTime} onChange={(e) => update('startTime', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Event End Time</label>
                  <input type="time" value={form.endTime} onChange={(e) => update('endTime', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Duration</label>
                  <div className="px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 whitespace-nowrap text-center">
                    {duration !== null ? `${duration % 1 === 0 ? duration : duration.toFixed(1)} hrs` : '—'}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={`${labelClass} mb-0`}>Event Note</label>
                  {form.eventNote && (
                    <button
                      type="button"
                      onClick={() => update('eventNote', '')}
                      className="text-xs text-slate-400 hover:text-red-600"
                      aria-label="Delete event note"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  placeholder="e.g. Client requested no announcements during dinner"
                  value={form.eventNote}
                  onChange={(e) => update('eventNote', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <h3 className={cardTitleClass}>Event Location</h3>
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Venue Name</label>
                <input value={form.venue.name} onChange={(e) => updateVenue('name', e.target.value)} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Address 1</label>
                  <input value={form.venue.address1} onChange={(e) => updateVenue('address1', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Address 2</label>
                  <input value={form.venue.address2} onChange={(e) => updateVenue('address2', e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>City</label>
                  <input value={form.venue.city} onChange={(e) => updateVenue('city', e.target.value)} className={inputClass} />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelClass}>State</label>
                    <input value={form.venue.state} onChange={(e) => updateVenue('state', e.target.value)} className={inputClass} />
                  </div>
                  <div className="w-24">
                    <label className={labelClass}>Zip</label>
                    <input value={form.venue.zip} onChange={(e) => updateVenue('zip', e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={`${labelClass} mb-0`}>Location Note</label>
                  {form.venue.locationNote && (
                    <button
                      type="button"
                      onClick={() => updateVenue('locationNote', '')}
                      className="text-xs text-slate-400 hover:text-red-600"
                      aria-label="Delete location note"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  placeholder="e.g. Loading dock around back, no elevator access"
                  value={form.venue.locationNote || ''}
                  onChange={(e) => updateVenue('locationNote', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={`${labelClass} mb-0`}>Load In Info</label>
                  {form.venue.loadInInfo && (
                    <button
                      type="button"
                      onClick={() => updateVenue('loadInInfo', '')}
                      className="text-xs text-slate-400 hover:text-red-600"
                      aria-label="Delete load in info"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  placeholder="e.g. Load in through the back entrance, freight elevator to 2nd floor"
                  value={form.venue.loadInInfo || ''}
                  onChange={(e) => updateVenue('loadInInfo', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>

        <div className={activeTab === 'details' ? cardClass : 'hidden'}>
          <div className="flex items-center justify-between mb-5">
            <h3 className={`${cardTitleClass} mb-0`}>Event Schedule</h3>
            <button
              type="button"
              onClick={addScheduleItem}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              + Add Line
            </button>
          </div>

          {form.schedule.length === 0 ? (
            <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
              No schedule lines yet.
            </div>
          ) : (
            <div className="space-y-2">
              {form.schedule.map((item) => (
                <div key={item.id} className="flex items-start gap-2">
                  <input
                    type="time"
                    value={item.time}
                    onChange={(e) => updateScheduleItem(item.id, { time: e.target.value })}
                    className="shrink-0 w-32 px-2.5 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                  <input
                    value={item.name}
                    onChange={(e) => updateScheduleItem(item.id, { name: e.target.value })}
                    placeholder="e.g. Ceremony"
                    className="shrink-0 w-48 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                  <input
                    value={item.details}
                    onChange={(e) => updateScheduleItem(item.id, { details: e.target.value })}
                    placeholder="Details…"
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                  <button
                    type="button"
                    onClick={() => removeScheduleItem(item.id)}
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                    aria-label="Remove schedule line"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={activeTab === 'contractors' ? cardClass : 'hidden'}>
          <div className="flex items-center justify-between mb-5">
            <h3 className={`${cardTitleClass} mb-0`}>Contractors</h3>
            {!showBulkRow && canAddContractor && addContractorButton}
          </div>

          {hasCategories && (
            <GroupChipSelector
              groups={form.categoryTabs}
              allOptions={contractorTypes}
              activeGroup={activeCategoryTab}
              onSelectGroup={setActiveCategoryTab}
              onAddGroup={addCategoryTab}
              onRemoveGroup={removeCategoryTab}
              emptyLabel="No group tabs yet"
            />
          )}

          {showBulkRow && (
            <div className="flex items-center gap-3 px-3 pb-2">
              <span className="cursor-grab text-slate-300 select-none invisible" aria-hidden="true">⠿</span>
              <div className="flex-1 min-w-0 text-xs font-semibold text-slate-500">Bulk send</div>
              <div className="shrink-0 w-12" aria-hidden="true" />
              <select
                value={bulkTemplateId}
                onChange={(e) => setBulkTemplateId(e.target.value)}
                className="shrink-0 w-36 px-2 py-1.5 rounded-lg border border-slate-300 text-xs"
              >
                <option value="">Select template…</option>
                {emailTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button
                type="button"
                onClick={openBulkPreview}
                disabled={!bulkTemplateId}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                Send to All
              </button>
              <div className="shrink-0 ml-3 w-32" aria-hidden="true" />
              <div className="w-20 shrink-0" aria-hidden="true" />
              <div className="shrink-0 w-6" aria-hidden="true" />
              {canAddContractor && addContractorButton}
            </div>
          )}

          {!canAddContractor ? (
            <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
              Add a group tab above to start adding contractors.
            </div>
          ) : visibleEntries.length === 0 ? (
            <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
              {hasCategories ? 'No contractors in this category yet.' : 'No contractors added yet.'}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleEntries.map(({ booking: b, index: i }) => (
                <ContractorPickerRow
                  key={b.contractorId}
                  booking={b}
                  index={i}
                  contractor={contractors.find((c) => c.id === b.contractorId)}
                  inquiryStatuses={inquiryStatuses}
                  emailTemplates={emailTemplates}
                  threadSummary={threadSummaries[b.contractorId]}
                  onStatusChange={changeBookingStatus}
                  onTierChange={changeBookingTier}
                  onTimeChange={changeBookingTime}
                  onRemove={removeContractorFromEvent}
                  onRequestSend={handleRequestSend}
                  onOpenContractor={setEditingContractor}
                  onOpenThread={setOpenThreadContractorId}
                  onDragStart={(idx) => { dragIndex.current = idx; }}
                  onDragOver={(idx) => setDragOverIndex(idx)}
                  onDrop={handleDrop}
                  isDragging={dragOverIndex === i && dragIndex.current !== i}
                />
              ))}
            </div>
          )}

          {form.contractorBookings.length > 0 && (
            <div className="flex justify-end mt-3 text-sm font-bold text-slate-800">
              Total: {currency(totalCost)}
            </div>
          )}
        </div>

        <div className={activeTab === 'prep' ? cardClass : 'hidden'}>
          <div className="flex items-center justify-between mb-5">
            <h3 className={`${cardTitleClass} mb-0`}>Prep Sheet</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50"
              >
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => setPrepEmailModalOpen(true)}
                disabled={prepContractors.length === 0}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Email Prep Sheet
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <PrepSection title="Event Details" color="#64748b" icon={<InfoIcon className="w-3.5 h-3.5" />}>
              <div className="text-sm space-y-1">
                <p className="font-semibold text-slate-800">{form.name || 'Untitled event'}</p>
                <p className="text-slate-500">
                  {formatEventDate(form.eventDate) || '—'}
                  {form.eventDayOfTheWeek ? ` (${form.eventDayOfTheWeek})` : ''}
                </p>
                <p className="text-slate-500">{formatEventTime(form.startTime) || '—'} – {formatEventTime(form.endTime) || '—'}</p>
                {form.contactPhone && <p className="text-slate-500">{form.contactPhone}{form.contactPhoneExt ? ` ext. ${form.contactPhoneExt}` : ''}</p>}
                {form.contactEmail && <p className="text-slate-500">{form.contactEmail}</p>}
              </div>
            </PrepSection>
            <PrepSection title="Location" color="#2563eb" icon={<MapPinIcon className="w-3.5 h-3.5" />}>
              <div className="text-sm space-y-1">
                {form.venue.name && <p className="font-semibold text-slate-800">{form.venue.name}</p>}
                <p className="text-slate-500">
                  {[form.venue.address1, form.venue.address2].filter(Boolean).join(', ')}
                  {form.venue.city ? <br /> : null}
                  {[form.venue.city, form.venue.state, form.venue.zip].filter(Boolean).join(' ')}
                </p>
                {form.venue.locationNote && <p className="text-slate-500">{form.venue.locationNote}</p>}
                {form.venue.loadInInfo && <p className="text-slate-500"><em>Load-in:</em> {form.venue.loadInInfo}</p>}
              </div>
            </PrepSection>
          </div>

          {form.schedule.some((s) => s.time || s.name || s.details) && (
            <div className="mb-4">
              <PrepSection title="Schedule" color="#0d9488" icon={<ClockIcon className="w-3.5 h-3.5" />}>
                <div className="space-y-1 text-sm">
                  {form.schedule.filter((s) => s.time || s.name || s.details).map((s) => (
                    <div key={s.id} className="flex gap-3">
                      <span className="w-20 shrink-0 text-slate-400">{formatEventTime(s.time) || '—'}</span>
                      <span className="w-40 shrink-0 font-medium text-slate-700">{s.name}</span>
                      <span className="text-slate-500">{s.details}</span>
                    </div>
                  ))}
                </div>
              </PrepSection>
            </div>
          )}

          <div className="mb-4">
            <PrepSection title="Crew" color="#7c3aed" icon={<UsersIcon className="w-3.5 h-3.5" />}>
              <GroupChipSelector
                groups={form.prepGroups}
                allOptions={contractorTypes}
                onAddGroup={addPrepGroup}
                onRemoveGroup={removePrepGroup}
                emptyLabel="No groups added yet"
              />
              {prepContractors.length === 0 ? (
                <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
                  Add a group above to include its contractors here.
                </div>
              ) : (
                <div className="space-y-1 text-sm">
                  {prepContractors.map((c) => (
                    <div key={c.contractorId} className="flex gap-3 px-1 py-1">
                      <span className="w-40 shrink-0 font-medium text-slate-700">{c.name}</span>
                      <span className="w-40 shrink-0 text-slate-500">{c.role}</span>
                      <span className="text-slate-500">{formatEventTime(c.startTime) || '—'} – {formatEventTime(c.endTime) || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </PrepSection>
          </div>

          <div className="mb-4">
            <PrepSection
              title="Requests"
              color="#d97706"
              icon={<ClipboardIcon className="w-3.5 h-3.5" />}
              action={(
                <button type="button" onClick={addRequestItem} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                  + Add Request
                </button>
              )}
            >
              {form.requests.length === 0 ? (
                <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
                  No requests added yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {form.requests.map((r) => (
                    <div key={r.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          placeholder="Name"
                          value={r.name}
                          onChange={(e) => updateRequestItem(r.id, { name: e.target.value })}
                          className={inputClass}
                        />
                        <input
                          placeholder="Link (optional)"
                          value={r.link}
                          onChange={(e) => updateRequestItem(r.id, { link: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                      <textarea
                        rows={2}
                        placeholder="Request details…"
                        value={r.details}
                        onChange={(e) => updateRequestItem(r.id, { details: e.target.value })}
                        className={inputClass}
                      />
                      <div className="flex items-center justify-between">
                        {r.documentId ? (
                          <a
                            href={documentDownloadUrl(r.documentId)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 min-w-0 truncate text-xs text-indigo-600 hover:underline"
                          >
                            {r.documentName}
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">No document attached</span>
                        )}
                        <div className="flex items-center gap-3 shrink-0">
                          <label className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer">
                            {uploadingRequestId === r.id ? 'Uploading…' : r.documentId ? 'Replace document' : '+ Attach document'}
                            <input
                              type="file"
                              onChange={(e) => handleUploadRequestDocument(r.id, e.target.files?.[0])}
                              disabled={uploadingRequestId === r.id}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => removeRequestItem(r.id)}
                            className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                            aria-label="Remove request"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PrepSection>
          </div>

          <div className="mb-4">
            <PrepSection title="Notes" color="#e11d48" icon={<NoteIcon className="w-3.5 h-3.5" />}>
              <textarea
                rows={3}
                placeholder="Notes for the crew or day-of prep…"
                value={form.prepNotes}
                onChange={(e) => update('prepNotes', e.target.value)}
                className={inputClass}
              />
            </PrepSection>
          </div>

          <PrepSection
            title="Documents"
            color="#059669"
            icon={<FileIcon className="w-3.5 h-3.5" />}
            action={(
              <label className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer">
                {uploadingDocument ? 'Uploading…' : '+ Upload Document'}
                <input type="file" onChange={handleUploadDocument} disabled={uploadingDocument} className="hidden" />
              </label>
            )}
          >
            {generalDocuments.length === 0 ? (
              <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
                No documents uploaded yet.
              </div>
            ) : (
              <div className="space-y-1.5">
                {generalDocuments.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-200 text-sm">
                    <a href={documentDownloadUrl(d.id)} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-indigo-600 hover:underline">
                      {d.filename}
                    </a>
                    <span className="text-xs text-slate-400 shrink-0">{(d.size / 1024).toFixed(0)} KB</span>
                    <button
                      type="button"
                      onClick={() => setDocPendingDelete(d)}
                      className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                      aria-label={`Remove ${d.filename}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </PrepSection>
        </div>
      </form>

      <ContractorModal
        open={!!editingContractor}
        onClose={() => setEditingContractor(null)}
        contractor={editingContractor}
      />

      <Modal
        open={!!tierPickerContractor}
        onClose={() => setTierPickerContractor(null)}
        title={tierPickerContractor ? `Choose pricing tier — ${tierPickerContractor.firstName} ${tierPickerContractor.lastName}` : ''}
        widthClass="max-w-sm"
      >
        <div className="space-y-2">
          {tierPickerContractor && getPricingTiers(tierPickerContractor).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => confirmTierPick(t.id)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-left"
            >
              <span className="text-sm font-medium text-slate-700">{t.name}</span>
              <span className="text-sm font-semibold text-slate-800">{currency(t.price)}</span>
            </button>
          ))}
        </div>
      </Modal>

      <EmailPreviewModal
        open={!!previewState}
        onClose={() => setPreviewState(null)}
        recipientLabel={previewState?.mode === 'single'
          ? (() => {
              const c = contractors.find((x) => x.id === previewState.contractorId);
              return c ? `${c.firstName} ${c.lastName}` : '';
            })()
          : previewState?.mode === 'bulk' ? `${previewState.recipientCount} contractors` : ''}
        note={previewState?.mode === 'bulk' ? 'Merge fields (like {{ContractorFirstName}}) will be filled in per recipient when sent.' : undefined}
        initialSubject={previewState?.subject}
        initialBody={previewState?.body}
        sending={previewSending}
        onConfirm={confirmPreviewSend}
      />

      <EmailThreadModal
        open={!!openThreadContractorId}
        onClose={() => setOpenThreadContractorId(null)}
        eventId={form.id}
        contractorId={openThreadContractorId}
        contractorEmail={contractors.find((c) => c.id === openThreadContractorId)?.email}
        contractorLabel={(() => {
          const c = contractors.find((x) => x.id === openThreadContractorId);
          return c ? `${c.firstName} ${c.lastName}` : '';
        })()}
        fromName={fromName}
        onChanged={() => refreshThreadSummaries(form.id)}
      />

      <PrepEmailModal
        open={prepEmailModalOpen}
        onClose={() => setPrepEmailModalOpen(false)}
        prepContractors={prepContractors}
        documents={generalDocuments}
        initialSubject={prepEmailDraft.subject}
        initialBody={prepEmailDraft.body}
        sending={sendingPrepEmail}
        onConfirm={handleSendPrepEmail}
      />

      <ConfirmDialog
        open={!!docPendingDelete}
        onClose={() => setDocPendingDelete(null)}
        onConfirm={confirmDeleteDocument}
        title="Remove document?"
        description={`This will remove "${docPendingDelete?.filename}" from this event. This can't be undone.`}
      />
    </div>
  );
}
