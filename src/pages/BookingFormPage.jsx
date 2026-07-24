import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ClientModal from '../components/ClientModal';
import InvoiceDocument from '../components/InvoiceDocument';
import AcceptPaymentModal from '../components/AcceptPaymentModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { uid } from '../lib/storage';
import { listBookingDocuments, uploadBookingDocument, deleteBookingDocument, bookingDocumentDownloadUrl } from '../lib/bookingDocuments';
import { generateProposalPdf, generateProposalPdfAttachment } from '../lib/proposalPdf';
import { getContractForBooking, sendContract, ownerSignContract, updateContractTerms } from '../lib/contracts';
import { listInvoices, createInvoice, updateInvoice, sendInvoice, markInvoicePayment, sendReceipt, voidInvoice, getNextInvoiceInfo } from '../lib/invoices';
import { generateContractPdf, getContractPdfDataUrl } from '../lib/contractPdf';
import { sendEmail } from '../lib/email/send';
import { formatCurrency as currency, formatEventDate, formatVenueLine, formatEventTime } from '../lib/format';
import { FileIcon } from '../components/ui/icons';
import SignatureCanvas from '../components/SignatureCanvas';
import MoneyInput from '../components/ui/MoneyInput';
import { useSavingIndicator } from '../components/ui/SavingIndicator';
import OfferingPickerModal from '../components/OfferingPickerModal';
import { computeOfferingTotal, computeOfferingsTotal } from '../lib/offerings';
import { matchesSearch } from '../lib/search';

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';
const cardClass = 'bg-white rounded-2xl border border-slate-200 p-6';
const cardTitleClass = 'text-base font-bold text-slate-800 mb-5';

export const PRIORITIES = [
  { value: 'hot', label: 'Hot', color: '#ef4444' },
  { value: 'warm', label: 'Warm', color: '#eab308' },
  { value: 'cold', label: 'Cold', color: '#3b82f6' },
];

const TABS = [
  { id: 'info', label: 'Booking Info' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'contract', label: 'Contract' },
  { id: 'invoices', label: 'Invoices' },
];

const DEFAULT_CONTRACT_ACCENT_COLOR = '#6366f1';

const PAYMENT_METHOD_LABELS = { ach: 'ACH', check: 'Check', card: 'Card', other: 'Other' };

// Mirrors EventFormPage's venue shape exactly — a booking's location carries
// straight into the event created from it, so a partial object here would
// leave that event's venue fields undefined (React controlled-input warnings).
function emptyVenue() {
  return { name: '', address1: '', address2: '', city: '', state: '', zip: '', locationNote: '', loadInInfo: '' };
}

// Mirrors EventFormPage's schedule item shape exactly — carries straight
// into the event created from this booking (see convertBookingToEvent).
function emptyScheduleItem() {
  return { id: uid('sched'), time: '', name: '', details: '' };
}

function emptyForm() {
  return {
    // Generated up front so document uploads on a not-yet-saved booking still
    // have a stable bookingId to attach to — mirrors EventFormPage.
    id: uid('bkg'),
    eventName: '', clientId: '', eventDate: '', eventType: '',
    venue: emptyVenue(),
    schedule: [emptyScheduleItem()],
    depositAmount: '', depositDueDate: '', depositPaid: false,
    bookingStatus: '', priority: '', nextFollowUpDate: '',
    contractSignedDate: '', referralSource: '', notes: '', activityLog: [],
    proposal: null,
  };
}

// A brand-new booking only lives in memory until "Add Booking" is clicked —
// nothing to auto-save to the server yet. But the tab itself can still be
// discarded by the browser (backgrounded to save memory) or reloaded, which
// wipes that in-progress React state outright. Mirroring the draft into
// sessionStorage means a reload picks up right where the user left off
// instead of silently losing everything they'd typed.
const NEW_BOOKING_DRAFT_KEY = 'gigworks:newBookingDraft';

function loadNewBookingDraft() {
  try {
    const raw = sessionStorage.getItem(NEW_BOOKING_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveNewBookingDraft(form) {
  try {
    sessionStorage.setItem(NEW_BOOKING_DRAFT_KEY, JSON.stringify(form));
  } catch {
    // storage full/unavailable — draft recovery just won't work this time
  }
}

function clearNewBookingDraft() {
  try {
    sessionStorage.removeItem(NEW_BOOKING_DRAFT_KEY);
  } catch {
    // ignore
  }
}

function DocumentSection({ category, docs, uploading, onUpload, onRequestDelete }) {
  const label = category === 'proposal' ? 'Proposal' : 'Contract';
  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between mb-5">
        <h3 className={`${cardTitleClass} mb-0`}>{label} Documents</h3>
        <label className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer">
          {uploading ? 'Uploading…' : `+ Upload ${label}`}
          <input
            type="file"
            onChange={(e) => { onUpload(category, e.target.files?.[0]); e.target.value = ''; }}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>
      {docs.length === 0 ? (
        <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-6 text-center">
          No {category} documents uploaded yet.
        </div>
      ) : (
        <div className="space-y-1.5">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-200 text-sm">
              <FileIcon className="w-4 h-4 text-slate-400 shrink-0" />
              <a href={bookingDocumentDownloadUrl(d.id)} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-indigo-600 hover:underline">
                {d.filename}
              </a>
              <span className="text-xs text-slate-400 shrink-0">{(d.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                onClick={() => onRequestDelete(d)}
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                aria-label={`Remove ${d.filename}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Free-form line items are no longer user-addable (folded into Offerings —
// see OfferingPickerModal's "+ One-time item"), but computeGrandTotal and
// the PDF builders still read this field so proposals/contracts sent before
// that change keep rendering their stored line items correctly.

function computeGrandTotal(lineItems, offerings) {
  const itemsTotal = (lineItems || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  return itemsTotal + computeOfferingsTotal(offerings);
}

// Offerings are added via the picker (a saved template cloned in), then
// edited in place here — the instance is independent of the saved template
// from that point on.
function OfferingsEditor({ offerings, onChange, onAddClick }) {
  function handleUpdate(id, patch) {
    onChange(offerings.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function handleRemove(id) {
    onChange(offerings.filter((o) => o.id !== id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className={labelClass}>Offerings</label>
        <button type="button" onClick={onAddClick} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
          + Add Offering
        </button>
      </div>
      {offerings.length === 0 ? (
        <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
          No offerings added yet.
        </div>
      ) : (
        <div className="space-y-2">
          {offerings.map((o) => (
            <div key={o.id} className="border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={o.name}
                  onChange={(e) => handleUpdate(o.id, { name: e.target.value })}
                  placeholder="Offering name"
                  className={`${inputClass} font-semibold flex-1 min-w-0`}
                />
                <select
                  value={o.type}
                  onChange={(e) => handleUpdate(o.id, { type: e.target.value })}
                  className="px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 w-32 shrink-0"
                >
                  <option value="general">General</option>
                  <option value="perUnit">Per Unit</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleRemove(o.id)}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                  aria-label={`Remove ${o.name || 'offering'}`}
                >
                  ✕
                </button>
              </div>
              <textarea
                rows={2}
                value={o.details}
                onChange={(e) => handleUpdate(o.id, { details: e.target.value })}
                placeholder="Details (optional)"
                className={`${inputClass} mb-2`}
              />
              {o.type === 'perUnit' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Unit Count</label>
                    <input
                      type="number"
                      min="0"
                      value={o.unitCount}
                      onChange={(e) => handleUpdate(o.id, { unitCount: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">$ Per Unit</label>
                    <MoneyInput
                      value={o.ratePerUnit}
                      onChange={(v) => handleUpdate(o.id, { ratePerUnit: v })}
                      className="w-full py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Amount</label>
                  <MoneyInput
                    value={o.amount}
                    onChange={(v) => handleUpdate(o.id, { amount: v })}
                    className="w-full py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              )}
              <div className="text-right text-xs font-semibold text-slate-600 mt-2">
                Subtotal: {currency(computeOfferingTotal(o))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A custom section = a title (rendered as a highlighted separator bar in the
// PDF) plus an optional short value and/or a longer free-text block — used
// for both the Proposal and Contract so either document can carry arbitrary
// extra content (riders, policies, custom line notes) beyond the fixed
// fields above.
function SectionsEditor({ sections, onChange }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [value, setValue] = useState('');

  function handleAdd() {
    if (!title.trim()) return;
    onChange([...sections, { id: uid('section'), title: title.trim(), text: text.trim(), value: value.trim() }]);
    setTitle('');
    setText('');
    setValue('');
  }

  function handleRemove(id) {
    onChange(sections.filter((s) => s.id !== id));
  }

  function handleUpdate(id, field, val) {
    onChange(sections.map((s) => (s.id === id ? { ...s, [field]: val } : s)));
  }

  return (
    <div>
      <label className={labelClass}>Custom Sections</label>
      {sections.length > 0 && (
        <div className="space-y-2 mb-3">
          {sections.map((s) => (
            <div key={s.id} className="border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={s.title}
                  onChange={(e) => handleUpdate(s.id, 'title', e.target.value)}
                  placeholder="Section title"
                  className={`${inputClass} font-semibold`}
                />
                <button
                  type="button"
                  onClick={() => handleRemove(s.id)}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                  aria-label={`Remove ${s.title || 'section'}`}
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <textarea
                  rows={2}
                  value={s.text}
                  onChange={(e) => handleUpdate(s.id, 'text', e.target.value)}
                  placeholder="Text (optional)"
                  className={inputClass}
                />
                <input
                  value={s.value}
                  onChange={(e) => handleUpdate(s.id, 'value', e.target.value)}
                  placeholder="Value (optional)"
                  className={inputClass}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="border border-dashed border-slate-300 rounded-lg p-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New section title" className={`${inputClass} mb-2`} />
        <div className="grid grid-cols-2 gap-2 mb-2">
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Text (optional)" className={inputClass} />
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value (optional)" className={inputClass} />
        </div>
        <button type="button" onClick={handleAdd} className="px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50">+ Add Section</button>
      </div>
    </div>
  );
}

// Collapses variable-length, often-empty blocks (pricing, custom sections)
// so a booking with nothing in them doesn't force a long scroll past empty
// state — starts open once there's something worth seeing.
function CollapsibleSection({ title, subtitle, defaultOpen, badge, children, className = 'mt-6 pt-6 border-t border-slate-100' }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div>
          <h4 className="text-sm font-bold text-slate-800">{title}</h4>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge}
          <span className={`text-slate-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
        </div>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}

// Type-to-filter client picker — a plain <select> doesn't scale once an
// account has more than a handful of clients.
function ClientCombobox({ clients, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = clients.find((c) => c.id === value);
  const filtered = clients.filter((c) => matchesSearch(query, [c.firstName, c.lastName, c.email, c.phone]));

  return (
    <div className="relative">
      <input
        value={open ? query : (selected ? `${selected.firstName} ${selected.lastName}` : '')}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { setQuery(''); setOpen(true); }}
        placeholder="Search clients…"
        className={inputClass}
      />
      {open && (
        <>
          {/* Closing without picking a result must not touch the committed
              selection — only clear the transient search text. */}
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setQuery(''); }} />
          <div className="absolute left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white rounded-lg shadow-lg border border-slate-100 z-20">
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-xs text-slate-400">No clients found.</div>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange(c.id); setQuery(''); setOpen(false); }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
              >
                <div className="font-medium text-slate-700">{c.firstName} {c.lastName}</div>
                {(c.email || c.phone) && (
                  <div className="text-xs text-slate-400">{[c.email, c.phone].filter(Boolean).join(' · ')}</div>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Pure presentational read of state that already exists elsewhere on the
// page (booking, proposal, contract, event) — no new data, just orientation.
function pipelineSteps(booking, proposal, contract, invoices) {
  const proposalSent = !!proposal?.sentAt;
  const contractSent = !!contract;
  const fullySigned = contract?.status === 'fully_signed';
  const hasEvent = !!booking?.convertedEventId;
  const invoicePaid = (invoices || []).some((inv) => inv.status === 'paid');
  const invoiceAwaitingPayment = (invoices || []).some((inv) => inv.status === 'sent' || inv.status === 'partial');
  const state = (done, current) => (done ? 'done' : current ? 'current' : 'upcoming');
  return [
    { label: 'Booking', state: state(!!booking, !booking) },
    { label: 'Proposal', state: state(proposalSent, !!booking && !proposalSent) },
    { label: 'Contract', state: state(contractSent, proposalSent && !contractSent) },
    { label: 'Signed', state: state(fullySigned, contractSent && !fullySigned) },
    { label: 'Event', state: state(hasEvent, fullySigned && !hasEvent) },
    { label: 'Payment', state: state(invoicePaid, invoiceAwaitingPayment && !invoicePaid) },
  ];
}

function PipelineStepper({ steps }) {
  return (
    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-5">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                step.state === 'done'
                  ? 'bg-indigo-600 text-white'
                  : step.state === 'current'
                    ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              {step.state === 'done' ? '✓' : i + 1}
            </span>
            <span className={`text-xs font-semibold ${step.state === 'upcoming' ? 'text-slate-400' : 'text-slate-700'}`}>
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && <span className="w-6 h-px bg-slate-200 shrink-0" />}
        </div>
      ))}
    </div>
  );
}

export default function BookingFormPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const {
    bookings, clients, eventTypes, addEventType, bookingStatuses,
    addBooking, updateBooking, convertBookingToEvent, addEvent,
  } = useData();
  const { can, currentUser, updateCurrentUser } = useAuth();
  const { showToast } = useToast();
  const notifySaving = useSavingIndicator();

  useEffect(() => {
    if (!can('manageBookings')) navigate('/bookings', { replace: true });
  }, [can, navigate]);

  const isEditing = !!bookingId;
  const booking = isEditing ? bookings.find((b) => b.id === bookingId) : null;

  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const [newClientModalOpen, setNewClientModalOpen] = useState(false);
  const [addingType, setAddingType] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [newActivityText, setNewActivityText] = useState('');
  const [proposalDocs, setProposalDocs] = useState([]);
  const [contractDocs, setContractDocs] = useState([]);
  const [uploadingProposal, setUploadingProposal] = useState(false);
  const [uploadingContract, setUploadingContract] = useState(false);
  const [docPendingDelete, setDocPendingDelete] = useState(null);
  const [sendingProposal, setSendingProposal] = useState(false);
  const [contract, setContract] = useState(null);
  const [contractRecipientEmail, setContractRecipientEmail] = useState('');
  const [contractRecipientName, setContractRecipientName] = useState('');
  const [contractHours, setContractHours] = useState('');
  const [contractLineItems, setContractLineItems] = useState([]);
  const [contractTitle, setContractTitle] = useState('Event Contract');
  const [contractSections, setContractSections] = useState([]);
  const [contractOfferings, setContractOfferings] = useState([]);
  const [proposalOfferingPickerOpen, setProposalOfferingPickerOpen] = useState(false);
  const [contractOfferingPickerOpen, setContractOfferingPickerOpen] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);
  const [newInvoiceOfferings, setNewInvoiceOfferings] = useState([]);
  const [newInvoiceRecipientEmail, setNewInvoiceRecipientEmail] = useState('');
  const [newInvoiceRecipientName, setNewInvoiceRecipientName] = useState('');
  const [newInvoiceDueDate, setNewInvoiceDueDate] = useState('');
  const [newInvoiceMemo, setNewInvoiceMemo] = useState('');
  const [newInvoiceNumber, setNewInvoiceNumber] = useState('');
  // The account's running invoice-number sequence and sticky footer memo —
  // what the composer resets to after a save or a cancelled edit. Advances
  // locally right after each save so the next invoice picks up from there
  // without a round-trip; see the booking-load effect below for the initial
  // fetch via GET /invoices/next-number.
  const [invoiceDefaults, setInvoiceDefaults] = useState({ number: '', memo: '' });
  const [invoiceOfferingPickerOpen, setInvoiceOfferingPickerOpen] = useState(false);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [savingInvoiceDraft, setSavingInvoiceDraft] = useState(false);
  const [sendingNewInvoice, setSendingNewInvoice] = useState(false);
  const [invoiceActionId, setInvoiceActionId] = useState(null);
  const [lastInvoicePayLink, setLastInvoicePayLink] = useState(null); // { invoiceId, link } — only known right after sending, same as contract sign links
  const [partialAmountDraft, setPartialAmountDraft] = useState(null); // { invoiceId, value } — inline "$ paid so far" editor for one row at a time
  const [acceptPaymentInvoice, setAcceptPaymentInvoice] = useState(null); // invoice currently open in the Accept Payment popover, or null
  const [contractPreviewUrl, setContractPreviewUrl] = useState('');
  const [showContractPreview, setShowContractPreview] = useState(false);
  const [loadingContractPreview, setLoadingContractPreview] = useState(false);
  const [sendingContract, setSendingContract] = useState(false);
  const [lastSignLink, setLastSignLink] = useState('');
  const [lastOwnerSignLink, setLastOwnerSignLink] = useState('');
  const [ownerSignerName, setOwnerSignerName] = useState('');
  const [ownerSignatureImage, setOwnerSignatureImage] = useState('');
  const [signingOwner, setSigningOwner] = useState(false);
  const [contractTerms, setContractTerms] = useState('');

  const client = clients.find((c) => c.id === form.clientId);
  const autoSaveSkipRef = useRef(true);
  const termsSkipRef = useRef(true);
  const contractTemplateSkipRef = useRef(true);
  const proposalTemplateSkipRef = useRef(true);
  const autoCreatedEventRef = useRef(false);
  // Background refreshes (e.g. the window-focus refetch in AuthContext) hand
  // back a brand-new `booking` object even when nothing changed, which would
  // otherwise re-run this effect and clobber whatever the user is mid-typing.
  // Only actually hydrate once per booking id.
  const hydratedBookingIdRef = useRef(null);

  useEffect(() => {
    if (booking) {
      if (hydratedBookingIdRef.current === booking.id) return;
      hydratedBookingIdRef.current = booking.id;
      setForm({
        id: booking.id,
        eventName: booking.eventName || '',
        clientId: booking.clientId || '',
        eventDate: booking.eventDate || '',
        eventType: booking.eventType || '',
        venue: { ...emptyVenue(), ...booking.venue },
        schedule: booking.schedule && booking.schedule.length ? booking.schedule : [emptyScheduleItem()],
        depositAmount: booking.depositAmount ?? '',
        depositDueDate: booking.depositDueDate || '',
        depositPaid: !!booking.depositPaid,
        bookingStatus: booking.bookingStatus || (bookingStatuses[0]?.id || ''),
        priority: booking.priority || '',
        nextFollowUpDate: booking.nextFollowUpDate || '',
        contractSignedDate: booking.contractSignedDate || '',
        referralSource: booking.referralSource || '',
        notes: booking.notes || '',
        activityLog: booking.activityLog || [],
        proposal: booking.proposal || null,
      });
    } else {
      // bookingId is undefined for the whole time you're drafting a brand-new
      // booking — guard on it (not just truthiness of `booking`) so a
      // background refresh doesn't wipe that in-progress, not-yet-saved draft.
      if (hydratedBookingIdRef.current === bookingId) return;
      hydratedBookingIdRef.current = bookingId;
      setForm(loadNewBookingDraft() || emptyForm());
    }
    setError('');
    setAddingType(false);
    setNewActivityText('');
    // The setForm above is a load, not an edit — the auto-save effect below
    // would otherwise immediately re-persist the just-loaded data as if the
    // user had typed something.
    autoSaveSkipRef.current = true;
    proposalTemplateSkipRef.current = true;
    autoCreatedEventRef.current = false;
  }, [bookingId, booking, bookingStatuses]);

  // Mirrors the in-progress draft of a brand-new (not-yet-saved) booking into
  // sessionStorage on every change, so a discarded/reloaded tab can recover
  // it — see loadNewBookingDraft above.
  useEffect(() => {
    if (booking) return;
    saveNewBookingDraft(form);
  }, [form, booking]);

  // Auto-saves an existing booking shortly after any field changes — no
  // explicit "Save Changes" click needed. Only for bookings that already
  // exist; a brand-new one still needs its first, deliberate "Add Booking".
  useEffect(() => {
    if (!booking) return;
    if (autoSaveSkipRef.current) { autoSaveSkipRef.current = false; return; }
    const timer = setTimeout(() => { persistBooking(); }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const refreshDocs = useCallback(async (id) => {
    try {
      const [proposals, contracts] = await Promise.all([
        listBookingDocuments(id, 'proposal'),
        listBookingDocuments(id, 'contract'),
      ]);
      setProposalDocs(proposals);
      setContractDocs(contracts);
    } catch {
      // best-effort — document lists just stay empty if this fails
    }
  }, []);

  useEffect(() => {
    if (form.id) refreshDocs(form.id);
  }, [form.id, refreshDocs]);

  useEffect(() => {
    if (!booking) { setContract(null); return; }
    let cancelled = false;
    getContractForBooking(booking.id).then((c) => { if (!cancelled) setContract(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [booking?.id]);

  useEffect(() => {
    if (!booking) { setInvoices([]); return; }
    let cancelled = false;
    listInvoices(booking.id).then((list) => { if (!cancelled) setInvoices(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, [booking?.id]);

  // Seeds the new-invoice composer from the client and the current proposal
  // each time a different booking loads — same idea as the contract prep
  // panel above, so the invoice starts out billing everything that was
  // proposed and the user trims/adds from there.
  useEffect(() => {
    if (!booking) return;
    setEditingInvoiceId(null);
    setNewInvoiceOfferings(booking.proposal?.offerings || []);
    setNewInvoiceDueDate('');
    setLastInvoicePayLink(null);
    setShowInvoicePreview(false);
    let cancelled = false;
    getNextInvoiceInfo().then(({ number, memo }) => {
      if (cancelled) return;
      const defaults = { number: String(number), memo: memo || '' };
      setInvoiceDefaults(defaults);
      setNewInvoiceNumber(defaults.number);
      setNewInvoiceMemo(defaults.memo);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [booking?.id]);

  useEffect(() => {
    if (!client) return;
    setNewInvoiceRecipientEmail((prev) => prev || client.email || '');
    setNewInvoiceRecipientName((prev) => prev || `${client.firstName} ${client.lastName}`.trim());
  }, [client?.id]);

  // Seeds the contract-prep panel from the current proposal each time a
  // different booking loads — only relevant before a contract exists, since
  // the panel is hidden once one has been sent.
  useEffect(() => {
    if (!booking) return;
    setContractHours(booking.proposal?.hours || '');
    setContractLineItems(booking.proposal?.lineItems || []);
    setContractOfferings(booking.proposal?.offerings || []);
    setShowContractPreview(false);
    setContractPreviewUrl('');
    setLastSignLink('');
    setLastOwnerSignLink('');
    setOwnerSignerName('');
    setOwnerSignatureImage('');
  }, [booking?.id]);

  useEffect(() => {
    if (!client) return;
    setContractRecipientEmail((prev) => prev || client.email || '');
    setContractRecipientName((prev) => prev || `${client.firstName} ${client.lastName}`.trim());
  }, [client?.id]);

  // Terms rides along in the initial send payload before a contract exists,
  // then switches to auto-saving via PATCH below — same field either way, so
  // the prep-panel text carries straight through instead of being retyped.
  // Keyed on the booking too (not just the contract) so switching to a
  // different not-yet-sent booking clears stale prep-panel text.
  useEffect(() => {
    setContractTerms(contract?.terms || '');
    termsSkipRef.current = true;
  }, [booking?.id, contract?.id]);

  useEffect(() => {
    if (!contract) return; // nothing to save to yet — value goes out with the send instead
    if (termsSkipRef.current) { termsSkipRef.current = false; return; }
    const timer = setTimeout(async () => {
      try {
        const updated = await updateContractTerms(contract.id, contractTerms);
        setContract(updated);
      } catch (err) {
        showToast(err.message || 'Failed to save terms', 'error');
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractTerms]);

  // Title and custom sections work like a reusable template: before a
  // contract is sent they're loaded from (and kept in sync with) the
  // account-wide default, so whatever the user last set carries forward to
  // every new contract. Once sent, they're locked into that contract's
  // snapshot — same source-of-truth switch the terms field makes above.
  useEffect(() => {
    if (contract) {
      setContractTitle(contract.snapshot?.title || 'Event Contract');
      setContractSections(contract.snapshot?.sections || []);
    } else {
      setContractTitle(currentUser.contractTemplate?.title || 'Event Contract');
      // Prefer this specific proposal's own sections (same auto-carry as
      // offerings/line items/hours below); only fall back to the account-wide
      // default when the proposal doesn't have any of its own yet.
      setContractSections(
        booking?.proposal?.sections?.length ? booking.proposal.sections : (currentUser.contractTemplate?.sections || [])
      );
    }
    contractTemplateSkipRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id, contract?.id]);

  useEffect(() => {
    if (contract) return; // already locked into the sent snapshot
    if (contractTemplateSkipRef.current) { contractTemplateSkipRef.current = false; return; }
    const timer = setTimeout(() => {
      updateCurrentUser({ contractTemplate: { title: contractTitle, sections: contractSections } });
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractTitle, contractSections]);

  // Proposal sections follow the same reusable-template pattern, synced to
  // the account default while a proposal is still a draft.
  useEffect(() => {
    if (!form.proposal) return;
    if (proposalTemplateSkipRef.current) { proposalTemplateSkipRef.current = false; return; }
    const timer = setTimeout(() => {
      updateCurrentUser({ proposalTemplate: { sections: form.proposal.sections || [] } });
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.proposal?.sections]);

  // Once both signatures are in, the event is created automatically — no
  // button to click. Guarded by a ref (not just booking.convertedEventId)
  // so a re-render before that update lands can't fire this twice.
  useEffect(() => {
    if (contract?.status === 'fully_signed' && booking && !booking.convertedEventId && !autoCreatedEventRef.current) {
      autoCreatedEventRef.current = true;
      createEventFromContract(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract?.status, booking?.convertedEventId]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  function updateVenue(field, val) {
    setForm((f) => ({ ...f, venue: { ...f.venue, [field]: val } }));
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

  function handleAddActivity() {
    if (!newActivityText.trim()) return;
    const entry = { id: uid('activity'), date: new Date().toISOString(), text: newActivityText.trim() };
    setForm((f) => ({ ...f, activityLog: [entry, ...f.activityLog] }));
    setNewActivityText('');
  }

  function handleAddType() {
    if (!newTypeLabel.trim()) return;
    addEventType(newTypeLabel);
    update('eventType', newTypeLabel.trim());
    setNewTypeLabel('');
    setAddingType(false);
  }

  function validate() {
    if (!form.clientId) return 'A client is required.';
    return '';
  }

  function buildBookingPatch() {
    return {
      ...form,
      depositAmount: form.depositAmount === '' ? null : Number(form.depositAmount),
    };
  }

  function persistBooking() {
    const patch = buildBookingPatch();
    if (booking) updateBooking(booking.id, patch);
    else addBooking(patch);
    return patch;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); setActiveTab('info'); return; }
    setSaving(true);
    const wasNew = !booking;
    persistBooking();
    setSaving(false);
    if (wasNew) clearNewBookingDraft();
    showToast(booking ? 'Booking updated' : 'Booking added');
    navigate('/bookings');
  }

  function handleLeaveWithoutSaving() {
    if (!booking) clearNewBookingDraft();
    navigate('/bookings');
  }

  function handleConvert() {
    const event = convertBookingToEvent(booking.id);
    if (!event) return;
    showToast('Booking converted to event');
    navigate(`/events/${event.id}`);
  }

  function handlePushToProposal() {
    const proposal = { hours: '', lineItems: [], sections: currentUser.proposalTemplate?.sections || [], offerings: [], sentAt: null, sentTo: null };
    update('proposal', proposal);
    if (booking) updateBooking(booking.id, { proposal });
  }

  async function handleDownloadProposal() {
    try {
      const patch = persistBooking();
      await generateProposalPdf({ booking: patch, client, businessInfo: currentUser.businessInfo || {} });
    } catch (err) {
      showToast(err.message || 'Failed to generate PDF', 'error');
    }
  }

  async function handleSendProposal() {
    if (!client?.email) {
      showToast("This client doesn't have an email address on file", 'error');
      return;
    }
    setSendingProposal(true);
    try {
      const patch = persistBooking();
      const businessInfo = currentUser.businessInfo || {};
      const fromName = businessInfo.name || `${currentUser.firstName} ${currentUser.lastName}`;
      const pdfAttachment = await generateProposalPdfAttachment({ booking: patch, client, businessInfo });
      await sendEmail({
        to: client.email,
        subject: `Proposal from ${fromName}`,
        body: `<p>Hi ${client.firstName},</p><p>Please find attached our proposal for your event. Let us know if you have any questions!</p><p>${fromName}</p>`,
        fromName,
        pdfAttachment,
      });
      const sentProposal = { ...(patch.proposal || {}), sentAt: new Date().toISOString(), sentTo: client.email };
      updateBooking(booking.id, { proposal: sentProposal });
      update('proposal', sentProposal);
      showToast(`Proposal sent to ${client.email}`);
    } catch (err) {
      showToast(err.message || 'Failed to send proposal', 'error');
    } finally {
      setSendingProposal(false);
    }
  }

  function buildContractSnapshot() {
    const businessInfo = currentUser.businessInfo || {};
    return {
      businessInfo,
      client: client ? { firstName: client.firstName, lastName: client.lastName, email: client.email, phone: client.phone } : {},
      booking: {
        eventType: form.eventType,
        eventDate: form.eventDate,
        venue: form.venue,
        depositAmount: form.depositAmount === '' ? null : Number(form.depositAmount),
        depositDueDate: form.depositDueDate,
        depositPaid: form.depositPaid,
        notes: form.notes,
      },
      hours: contractHours,
      lineItems: contractLineItems,
      offerings: contractOfferings,
      title: contractTitle,
      sections: contractSections,
      style: { accentColor: currentUser.businessInfo?.accentColor || DEFAULT_CONTRACT_ACCENT_COLOR },
    };
  }

  // Same frozen-snapshot idea as buildContractSnapshot above, minus the
  // booking/hours/title/sections fields an invoice doesn't need.
  function buildInvoiceSnapshot() {
    return {
      businessInfo: currentUser.businessInfo || {},
      client: client ? { firstName: client.firstName, lastName: client.lastName, email: client.email, phone: client.phone } : {},
      event: { type: form.eventType, date: form.eventDate, venue: formatVenueLine(form.venue) },
      lineItems: newInvoiceOfferings,
    };
  }

  // A brand-new invoice prepends; an edited draft replaces in place so it
  // doesn't jump to the top of the history list just for being touched.
  function upsertInvoiceInList(invoice, { isNew }) {
    setInvoices((prev) => (isNew ? [invoice, ...prev] : prev.map((inv) => (inv.id === invoice.id ? invoice : inv))));
  }

  // Number/memo aren't reset here — they're sticky defaults, set explicitly
  // from invoiceDefaults (cancel) or the just-saved invoice (save/send)
  // instead of being cleared back to blank like the rest of the composer.
  function resetInvoiceComposer() {
    setEditingInvoiceId(null);
    setNewInvoiceOfferings([]);
    setNewInvoiceDueDate('');
    setShowInvoicePreview(false);
  }

  // Advances the sticky number by one (ready for the next invoice) and
  // carries the just-used memo forward as-is — called right after a
  // successful create/update, mirroring the server's own forward-only sync.
  function applyInvoiceDefaultsAfterSave(invoice) {
    const defaults = { number: String((invoice.number || 0) + 1), memo: invoice.memo || '' };
    setInvoiceDefaults(defaults);
    setNewInvoiceNumber(defaults.number);
    setNewInvoiceMemo(defaults.memo);
  }

  function handleEditInvoiceClick(inv) {
    setEditingInvoiceId(inv.id);
    setNewInvoiceRecipientEmail(inv.recipientEmail || '');
    setNewInvoiceRecipientName(inv.recipientName || '');
    setNewInvoiceDueDate(inv.dueDate ? inv.dueDate.slice(0, 10) : '');
    setNewInvoiceMemo(inv.memo || '');
    setNewInvoiceNumber(inv.number != null ? String(inv.number) : '');
    setNewInvoiceOfferings(inv.snapshot?.lineItems || []);
    setShowInvoicePreview(false);
  }

  function handleCancelEditInvoice() {
    resetInvoiceComposer();
    setNewInvoiceOfferings(booking.proposal?.offerings || []);
    setNewInvoiceRecipientEmail(client?.email || '');
    setNewInvoiceRecipientName(client ? `${client.firstName} ${client.lastName}`.trim() : '');
    setNewInvoiceNumber(invoiceDefaults.number);
    setNewInvoiceMemo(invoiceDefaults.memo);
  }

  async function handleSaveInvoiceDraft() {
    if (!newInvoiceRecipientEmail.trim()) {
      showToast('Recipient email is required', 'error');
      return;
    }
    setSavingInvoiceDraft(true);
    try {
      const payload = {
        recipientEmail: newInvoiceRecipientEmail.trim(),
        recipientName: newInvoiceRecipientName.trim(),
        snapshot: buildInvoiceSnapshot(),
        dueDate: newInvoiceDueDate || null,
        memo: newInvoiceMemo || null,
        number: newInvoiceNumber ? Number(newInvoiceNumber) : undefined,
      };
      const invoice = editingInvoiceId
        ? await updateInvoice(editingInvoiceId, payload)
        : await createInvoice({ bookingId: booking.id, ...payload });
      upsertInvoiceInList(invoice, { isNew: !editingInvoiceId });
      resetInvoiceComposer();
      applyInvoiceDefaultsAfterSave(invoice);
      showToast(editingInvoiceId ? 'Invoice draft updated' : 'Invoice saved as draft');
    } catch (err) {
      showToast(err.message || 'Failed to save invoice', 'error');
    } finally {
      setSavingInvoiceDraft(false);
    }
  }

  async function handleSendNewInvoice() {
    if (!newInvoiceRecipientEmail.trim()) {
      showToast('Recipient email is required', 'error');
      return;
    }
    if (newInvoiceOfferings.length === 0) {
      showToast('Add at least one line item before sending', 'error');
      return;
    }
    setSendingNewInvoice(true);
    try {
      const payload = {
        recipientEmail: newInvoiceRecipientEmail.trim(),
        recipientName: newInvoiceRecipientName.trim(),
        snapshot: buildInvoiceSnapshot(),
        dueDate: newInvoiceDueDate || null,
        memo: newInvoiceMemo || null,
        number: newInvoiceNumber ? Number(newInvoiceNumber) : undefined,
      };
      const draft = editingInvoiceId
        ? await updateInvoice(editingInvoiceId, payload)
        : await createInvoice({ bookingId: booking.id, ...payload });
      const { invoice: sent, payLink, emailError } = await sendInvoice(draft.id);
      upsertInvoiceInList(sent, { isNew: !editingInvoiceId });
      setLastInvoicePayLink({ invoiceId: sent.id, link: payLink });
      resetInvoiceComposer();
      applyInvoiceDefaultsAfterSave(sent);
      if (emailError) showToast(emailError, 'error');
      else showToast(`Invoice sent to ${newInvoiceRecipientEmail.trim()}`);
    } catch (err) {
      showToast(err.message || 'Failed to send invoice', 'error');
    } finally {
      setSendingNewInvoice(false);
    }
  }

  async function handleSendExistingInvoice(invoiceId) {
    setInvoiceActionId(invoiceId);
    try {
      const { invoice: sent, payLink, emailError } = await sendInvoice(invoiceId);
      setInvoices((prev) => prev.map((inv) => (inv.id === sent.id ? sent : inv)));
      setLastInvoicePayLink({ invoiceId: sent.id, link: payLink });
      if (emailError) showToast(emailError, 'error');
      else showToast(`Invoice sent to ${sent.recipientEmail}`);
    } catch (err) {
      showToast(err.message || 'Failed to send invoice', 'error');
    } finally {
      setInvoiceActionId(null);
    }
  }

  async function handleMarkInvoicePayment(invoiceId, status, paidAmount) {
    setInvoiceActionId(invoiceId);
    try {
      const updated = await markInvoicePayment(invoiceId, { status, paidAmount });
      setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)));
      setPartialAmountDraft(null);
      const label = { sent: 'open', partial: 'partially paid', paid: 'paid' }[status];
      showToast(`Invoice marked as ${label}`);
    } catch (err) {
      showToast(err.message || 'Failed to update payment status', 'error');
    } finally {
      setInvoiceActionId(null);
    }
  }

  async function handleSendReceiptClick(invoiceId) {
    setInvoiceActionId(invoiceId);
    try {
      const { invoice: updated, emailError } = await sendReceipt(invoiceId);
      setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)));
      if (emailError) showToast(emailError, 'error');
      else showToast(`Receipt sent to ${updated.recipientEmail}`);
    } catch (err) {
      showToast(err.message || 'Failed to send receipt', 'error');
    } finally {
      setInvoiceActionId(null);
    }
  }

  async function handleVoidInvoiceClick(invoiceId) {
    setInvoiceActionId(invoiceId);
    try {
      const updated = await voidInvoice(invoiceId);
      setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)));
      showToast('Invoice voided');
    } catch (err) {
      showToast(err.message || 'Failed to void invoice', 'error');
    } finally {
      setInvoiceActionId(null);
    }
  }

  function handleCopyInvoiceLink(link) {
    navigator.clipboard?.writeText(link);
    showToast('Pay link copied');
  }

  async function handleTogglePreview() {
    if (showContractPreview) {
      setShowContractPreview(false);
      return;
    }
    setLoadingContractPreview(true);
    try {
      const url = await getContractPdfDataUrl({
        snapshot: buildContractSnapshot(),
        terms: contractTerms,
        clientSignature: null,
        ownerSignature: null,
      });
      setContractPreviewUrl(url);
      setShowContractPreview(true);
    } catch (err) {
      showToast(err.message || 'Failed to build preview', 'error');
    } finally {
      setLoadingContractPreview(false);
    }
  }

  async function handleSendContract() {
    if (!contractRecipientEmail.trim()) {
      showToast('Recipient email is required', 'error');
      return;
    }
    setSendingContract(true);
    try {
      persistBooking();
      const { contract: created, signLink, ownerSignLink, emailError } = await sendContract({
        bookingId: booking.id,
        recipientEmail: contractRecipientEmail.trim(),
        recipientName: contractRecipientName.trim(),
        snapshot: buildContractSnapshot(),
        terms: contractTerms,
      });
      setContract(created);
      setLastSignLink(signLink);
      setLastOwnerSignLink(ownerSignLink);
      if (emailError) showToast(emailError, 'error');
      else showToast(`Contract sent to ${contractRecipientEmail.trim()}`);
    } catch (err) {
      showToast(err.message || 'Failed to send contract', 'error');
    } finally {
      setSendingContract(false);
    }
  }

  async function handleOwnerSign() {
    if (!ownerSignerName.trim() || !ownerSignatureImage) {
      showToast('Please type your name and draw your signature', 'error');
      return;
    }
    setSigningOwner(true);
    try {
      const updated = await ownerSignContract(contract.id, {
        signatureName: ownerSignerName.trim(),
        signatureImage: ownerSignatureImage,
      });
      setContract(updated);
      showToast('Contract fully signed!');
    } catch (err) {
      showToast(err.message || 'Failed to sign', 'error');
    } finally {
      setSigningOwner(false);
    }
  }

  async function handleDownloadContract() {
    if (!contract) return;
    try {
      await generateContractPdf({
        snapshot: contract.snapshot,
        terms: contract.terms,
        clientSignature: contract.clientSignedAt
          ? { name: contract.clientSignatureName, image: contract.clientSignatureImage, signedAt: contract.clientSignedAt }
          : null,
        ownerSignature: contract.ownerSignedAt
          ? { name: contract.ownerSignatureName, image: contract.ownerSignatureImage, signedAt: contract.ownerSignedAt }
          : null,
      });
    } catch (err) {
      showToast(err.message || 'Failed to generate PDF', 'error');
    }
  }

  // Fires automatically once a contract is fully signed (see the effect
  // above) — navigateAfter is only true for a future manual trigger, if one
  // is ever added back; today it's always called silently.
  function createEventFromContract(navigateAfter) {
    if (!booking || !contract) return;
    const contractBooking = contract.snapshot.booking || {};
    const grandTotal = computeGrandTotal(contract.snapshot.lineItems, contract.snapshot.offerings);
    const name = [client ? `${client.firstName} ${client.lastName}` : '', contractBooking.eventType].filter(Boolean).join(' ') || 'New Event';
    const noteLines = [
      'Created from a fully signed contract.',
      contract.snapshot.hours ? `Estimated hours: ${contract.snapshot.hours}` : null,
      `Contract total: ${currency(grandTotal)}`,
    ].filter(Boolean);
    const event = addEvent({
      name,
      eventType: contractBooking.eventType || '',
      eventDate: contractBooking.eventDate || '',
      clientId: booking.clientId || '',
      venue: { ...emptyVenue(), ...(contractBooking.venue || booking.venue) },
      contactEmail: client?.email || '',
      contactPhone: client?.phone || '',
      eventNote: noteLines.join(' '),
    });
    updateBooking(booking.id, { convertedEventId: event.id });
    if (navigateAfter) {
      showToast('Event created from signed contract');
      navigate(`/events/${event.id}`);
    } else {
      showToast('Contract fully signed — event created automatically');
    }
  }

  async function handleUploadDoc(category, file) {
    if (!file) return;
    const setUploading = category === 'proposal' ? setUploadingProposal : setUploadingContract;
    setUploading(true);
    try {
      await uploadBookingDocument(form.id, category, file);
      await refreshDocs(form.id);
      showToast('Document uploaded');
    } catch (err) {
      showToast(err.message || 'Failed to upload document', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function confirmDeleteDocument() {
    if (!docPendingDelete) return;
    try {
      await deleteBookingDocument(docPendingDelete.id);
      await refreshDocs(form.id);
      showToast('Document deleted');
    } catch (err) {
      showToast(err.message || 'Failed to delete document', 'error');
    } finally {
      setDocPendingDelete(null);
    }
  }

  const status = bookingStatuses.find((s) => s.id === form.bookingStatus);
  const canConvert = booking && !booking.convertedEventId && status?.isBooked;

  if (isEditing && !booking) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-slate-500 mb-4">This booking couldn't be found.</p>
        <button
          type="button"
          onClick={() => navigate('/bookings')}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
        >
          Back to Bookings
        </button>
      </div>
    );
  }

  const title = isEditing ? (client ? `${client.firstName} ${client.lastName}` : 'Booking') : 'Add Booking';

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleLeaveWithoutSaving}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100"
            aria-label="Back to Bookings"
          >
            ←
          </button>
          <h2 className="text-2xl font-bold text-slate-800 truncate">{title}</h2>
        </div>
        <div className="flex gap-2 shrink-0">
          {canConvert && (
            <button
              type="button"
              onClick={handleConvert}
              className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
            >
              Convert to Event →
            </button>
          )}
          <button type="button" onClick={handleLeaveWithoutSaving} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="submit"
            form="booking-form"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
          >
            {saving && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            {isEditing ? 'Save Changes' : 'Add Booking'}
          </button>
        </div>
      </div>

      {booking?.convertedEventId && (
        <div className="flex items-center justify-between gap-3 text-sm bg-blue-50 border border-blue-100 text-blue-700 rounded-lg px-3 py-2 mb-6">
          <span>Converted to an event.</span>
          <button
            type="button"
            onClick={() => navigate(`/events/${booking.convertedEventId}`)}
            className="font-semibold hover:underline shrink-0"
          >
            View Event →
          </button>
        </div>
      )}

      <PipelineStepper steps={pipelineSteps(booking, form.proposal, contract, invoices)} />

      <div className="flex border-b border-slate-200 mb-6">
        {TABS.map((t) => {
          const count = t.id === 'proposal' ? proposalDocs.length : t.id === 'contract' ? contractDocs.length : 0;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px flex items-center gap-2 ${
                activeTab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
              {count > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

      <form
        id="booking-form"
        onSubmit={handleSubmit}
        onBlur={(e) => {
          if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) notifySaving();
        }}
        className="space-y-6"
      >
        <div className={activeTab === 'info' ? 'space-y-6' : 'hidden'}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className={cardClass}>
            <h3 className={cardTitleClass}>Booking Details</h3>
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Event Name</label>
                <input value={form.eventName} onChange={(e) => update('eventName', e.target.value)} className={inputClass} />
              </div>

              <div>
                <label className={labelClass}>Client *</label>
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <ClientCombobox clients={clients} value={form.clientId} onChange={(id) => update('clientId', id)} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewClientModalOpen(true)}
                    className="shrink-0 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
                  >
                    + New Client
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Event Date (tentative is fine)</label>
                  <input type="date" value={form.eventDate} onChange={(e) => update('eventDate', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Event Type</label>
                  {!addingType ? (
                    <div className="flex gap-2">
                      <select value={form.eventType} onChange={(e) => update('eventType', e.target.value)} className={inputClass}>
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
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Deposit Amount</label>
                  <MoneyInput value={form.depositAmount} onChange={(v) => update('depositAmount', v)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Deposit Due Date</label>
                  <input type="date" value={form.depositDueDate} onChange={(e) => update('depositDueDate', e.target.value)} className={inputClass} />
                </div>
                <div className="flex items-end pb-2.5">
                  <label className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input type="checkbox" checked={form.depositPaid} onChange={(e) => update('depositPaid', e.target.checked)} />
                    Deposit paid
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Booking Status</label>
                  <select value={form.bookingStatus} onChange={(e) => update('bookingStatus', e.target.value)} className={inputClass}>
                    {bookingStatuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Priority</label>
                  <select value={form.priority} onChange={(e) => update('priority', e.target.value)} className={inputClass}>
                    <option value="">None</option>
                    {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Next Follow-up Date</label>
                  <input type="date" value={form.nextFollowUpDate} onChange={(e) => update('nextFollowUpDate', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Referral Source</label>
                  <input value={form.referralSource} onChange={(e) => update('referralSource', e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <h3 className={cardTitleClass}>Location</h3>
            <p className="text-xs text-slate-400 -mt-3 mb-5">Carries straight into the event once this booking converts.</p>
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
                <label className={labelClass}>Location Note</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Loading dock around back, no elevator access"
                  value={form.venue.locationNote}
                  onChange={(e) => updateVenue('locationNote', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Load In Info</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Load in through the back entrance, freight elevator to 2nd floor"
                  value={form.venue.loadInInfo}
                  onChange={(e) => updateVenue('loadInInfo', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className={`${cardTitleClass} mb-0`}>Event Schedule</h3>
              <p className="text-xs text-slate-400 mt-1">Included in the proposal, and carries straight into the event once this booking converts.</p>
            </div>
            <button
              type="button"
              onClick={addScheduleItem}
              className="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
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

        <div className={cardClass}>
          <h3 className={cardTitleClass}>Notes & Activity</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>Notes</label>
              <textarea rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} className={inputClass} />
            </div>

            {booking && (
              <div>
                <label className={labelClass}>Activity Log</label>
                <div className="flex gap-2 mb-2">
                  <input
                    value={newActivityText}
                    onChange={(e) => setNewActivityText(e.target.value)}
                    placeholder="e.g. Called, left voicemail"
                    className={inputClass}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddActivity(); } }}
                  />
                  <button type="button" onClick={handleAddActivity} className="shrink-0 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50">Add</button>
                </div>
                {form.activityLog.length > 0 ? (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto border border-slate-200 rounded-lg px-3 py-2">
                    {form.activityLog.map((entry) => (
                      <div key={entry.id} className="text-sm text-slate-600 flex gap-2">
                        <span className="text-slate-400 shrink-0">
                          {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        <span>{entry.text}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
                    No activity logged yet.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </div>

        <div className={activeTab === 'proposal' ? 'space-y-6' : 'hidden'}>
          {!booking ? (
            <div className={cardClass}>
              <p className="text-sm text-slate-400 text-center py-8">Save this booking first, then you can push it to a proposal.</p>
            </div>
          ) : !form.proposal ? (
            <div className={cardClass}>
              <h3 className={cardTitleClass}>Proposal</h3>
              <p className="text-sm text-slate-500 mb-5 max-w-xl">
                Push this booking's details into a client-ready proposal — your logo and business info as letterhead, plus event details and pricing — ready to download or email.
              </p>
              <button
                type="button"
                onClick={handlePushToProposal}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
              >
                Push to Proposal
              </button>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                <div className="flex items-start justify-between gap-4 pb-5 mb-5 border-b border-slate-100 flex-wrap">
                  <div className="flex items-center gap-3">
                    {currentUser.businessInfo?.logo && (
                      <img src={currentUser.businessInfo.logo} alt="" className="h-12 w-auto object-contain" />
                    )}
                    <div>
                      <div className="font-bold text-slate-800">{currentUser.businessInfo?.name || 'Your Business'}</div>
                      <div className="text-xs text-slate-400">
                        {[currentUser.businessInfo?.address, currentUser.businessInfo?.phone, currentUser.businessInfo?.email].filter(Boolean).join('  ·  ')}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-slate-800">Event Proposal</div>
                    <div className="text-xs text-slate-400">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Prepared For</div>
                    <div className="text-sm font-semibold text-slate-800">{client ? `${client.firstName} ${client.lastName}` : '—'}</div>
                    <div className="text-xs text-slate-400">{client?.email || 'No email on file'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Event</div>
                    <div className="text-sm text-slate-700">{form.eventType || '—'} · {form.eventDate ? formatEventDate(form.eventDate) : 'Tentative'}</div>
                    <div className="text-xs text-slate-400">{formatVenueLine(form.venue) || '—'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Estimated Hours</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={form.proposal.hours}
                      onChange={(e) => update('proposal', { ...form.proposal, hours: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <div className={labelClass}>Deposit</div>
                    <div className="px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
                      {form.depositAmount ? currency(form.depositAmount) : '—'}
                    </div>
                  </div>
                </div>

                {(form.schedule || []).some((s) => s.time || s.name || s.details) && (
                  <CollapsibleSection
                    title="Schedule"
                    defaultOpen
                  >
                    <div className="space-y-1 text-sm">
                      {form.schedule.filter((s) => s.time || s.name || s.details).map((s) => (
                        <div key={s.id} className="flex gap-3">
                          <span className="w-20 shrink-0 text-slate-400">{formatEventTime(s.time) || '—'}</span>
                          <span className="w-40 shrink-0 font-medium text-slate-700">{s.name}</span>
                          <span className="text-slate-500">{s.details}</span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}

                <CollapsibleSection
                  title="Pricing"
                  defaultOpen={(form.proposal.offerings || []).length > 0}
                  badge={<span className="text-sm font-bold text-slate-800">{currency(computeGrandTotal(form.proposal.lineItems, form.proposal.offerings))}</span>}
                >
                  <OfferingsEditor
                    offerings={form.proposal.offerings || []}
                    onChange={(offerings) => update('proposal', { ...form.proposal, offerings })}
                    onAddClick={() => setProposalOfferingPickerOpen(true)}
                  />
                  <div className="flex justify-end mt-3 text-sm font-bold text-slate-800">
                    Grand Total: {currency(computeGrandTotal(form.proposal.lineItems, form.proposal.offerings))}
                  </div>
                </CollapsibleSection>

                <CollapsibleSection
                  title="Additional Sections"
                  subtitle="Riders, policies, or any other custom content"
                  defaultOpen={(form.proposal.sections || []).length > 0}
                  badge={(form.proposal.sections || []).length > 0 ? (
                    <span className="text-xs font-semibold text-slate-400">{form.proposal.sections.length}</span>
                  ) : null}
                >
                  <SectionsEditor
                    sections={form.proposal.sections || []}
                    onChange={(sections) => update('proposal', { ...form.proposal, sections })}
                  />
                </CollapsibleSection>
              </div>

              <div className={cardClass}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="text-sm text-slate-500">
                    {form.proposal.sentAt ? (
                      <span>
                        Sent {new Date(form.proposal.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} to{' '}
                        <span className="font-semibold text-slate-700">{form.proposal.sentTo}</span>
                      </span>
                    ) : (
                      <span>Not sent yet.</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadProposal}
                      className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50"
                    >
                      Download PDF
                    </button>
                    <button
                      type="button"
                      onClick={handleSendProposal}
                      disabled={sendingProposal || !client?.email}
                      title={!client?.email ? "Add an email address for this client first" : undefined}
                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {sendingProposal && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                      {form.proposal.sentAt ? 'Resend Proposal' : 'Send Proposal'}
                    </button>
                  </div>
                </div>
              </div>

              <DocumentSection
                category="proposal"
                docs={proposalDocs}
                uploading={uploadingProposal}
                onUpload={handleUploadDoc}
                onRequestDelete={setDocPendingDelete}
              />
            </>
          )}
        </div>

        <div className={activeTab === 'contract' ? 'space-y-6' : 'hidden'}>
          {!booking ? (
            <div className={cardClass}>
              <p className="text-sm text-slate-400 text-center py-8">Save this booking first, then you can move it to a contract.</p>
            </div>
          ) : !form.proposal ? (
            <div className={cardClass}>
              <p className="text-sm text-slate-400 text-center py-8">Push this booking to a proposal first, then you can move it to a contract.</p>
            </div>
          ) : !contract ? (
            <div className={cardClass}>
              <h3 className={cardTitleClass}>Move Proposal to Contract</h3>
              <p className="text-sm text-slate-500 mb-5 max-w-xl">
                Sends a contract for signature, built from the current proposal. Terms are locked once sent — the client signs first, then it's returned to you to countersign.
              </p>
              <div className="max-w-2xl mb-5">
                <label className={labelClass}>Contract Title</label>
                <input value={contractTitle} onChange={(e) => setContractTitle(e.target.value)} className={inputClass} />
                <p className="mt-1 text-xs text-slate-400">Saved as your default title for future contracts, until changed.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5 max-w-2xl">
                <div>
                  <label className={labelClass}>Recipient Email *</label>
                  <input type="email" value={contractRecipientEmail} onChange={(e) => setContractRecipientEmail(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Recipient Name</label>
                  <input value={contractRecipientName} onChange={(e) => setContractRecipientName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Estimated Hours</label>
                  <input type="number" min="0" step="0.5" value={contractHours} onChange={(e) => setContractHours(e.target.value)} className={inputClass} />
                </div>
              </div>
              <CollapsibleSection
                className="max-w-2xl mb-5"
                title="Pricing"
                defaultOpen={contractOfferings.length > 0}
                badge={<span className="text-sm font-bold text-slate-800">{currency(computeGrandTotal(contractLineItems, contractOfferings))}</span>}
              >
                <OfferingsEditor
                  offerings={contractOfferings}
                  onChange={setContractOfferings}
                  onAddClick={() => setContractOfferingPickerOpen(true)}
                />
                <div className="flex justify-end mt-3 text-sm font-bold text-slate-800">
                  Grand Total: {currency(computeGrandTotal(contractLineItems, contractOfferings))}
                </div>
              </CollapsibleSection>
              <CollapsibleSection
                className="max-w-2xl mb-5"
                title="Additional Sections"
                subtitle="Saved as your default sections for future contracts, until changed"
                defaultOpen={contractSections.length > 0}
                badge={contractSections.length > 0 ? <span className="text-xs font-semibold text-slate-400">{contractSections.length}</span> : null}
              >
                <SectionsEditor sections={contractSections} onChange={setContractSections} />
              </CollapsibleSection>
              <div className="max-w-2xl mb-5">
                <label className={labelClass}>Terms</label>
                <textarea
                  rows={4}
                  placeholder="e.g. Cancellation policy, payment schedule, rider requirements…"
                  value={contractTerms}
                  onChange={(e) => setContractTerms(e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-400">Stays editable after the contract is sent — everything else here locks.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleTogglePreview}
                  disabled={loadingContractPreview}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60 flex items-center gap-2"
                >
                  {loadingContractPreview && <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />}
                  {showContractPreview ? 'Hide Preview' : 'Preview'}
                </button>
                <button
                  type="button"
                  onClick={handleSendContract}
                  disabled={sendingContract || !contractRecipientEmail.trim()}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {sendingContract && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                  Send Contract for Signature
                </button>
              </div>
              {showContractPreview && contractPreviewUrl && (
                <div className="mt-5 rounded-xl border border-slate-200 overflow-hidden">
                  <iframe title="Contract preview" src={contractPreviewUrl} className="w-full h-[70vh]" />
                </div>
              )}
            </div>
          ) : (
            <>
              <div className={cardClass}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-700">
                      {contract.status === 'sent' && 'Waiting on signatures'}
                      {contract.status === 'client_signed' && 'Client signed — your turn to countersign'}
                      {contract.status === 'owner_signed' && "You've signed — waiting on the client"}
                      {contract.status === 'fully_signed' && 'Fully signed by both parties'}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Sent {new Date(contract.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} to{' '}
                      <span className="font-semibold text-slate-600">{contract.recipientEmail}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadContract}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50"
                  >
                    Download PDF
                  </button>
                </div>
                {(lastSignLink || lastOwnerSignLink) && (
                  <div className="mt-4 space-y-2">
                    {lastSignLink && (
                      <div className="flex items-center gap-2 text-xs bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg px-3 py-2">
                        <span className="font-semibold shrink-0">Client link:</span>
                        <span className="flex-1 truncate">{lastSignLink}</span>
                        <button
                          type="button"
                          onClick={() => { navigator.clipboard.writeText(lastSignLink); showToast('Link copied'); }}
                          className="font-semibold hover:underline shrink-0"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                    {lastOwnerSignLink && (
                      <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 text-slate-600 rounded-lg px-3 py-2">
                        <span className="font-semibold shrink-0">Your link:</span>
                        <span className="flex-1 truncate">{lastOwnerSignLink}</span>
                        <button
                          type="button"
                          onClick={() => { navigator.clipboard.writeText(lastOwnerSignLink); showToast('Link copied'); }}
                          className="font-semibold hover:underline shrink-0"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={cardClass}>
                <h3 className={cardTitleClass}>What Was Sent</h3>
                <div className="space-y-4 text-sm">
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Title</div>
                    <div className="text-slate-700">{contract.snapshot.title || 'Event Contract'}</div>
                  </div>
                  {((contract.snapshot.lineItems || []).length > 0 || (contract.snapshot.offerings || []).length > 0) && (
                    <div>
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Pricing</div>
                      <div className="space-y-1">
                        {(contract.snapshot.lineItems || []).map((item) => (
                          <div key={item.id} className="flex justify-between text-slate-600">
                            <span>{item.name}</span>
                            <span className="font-medium">{currency(item.amount)}</span>
                          </div>
                        ))}
                        {(contract.snapshot.offerings || []).map((o) => (
                          <div key={o.id} className="flex justify-between text-slate-600">
                            <span>{o.name}</span>
                            <span className="font-medium">{currency(computeOfferingTotal(o))}</span>
                          </div>
                        ))}
                        <div className="flex justify-between font-bold text-slate-800 pt-1 mt-1 border-t border-slate-100">
                          <span>Grand Total</span>
                          <span>{currency(computeGrandTotal(contract.snapshot.lineItems, contract.snapshot.offerings))}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {(contract.snapshot.sections || []).length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Additional Sections</div>
                      <div className="space-y-2">
                        {contract.snapshot.sections.map((s) => (
                          <div key={s.id}>
                            <div className="font-semibold text-slate-700">{s.title}</div>
                            {s.value && <div className="text-slate-600">{s.value}</div>}
                            {s.text && <div className="text-slate-500 whitespace-pre-wrap">{s.text}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className={cardClass}>
                <h3 className={cardTitleClass}>Terms</h3>
                <textarea
                  rows={4}
                  placeholder="e.g. Cancellation policy, payment schedule, rider requirements…"
                  value={contractTerms}
                  onChange={(e) => setContractTerms(e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-400">Editable any time, saves automatically.</p>
              </div>

              {contract.status !== 'fully_signed' && (
                <>
                  {contract.clientSignedAt && (
                    <div className={cardClass}>
                      <h3 className={cardTitleClass}>Client Signature</h3>
                      <div className="flex items-center gap-4">
                        {contract.clientSignatureImage && (
                          <img src={contract.clientSignatureImage} alt="Client signature" className="h-14 border border-slate-200 rounded-lg bg-white px-2" />
                        )}
                        <div className="text-sm">
                          <div className="font-semibold text-slate-700">{contract.clientSignatureName}</div>
                          <div className="text-xs text-slate-400">
                            Signed {new Date(contract.clientSignedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={cardClass}>
                    <h3 className={cardTitleClass}>Your Signature</h3>
                    {contract.ownerSignedAt ? (
                      <div className="flex items-center gap-4">
                        {contract.ownerSignatureImage && (
                          <img src={contract.ownerSignatureImage} alt="Your signature" className="h-14 border border-slate-200 rounded-lg bg-white px-2" />
                        )}
                        <div className="text-sm">
                          <div className="font-semibold text-slate-700">{contract.ownerSignatureName}</div>
                          <div className="text-xs text-slate-400">
                            Signed {new Date(contract.ownerSignedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · waiting on the client
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 max-w-md">
                        <div>
                          <label className={labelClass}>Full Legal Name</label>
                          <input value={ownerSignerName} onChange={(e) => setOwnerSignerName(e.target.value)} className={inputClass} />
                        </div>
                        <SignatureCanvas onChange={setOwnerSignatureImage} />
                        <button
                          type="button"
                          onClick={handleOwnerSign}
                          disabled={signingOwner}
                          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
                        >
                          {signingOwner && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                          Sign Contract
                        </button>
                        <p className="text-xs text-slate-400">On the move? You were also emailed a secure link to sign from your phone.</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {contract.status === 'fully_signed' && (
                <div className={cardClass}>
                  <h3 className={cardTitleClass}>Signatures</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                    <div>
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Client</div>
                      {contract.clientSignatureImage && (
                        <img src={contract.clientSignatureImage} alt="" className="h-12 border border-slate-200 rounded-lg bg-white px-2 mb-1" />
                      )}
                      <div className="text-sm font-semibold text-slate-700">{contract.clientSignatureName}</div>
                      <div className="text-xs text-slate-400">
                        Signed {new Date(contract.clientSignedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Business</div>
                      {contract.ownerSignatureImage && (
                        <img src={contract.ownerSignatureImage} alt="" className="h-12 border border-slate-200 rounded-lg bg-white px-2 mb-1" />
                      )}
                      <div className="text-sm font-semibold text-slate-700">{contract.ownerSignatureName}</div>
                      <div className="text-xs text-slate-400">
                        Signed {new Date(contract.ownerSignedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  </div>
                  {booking.convertedEventId ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/events/${booking.convertedEventId}`)}
                      className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
                    >
                      View Event →
                    </button>
                  ) : (
                    <p className="text-xs text-slate-400">Setting up your event…</p>
                  )}
                </div>
              )}
            </>
          )}

          <DocumentSection
            category="contract"
            docs={contractDocs}
            uploading={uploadingContract}
            onUpload={handleUploadDoc}
            onRequestDelete={setDocPendingDelete}
          />
        </div>

        <div className={activeTab === 'invoices' ? 'space-y-6' : 'hidden'}>
          {!booking ? (
            <div className={cardClass}>
              <p className="text-sm text-slate-400 text-center py-8">Save this booking first, then you can send an invoice.</p>
            </div>
          ) : (
            <>
              <div className={cardClass}>
                <h3 className={cardTitleClass}>{editingInvoiceId ? 'Edit Draft Invoice' : 'New Invoice'}</h3>
                <p className="text-sm text-slate-500 mb-5 max-w-xl">
                  Paid online via Stripe, straight into your own connected account — see Settings → Billing to connect one first.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-5 max-w-3xl">
                  <div>
                    <label className={labelClass}>Invoice #</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={newInvoiceNumber}
                      onChange={(e) => setNewInvoiceNumber(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Recipient Email *</label>
                    <input type="email" value={newInvoiceRecipientEmail} onChange={(e) => setNewInvoiceRecipientEmail(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Recipient Name</label>
                    <input value={newInvoiceRecipientName} onChange={(e) => setNewInvoiceRecipientName(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Due Date</label>
                    <input type="date" value={newInvoiceDueDate} onChange={(e) => setNewInvoiceDueDate(e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div className="max-w-2xl mb-5">
                  <OfferingsEditor
                    offerings={newInvoiceOfferings}
                    onChange={setNewInvoiceOfferings}
                    onAddClick={() => setInvoiceOfferingPickerOpen(true)}
                  />
                  <div className="flex justify-end mt-3 text-sm font-bold text-slate-800">
                    Total: {currency(computeOfferingsTotal(newInvoiceOfferings))}
                  </div>
                </div>
                <div className="max-w-2xl mb-5">
                  <label className={labelClass}>Memo</label>
                  <textarea
                    rows={2}
                    placeholder="Shown at the bottom of the invoice — carries over to future invoices until changed"
                    value={newInvoiceMemo}
                    onChange={(e) => setNewInvoiceMemo(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowInvoicePreview((v) => !v)}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50"
                  >
                    {showInvoicePreview ? 'Hide Preview' : 'Preview'}
                  </button>
                  {editingInvoiceId && (
                    <button
                      type="button"
                      onClick={handleCancelEditInvoice}
                      disabled={savingInvoiceDraft || sendingNewInvoice}
                      className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveInvoiceDraft}
                    disabled={savingInvoiceDraft || sendingNewInvoice}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                  >
                    {savingInvoiceDraft ? 'Saving…' : editingInvoiceId ? 'Save Changes' : 'Save Draft'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSendNewInvoice}
                    disabled={sendingNewInvoice || savingInvoiceDraft}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {sendingNewInvoice && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                    Send Invoice
                  </button>
                </div>
                {showInvoicePreview && (
                  <div className="mt-5 max-w-2xl">
                    <InvoiceDocument
                      businessInfo={currentUser.businessInfo}
                      client={client}
                      event={{ type: form.eventType, date: form.eventDate, venue: formatVenueLine(form.venue) }}
                      lineItems={newInvoiceOfferings}
                      dueDate={newInvoiceDueDate}
                      memo={newInvoiceMemo}
                      status="draft"
                      number={newInvoiceNumber ? Number(newInvoiceNumber) : null}
                    />
                  </div>
                )}
              </div>

              {invoices.length > 0 && (
                <div className={cardClass}>
                  <h3 className={cardTitleClass}>Invoice History</h3>
                  <div className="space-y-3">
                    {invoices.map((inv) => {
                      const statusMeta = {
                        draft: { label: 'Draft', color: '#94a3b8' },
                        sent: { label: 'Open', color: '#eab308' },
                        partial: { label: 'Partially Paid', color: '#f97316' },
                        paid: { label: 'Paid', color: '#22c55e' },
                        void: { label: 'Void', color: '#ef4444' },
                      }[inv.status];
                      const acting = invoiceActionId === inv.id;
                      const payLink = lastInvoicePayLink?.invoiceId === inv.id ? lastInvoicePayLink.link : null;
                      const editingPartialAmount = partialAmountDraft?.invoiceId === inv.id;
                      // Draft included so a business that never connects Stripe can still
                      // track invoices by hand, without going through the Stripe-gated Send.
                      const canMarkPayment = ['draft', 'sent', 'partial', 'paid'].includes(inv.status);
                      return (
                        <div key={inv.id} className="border border-slate-200 rounded-lg p-4">
                          <div className="flex items-center justify-between flex-wrap gap-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Badge color={statusMeta.color}>{statusMeta.label}</Badge>
                                {inv.number != null && <span className="text-xs font-semibold text-slate-400">#{inv.number}</span>}
                                <span className="text-sm font-bold text-slate-800">
                                  {inv.status === 'partial' ? `${currency(inv.paidAmount)} of ${currency(inv.total)}` : currency(inv.total)}
                                </span>
                              </div>
                              <div className="text-xs text-slate-400">
                                {inv.recipientName || inv.recipientEmail}
                                {inv.dueDate && ` · Due ${formatEventDate(inv.dueDate.slice(0, 10))}`}
                                {inv.paidAt && ` · Paid ${formatEventDate(inv.paidAt.slice(0, 10))}`}
                                {inv.paymentMethod && ` via ${PAYMENT_METHOD_LABELS[inv.paymentMethod] || inv.paymentMethod}${inv.paymentMethod === 'check' && inv.paymentReference ? ` #${inv.paymentReference}` : ''}`}
                                {inv.receiptSentAt && ` · Receipt sent ${formatEventDate(inv.receiptSentAt.slice(0, 10))}`}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {inv.status === 'draft' && editingInvoiceId !== inv.id && (
                                <button
                                  type="button"
                                  onClick={() => handleEditInvoiceClick(inv)}
                                  disabled={acting}
                                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Edit
                                </button>
                              )}
                              {inv.status === 'draft' && editingInvoiceId !== inv.id && (
                                <button
                                  type="button"
                                  onClick={() => handleSendExistingInvoice(inv.id)}
                                  disabled={acting}
                                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                                >
                                  {acting ? 'Sending…' : 'Send'}
                                </button>
                              )}
                              {inv.status === 'draft' && editingInvoiceId === inv.id && (
                                <span className="px-3 py-1.5 text-xs font-semibold text-indigo-600">Editing above ↑</span>
                              )}
                              {(inv.status === 'sent' || inv.status === 'partial') && payLink && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyInvoiceLink(payLink)}
                                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50"
                                >
                                  Copy Pay Link
                                </button>
                              )}
                              {editingPartialAmount ? (
                                <>
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      autoFocus
                                      value={partialAmountDraft.value}
                                      onChange={(e) => setPartialAmountDraft({ invoiceId: inv.id, value: e.target.value })}
                                      className="w-24 pl-5 pr-2 py-1.5 rounded-lg border border-slate-300 text-xs"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleMarkInvoicePayment(inv.id, 'partial', Number(partialAmountDraft.value))}
                                    disabled={acting || !(Number(partialAmountDraft.value) > 0)}
                                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPartialAmountDraft(null)}
                                    className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  {canMarkPayment && inv.status !== 'sent' && (
                                    <button
                                      type="button"
                                      onClick={() => handleMarkInvoicePayment(inv.id, 'sent', null)}
                                      disabled={acting}
                                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
                                    >
                                      Mark Open
                                    </button>
                                  )}
                                  {canMarkPayment && inv.status !== 'paid' && (
                                    <button
                                      type="button"
                                      onClick={() => setPartialAmountDraft({ invoiceId: inv.id, value: inv.paidAmount ? String(inv.paidAmount) : '' })}
                                      disabled={acting}
                                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
                                    >
                                      Mark Partial
                                    </button>
                                  )}
                                  {canMarkPayment && inv.status !== 'paid' && (
                                    <button
                                      type="button"
                                      onClick={() => setAcceptPaymentInvoice(inv)}
                                      disabled={acting}
                                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                      Mark Paid
                                    </button>
                                  )}
                                </>
                              )}
                              {inv.status === 'paid' && (
                                <button
                                  type="button"
                                  onClick={() => handleSendReceiptClick(inv.id)}
                                  disabled={acting}
                                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
                                >
                                  {acting ? 'Sending…' : inv.receiptSentAt ? 'Resend Receipt' : 'Send Receipt'}
                                </button>
                              )}
                              {(inv.status === 'sent' || inv.status === 'partial') && (
                                <button
                                  type="button"
                                  onClick={() => handleVoidInvoiceClick(inv.id)}
                                  disabled={acting}
                                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
                                >
                                  {acting ? 'Voiding…' : 'Void'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </form>

      <ClientModal
        open={newClientModalOpen}
        onClose={() => setNewClientModalOpen(false)}
        onSaved={(record) => update('clientId', record.id)}
      />

      <AcceptPaymentModal
        open={!!acceptPaymentInvoice}
        amountDue={acceptPaymentInvoice?.total}
        amountLabel="Invoice amount"
        onClose={() => setAcceptPaymentInvoice(null)}
        onAccept={async (payload) => {
          const updated = await markInvoicePayment(acceptPaymentInvoice.id, {
            status: 'paid',
            paidAmount: payload.amount,
            paidAt: payload.paymentDate,
            paymentMethod: payload.method,
            paymentReference: payload.checkNumber,
            paymentMemo: payload.memo,
          });
          setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)));
          showToast('Payment accepted');
        }}
      />

      <ConfirmDialog
        open={!!docPendingDelete}
        onClose={() => setDocPendingDelete(null)}
        onConfirm={confirmDeleteDocument}
        title="Remove document?"
        description={`This will remove "${docPendingDelete?.filename}" from this booking. This can't be undone.`}
      />

      <OfferingPickerModal
        open={proposalOfferingPickerOpen}
        onClose={() => setProposalOfferingPickerOpen(false)}
        onSelect={(template) => {
          const instance = { ...template, id: uid('offitem') };
          update('proposal', { ...form.proposal, offerings: [...(form.proposal?.offerings || []), instance] });
        }}
      />
      <OfferingPickerModal
        open={contractOfferingPickerOpen}
        onClose={() => setContractOfferingPickerOpen(false)}
        onSelect={(template) => {
          const instance = { ...template, id: uid('offitem') };
          setContractOfferings((prev) => [...prev, instance]);
        }}
      />
      <OfferingPickerModal
        open={invoiceOfferingPickerOpen}
        onClose={() => setInvoiceOfferingPickerOpen(false)}
        onSelect={(template) => {
          const instance = { ...template, id: uid('offitem') };
          setNewInvoiceOfferings((prev) => [...prev, instance]);
        }}
      />
    </div>
  );
}
