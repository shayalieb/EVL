import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ContractorPickerRow from '../components/ContractorPickerRow';
import ContractorModal from '../components/ContractorModal';
import ClientCombobox from '../components/ClientCombobox';
import AcceptPaymentModal from '../components/AcceptPaymentModal';
import EmailPreviewModal from '../components/EmailPreviewModal';
import EmailThreadModal from '../components/EmailThreadModal';
import PrepEmailModal from '../components/PrepEmailModal';
import GroupChipSelector from '../components/GroupChipSelector';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import HistoryModal from '../components/HistoryModal';
import VenueCombobox from '../components/VenueCombobox';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { getThreadSummaries, getThread, sendThreadedEmail } from '../lib/email/threads';
import { renderEmailTemplate } from '../lib/mergeFields';
import { uid } from '../lib/storage';
import { loadDraft, saveDraft, clearDraft } from '../lib/draftStorage';
import { formatCurrency as currency, formatEventDate, formatEventTime, formatPhoneNumber } from '../lib/format';
import { getPricingTiers, getPricingTier, getTierPrice, getBookingTotal, getOvertimeHours, getOvertimeAmount } from '../lib/pricingTiers';
import { getPrepContractors, renderPrepSheetEmail, requestsLabels } from '../lib/prepSheet';
import { generatePrepSheetPdf, generatePrepSheetPdfAttachment } from '../lib/prepSheetPdf';
import { listDocuments, uploadDocument, deleteDocument, documentDownloadUrl } from '../lib/documents';
import { getBookingByEvent } from '../lib/bookings';
import { getDashboard } from '../lib/dashboard';
import { listInvoices } from '../lib/invoices';
import { listGuests, createGuest, updateGuest, deleteGuest, getRsvpLink } from '../lib/guests';
import { InfoIcon, MapPinIcon, ClockIcon, UsersIcon, ClipboardIcon, NoteIcon, FileIcon } from '../components/ui/icons';
import { BUCKETS, statusBucket } from '../lib/inquiryStatusBucket';
import { isWedding } from '../lib/eventType';

const StagePlotEditorPage = lazy(() => import('./StagePlotEditorPage'));

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';
const cardClass = 'bg-white rounded-2xl border border-slate-200 p-6';
const cardTitleClass = 'text-base font-bold text-slate-800 mb-5';
const INVOICE_STATUS_LABELS = { draft: 'Draft', sent: 'Sent', partial: 'Partial', paid: 'Paid', void: 'Void' };
const INVOICE_STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-500',
  sent: 'bg-blue-100 text-blue-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  void: 'bg-slate-100 text-slate-400',
};

// One collapsible group per contractor status bucket (Confirmed/Tentative/
// Not Avail) on the Contractors tab — see src/lib/inquiryStatusBucket.js.
function ContractorBucketSection({ label, count, total, paid, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="event-form-contractor-bucket-toggle-button"
        className="w-full flex items-center gap-2 text-left mb-3"
      >
        <span className={`text-slate-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</h4>
        <span className="text-xs font-semibold text-slate-400">{count}</span>
        <span className="flex-1 border-t border-slate-100" />
        {/* Not Avail sections pass no total — that money isn't actually
            being spent, so there's nothing worth showing here. */}
        {total !== undefined && (
          <span className="text-xs font-bold text-slate-600">
            {paid > 0 && <span className="font-semibold text-emerald-600">{currency(paid)} paid · </span>}
            {currency(total)}
          </span>
        )}
      </button>
      {open && children}
    </div>
  );
}

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
    brideName: '', groomName: '',
    guestCount: '',
    venue: {
      name: '', address1: '', address2: '', city: '', state: '', zip: '', locationNote: '', loadInInfo: '',
      contactName: '', contactPhone: '', contactPhoneExt: '', contactEmail: '',
    },
    contactPhone: '', contactPhoneExt: '', contactEmail: '',
    startTime: '', endTime: '',
    eventNote: '',
    noOutsideContractorsNeeded: false,
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
    // Photography-vertical-only prep tools (see currentUser.vertical gates
    // in the Prep tab below) — plain arrays on the Event object, same
    // convention as requests[]/schedule[] above, no schema change needed.
    shotList: [],
    secondShooters: [],
    // Manual overhead lines for costs nothing else tracks (venue rental,
    // permits, equipment) — feeds the Financials tab's P&L alongside the
    // computed contractor cost total.
    otherExpenses: [],
  };
}

function emptyScheduleItem() {
  return { id: uid('sched'), time: '', name: '', details: '' };
}

function emptyRequestItem() {
  return { id: uid('req'), name: '', details: '', link: '', documentId: null, documentName: null };
}

function emptyShotListItem() {
  return { id: uid('shot'), label: '', category: 'Family Formals', mustHave: false, notes: '' };
}

function emptySecondShooter() {
  return { id: uid('shooter'), contractorId: '', role: '', notes: '' };
}

const RSVP_STATUSES = [
  { value: 'invited', label: 'Invited', color: '#94a3b8' },
  { value: 'confirmed', label: 'Confirmed', color: '#22c55e' },
  { value: 'declined', label: 'Declined', color: '#ef4444' },
];

const SHOT_CATEGORIES = ['Family Formals', 'Candid', 'Detail', 'Portrait', 'Other'];

// A brand-new event only lives in memory until it's saved — nothing to
// auto-save to the server yet. But the tab itself can still be discarded by
// the browser (backgrounded to save memory) or reloaded, which wipes that
// in-progress React state outright. Mirroring the draft into sessionStorage
// (see lib/draftStorage.js) means a reload picks up right where the user
// left off instead of silently losing everything they'd typed.
const NEW_EVENT_DRAFT_KEY = 'gigworks:newEventDraft';

export default function EventFormPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const {
    eventTypes, addEventType, eventStatuses, inquiryStatuses, addInquiryStatus, emailTemplates, loadEvent,
    contractors, searchContractors, contractorTypes, venues, addEvent, updateEvent, computeDurationHours,
    updateBooking, computeEventTotalCost, contractorGroups,
  } = useData();
  const { can, currentUser, role } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (!can('manageEvents')) navigate('/events', { replace: true });
  }, [can, navigate]);

  const isEditing = !!eventId;
  const [fullEvent, setFullEvent] = useState(null);
  const [eventDetailLoaded, setEventDetailLoaded] = useState(false);
  const event = isEditing ? fullEvent : null;

  useEffect(() => {
    if (!eventId) { setFullEvent(null); setEventDetailLoaded(false); return; }
    let cancelled = false;
    setEventDetailLoaded(false);
    loadEvent(eventId)
      .then((full) => { if (!cancelled) setFullEvent(full); })
      .catch(() => { if (!cancelled) setFullEvent(null); })
      .finally(() => { if (!cancelled) setEventDetailLoaded(true); });
    return () => { cancelled = true; };
  }, [eventId, loadEvent]);

  // Profit/loss is sensitive financial data — same owner/admin-only gate
  // already used for Settings -> Users/Billing.
  const isAdminOrOwner = role === 'owner' || role === 'admin';

  const [form, setForm] = useState(emptyForm());
  const [addingType, setAddingType] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [stagePlotModalOpen, setStagePlotModalOpen] = useState(false);
  const [emailHistoryEntries, setEmailHistoryEntries] = useState([]);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [contractorQuery, setContractorQuery] = useState('');
  const [contractorSearchResults, setContractorSearchResults] = useState([]);
  const [contractorSearchLoading, setContractorSearchLoading] = useState(false);
  const [ensemblePickerOpen, setEnsemblePickerOpen] = useState(false);
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
  const [payingContractorId, setPayingContractorId] = useState(null); // contractorId currently open in the Pay Contractor popover, or null
  const [activeTab, setActiveTab] = useState('details');
  const [activeCategoryTab, setActiveCategoryTab] = useState('');
  const [documents, setDocuments] = useState([]);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [markingDepositPaid, setMarkingDepositPaid] = useState(false);
  const [docPendingDelete, setDocPendingDelete] = useState(null);
  const [prepEmailModalOpen, setPrepEmailModalOpen] = useState(false);
  const [sendingPrepEmail, setSendingPrepEmail] = useState(false);
  const [uploadingRequestId, setUploadingRequestId] = useState(null);

  const hasCategories = contractorTypes.length > 0;

  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setContractorSearchLoading(true);
      searchContractors(contractorQuery)
        .then((items) => { if (!cancelled) setContractorSearchResults(items); })
        .finally(() => { if (!cancelled) setContractorSearchLoading(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pickerOpen, contractorQuery, searchContractors]);

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
  // Skips the auto-save effect's very next run after (re)hydrating `form`
  // from `event` — otherwise loading an event's data would itself look like
  // an edit and immediately re-persist the just-loaded data.
  const autoSaveSkipRef = useRef(true);

  useEffect(() => {
    if (event) {
      if (hydratedEventIdRef.current === event.id) return;
      hydratedEventIdRef.current = event.id;
      // Older saved events predate categoryTabs/prepGroups — derive an initial
      // set for each from whichever categories are already booked so nothing
      // disappears. Checked by length, not truthiness: [] is truthy in JS,
      // and [] is exactly what the server defaults both fields to on every
      // new event — so a plain `event.categoryTabs || derive(...)` would
      // never derive anything for a brand-new event whose contractors were
      // assigned by some path other than this page's own "+ Add Contractor"/
      // "+ Add" group buttons (e.g. seeded/imported data, or a future
      // integration), leaving them booked and billed but invisible on both
      // the Contractors tab and the Prep Sheet's Crew list.
      const bookedCategories = () => Array.from(new Set(
        event.contractorBookings
          .map((b) => contractors.find((c) => c.id === b.contractorId)?.contractorType1)
          .filter(Boolean)
      ));
      const categoryTabs = event.categoryTabs?.length ? event.categoryTabs : bookedCategories();
      const prepGroups = event.prepGroups?.length ? event.prepGroups : bookedCategories();
      setForm({
        id: event.id,
        name: event.name, eventType: event.eventType, eventDate: event.eventDate,
        eventDayOfTheWeek: event.eventDayOfTheWeek || dayOfWeekFromDate(event.eventDate),
        clientId: event.clientId || '',
        brideName: event.brideName || '',
        groomName: event.groomName || '',
        guestCount: event.guestCount ?? '',
        // Defaults spread first so events saved before contactName/
        // contactEmail existed still get controlled ('') instead of
        // undefined values for them.
        venue: { name: '', address1: '', address2: '', city: '', state: '', zip: '', locationNote: '', loadInInfo: '', contactName: '', contactPhone: '', contactPhoneExt: '', contactEmail: '', ...event.venue },
        contactPhone: event.contactPhone, contactPhoneExt: event.contactPhoneExt || '', contactEmail: event.contactEmail,
        startTime: event.startTime, endTime: event.endTime,
        eventNote: event.eventNote || '',
        noOutsideContractorsNeeded: !!event.noOutsideContractorsNeeded,
        contractorBookings: [...event.contractorBookings],
        categoryTabs,
        schedule: event.schedule || [emptyScheduleItem()],
        prepGroups,
        prepNotes: event.prepNotes || '',
        requests: event.requests || [emptyRequestItem()],
        shotList: event.shotList || [],
        secondShooters: event.secondShooters || [],
        otherExpenses: event.otherExpenses || [],
      });
    } else if (!isEditing) {
      // eventId is undefined for the whole time you're drafting a brand-new
      // event — guard on it (not just truthiness of `event`) so a background
      // refresh doesn't wipe that in-progress, not-yet-saved draft.
      if (hydratedEventIdRef.current === eventId) return;
      hydratedEventIdRef.current = eventId;
      setForm(loadDraft(NEW_EVENT_DRAFT_KEY) || emptyForm());
    } else {
      // isEditing but `event` (the full-detail fetch) hasn't resolved yet —
      // nothing to hydrate from. Do NOT touch hydratedEventIdRef here, or the
      // real hydration above would see it already "done" once the fetch
      // lands and skip populating the form entirely.
      return;
    }
    setError('');
    setAddingType(false);
    setPickerOpen(false);
    autoSaveSkipRef.current = true;
  }, [eventId, event, contractors, isEditing]);

  // Mirrors the in-progress draft of a brand-new (not-yet-saved) event into
  // sessionStorage on every change, so a discarded/reloaded tab can recover
  // it — see lib/draftStorage.js.
  useEffect(() => {
    if (event || isEditing) return;
    saveDraft(NEW_EVENT_DRAFT_KEY, form);
  }, [form, event, isEditing]);

  // Auto-saves an existing event shortly after any field changes — no
  // explicit "Save Changes" click needed, mirroring BookingFormPage's same
  // pattern. Only for events that already exist; a brand-new one still
  // needs its first, deliberate "Add Event". Saves `form` as-is (current
  // status included) rather than through persistEvent, which is reserved
  // for the Save Draft/Submit buttons that deliberately force a status.
  useEffect(() => {
    if (!event) return;
    if (autoSaveSkipRef.current) { autoSaveSkipRef.current = false; return; }
    const timer = setTimeout(() => {
      updateEvent(event.id, form).catch((err) => setError(err.message || 'Failed to save changes.'));
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

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

  // Guests are real DB rows scoped by eventId, not part of the form/blob —
  // party_planning-only, both client-side (the tab is hidden for other
  // verticals) and server-side (GET /guests 403s for them), so only fetch
  // when relevant.
  const isPartyPlanning = currentUser.activeVerticals?.includes('party_planning');
  const [guests, setGuests] = useState([]);
  const [rsvpLink, setRsvpLink] = useState('');
  const [rsvpLinkCopied, setRsvpLinkCopied] = useState(false);
  useEffect(() => {
    if (!isPartyPlanning || !form.id) return;
    let cancelled = false;
    listGuests(form.id).then((list) => { if (!cancelled) setGuests(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isPartyPlanning, form.id]);

  // Get-or-create — the link is only actually minted server-side the first
  // time someone copies it, not eagerly on page load.
  async function handleCopyRsvpLink() {
    try {
      const link = rsvpLink || await getRsvpLink(form.id);
      if (!rsvpLink) setRsvpLink(link);
      await navigator.clipboard.writeText(link);
      setRsvpLinkCopied(true);
      setTimeout(() => setRsvpLinkCopied(false), 2000);
    } catch (err) {
      showToast(err.message || 'Failed to copy RSVP link', 'error');
    }
  }

  // Event has no bookingId back-reference (only Booking -> convertedEventId
  // -> Event) — reverse-lookup the booking this event came from so the
  // Financials tab can pull its invoices for Revenue. Events created
  // directly (not converted from a booking) simply have no sourceBooking.
  const [sourceBooking, setSourceBooking] = useState(null);
  const sourceBookingId = sourceBooking?.id;
  const [allInvoices, setAllInvoices] = useState([]);
  const [marginBenchmark, setMarginBenchmark] = useState(null);
  useEffect(() => {
    if (!event?.id) { setSourceBooking(null); return; }
    let cancelled = false;
    getBookingByEvent(event.id).then((record) => { if (!cancelled) setSourceBooking(record); }).catch(() => { if (!cancelled) setSourceBooking(null); });
    getDashboard().then((summary) => { if (!cancelled) setMarginBenchmark(summary.financials.avgMargin); }).catch(() => {});
    return () => { cancelled = true; };
  }, [event?.id]);
  useEffect(() => {
    if (!sourceBookingId) { setAllInvoices([]); return; }
    let cancelled = false;
    listInvoices(sourceBookingId).then((list) => { if (!cancelled) setAllInvoices(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, [sourceBookingId]);
  const eventInvoices = useMemo(
    () => (sourceBookingId ? allInvoices.filter((inv) => inv.bookingId === sourceBookingId) : []),
    [allInvoices, sourceBookingId]
  );

  // Vendor email activity folded into the History popup — fetched lazily,
  // only while the modal is actually open, rather than on every page load,
  // since it's several network calls (one per contractor with a thread).
  useEffect(() => {
    if (!historyModalOpen || !event?.id) return;
    let cancelled = false;
    (async () => {
      const summaries = await getThreadSummaries(event.id).catch(() => ({}));
      const contractorIds = Object.keys(summaries).filter((id) => summaries[id]?.hasThread);
      const threads = await Promise.all(contractorIds.map((id) => getThread(event.id, id).catch(() => null)));
      if (cancelled) return;
      const entries = threads.flatMap((thread, i) => {
        if (!thread) return [];
        const c = contractors.find((c) => c.id === contractorIds[i]);
        const name = c ? [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email : 'Contractor';
        return thread.messages.map((m) => ({
          id: `email_${m.id}`,
          at: m.createdAt,
          type: m.direction === 'outbound' ? 'emailed' : 'email-reply',
          contractorName: name,
          subject: m.subject,
        }));
      });
      setEmailHistoryEntries(entries);
    })();
    return () => { cancelled = true; };
  }, [historyModalOpen, event?.id, contractors]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }
  function updateVenue(field, val) {
    setForm((f) => ({ ...f, venue: { ...f.venue, [field]: val } }));
  }

  // Same reasoning as BookingFormPage's selectSavedVenue — picking a saved
  // venue autofills every field it has; typing a non-matching name is just
  // plain text, auto-saved as a new venue once this event itself is saved.
  function selectSavedVenue(venue) {
    setForm((f) => ({
      ...f,
      venue: {
        ...f.venue,
        name: venue.name || '',
        address1: venue.address1 || '',
        address2: venue.address2 || '',
        city: venue.city || '',
        state: venue.state || '',
        zip: venue.zip || '',
        contactName: venue.contactName || '',
        contactPhone: venue.contactPhone || '',
        contactPhoneExt: venue.contactPhoneExt || '',
        contactEmail: venue.contactEmail || '',
        locationNote: venue.locationNote || '',
        loadInInfo: venue.loadInInfo || '',
      },
    }));
  }

  function handleAddType() {
    if (!newTypeLabel.trim()) return;
    addEventType(newTypeLabel);
    update('eventType', newTypeLabel.trim());
    setNewTypeLabel('');
    setAddingType(false);
  }

  const duration = computeDurationHours(form.startTime, form.endTime);
  const prepContractors = getPrepContractors(form, contractors);
  const prepEmailDraft = renderPrepSheetEmail(form, prepContractors, form.requests, undefined, currentUser.businessInfo, currentUser.vertical, contractors);
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

  // Sectioned into Confirmed/Tentative/Not Avail for display — see
  // src/lib/inquiryStatusBucket.js. Each entry still carries its original
  // master-array index, so drag-and-drop within a section keeps working
  // exactly like the single flat list did.
  const entriesByBucket = Object.fromEntries(BUCKETS.map((b) => [b.value, []]));
  visibleEntries.forEach((entry) => {
    const status = inquiryStatuses.find((s) => s.id === entry.booking.inquiryStatusId);
    entriesByBucket[statusBucket(status)].push(entry);
  });
  const availableContractorsForActiveTab = contractorSearchResults
    .filter((c) => !form.contractorBookings.some((booking) => booking.contractorId === c.id))
    .filter((c) => !hasCategories || c.contractorType1 === activeCategoryTab);

  const totalCost = computeEventTotalCost(form);

  // Per-contractor cost breakdown feeding the Financials tab — Not Avail
  // excluded, same reasoning as computeEventTotalCost (they're not actually
  // being booked/paid). Base/overtime split and paid/outstanding come from
  // this one pass so the totals below and the itemized list can't drift
  // apart from each other.
  const contractorCostRows = form.contractorBookings
    .filter((b) => {
      const status = inquiryStatuses.find((s) => s.id === b.inquiryStatusId);
      return statusBucket(status) !== 'unavailable';
    })
    .map((b) => {
      const c = contractors.find((x) => x.id === b.contractorId);
      if (!c) return null;
      const tier = getPricingTier(c, b.pricingTierId);
      const base = getTierPrice(c, b.pricingTierId);
      const overtime = getOvertimeAmount(b, c);
      const isPaid = b.paymentStatus === 'paid';
      return {
        contractorId: b.contractorId,
        name: `${c.firstName} ${c.lastName}`,
        tierName: tier?.name,
        base,
        overtime,
        total: base + overtime,
        isPaid,
        paidAmount: isPaid ? Number(b.paidAmount) || 0 : 0,
      };
    })
    .filter(Boolean);
  const baseCostTotal = contractorCostRows.reduce((sum, r) => sum + r.base, 0);
  const overtimeCostTotal = contractorCostRows.reduce((sum, r) => sum + r.overtime, 0);
  const contractorPaidTotal = contractorCostRows.reduce((sum, r) => sum + r.paidAmount, 0);
  const contractorOutstanding = totalCost - contractorPaidTotal;

  // Party size defaults to 1 when blank (a guest being added mid-edit) so
  // the running totals never dip due to a momentarily-empty input.
  const guestPartySize = (g) => (g.partySize === '' || g.partySize == null ? 1 : Number(g.partySize) || 0);
  const guestStats = guests.reduce((acc, g) => {
    const size = guestPartySize(g);
    acc.invited += size;
    if (g.rsvpStatus === 'confirmed') acc.confirmed += size;
    else if (g.rsvpStatus === 'declined') acc.declined += size;
    else acc.awaiting += size;
    return acc;
  }, { invited: 0, confirmed: 0, declined: 0, awaiting: 0 });

  // Revenue is the full invoiced total (not just what's been collected) so
  // the deal's value shows up as soon as an invoice goes out; "collected"
  // is tracked separately below for cash-in-hand visibility. Draft invoices
  // are excluded — they're still fully editable/deletable and were never
  // actually sent to the client, so counting one here would overstate real
  // revenue with something that isn't a commitment yet. Shown separately
  // (draftTotal) instead of just silently vanishing.
  const revenueTotal = eventInvoices.filter((inv) => inv.status !== 'void' && inv.status !== 'draft').reduce((sum, inv) => sum + (inv.total || 0), 0);
  const draftTotal = eventInvoices.filter((inv) => inv.status === 'draft').reduce((sum, inv) => sum + (inv.total || 0), 0);
  const collectedTotal = eventInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
  // Deposit lives on the sourceBooking (Booking.depositAmount/depositPaid/
  // depositDueDate), not the invoice — a business collects it up front,
  // often before any invoice exists, so it's the one piece of pre-gig cash
  // flow the invoice-driven "collected so far" line above can't show.
  // daysUntilDue: negative once overdue, 0 same-day, positive still ahead —
  // date-only strings parsed at local midnight (same pattern as the
  // eventDate formatting elsewhere on this page) so this doesn't drift a
  // day off around a UTC boundary.
  const depositInfo = sourceBooking?.depositAmount ? {
    amount: Number(sourceBooking.depositAmount) || 0,
    paid: !!sourceBooking.depositPaid,
    dueDate: sourceBooking.depositDueDate,
    daysUntilDue: sourceBooking.depositDueDate
      ? Math.round((new Date(`${sourceBooking.depositDueDate}T00:00:00`) - new Date(new Date().toDateString())) / 86400000)
      : null,
  } : null;
  const depositOverdue = !!depositInfo && !depositInfo.paid && depositInfo.daysUntilDue !== null && depositInfo.daysUntilDue < 0;
  const otherExpensesTotal = (form.otherExpenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  // Same paid/outstanding split contractor costs already have — an "Other
  // Expense" (venue rental, permits, rented equipment) is still a real
  // liability the moment it's logged, but whether it's actually been paid
  // is a separate, worth-tracking fact, same reasoning as contractor pay.
  const otherExpensesPaidTotal = (form.otherExpenses || []).reduce((sum, e) => sum + (e.paid ? Number(e.amount) || 0 : 0), 0);
  const otherExpensesOutstanding = otherExpensesTotal - otherExpensesPaidTotal;
  const netProfit = revenueTotal - totalCost - otherExpensesTotal;
  const profitMargin = revenueTotal > 0 ? (netProfit / revenueTotal) * 100 : null;

  // Account-wide weighted margin across fully costed, invoiced events is
  // supplied by the compact dashboard endpoint. This preserves the useful
  // comparison without downloading every event, booking, and invoice.
  // "Actual" once both sides of the P&L are actually settled, not just
  // planned: every confirmed contractor is paid, nobody's still sitting in
  // Tentative (an undecided contractor means the final lineup — and so the
  // final cost — isn't locked in yet, so the margin is still inherently a
  // projection even if everyone already-confirmed has been paid), and every
  // real invoice (not a still-editable draft, not void) is fully paid.
  // Not Avail doesn't count toward either — excluded from cost entirely,
  // same as computeEventTotalCost. Every logged Other Expense being marked
  // paid is the third leg of the same idea — an unpaid rental/permit is
  // just as much an unsettled liability as an unpaid contractor. Vacuously
  // true with nothing to settle on a side, so "no contractors/expenses yet"
  // doesn't block it — but at least one side needs real activity, or a
  // brand-new empty event would misleadingly show as "Actual" from having
  // nothing to reconcile.
  const confirmedContractorBookings = form.contractorBookings.filter(
    (b) => statusBucket(inquiryStatuses.find((s) => s.id === b.inquiryStatusId)) === 'confirmed'
  );
  const tentativeContractorBookings = form.contractorBookings.filter(
    (b) => statusBucket(inquiryStatuses.find((s) => s.id === b.inquiryStatusId)) === 'tentative'
  );
  const settledInvoices = eventInvoices.filter((inv) => inv.status !== 'void' && inv.status !== 'draft');
  const costsSettled = tentativeContractorBookings.length === 0 && confirmedContractorBookings.every((b) => b.paymentStatus === 'paid');
  const revenueSettled = settledInvoices.every((inv) => inv.status === 'paid');
  const expensesSettled = (form.otherExpenses || []).every((e) => e.paid);
  const hasFinancialActivity = confirmedContractorBookings.length > 0 || tentativeContractorBookings.length > 0
    || settledInvoices.length > 0 || (form.otherExpenses || []).length > 0;
  const isActualFinancials = hasFinancialActivity && costsSettled && revenueSettled && expensesSettled;

  // Writes straight to the booking (not local form state, unlike most of
  // this page) — deposit fields live on sourceBooking, a different record
  // from the event this form is editing, so there's nothing to save here
  // beyond the one field.
  async function handleMarkDepositPaid() {
    if (!sourceBooking) return;
    setMarkingDepositPaid(true);
    try {
      await updateBooking(sourceBooking.id, { depositPaid: true });
      showToast('Deposit marked paid');
    } catch (err) {
      showToast(err.message || 'Failed to mark deposit paid', 'error');
    } finally {
      setMarkingDepositPaid(false);
    }
  }

  function addOtherExpense() {
    setForm((f) => ({ ...f, otherExpenses: [...(f.otherExpenses || []), { id: uid('expense'), name: '', description: '', amount: '' }] }));
  }
  function updateOtherExpense(id, patch) {
    setForm((f) => ({ ...f, otherExpenses: f.otherExpenses.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  }
  function removeOtherExpense(id) {
    setForm((f) => ({ ...f, otherExpenses: f.otherExpenses.filter((e) => e.id !== id) }));
  }

  const payingBooking = form.contractorBookings.find((b) => b.contractorId === payingContractorId);
  const payingContractor = payingBooking ? contractors.find((c) => c.id === payingBooking.contractorId) : null;
  const payingAmountDue = payingBooking && payingContractor ? getBookingTotal(payingBooking, payingContractor) : undefined;
  const payingTier = payingContractor ? getPricingTier(payingContractor, payingBooking?.pricingTierId) : null;
  const payingTierTracksOvertime = Number(payingTier?.includedHours) > 0 && Number(payingTier?.overtimeRate) > 0;
  const payingOvertime = payingTierTracksOvertime ? {
    hours: getOvertimeHours(payingBooking, payingContractor),
    rate: payingTier.overtimeRate,
    baseAmount: getTierPrice(payingContractor, payingBooking.pricingTierId),
  } : undefined;

  function getOrCreateInquiryStatus(label, color, bucket = 'tentative') {
    const existing = inquiryStatuses.find((s) => s.label.toLowerCase() === label.toLowerCase());
    return existing || addInquiryStatus({ label, color, bucket, isConfirmed: bucket === 'confirmed' });
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

  // "+ Add Ensemble" — clones a saved Contractor Group's members onto the
  // roster in one shot, defaulting each to their first (cheapest) pricing
  // tier rather than popping N sequential tier-picker dialogs; tiers are
  // editable per-row afterward same as any other roster entry. Already-added
  // contractors are skipped (no duplicates) and group members who no longer
  // exist (contractor deleted since the group was saved) are silently
  // dropped — same "clone, then independent" contract as Set List Library.
  function addContractorGroupToEvent(group) {
    const addedStatus = getOrCreateInquiryStatus('Added', '#94a3b8');
    setForm((f) => {
      const existingIds = new Set(f.contractorBookings.map((b) => b.contractorId));
      const newBookings = group.contractorIds
        .filter((id) => !existingIds.has(id))
        .map((id) => contractors.find((c) => c.id === id))
        .filter(Boolean)
        .map((c) => ({
          contractorId: c.id,
          inquiryStatusId: addedStatus?.id,
          pricingTierId: getPricingTiers(c)[0]?.id,
          startTime: f.startTime,
          endTime: f.endTime,
        }));
      return { ...f, contractorBookings: [...f.contractorBookings, ...newBookings] };
    });
    setEnsemblePickerOpen(false);
  }

  function changeBookingStatus(contractorId, inquiryStatusId) {
    setForm((f) => ({
      ...f,
      contractorBookings: f.contractorBookings.map((b) => (b.contractorId === contractorId ? { ...b, inquiryStatusId } : b)),
    }));
  }

  // Shared by sendAndMarkEmailed and the manual-contact-log handler below —
  // both want to nudge a contractor's status forward on outreach activity,
  // but only ever out of the 'tentative' bucket. Without this guard, a
  // routine follow-up email or a logged call against an already-Confirmed
  // (or Not Available/Declined) contractor would silently revert them back
  // to a tentative status, destroying that signal.
  function advanceInquiryStatusIfTentative(contractorId, label, color) {
    const currentBooking = form.contractorBookings.find((b) => b.contractorId === contractorId);
    const currentStatus = inquiryStatuses.find((s) => s.id === currentBooking?.inquiryStatusId);
    if (statusBucket(currentStatus) !== 'tentative') return;
    const nextStatus = getOrCreateInquiryStatus(label, color);
    if (nextStatus) changeBookingStatus(contractorId, nextStatus.id);
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

  // null clears the override (back to auto — see lib/pricingTiers.js's
  // getOvertimeHours), any other value (including '0') is a manual one.
  function changeBookingOvertime(contractorId, overtimeHoursOverride) {
    setForm((f) => ({
      ...f,
      contractorBookings: f.contractorBookings.map((b) => (b.contractorId === contractorId ? { ...b, overtimeHoursOverride } : b)),
    }));
  }

  // Manual payment tracking, not a real payout — the business actually pays
  // the contractor outside the app (Zelle, check, cash, etc.) and records
  // it here. Lives on the booking itself, saved through the same autosave
  // as everything else on the event, same reasoning as inquiryStatusId.
  function markContractorPaid(contractorId, payload) {
    setForm((f) => ({
      ...f,
      contractorBookings: f.contractorBookings.map((b) => (b.contractorId === contractorId ? {
        ...b,
        paymentStatus: 'paid',
        paidAmount: payload.amount,
        paidAt: payload.paymentDate,
        paymentMethod: payload.method,
        paymentReference: payload.checkNumber || null,
        paymentMemo: payload.memo || null,
        // Only present when AcceptPaymentModal was given an `overtime` prop
        // (i.e. the tier actually tracks it) — reconciling hours at payment
        // time writes back to the same override ContractorPickerRow's own
        // OT Hours field uses, so both stay in sync.
        ...(payload.overtimeHours !== undefined ? { overtimeHoursOverride: payload.overtimeHours } : {}),
      } : b)),
    }));
  }

  function markContractorUnpaid(contractorId) {
    setForm((f) => ({
      ...f,
      contractorBookings: f.contractorBookings.map((b) => (b.contractorId === contractorId ? {
        ...b, paymentStatus: 'unpaid', paidAmount: null, paidAt: null, paymentMethod: null, paymentReference: null, paymentMemo: null,
      } : b)),
    }));
    showToast('Marked unpaid');
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

  function addShotListItem() {
    setForm((f) => ({ ...f, shotList: [...f.shotList, emptyShotListItem()] }));
  }
  function updateShotListItem(id, patch) {
    setForm((f) => ({ ...f, shotList: f.shotList.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  }
  function removeShotListItem(id) {
    setForm((f) => ({ ...f, shotList: f.shotList.filter((s) => s.id !== id) }));
  }

  function addSecondShooter() {
    setForm((f) => ({ ...f, secondShooters: [...f.secondShooters, emptySecondShooter()] }));
  }
  function updateSecondShooter(id, patch) {
    setForm((f) => ({ ...f, secondShooters: f.secondShooters.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  }
  function removeSecondShooter(id) {
    setForm((f) => ({ ...f, secondShooters: f.secondShooters.filter((s) => s.id !== id) }));
  }

  // Guests are real DB rows (see server/prisma/schema.prisma's Guest model
  // comment for why), not part of the account-data blob like everything
  // else on this form — so these hit the API directly instead of setForm.
  async function handleAddGuest() {
    try {
      const guest = await createGuest(form.id, { name: '', partySize: 1, rsvpStatus: 'invited' });
      setGuests((prev) => [...prev, guest]);
    } catch (err) {
      showToast(err.message || 'Failed to add guest', 'error');
    }
  }
  // Local-only — for onChange responsiveness while typing; the actual save
  // happens on blur (handleCommitGuest) so a keystroke isn't a network call.
  function updateGuestLocal(id, patch) {
    setGuests((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }
  async function handleCommitGuest(id, patch) {
    try {
      const guest = await updateGuest(id, patch);
      setGuests((prev) => prev.map((g) => (g.id === id ? guest : g)));
    } catch (err) {
      showToast(err.message || 'Failed to save guest', 'error');
    }
  }
  async function handleRemoveGuest(id) {
    try {
      await deleteGuest(id);
      setGuests((prev) => prev.filter((g) => g.id !== id));
    } catch (err) {
      showToast(err.message || 'Failed to remove guest', 'error');
    }
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
    advanceInquiryStatusIfTentative(contractor.id, 'Emailed', '#eab308');
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
      await generatePrepSheetPdf(form, prepContractors, form.requests, currentUser.businessInfo, currentUser.vertical, contractors);
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
      const pdfAttachment = await generatePrepSheetPdfAttachment(form, prepContractors, form.requests, currentUser.businessInfo, currentUser.vertical, contractors);
      let successCount = 0;
      for (const contractorId of recipientIds) {
        const contractor = contractors.find((c) => c.id === contractorId);
        if (!contractor?.email) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          await sendThreadedEmail({
            eventId: form.id, contractorId, contractorEmail: contractor.email,
            subject, body, fromName, documentIds: mergedDocumentIds, pdfAttachment,
            inlineImages: prepEmailDraft.inlineImages,
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

  // Returns { patch, promise } — same reasoning as BookingFormPage's
  // persistBooking: `patch` is available synchronously, `promise` is the
  // actual save for callers that need to know whether it succeeded.
  function persistEvent(statusId) {
    const patch = { ...form, eventStatus: statusId };
    const promise = event ? updateEvent(event.id, patch) : addEvent(patch);
    return { patch, promise };
  }

  // Stay on the form after saving in both handlers below — only Back/Cancel
  // or navigating elsewhere in the app should leave it. A brand-new event's
  // `id` was already generated up front in emptyForm() (for document uploads
  // on an unsaved event), so it's known before this save and doubles as the
  // real record's id once persistEvent() creates it — swap the route from
  // /events/new to /events/:id so the form is now in edit mode.
  async function handleSaveDraft() {
    const err = validate();
    if (err) { setError(err); setActiveTab('details'); return; }
    const wasNew = !event;
    const { patch, promise } = persistEvent(draftStatus?.id);
    try {
      await promise;
      showToast('Saved as draft');
      if (wasNew) {
        clearDraft(NEW_EVENT_DRAFT_KEY);
        navigate(`/events/${patch.id}`, { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Failed to save draft.');
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); setActiveTab('details'); return; }
    setSaving(true);
    const wasNew = !event;
    setTimeout(async () => {
      const confirmedStatus = eventStatuses.find((s) => s.label.toLowerCase() === 'confirmed');
      const { patch, promise } = persistEvent(event?.eventStatus || confirmedStatus?.id || draftStatus?.id);
      try {
        await promise;
        showToast(wasNew ? 'Event added' : 'Event updated');
        if (wasNew) {
          clearDraft(NEW_EVENT_DRAFT_KEY);
          navigate(`/events/${patch.id}`, { replace: true });
        }
      } catch (err) {
        setError(err.message || 'Failed to save event.');
      } finally {
        setSaving(false);
      }
    }, 600);
  }

  function handleLeaveWithoutSaving() {
    if (!event) clearDraft(NEW_EVENT_DRAFT_KEY);
    navigate('/events');
  }

  if (isEditing && !event) {
    if (!eventDetailLoaded) {
      return (
        <div className="max-w-2xl mx-auto text-center py-16">
          <span className="inline-block w-6 h-6 rounded-full border-2 border-slate-300 border-t-indigo-600 animate-spin" />
        </div>
      );
    }
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-slate-500 mb-4">This event couldn't be found.</p>
        <button
          type="button"
          onClick={() => navigate('/events')}
          data-testid="event-form-not-found-back-button"
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
        data-testid="event-form-add-contractor-button"
        className="px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-600 text-xs font-semibold hover:bg-indigo-50"
      >
        + Add Contractor
      </button>
      {pickerOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
          <div className="absolute right-0 mt-1 w-72 max-h-64 overflow-y-auto bg-white rounded-lg shadow-lg border border-slate-100 z-20">
            <div className="sticky top-0 bg-white p-2 border-b border-slate-100">
              <input
                autoFocus
                value={contractorQuery}
                onChange={(e) => setContractorQuery(e.target.value)}
                placeholder="Search contractors…"
                data-testid="event-form-contractor-search-input"
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            {contractorSearchLoading && <div className="px-3 py-3 text-xs text-slate-400">Searching…</div>}
            {!contractorSearchLoading && availableContractorsForActiveTab.length === 0 && (
              <div className="px-3 py-3 text-xs text-slate-400">
                {hasCategories ? 'No available contractors in this category.' : 'All contractors already added.'}
              </div>
            )}
            {availableContractorsForActiveTab.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handlePickContractorToAdd(c)}
                data-testid="event-form-add-contractor-option-button"
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
  const addEnsembleButton = (
    <div className="relative">
      <button
        type="button"
        onClick={() => setEnsemblePickerOpen((v) => !v)}
        data-testid="event-form-add-ensemble-button"
        className="px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-600 text-xs font-semibold hover:bg-indigo-50"
      >
        + Add Ensemble
      </button>
      {ensemblePickerOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setEnsemblePickerOpen(false)} />
          <div className="absolute right-0 mt-1 w-72 max-h-64 overflow-y-auto bg-white rounded-lg shadow-lg border border-slate-100 z-20">
            {contractorGroups.length === 0 && (
              <div className="px-3 py-3 text-xs text-slate-400">
                No saved groups yet — add one from the Contractors page.
              </div>
            )}
            {contractorGroups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => addContractorGroupToEvent(g)}
                data-testid="event-form-add-ensemble-option-button"
                className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
              >
                <div className="font-medium text-slate-700">{g.name}</div>
                <div className="text-xs text-slate-400">{g.contractorIds.length} contractor{g.contractorIds.length === 1 ? '' : 's'}</div>
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
            onClick={handleLeaveWithoutSaving}
            data-testid="event-form-back-button"
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100"
            aria-label="Back to Events"
          >
            ←
          </button>
          <h2 className="text-2xl font-bold text-slate-800 truncate">{isEditing ? event.name : 'Add Event'}</h2>
        </div>
        <div className="flex gap-2 shrink-0">
          {isEditing && sourceBooking && (
            <button
              type="button"
              onClick={() => navigate(`/bookings/${sourceBooking.id}`)}
              data-testid="event-form-view-booking-button"
              className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
            >
              View Booking →
            </button>
          )}
          {isEditing && currentUser.activeVerticals?.includes('band_orchestra') && (
            <button
              type="button"
              onClick={() => setStagePlotModalOpen(true)}
              data-testid="event-form-stage-plot-link"
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50"
            >
              Stage Plot
            </button>
          )}
          {isEditing && currentUser.activeVerticals?.includes('band_orchestra') && (
            <Link
              to={`/events/${eventId}/set-lists`}
              data-testid="event-form-set-lists-link"
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50"
            >
              Set Lists
            </Link>
          )}
          {isEditing && currentUser.activeVerticals?.includes('party_planning') && (
            <Link
              to={`/events/${eventId}/floor-plan`}
              data-testid="event-form-floor-plan-link"
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50"
            >
              Floor Plan
            </Link>
          )}
          {isEditing && (
            <button
              type="button"
              onClick={() => setHistoryModalOpen(true)}
              data-testid="event-form-history-button"
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50"
            >
              History
            </button>
          )}
          <button type="button" onClick={handleLeaveWithoutSaving} data-testid="event-form-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button type="button" onClick={handleSaveDraft} data-testid="event-form-save-draft-button" className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Save as Draft
          </button>
          <button
            type="submit"
            form="event-form"
            disabled={saving}
            data-testid="event-form-submit-button"
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
          >
            {saving && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            {isEditing ? 'Save Changes' : 'Add Event'}
          </button>
        </div>
      </div>

      {isEditing && sourceBooking && (
        <div data-testid="event-form-source-booking-banner" className="flex items-center justify-between gap-3 text-sm bg-blue-50 border border-blue-100 text-blue-700 rounded-lg px-3 py-2 mb-6">
          <span>Created from a booking.</span>
          <button
            type="button"
            onClick={() => navigate(`/bookings/${sourceBooking.id}`)}
            data-testid="event-form-source-booking-view-button"
            className="font-semibold hover:underline shrink-0"
          >
            View Booking →
          </button>
        </div>
      )}

      <div className="flex overflow-x-auto border-b border-slate-200 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('details')}
          data-testid="event-form-tab-details"
          className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${
            activeTab === 'details' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('contractors')}
          data-testid="event-form-tab-contractors"
          className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px flex items-center gap-2 ${
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
        {isPartyPlanning && (
          <button
            type="button"
            onClick={() => setActiveTab('guests')}
            data-testid="event-form-tab-guests"
            className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px flex items-center gap-2 ${
              activeTab === 'guests' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Guests
            {guests.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                {guests.length}
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('prep')}
          data-testid="event-form-tab-prep"
          className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${
            activeTab === 'prep' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Prep
        </button>
        {isAdminOrOwner && (
          <button
            type="button"
            onClick={() => setActiveTab('financials')}
            data-testid="event-form-tab-financials"
            className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${
              activeTab === 'financials' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Financials
          </button>
        )}
      </div>

      {error && <div data-testid="event-form-error-banner" className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

      <form id="event-form" onSubmit={handleSubmit} className="space-y-6">
        <div className={activeTab === 'details' ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : 'hidden'}>
          <div className={cardClass}>
            <h3 className={cardTitleClass}>Event Details</h3>
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Event Name *</label>
                <input required value={form.name} onChange={(e) => update('name', e.target.value)} data-testid="event-form-name-input" className={inputClass} />
              </div>

              <div>
                <label className={labelClass}>Client</label>
                <ClientCombobox value={form.clientId} onChange={(id) => update('clientId', id)} testId="event-form-client-combobox" />
              </div>

              {isWedding(form.eventType) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Bride's Name</label>
                    <input value={form.brideName} onChange={(e) => update('brideName', e.target.value)} data-testid="event-form-bridename-input" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Groom's Name</label>
                    <input value={form.groomName} onChange={(e) => update('groomName', e.target.value)} data-testid="event-form-groomname-input" className={inputClass} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Event Type *</label>
                  {!addingType ? (
                    <div className="flex gap-2">
                      <select
                        required
                        value={form.eventType}
                        onChange={(e) => {
                          const nextType = e.target.value;
                          setForm((f) => ({ ...f, eventType: nextType, ...(isWedding(nextType) ? {} : { brideName: '', groomName: '' }) }));
                        }}
                        data-testid="event-form-event-type-select"
                        className={inputClass}
                      >
                        <option value="">Select a type…</option>
                        {eventTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button type="button" onClick={() => setAddingType(true)} data-testid="event-form-add-event-type-button" className="shrink-0 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50">+ Add</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input autoFocus value={newTypeLabel} onChange={(e) => setNewTypeLabel(e.target.value)} placeholder="New event type" data-testid="event-form-new-event-type-input" className={inputClass} />
                      <button type="button" onClick={handleAddType} data-testid="event-form-save-event-type-button" className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Save</button>
                      <button type="button" onClick={() => setAddingType(false)} data-testid="event-form-cancel-event-type-button" className="shrink-0 px-3 py-2 rounded-lg text-slate-500 text-sm">Cancel</button>
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
                      data-testid="event-form-event-date-input"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className={labelClass}>Expected Guest Count</label>
                <input
                  type="number"
                  min="0"
                  value={form.guestCount}
                  onChange={(e) => update('guestCount', e.target.value)}
                  data-testid="event-form-guest-count-input"
                  className={`${inputClass} max-w-[10rem]`}
                />
              </div>

              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={form.noOutsideContractorsNeeded}
                  onChange={(e) => update('noOutsideContractorsNeeded', e.target.checked)}
                  data-testid="event-form-no-outside-contractors-checkbox"
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-700">No outside contractors needed</span>
                  <span className="block text-xs text-slate-500 mt-0.5">Use this when the owner performs the event or external staffing genuinely costs $0.</span>
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelClass}>Contact Phone</label>
                    <input type="tel" value={form.contactPhone} onChange={(e) => update('contactPhone', formatPhoneNumber(e.target.value))} data-testid="event-form-contact-phone-input" className={inputClass} />
                  </div>
                  <div className="w-20">
                    <label className={labelClass}>Ext.</label>
                    <input value={form.contactPhoneExt} onChange={(e) => update('contactPhoneExt', e.target.value)} data-testid="event-form-contact-phone-ext-input" className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Contact Email</label>
                  <input type="email" value={form.contactEmail} onChange={(e) => update('contactEmail', e.target.value)} data-testid="event-form-contact-email-input" className={inputClass} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
                <div>
                  <label className={labelClass}>Event Start Time</label>
                  <input type="time" value={form.startTime} onChange={(e) => update('startTime', e.target.value)} data-testid="event-form-start-time-input" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Event End Time</label>
                  <input type="time" value={form.endTime} onChange={(e) => update('endTime', e.target.value)} data-testid="event-form-end-time-input" className={inputClass} />
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
                      data-testid="event-form-delete-event-note-button"
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
                  data-testid="event-form-event-note-textarea"
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
                <VenueCombobox
                  venues={venues}
                  value={form.venue.name}
                  onChangeName={(name) => updateVenue('name', name)}
                  onSelectVenue={selectSavedVenue}
                  testId="event-form-venue-name-input"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Address 1</label>
                  <input value={form.venue.address1} onChange={(e) => updateVenue('address1', e.target.value)} data-testid="event-form-venue-address1-input" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Address 2</label>
                  <input value={form.venue.address2} onChange={(e) => updateVenue('address2', e.target.value)} data-testid="event-form-venue-address2-input" className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Venue Contact</label>
                  <input value={form.venue.contactName} onChange={(e) => updateVenue('contactName', e.target.value)} data-testid="event-form-venue-contactname-input" className={inputClass} />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelClass}>Venue Contact Phone</label>
                    <input type="tel" value={form.venue.contactPhone} onChange={(e) => updateVenue('contactPhone', formatPhoneNumber(e.target.value))} data-testid="event-form-venue-contactphone-input" className={inputClass} />
                  </div>
                  <div className="w-20">
                    <label className={labelClass}>Ext.</label>
                    <input value={form.venue.contactPhoneExt} onChange={(e) => updateVenue('contactPhoneExt', e.target.value)} data-testid="event-form-venue-contactphoneext-input" className={inputClass} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Venue Contact Email</label>
                  <input type="email" value={form.venue.contactEmail} onChange={(e) => updateVenue('contactEmail', e.target.value)} data-testid="event-form-venue-contactemail-input" className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>City</label>
                  <input value={form.venue.city} onChange={(e) => updateVenue('city', e.target.value)} data-testid="event-form-venue-city-input" className={inputClass} />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelClass}>State</label>
                    <input value={form.venue.state} onChange={(e) => updateVenue('state', e.target.value)} data-testid="event-form-venue-state-input" className={inputClass} />
                  </div>
                  <div className="w-24">
                    <label className={labelClass}>Zip</label>
                    <input value={form.venue.zip} onChange={(e) => updateVenue('zip', e.target.value)} data-testid="event-form-venue-zip-input" className={inputClass} />
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
                      data-testid="event-form-delete-location-note-button"
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
                  data-testid="event-form-location-note-textarea"
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
                      data-testid="event-form-delete-load-in-info-button"
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
                  data-testid="event-form-load-in-info-textarea"
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
              data-testid="event-form-add-schedule-line-button"
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
                // flex-wrap + full-width-on-mobile inputs — the fixed w-32/
                // w-48 widths below add up to more than a phone viewport on
                // their own; wrapping lets time/name/details stack instead
                // of overflowing the page horizontally.
                <div key={item.id} data-testid="event-form-schedule-item-row" className="flex flex-wrap items-start gap-2">
                  <input
                    type="time"
                    value={item.time}
                    onChange={(e) => updateScheduleItem(item.id, { time: e.target.value })}
                    data-testid="event-form-schedule-item-time-input"
                    className="w-full sm:w-32 sm:shrink-0 px-2.5 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                  <input
                    value={item.name}
                    onChange={(e) => updateScheduleItem(item.id, { name: e.target.value })}
                    placeholder="e.g. Ceremony"
                    data-testid="event-form-schedule-item-name-input"
                    className="w-full sm:w-48 sm:shrink-0 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                  <input
                    value={item.details}
                    onChange={(e) => updateScheduleItem(item.id, { details: e.target.value })}
                    placeholder="Details…"
                    data-testid="event-form-schedule-item-details-input"
                    className="flex-1 min-w-[10rem] px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                  <button
                    type="button"
                    onClick={() => removeScheduleItem(item.id)}
                    data-testid="event-form-schedule-item-remove-button"
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
            {!showBulkRow && canAddContractor && (
              <div className="flex items-center gap-2">
                {addContractorButton}
                {addEnsembleButton}
              </div>
            )}
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
            // flex-wrap so the functional controls (select + button) never
            // overflow on mobile; the aria-hidden spacers only exist to
            // align this row's controls with ContractorPickerRow's columns
            // above, which is meaningless once that row wraps on mobile too
            // — hidden below sm rather than reserving dead space there.
            <div className="flex flex-wrap items-center gap-3 px-3 pb-2">
              <span className="hidden sm:inline cursor-grab text-slate-300 select-none invisible" aria-hidden="true">⠿</span>
              <div className="flex-1 min-w-0 text-xs font-semibold text-slate-500">Bulk send</div>
              <div className="hidden sm:block shrink-0 w-12" aria-hidden="true" />
              <select
                value={bulkTemplateId}
                onChange={(e) => setBulkTemplateId(e.target.value)}
                data-testid="event-form-bulk-template-select"
                className="shrink-0 w-36 px-2 py-1.5 rounded-lg border border-slate-300 text-xs"
              >
                <option value="">Select template…</option>
                {emailTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button
                type="button"
                onClick={openBulkPreview}
                disabled={!bulkTemplateId}
                data-testid="event-form-bulk-send-button"
                className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                Send to All
              </button>
              <div className="hidden sm:block shrink-0 ml-3 w-32" aria-hidden="true" />
              <div className="hidden sm:block w-20 shrink-0" aria-hidden="true" />
              <div className="hidden sm:block shrink-0 w-6" aria-hidden="true" />
              {canAddContractor && addContractorButton}
              {canAddContractor && addEnsembleButton}
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
            <div className="space-y-5">
              {BUCKETS.map((b) => {
                const entries = entriesByBucket[b.value];
                if (entries.length === 0) return null;
                const sectionTotal = b.value === 'unavailable' ? undefined : entries.reduce((sum, { booking: bk }) => {
                  const c = contractors.find((x) => x.id === bk.contractorId);
                  return sum + (c ? getBookingTotal(bk, c) : 0);
                }, 0);
                const sectionPaid = b.value !== 'confirmed' ? 0 : entries.reduce((sum, { booking: bk }) => (
                  bk.paymentStatus === 'paid' ? sum + (Number(bk.paidAmount) || 0) : sum
                ), 0);
                return (
                  <ContractorBucketSection key={b.value} label={b.label} count={entries.length} total={sectionTotal} paid={sectionPaid} defaultOpen>
                    <div className="space-y-3">
                      {entries.map(({ booking: bk, index: i }) => (
                        <ContractorPickerRow
                          key={bk.contractorId}
                          booking={bk}
                          index={i}
                          contractor={contractors.find((c) => c.id === bk.contractorId)}
                          inquiryStatuses={inquiryStatuses}
                          emailTemplates={emailTemplates}
                          threadSummary={threadSummaries[bk.contractorId]}
                          onStatusChange={changeBookingStatus}
                          onTierChange={changeBookingTier}
                          onTimeChange={changeBookingTime}
                          onOvertimeChange={changeBookingOvertime}
                          onRemove={removeContractorFromEvent}
                          onRequestSend={handleRequestSend}
                          onOpenContractor={setEditingContractor}
                          onOpenThread={setOpenThreadContractorId}
                          onPayClick={setPayingContractorId}
                          onMarkUnpaid={markContractorUnpaid}
                          onDragStart={(idx) => { dragIndex.current = idx; }}
                          onDragOver={(idx) => setDragOverIndex(idx)}
                          onDrop={handleDrop}
                          isDragging={dragOverIndex === i && dragIndex.current !== i}
                        />
                      ))}
                    </div>
                  </ContractorBucketSection>
                );
              })}
            </div>
          )}

          {form.contractorBookings.length > 0 && (
            <div className="flex justify-end mt-3 text-sm font-bold text-slate-800">
              Total: {currency(totalCost)}
            </div>
          )}
        </div>

        <div className={activeTab === 'guests' ? cardClass : 'hidden'}>
          <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
            <h3 className={`${cardTitleClass} mb-0`}>Guest List</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyRsvpLink}
                data-testid="event-form-copy-rsvp-link-button"
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                {rsvpLinkCopied ? 'Link Copied!' : 'Copy RSVP Link'}
              </button>
              <button type="button" onClick={handleAddGuest} data-testid="event-form-add-guest-button" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">+ Add Guest</button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Invited</div>
              <div className="text-lg font-bold text-slate-800" data-testid="event-form-guest-stat-invited">{guestStats.invited}</div>
            </div>
            <div className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Confirmed</div>
              <div className="text-lg font-bold text-emerald-600" data-testid="event-form-guest-stat-confirmed">{guestStats.confirmed}</div>
            </div>
            <div className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Declined</div>
              <div className="text-lg font-bold text-red-600" data-testid="event-form-guest-stat-declined">{guestStats.declined}</div>
            </div>
            <div className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Awaiting Response</div>
              <div className="text-lg font-bold text-amber-600" data-testid="event-form-guest-stat-awaiting">{guestStats.awaiting}</div>
            </div>
          </div>

          {form.guestCount !== '' && (
            <div className="text-xs text-slate-500 mb-4">
              {guestStats.confirmed} of {form.guestCount} expected guests confirmed so far.
            </div>
          )}

          {guests.length === 0 ? (
            <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
              No guests added yet. Add one below, or share the RSVP link above.
            </div>
          ) : (
            <div className="space-y-2">
              {guests.map((g) => (
                <div key={g.id} data-testid="event-form-guest-row" className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_7rem] gap-2">
                    <input
                      placeholder="Guest name"
                      value={g.name}
                      onChange={(e) => updateGuestLocal(g.id, { name: e.target.value })}
                      onBlur={() => handleCommitGuest(g.id, { name: g.name })}
                      data-testid="event-form-guest-name-input"
                      className={inputClass}
                    />
                    <input
                      type="number"
                      min="1"
                      title="Party size, including this guest"
                      placeholder="Party size"
                      value={g.partySize}
                      onChange={(e) => updateGuestLocal(g.id, { partySize: e.target.value === '' ? '' : Number(e.target.value) })}
                      onBlur={() => handleCommitGuest(g.id, { partySize: g.partySize })}
                      data-testid="event-form-guest-partysize-input"
                      className={inputClass}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="email"
                      placeholder="Email (optional)"
                      value={g.email || ''}
                      onChange={(e) => updateGuestLocal(g.id, { email: e.target.value })}
                      onBlur={() => handleCommitGuest(g.id, { email: g.email })}
                      data-testid="event-form-guest-email-input"
                      className={inputClass}
                    />
                    <input
                      type="tel"
                      placeholder="Phone (optional)"
                      value={g.phone || ''}
                      onChange={(e) => updateGuestLocal(g.id, { phone: formatPhoneNumber(e.target.value) })}
                      onBlur={() => handleCommitGuest(g.id, { phone: g.phone })}
                      data-testid="event-form-guest-phone-input"
                      className={inputClass}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      {RSVP_STATUSES.map((s) => {
                        const active = (g.rsvpStatus || 'invited') === s.value;
                        return (
                          <button
                            key={s.value}
                            type="button"
                            onClick={() => { updateGuestLocal(g.id, { rsvpStatus: s.value }); handleCommitGuest(g.id, { rsvpStatus: s.value }); }}
                            data-testid={`event-form-guest-rsvp-${s.value}-button`}
                            className="px-2 py-1 rounded-lg border text-xs font-semibold border-slate-300 text-slate-500 hover:bg-slate-50"
                            style={active ? { color: s.color, borderColor: `${s.color}55`, backgroundColor: `${s.color}11` } : undefined}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                      {g.source === 'rsvp_link' && (
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide ml-1">via RSVP link</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveGuest(g.id)}
                      data-testid="event-form-guest-remove-button"
                      className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                      aria-label="Remove guest"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    placeholder="Notes (e.g. dietary restrictions, plus-one name)"
                    value={g.notes || ''}
                    onChange={(e) => updateGuestLocal(g.id, { notes: e.target.value })}
                    onBlur={() => handleCommitGuest(g.id, { notes: g.notes })}
                    data-testid="event-form-guest-notes-input"
                    className={inputClass}
                  />
                </div>
              ))}
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
                data-testid="event-form-download-prep-pdf-button"
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50"
              >
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => setPrepEmailModalOpen(true)}
                disabled={prepContractors.length === 0}
                data-testid="event-form-email-prep-sheet-button"
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
              <PrepSection title={currentUser.vertical === 'photography' ? 'Timeline' : 'Schedule'} color="#0d9488" icon={<ClockIcon className="w-3.5 h-3.5" />}>
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
                      <span className="w-32 shrink-0 text-slate-500">{c.phone || '—'}</span>
                      <span className="text-slate-500">{formatEventTime(c.startTime) || '—'} – {formatEventTime(c.endTime) || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </PrepSection>
          </div>

          <div className="mb-4">
            <PrepSection
              title={requestsLabels(currentUser.vertical).title}
              color="#d97706"
              icon={<ClipboardIcon className="w-3.5 h-3.5" />}
              action={(
                <button type="button" onClick={addRequestItem} data-testid="event-form-add-request-button" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                  {requestsLabels(currentUser.vertical).addLabel}
                </button>
              )}
            >
              {form.requests.length === 0 ? (
                <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
                  {requestsLabels(currentUser.vertical).emptyLabel}
                </div>
              ) : (
                <div className="space-y-3">
                  {form.requests.map((r) => (
                    <div key={r.id} data-testid="event-form-request-item-row" className="border border-slate-200 rounded-lg p-3 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          placeholder="Name"
                          value={r.name}
                          onChange={(e) => updateRequestItem(r.id, { name: e.target.value })}
                          data-testid="event-form-request-item-name-input"
                          className={inputClass}
                        />
                        <input
                          placeholder="Link (optional)"
                          value={r.link}
                          onChange={(e) => updateRequestItem(r.id, { link: e.target.value })}
                          data-testid="event-form-request-item-link-input"
                          className={inputClass}
                        />
                      </div>
                      <textarea
                        rows={2}
                        placeholder="Request details…"
                        value={r.details}
                        onChange={(e) => updateRequestItem(r.id, { details: e.target.value })}
                        data-testid="event-form-request-item-details-textarea"
                        className={inputClass}
                      />
                      <div className="flex items-center justify-between">
                        {r.documentId ? (
                          <a
                            href={documentDownloadUrl(r.documentId)}
                            target="_blank"
                            rel="noreferrer"
                            data-testid="event-form-request-item-document-link"
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
                              data-testid="event-form-request-item-attach-document-input"
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => removeRequestItem(r.id)}
                            data-testid="event-form-request-item-remove-button"
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

          {currentUser.vertical === 'photography' && (
            <div className="mb-4">
              <PrepSection
                title="Shot List"
                color="#0891b2"
                icon={<ClipboardIcon className="w-3.5 h-3.5" />}
                action={(
                  <button type="button" onClick={addShotListItem} data-testid="event-form-add-shot-button" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                    + Add Shot
                  </button>
                )}
              >
                {form.shotList.length === 0 ? (
                  <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
                    No shots added yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {form.shotList.map((s) => (
                      <div key={s.id} data-testid="event-form-shot-item-row" className="border border-slate-200 rounded-lg p-3 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            placeholder="Shot (e.g. Bride with parents)"
                            value={s.label}
                            onChange={(e) => updateShotListItem(s.id, { label: e.target.value })}
                            data-testid="event-form-shot-item-label-input"
                            className={inputClass}
                          />
                          <select
                            value={s.category}
                            onChange={(e) => updateShotListItem(s.id, { category: e.target.value })}
                            data-testid="event-form-shot-item-category-select"
                            className={inputClass}
                          >
                            {SHOT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                            <input
                              type="checkbox"
                              checked={s.mustHave}
                              onChange={(e) => updateShotListItem(s.id, { mustHave: e.target.checked })}
                              data-testid="event-form-shot-item-musthave-checkbox"
                            />
                            Must-have
                          </label>
                          <button
                            type="button"
                            onClick={() => removeShotListItem(s.id)}
                            data-testid="event-form-shot-item-remove-button"
                            className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                            aria-label="Remove shot"
                          >
                            ✕
                          </button>
                        </div>
                        <input
                          placeholder="Notes (optional)"
                          value={s.notes}
                          onChange={(e) => updateShotListItem(s.id, { notes: e.target.value })}
                          data-testid="event-form-shot-item-notes-input"
                          className={inputClass}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </PrepSection>
            </div>
          )}

          {currentUser.vertical === 'photography' && (
            <div className="mb-4">
              <PrepSection
                title="Second Shooters"
                color="#be185d"
                icon={<UsersIcon className="w-3.5 h-3.5" />}
                action={(
                  <button type="button" onClick={addSecondShooter} data-testid="event-form-add-second-shooter-button" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                    + Add
                  </button>
                )}
              >
                {form.secondShooters.length === 0 ? (
                  <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
                    No second shooters or additional roles assigned yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {form.secondShooters.map((s) => (
                      <div key={s.id} data-testid="event-form-second-shooter-row" className="border border-slate-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-start">
                        <select
                          value={s.contractorId}
                          onChange={(e) => updateSecondShooter(s.id, { contractorId: e.target.value })}
                          data-testid="event-form-second-shooter-contractor-select"
                          className={inputClass}
                        >
                          <option value="">Select contractor…</option>
                          {contractors.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                        </select>
                        <input
                          placeholder="Role (e.g. Second Shooter)"
                          value={s.role}
                          onChange={(e) => updateSecondShooter(s.id, { role: e.target.value })}
                          data-testid="event-form-second-shooter-role-input"
                          className={inputClass}
                        />
                        <div className="flex items-center gap-2">
                          <input
                            placeholder="Notes (optional)"
                            value={s.notes}
                            onChange={(e) => updateSecondShooter(s.id, { notes: e.target.value })}
                            data-testid="event-form-second-shooter-notes-input"
                            className={`${inputClass} flex-1`}
                          />
                          <button
                            type="button"
                            onClick={() => removeSecondShooter(s.id)}
                            data-testid="event-form-second-shooter-remove-button"
                            className="w-6 h-6 shrink-0 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                            aria-label="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </PrepSection>
            </div>
          )}

          <div className="mb-4">
            <PrepSection title="Notes" color="#e11d48" icon={<NoteIcon className="w-3.5 h-3.5" />}>
              <textarea
                rows={3}
                placeholder="Notes for the crew or day-of prep…"
                value={form.prepNotes}
                onChange={(e) => update('prepNotes', e.target.value)}
                data-testid="event-form-prep-notes-textarea"
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
                <input type="file" onChange={handleUploadDocument} disabled={uploadingDocument} data-testid="event-form-upload-document-input" className="hidden" />
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
                  <div key={d.id} data-testid="event-form-document-row" className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-200 text-sm">
                    <a href={documentDownloadUrl(d.id)} target="_blank" rel="noreferrer" data-testid="event-form-document-download-link" className="flex-1 min-w-0 truncate text-indigo-600 hover:underline">
                      {d.filename}
                    </a>
                    <span className="text-xs text-slate-400 shrink-0">{(d.size / 1024).toFixed(0)} KB</span>
                    <button
                      type="button"
                      onClick={() => setDocPendingDelete(d)}
                      data-testid="event-form-document-remove-button"
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

        {isAdminOrOwner && (
          <div className={activeTab === 'financials' ? cardClass : 'hidden'}>
            <h3 className={cardTitleClass}>Profit &amp; Loss</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Revenue</div>
                {sourceBooking ? (
                  <>
                    <div className="text-xl font-bold text-slate-800" data-testid="event-form-financials-revenue">{currency(revenueTotal)}</div>
                    <div className="text-xs text-slate-400 mt-1">{currency(collectedTotal)} collected so far</div>
                    {draftTotal > 0 && (
                      <div data-testid="event-form-financials-draft-total" className="text-xs text-slate-400 mt-1">
                        {currency(draftTotal)} in draft (not yet sent)
                      </div>
                    )}
                    {depositInfo && (
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <span
                          data-testid="event-form-financials-deposit"
                          className={`text-xs font-medium ${depositInfo.paid ? 'text-emerald-600' : depositOverdue ? 'text-red-600' : 'text-amber-600'}`}
                        >
                          {currency(depositInfo.amount)} deposit —{' '}
                          {depositInfo.paid
                            ? 'paid'
                            : depositOverdue
                            ? `${Math.abs(depositInfo.daysUntilDue)} day${Math.abs(depositInfo.daysUntilDue) === 1 ? '' : 's'} overdue`
                            : depositInfo.daysUntilDue === 0
                            ? 'due today'
                            : depositInfo.daysUntilDue !== null
                            ? `due in ${depositInfo.daysUntilDue} day${depositInfo.daysUntilDue === 1 ? '' : 's'} (${formatEventDate(depositInfo.dueDate)})`
                            : 'due'}
                        </span>
                        {!depositInfo.paid && (
                          <button
                            type="button"
                            onClick={handleMarkDepositPaid}
                            disabled={markingDepositPaid}
                            data-testid="event-form-financials-mark-deposit-paid-button"
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                          >
                            {markingDepositPaid ? 'Saving…' : 'Mark Paid'}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-slate-400 mt-1">No linked invoices</div>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Contractor Costs</div>
                <div className="text-xl font-bold text-slate-800" data-testid="event-form-financials-contractor-costs">{currency(totalCost)}</div>
                {overtimeCostTotal > 0 && (
                  <div className="text-xs text-slate-400 mt-1" data-testid="event-form-financials-cost-breakdown">
                    {currency(baseCostTotal)} base + {currency(overtimeCostTotal)} overtime
                  </div>
                )}
                {totalCost > 0 && (
                  <div className="text-xs text-slate-400 mt-1" data-testid="event-form-financials-contractor-paid">
                    {currency(contractorPaidTotal)} paid · {currency(contractorOutstanding)} outstanding
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Other Expenses</div>
                <div className="text-xl font-bold text-slate-800" data-testid="event-form-financials-other-expenses">{currency(otherExpensesTotal)}</div>
                {otherExpensesTotal > 0 && (
                  <div className="text-xs text-slate-400 mt-1" data-testid="event-form-financials-other-expenses-paid">
                    {currency(otherExpensesPaidTotal)} paid · {currency(otherExpensesOutstanding)} outstanding
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-700">Net Profit</span>
                  <span
                    data-testid="event-form-financials-settlement-badge"
                    title={isActualFinancials ? 'Every contractor is resolved (Confirmed & paid, or Not Avail), every invoice is paid, and every expense is marked paid — this is realized, not estimated.' : 'Based on tier prices and invoiced amounts — will shift until every contractor is resolved (none left Tentative) and paid, every invoice settles, and every expense is marked paid.'}
                    className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${isActualFinancials ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                  >
                    {isActualFinancials ? 'Actual' : 'Projected'}
                  </span>
                </div>
                <span
                  data-testid="event-form-financials-net-profit"
                  className={`text-2xl font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                >
                  {currency(netProfit)}
                  {profitMargin !== null && <span className="text-sm font-semibold text-slate-400 ml-2">({profitMargin.toFixed(1)}% margin)</span>}
                </span>
              </div>
              {profitMargin !== null && marginBenchmark !== null && (
                <div data-testid="event-form-financials-benchmark" className="text-xs text-slate-400 mt-2 text-right">
                  Your average across other gigs:{' '}
                  <span className={`font-semibold ${profitMargin >= marginBenchmark ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {marginBenchmark.toFixed(1)}%
                  </span>
                  {' '}({profitMargin >= marginBenchmark ? 'above' : 'below'} average)
                </div>
              )}
            </div>

            {eventInvoices.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-bold text-slate-700 mb-3">Invoice Breakdown</h4>
                <div className="space-y-1.5">
                  {[...eventInvoices].sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity)).map((inv) => (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => navigate(`/bookings/${inv.bookingId}`)}
                      data-testid="event-form-financials-invoice-row"
                      className="w-full flex items-center justify-between gap-3 text-sm px-3 py-2 rounded-lg border border-slate-100 bg-slate-50/60 hover:bg-slate-100/60 text-left"
                    >
                      <div className="min-w-0 truncate">
                        <span className="font-medium text-slate-700">{inv.recipientName || `Invoice #${inv.number ?? '—'}`}</span>
                        {inv.dueDate && <span className="text-xs text-slate-400 ml-1.5">Due {formatEventDate(inv.dueDate.slice(0, 10))}</span>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-slate-500">
                          {currency(inv.total)}
                          {inv.status === 'partial' && ` (${currency(inv.paidAmount)} paid)`}
                        </span>
                        <span
                          data-testid="event-form-financials-invoice-row-status"
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${INVOICE_STATUS_STYLES[inv.status] || 'bg-slate-100 text-slate-500'}`}
                        >
                          {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {contractorCostRows.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-bold text-slate-700 mb-3">Contractor Breakdown</h4>
                <div className="space-y-1.5">
                  {contractorCostRows.map((r) => (
                    <div
                      key={r.contractorId}
                      data-testid="event-form-financials-contractor-row"
                      className="flex items-center justify-between gap-3 text-sm px-3 py-2 rounded-lg border border-slate-100 bg-slate-50/60"
                    >
                      <div className="min-w-0 truncate">
                        <span className="font-medium text-slate-700">{r.name}</span>
                        {r.tierName && <span className="text-xs text-slate-400 ml-1.5">{r.tierName}</span>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-slate-500">
                          {currency(r.base)}{r.overtime > 0 ? ` + ${currency(r.overtime)} OT` : ''}
                        </span>
                        <span
                          data-testid="event-form-financials-contractor-row-status"
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                        >
                          {r.isPaid ? 'Paid' : 'Unpaid'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-700">Other Expenses</h4>
              <button
                type="button"
                onClick={addOtherExpense}
                data-testid="event-form-add-expense-button"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                + Add Expense
              </button>
            </div>
            {(form.otherExpenses || []).length === 0 ? (
              <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
                No other expenses logged yet.
              </div>
            ) : (
              <div className="space-y-2">
                {form.otherExpenses.map((exp) => (
                  <div key={exp.id} data-testid="event-form-expense-row" className="border border-slate-200 rounded-lg p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        // exp.label is a fallback read for expenses saved
                        // before this field was split into name/description —
                        // never written to going forward.
                        value={exp.name ?? exp.label ?? ''}
                        onChange={(e) => updateOtherExpense(exp.id, { name: e.target.value })}
                        placeholder="Name (e.g. Venue rental)"
                        data-testid="event-form-expense-name-input"
                        className={`flex-1 font-medium ${inputClass}`}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={exp.amount}
                        onChange={(e) => updateOtherExpense(exp.id, { amount: e.target.value })}
                        placeholder="0.00"
                        data-testid="event-form-expense-amount-input"
                        // max-w- not w-32: inputClass bakes in w-full, and a
                        // plain width utility loses that cascade fight (its
                        // width:100% becomes this item's flex-basis since
                        // it has no explicit flex-* of its own, ballooning
                        // it and starving the sibling name input — same
                        // fix already used by guestCount's max-w-[10rem]).
                        className={`max-w-[8rem] ${inputClass}`}
                      />
                      <label className="shrink-0 flex items-center gap-1.5 text-xs text-slate-500">
                        <input
                          type="checkbox"
                          checked={!!exp.paid}
                          onChange={(e) => updateOtherExpense(exp.id, { paid: e.target.checked })}
                          data-testid="event-form-expense-paid-checkbox"
                        />
                        Paid
                      </label>
                      <button
                        type="button"
                        onClick={() => removeOtherExpense(exp.id)}
                        data-testid="event-form-expense-remove-button"
                        className="shrink-0 w-9 h-9 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                        aria-label="Remove expense"
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      value={exp.description || ''}
                      onChange={(e) => updateOtherExpense(exp.id, { description: e.target.value })}
                      placeholder="Description (optional) — e.g. deposit for grand ballroom, includes setup/teardown"
                      data-testid="event-form-expense-description-input"
                      className={`w-full text-xs ${inputClass}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </form>

      <ContractorModal
        open={!!editingContractor}
        onClose={() => setEditingContractor(null)}
        contractor={editingContractor}
      />

      <HistoryModal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        title="Event History"
        entries={[...(event?.history || []), ...emailHistoryEntries]}
      />

      <Modal
        open={stagePlotModalOpen}
        onClose={() => setStagePlotModalOpen(false)}
        title={`Stage Plot${event?.name ? ` — ${event.name}` : ''}`}
        widthClass="max-w-[1650px]"
        bodyClassName="px-6 py-5 max-h-[85vh] overflow-y-auto"
      >
        {stagePlotModalOpen && (
          <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Loading stage plot editor…</div>}>
            <StagePlotEditorPage onClose={() => setStagePlotModalOpen(false)} />
          </Suspense>
        )}
      </Modal>

      <AcceptPaymentModal
        open={!!payingContractorId}
        title={`Pay ${payingContractor ? `${payingContractor.firstName} ${payingContractor.lastName}` : 'Contractor'}`}
        amountDue={payingAmountDue}
        amountLabel="Rate"
        overtime={payingOvertime}
        initialValues={payingBooking?.paymentStatus === 'paid' ? {
          amount: payingBooking.paidAmount,
          paymentDate: payingBooking.paidAt,
          method: payingBooking.paymentMethod,
          checkNumber: payingBooking.paymentReference,
          memo: payingBooking.paymentMemo,
        } : undefined}
        onClose={() => setPayingContractorId(null)}
        onAccept={async (payload) => {
          markContractorPaid(payingContractorId, payload);
          showToast('Payment recorded');
        }}
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
              data-testid="event-form-tier-picker-option-button"
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
        onOutreachSent={(kind) => {
          if (!openThreadContractorId) return;
          if (kind === 'email') advanceInquiryStatusIfTentative(openThreadContractorId, 'Emailed', '#eab308');
          else advanceInquiryStatusIfTentative(openThreadContractorId, 'Called', '#eab308');
        }}
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
