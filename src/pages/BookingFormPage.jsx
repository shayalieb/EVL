import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ClientModal from '../components/ClientModal';
import ClientCombobox from '../components/ClientCombobox';
import VenueCombobox from '../components/VenueCombobox';
import SendInquiryLinkModal from '../components/SendInquiryLinkModal';
import ReviewInquiryModal from '../components/ReviewInquiryModal';
import InvoiceDocument from '../components/InvoiceDocument';
import AcceptPaymentModal from '../components/AcceptPaymentModal';
import SectionsEditor from '../components/SectionsEditor';
import EventLogPanel from '../components/EventLogPanel';
import HistoryModal from '../components/HistoryModal';
import OverflowMenu from '../components/ui/OverflowMenu';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { uid } from '../lib/storage';
import { loadDraft, saveDraft, clearDraft } from '../lib/draftStorage';
import { listBookingDocuments, uploadBookingDocument, deleteBookingDocument, bookingDocumentDownloadUrl } from '../lib/bookingDocuments';
import { generateProposalPdf, generateProposalPdfAttachment, getProposalPdfDataUrl } from '../lib/proposalPdf';
import { getContractForBooking, sendContract, ownerSignContract, updateContractTerms, addContractLogNote, regenerateClientSignLink } from '../lib/contracts';
import { getProposalResponseForBooking, sendProposalResponseLink } from '../lib/proposalResponses';
import { listInquiryLinks } from '../lib/inquiryLinks';
import { buildBookingMergePatch } from '../lib/applyInquiry';
import { listInvoices, createInvoice, updateInvoice, sendInvoice, markInvoicePayment, sendReceipt, voidInvoice, getNextInvoiceInfo } from '../lib/invoices';
import { generateContractPdf, getContractPdfDataUrl } from '../lib/contractPdf';
import { generateInvoicePdf } from '../lib/invoicePdf';
import { sendEmail } from '../lib/email/send';
import { formatCurrency as currency, formatEventDate, formatVenueLine, formatEventTime, formatEmailInput, formatPhoneNumber } from '../lib/format';
import { FileIcon } from '../components/ui/icons';
import SignatureCanvas from '../components/SignatureCanvas';
import MoneyInput from '../components/ui/MoneyInput';
import { useSavingIndicator } from '../components/ui/SavingIndicator';
import OfferingPickerModal from '../components/OfferingPickerModal';
import { computeOfferingTotal, computeOfferingsTotal } from '../lib/offerings';
import { DEFAULT_ACCENT_COLOR } from '../lib/colorTheme';
import { isWedding } from '../lib/eventType';
import { pipelineSteps, proposalStatusInfo, contractStatusInfo } from '../lib/bookingPipeline';
import { PRIORITIES } from '../lib/bookingPriorities';
import { BOOKING_DISPOSITIONS, bookingDisposition } from '../lib/bookingDisposition';
import { emptyForm, emptyVenue } from '../lib/bookingDefaults';

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';
const cardClass = 'bg-white rounded-2xl border border-slate-200 p-6';
const cardTitleClass = 'text-base font-bold text-slate-800 mb-5';
const primaryButtonClass = 'px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700';

const TABS = [
  { id: 'info', label: 'Booking Info' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'contract', label: 'Contract' },
  { id: 'invoices', label: 'Invoices' },
];


const PAYMENT_METHOD_LABELS = { ach: 'ACH', check: 'Check', card: 'Card', other: 'Other' };

// Default legal boilerplate for a fresh contract draft — an ordinary
// section from here on (see withDefaultEsignSection below), so it's fully
// editable/removable in SectionsEditor exactly like a hand-typed one.
const ESIGN_SECTION_TITLE = 'Electronic Signature Consent';
const ESIGN_SECTION_TEXT = 'By signing this document electronically, all parties agree that their electronic signature is the legal equivalent of a handwritten signature, and consent to conduct this transaction electronically. Electronic records of this agreement are as valid, binding, and enforceable as a signed paper original, consistent with the U.S. Electronic Signatures in Global and National Commerce Act (E-SIGN) and applicable state law.';

// Appends the default e-signature section unless one's already present
// (matched by title, so a user who's edited its wording isn't treated as
// having a "different" section and given a duplicate).
function withDefaultEsignSection(sections) {
  if (sections.some((s) => s.title === ESIGN_SECTION_TITLE)) return sections;
  return [...sections, { id: uid('section'), title: ESIGN_SECTION_TITLE, text: ESIGN_SECTION_TEXT, value: '' }];
}

// A brand-new booking only lives in memory until "Add Booking" is clicked —
// nothing to auto-save to the server yet. But the tab itself can still be
// discarded by the browser (backgrounded to save memory) or reloaded, which
// wipes that in-progress React state outright. Mirroring the draft into
// sessionStorage (see lib/draftStorage.js) means a reload picks up right
// where the user left off instead of silently losing everything they'd typed.
const NEW_BOOKING_DRAFT_KEY = 'gigworks:newBookingDraft';

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
            data-testid={`booking-form-${category}-doc-upload-input`}
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
            <div key={d.id} data-testid={`booking-form-${category}-doc-row`} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-200 text-sm">
              <FileIcon className="w-4 h-4 text-slate-400 shrink-0" />
              <a href={bookingDocumentDownloadUrl(d.id)} target="_blank" rel="noreferrer" data-testid={`booking-form-${category}-doc-link`} className="flex-1 min-w-0 truncate text-indigo-600 hover:underline">
                {d.filename}
              </a>
              <span className="text-xs text-slate-400 shrink-0">{(d.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                onClick={() => onRequestDelete(d)}
                data-testid={`booking-form-${category}-doc-remove-button`}
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

// Shared shape for the Proposal audit log (see also EventLogPanel and the
// mirrored server-side helper in contracts.js for Contracts).
function appendLogEntry(log, entry) {
  return [...(log || []), { id: uid('log'), at: new Date().toISOString(), ...entry }];
}

const PROPOSAL_LOG_LABELS = {
  sent: 'Proposal sent',
  manual_sent: 'Manually marked as sent',
  accepted: 'Client accepted',
  revision_requested: 'Client requested changes',
  note: 'Note',
};

const CONTRACT_LOG_LABELS = {
  sent: 'Contract sent',
  manual_sent: 'Manually marked as sent',
  owner_signed: 'You signed',
  client_signed: 'Client signed',
  terms_edited: 'Terms edited',
  client_link_regenerated: 'New client sign link generated',
  note: 'Note',
};

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
      <div className="flex items-center justify-between mb-3">
        <label className={labelClass}>Offerings</label>
        <button
          type="button"
          onClick={onAddClick}
          data-testid="booking-form-offering-add-button"
          className="px-4 py-2.5 rounded-lg border-2 border-indigo-300 text-indigo-600 text-sm font-bold hover:bg-indigo-50 hover:border-indigo-400"
        >
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
            <div key={o.id} data-testid="booking-form-offering-row" className="border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={o.name}
                  onChange={(e) => handleUpdate(o.id, { name: e.target.value })}
                  placeholder="Offering name"
                  data-testid="booking-form-offering-name-input"
                  className={`${inputClass} font-semibold flex-1 min-w-0`}
                />
                {o.type === 'ensemble' ? (
                  <span
                    data-testid="booking-form-offering-ensemble-badge"
                    className="px-3.5 py-2.5 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold w-32 shrink-0 text-center"
                  >
                    Ensemble
                  </span>
                ) : (
                  <select
                    value={o.type}
                    onChange={(e) => handleUpdate(o.id, { type: e.target.value })}
                    data-testid="booking-form-offering-type-select"
                    className="px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 w-32 shrink-0"
                  >
                    <option value="general">General</option>
                    <option value="perUnit">Per Unit</option>
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(o.id)}
                  data-testid="booking-form-offering-remove-button"
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                  aria-label={`Remove ${o.name || 'offering'}`}
                >
                  ✕
                </button>
              </div>
              {o.type === 'ensemble' ? (
                <div className="mb-2">
                  {(o.instruments || []).length === 0 ? (
                    <div className="text-xs text-slate-400 italic">No musicians in this ensemble.</div>
                  ) : (
                    <ul className="space-y-1">
                      {o.instruments.map((inst, idx) => (
                        <li
                          key={idx}
                          data-testid="booking-form-offering-instrument-row"
                          className="flex items-center justify-between gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-1.5"
                        >
                          <span>• {inst}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdate(o.id, { instruments: o.instruments.filter((_, i) => i !== idx) })}
                            data-testid="booking-form-offering-instrument-remove-button"
                            className="shrink-0 text-slate-300 hover:text-red-600"
                            aria-label={`Remove ${inst}`}
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <textarea
                  rows={2}
                  value={o.details}
                  onChange={(e) => handleUpdate(o.id, { details: e.target.value })}
                  placeholder="Details (optional)"
                  data-testid="booking-form-offering-details-textarea"
                  className={`${inputClass} mb-2`}
                />
              )}
              {o.type === 'perUnit' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Unit Count</label>
                    <input
                      type="number"
                      min="0"
                      value={o.unitCount}
                      onChange={(e) => handleUpdate(o.id, { unitCount: e.target.value })}
                      data-testid="booking-form-offering-unit-count-input"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">$ Per Unit</label>
                    <MoneyInput
                      value={o.ratePerUnit}
                      onChange={(v) => handleUpdate(o.id, { ratePerUnit: v })}
                      testId="booking-form-offering-rate-per-unit-input"
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
                    testId="booking-form-offering-amount-input"
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

// Collapses variable-length, often-empty blocks (pricing, custom sections)
// so a booking with nothing in them doesn't force a long scroll past empty
// state — starts open once there's something worth seeing.
function CollapsibleSection({ title, subtitle, defaultOpen, badge, children, className = 'mt-6 pt-6 border-t border-slate-100', testId }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={testId}
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

// pipelineSteps/proposalStatusInfo/contractStatusInfo now live in
// src/lib/bookingPipeline.js — shared with BookingsPage.jsx's Stage column,
// so every view deriving "where is this booking really at" agrees.
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
    clients, loadBooking, venues, searchVenues, eventTypes, addEventType, bookingStatuses,
    addBooking, updateBooking, convertBookingToEvent, addEvent,
    proposalTemplates, addProposalTemplate, contractTemplates, addContractTemplate,
  } = useData();
  const { can, currentUser } = useAuth();
  const { showToast } = useToast();
  const notifySaving = useSavingIndicator();

  useEffect(() => {
    if (!can('manageBookings')) navigate('/bookings', { replace: true });
  }, [can, navigate]);

  const isEditing = !!bookingId;
  const [fullBooking, setFullBooking] = useState(null);
  const [bookingDetailLoaded, setBookingDetailLoaded] = useState(false);
  const booking = isEditing ? fullBooking : null;

  useEffect(() => {
    if (!bookingId) { setFullBooking(null); setBookingDetailLoaded(false); return; }
    let cancelled = false;
    setBookingDetailLoaded(false);
    loadBooking(bookingId)
      .then((full) => { if (!cancelled) setFullBooking(full); })
      .catch(() => { if (!cancelled) setFullBooking(null); })
      .finally(() => { if (!cancelled) setBookingDetailLoaded(true); });
    return () => { cancelled = true; };
  }, [bookingId, loadBooking]);

  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // "?tab=invoices" (etc.) lets a link jump straight to a specific tab —
  // used by Reminders' related-record links for invoice reminders, which
  // land here since an Invoice has no page of its own.
  const [initialTabSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const requested = initialTabSearchParams.get('tab');
    return TABS.some((t) => t.id === requested) ? requested : 'info';
  });
  const [newClientModalOpen, setNewClientModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [sendInquiryModalOpen, setSendInquiryModalOpen] = useState(false);
  const [submittedInquiryLink, setSubmittedInquiryLink] = useState(null);
  const [reviewingInquiry, setReviewingInquiry] = useState(false);
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
  const [proposalResponse, setProposalResponse] = useState(null);
  const [contractRecipientEmail, setContractRecipientEmail] = useState('');
  const [contractRecipientName, setContractRecipientName] = useState('');
  const [contractHours, setContractHours] = useState('');
  const [contractLineItems, setContractLineItems] = useState([]);
  const [contractTitle, setContractTitle] = useState('Event Contract');
  const [contractSections, setContractSections] = useState([]);
  const [contractOfferings, setContractOfferings] = useState([]);
  // "Save as Template" inline name-prompt state — one pair per document
  // type, shown/hidden independently since a business could be mid-way
  // through saving one while the other stays closed.
  const [savingProposalTemplateAs, setSavingProposalTemplateAs] = useState(false);
  const [newProposalTemplateName, setNewProposalTemplateName] = useState('');
  const [savingContractTemplateAs, setSavingContractTemplateAs] = useState(false);
  const [newContractTemplateName, setNewContractTemplateName] = useState('');
  // "Mark as Sent Manually" inline reason-prompt state — same pair-per-
  // document-type pattern as the template-name prompts above.
  const [markingProposalSentManually, setMarkingProposalSentManually] = useState(false);
  const [proposalManualSentReason, setProposalManualSentReason] = useState('');
  const [markingContractSentManually, setMarkingContractSentManually] = useState(false);
  const [contractManualSentReason, setContractManualSentReason] = useState('');
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
  // Off for invoices whose actual payment is arranged outside GigWorks —
  // sending skips the Stripe-connected gate and the public pay page shows
  // no Pay button, just the document. Defaults on for every new invoice.
  const [newInvoiceAcceptPayment, setNewInvoiceAcceptPayment] = useState(true);
  // Set right after one of the quick-create buttons (Full/Deposit/Final)
  // pre-fills the composer, so the "Copied from your Proposal" note below
  // shows the right explanation instead for offerings that actually came
  // from one of those instead. null | 'deposit' | 'full' | 'final'
  const [newInvoicePrefillKind, setNewInvoicePrefillKind] = useState(null);
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
  // Drives inline validation messages under the composer's fields — true
  // once a Save/Send has been tried at least once, so errors don't show
  // before the user has attempted anything; recomputed live off current
  // field values so they clear themselves the moment the user fixes them.
  const [invoiceSubmitAttempted, setInvoiceSubmitAttempted] = useState(false);
  const [invoiceActionId, setInvoiceActionId] = useState(null);
  const [lastInvoicePayLink, setLastInvoicePayLink] = useState(null); // { invoiceId, link } — only known right after sending, same as contract sign links
  const [partialAmountDraft, setPartialAmountDraft] = useState(null); // { invoiceId, value } — inline "$ paid so far" editor for one row at a time
  const [acceptPaymentInvoice, setAcceptPaymentInvoice] = useState(null); // invoice currently open in the Accept Payment popover, or null
  const [proposalPreviewUrl, setProposalPreviewUrl] = useState('');
  const [showProposalPreview, setShowProposalPreview] = useState(false);
  const [loadingProposalPreview, setLoadingProposalPreview] = useState(false);
  const [contractPreviewUrl, setContractPreviewUrl] = useState('');
  const [showContractPreview, setShowContractPreview] = useState(false);
  const [loadingContractPreview, setLoadingContractPreview] = useState(false);
  const [sendingContract, setSendingContract] = useState(false);
  const [regeneratingClientLink, setRegeneratingClientLink] = useState(false);
  const [contractSubmitAttempted, setContractSubmitAttempted] = useState(false);
  const [lastSignLink, setLastSignLink] = useState('');
  const [lastOwnerSignLink, setLastOwnerSignLink] = useState('');
  const [ownerSignerName, setOwnerSignerName] = useState('');
  const [ownerSignatureImage, setOwnerSignatureImage] = useState('');
  const [signingOwner, setSigningOwner] = useState(false);
  const [contractTerms, setContractTerms] = useState('');

  const client = clients.find((c) => c.id === form.clientId);
  const autoSaveSkipRef = useRef(true);
  const bookingSaveChainRef = useRef(Promise.resolve());
  const termsSkipRef = useRef(true);
  const autoCreatedEventRef = useRef(false);
  // Background refreshes (e.g. the window-focus refetch in AuthContext) hand
  // back a brand-new `booking` object even when nothing changed, which would
  // otherwise re-run this effect and clobber whatever the user is mid-typing.
  // Only actually hydrate once per booking id.
  const hydratedBookingIdRef = useRef(null);

  function enqueueBookingUpdate(id, patch) {
    const pending = bookingSaveChainRef.current.catch(() => {}).then(() => updateBooking(id, patch));
    bookingSaveChainRef.current = pending;
    return pending;
  }

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
        brideName: booking.brideName || '',
        groomName: booking.groomName || '',
        guestCount: booking.guestCount ?? '',
        venue: { ...emptyVenue(), ...booking.venue },
        schedule: booking.schedule && booking.schedule.length ? booking.schedule : [emptyScheduleItem()],
        depositAmount: booking.depositAmount ?? '',
        depositDueDate: booking.depositDueDate || '',
        depositPaid: !!booking.depositPaid,
        depositType: booking.depositType || 'fixed',
        depositPercent: booking.depositPercent ?? '',
        bookingStatus: bookingDisposition(booking.bookingStatus, bookingStatuses),
        priority: booking.priority || '',
        nextFollowUpDate: booking.nextFollowUpDate || '',
        contractSignedDate: booking.contractSignedDate || '',
        referralSource: booking.referralSource || '',
        notes: booking.notes || '',
        activityLog: booking.activityLog || [],
        proposal: booking.proposal || null,
      });
    } else if (!isEditing) {
      // bookingId is undefined for the whole time you're drafting a brand-new
      // booking — guard on it (not just truthiness of `booking`) so a
      // background refresh doesn't wipe that in-progress, not-yet-saved draft.
      if (hydratedBookingIdRef.current === bookingId) return;
      hydratedBookingIdRef.current = bookingId;
      setForm(loadDraft(NEW_BOOKING_DRAFT_KEY) || emptyForm());
    } else {
      // isEditing but `booking` (the full-detail fetch) hasn't resolved yet —
      // nothing to hydrate from. Do NOT touch hydratedBookingIdRef here, or
      // the real hydration above would see it already "done" once the fetch
      // lands and skip populating the form entirely.
      return;
    }
    setError('');
    setAddingType(false);
    setNewActivityText('');
    // The setForm above is a load, not an edit — the auto-save effect below
    // would otherwise immediately re-persist the just-loaded data as if the
    // user had typed something.
    autoSaveSkipRef.current = true;
    autoCreatedEventRef.current = false;
  }, [bookingId, booking, bookingStatuses, isEditing]);

  // Mirrors the in-progress draft of a brand-new (not-yet-saved) booking into
  // sessionStorage on every change, so a discarded/reloaded tab can recover
  // it — see lib/draftStorage.js.
  useEffect(() => {
    if (booking || isEditing) return;
    saveDraft(NEW_BOOKING_DRAFT_KEY, form);
  }, [form, booking, isEditing]);

  // Auto-saves an existing booking shortly after any field changes — no
  // explicit "Save Changes" click needed. Only for bookings that already
  // exist; a brand-new one still needs its first, deliberate "Add Booking".
  useEffect(() => {
    if (!booking) return;
    if (autoSaveSkipRef.current) { autoSaveSkipRef.current = false; return; }
    const timer = setTimeout(() => {
      persistBooking().promise.catch((err) => setError(err.message || 'Failed to save changes.'));
    }, 800);
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

  // Checks whether a client has already responded to an inquiry link sent
  // from this specific booking (see the "Inquiry Link" widget below) — only
  // relevant once saved, since a brand-new unsaved booking can't have had a
  // link sent from it yet.
  const refreshSubmittedInquiry = useCallback(async (id) => {
    try {
      const links = await listInquiryLinks({ status: 'submitted', bookingId: id });
      setSubmittedInquiryLink(links[0] || null);
    } catch {
      // best-effort — the widget just shows no pending response if this fails
    }
  }, []);

  useEffect(() => {
    if (booking) refreshSubmittedInquiry(booking.id);
  }, [booking, refreshSubmittedInquiry]);

  useEffect(() => {
    if (!booking) { setContract(null); return; }
    let cancelled = false;
    getContractForBooking(booking.id).then((c) => { if (!cancelled) setContract(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [booking]);

  useEffect(() => {
    if (!booking) { setProposalResponse(null); return; }
    let cancelled = false;
    getProposalResponseForBooking(booking.id).then((pr) => { if (!cancelled) setProposalResponse(pr); }).catch(() => {});
    return () => { cancelled = true; };
  }, [booking]);

  useEffect(() => {
    if (!booking) { setInvoices([]); return; }
    let cancelled = false;
    listInvoices(booking.id).then((list) => { if (!cancelled) setInvoices(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, [booking]);

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
  }, [booking]);

  useEffect(() => {
    if (!client) return;
    setNewInvoiceRecipientEmail((prev) => prev || client.email || '');
    setNewInvoiceRecipientName((prev) => prev || `${client.firstName} ${client.lastName}`.trim());
  }, [client]);

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
  }, [booking]);

  useEffect(() => {
    if (!client) return;
    setContractRecipientEmail((prev) => prev || client.email || '');
    setContractRecipientName((prev) => prev || `${client.firstName} ${client.lastName}`.trim());
  }, [client]);

  // Terms rides along in the initial send payload before a contract exists,
  // then switches to auto-saving via PATCH below — same field either way, so
  // the prep-panel text carries straight through instead of being retyped.
  // Keyed on the booking too (not just the contract) so switching to a
  // different not-yet-sent booking clears stale prep-panel text.
  useEffect(() => {
    setContractTerms(contract?.terms || '');
    termsSkipRef.current = true;
    // Intentionally keyed to identity, not contract.terms: the PATCH below
    // replaces `contract` after each autosave. Reacting to that response
    // would set termsSkipRef again and silently discard the next user edit.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
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
      // offerings/line items/hours below); only fall back to the legacy
      // account-wide default when the proposal doesn't have any of its own
      // yet — that default is read-only now (see settings/TemplatesTab.jsx's
      // one-time migration into a real named template), nothing writes back
      // to it anymore. Either way, ensure the e-signature disclosure is
      // present — it belongs to the contract regardless of which path fed
      // these sections in, since a proposal's own sections (Technical
      // Rider, etc.) never carry it. withDefaultEsignSection is a no-op if
      // it's already there (e.g. the legacy-default path, or the user's own
      // template already has one), and it's just an ordinary section from
      // here on — same edit/remove as anything else in SectionsEditor.
      setContractSections(
        withDefaultEsignSection(
          booking?.proposal?.sections?.length ? booking.proposal.sections : (currentUser.contractTemplate?.sections || [])
        )
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id, contract?.id]);

  // Once both signatures are in, the event is created automatically — no
  // button to click. Guarded by a ref (not just booking.convertedEventId)
  // so a re-render before that update lands can't fire this twice.
  useEffect(() => {
    if (contract?.status === 'fully_signed' && booking && !booking.convertedEventId && !autoCreatedEventRef.current) {
      autoCreatedEventRef.current = true;
      createEventFromContract(false).catch((err) => {
        autoCreatedEventRef.current = false;
        showToast(err.message || 'Failed to create the signed event', 'error');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract?.status, booking?.convertedEventId]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  // Explicit, visible template load — replaces whatever's currently in the
  // sections editor rather than the old silent-auto-cache-on-every-keystroke
  // behavior it replaces (see settings/TemplatesTab.jsx for where these
  // named templates are managed).
  function handleLoadProposalTemplate(templateId) {
    const template = proposalTemplates.find((t) => t.id === templateId);
    if (!template) return;
    update('proposal', { ...form.proposal, sections: template.sections || [] });
    showToast(`Loaded "${template.name}"`);
  }

  function handleSaveProposalTemplateAs() {
    if (!newProposalTemplateName.trim()) return;
    addProposalTemplate({ name: newProposalTemplateName.trim(), sections: form.proposal?.sections || [] });
    showToast('Template saved');
    setSavingProposalTemplateAs(false);
    setNewProposalTemplateName('');
  }

  function handleLoadContractTemplate(templateId) {
    const template = contractTemplates.find((t) => t.id === templateId);
    if (!template) return;
    setContractTitle(template.title || 'Event Contract');
    setContractSections(template.sections || []);
    showToast(`Loaded "${template.name}"`);
  }

  function handleSaveContractTemplateAs() {
    if (!newContractTemplateName.trim()) return;
    addContractTemplate({ name: newContractTemplateName.trim(), title: contractTitle, sections: contractSections });
    showToast('Template saved');
    setSavingContractTemplateAs(false);
    setNewContractTemplateName('');
  }

  function updateVenue(field, val) {
    setForm((f) => ({ ...f, venue: { ...f.venue, [field]: val } }));
  }

  // Picking a saved venue from VenueCombobox autofills every field it has —
  // typing a name that doesn't match one just behaves like a plain text
  // field (updateVenue('name', ...) above), and gets auto-saved as a new
  // venue once this booking itself is saved (see DataContext's
  // ensureVenueSaved).
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

  // Merges a submitted inquiry response into this page's own `form` state
  // (same as if the agent had typed the values in) rather than going through
  // DataContext.updateBooking — this form is already open, and its
  // hydration effect only ever runs once per booking id, so a live
  // updateBooking() call wouldn't be reflected here without a reload. The
  // existing 800ms autosave effect persists it normally from here.
  async function handleApplyInquiryOverride(response, { clientId } = {}) {
    const venueMatches = response.venueName ? await searchVenues(response.venueName).catch(() => []) : [];
    const candidateVenues = [...venues, ...venueMatches.filter((match) => !venues.some((venue) => venue.id === match.id))];
    const patch = buildBookingMergePatch(response, form, candidateVenues);
    setForm((f) => ({ ...f, ...patch, clientId }));
    return { bookingId: form.id, clientId };
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

  // Returns { patch, promise } — `patch` is the current form values, built
  // and available synchronously so callers that just need up-to-date data
  // (PDF generation, etc.) don't have to wait on the network; `promise` is
  // the actual save, for callers that need to know whether it succeeded.
  function persistBooking() {
    const patch = buildBookingPatch();
    const promise = booking ? enqueueBookingUpdate(booking.id, patch) : addBooking(patch);
    return { patch, promise };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); setActiveTab('info'); return; }
    setSaving(true);
    const wasNew = !booking;
    const { patch, promise } = persistBooking();
    try {
      await promise;
      showToast(wasNew ? 'Booking added' : 'Booking updated');
      // Stay on the form after saving — only Back/Cancel or navigating
      // elsewhere in the app should leave it. A brand-new booking's `id`
      // was already generated up front in emptyForm() (for document
      // uploads on an unsaved booking), so it's known before this save and
      // doubles as the real record's id once persistBooking() creates it —
      // swap the route from /bookings/new to /bookings/:id so the form is
      // now in edit mode.
      if (wasNew) {
        clearDraft(NEW_BOOKING_DRAFT_KEY);
        navigate(`/bookings/${patch.id}`, { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Failed to save booking.');
    } finally {
      setSaving(false);
    }
  }

  function handleLeaveWithoutSaving() {
    if (!booking) clearDraft(NEW_BOOKING_DRAFT_KEY);
    navigate('/bookings');
  }

  async function handleConvert() {
    try {
      const event = await convertBookingToEvent(booking.id);
      if (!event) return;
      showToast('Event created');
      navigate(`/events/${event.id}`);
    } catch (err) {
      showToast(err.message || 'Failed to create event', 'error');
    }
  }

  function handlePushToProposal() {
    const proposal = { hours: '', lineItems: [], sections: currentUser.proposalTemplate?.sections || [], offerings: [], sentAt: null, sentTo: null, log: [] };
    update('proposal', proposal);
    if (booking) enqueueBookingUpdate(booking.id, { proposal });
  }

  async function handleDownloadProposal() {
    const { patch, promise } = persistBooking();
    promise.catch((err) => showToast(err.message || 'Failed to save changes.', 'error'));
    try {
      await generateProposalPdf({ booking: patch, client, businessInfo: currentUser.businessInfo || {} });
    } catch (err) {
      showToast(err.message || 'Failed to generate PDF', 'error');
    }
  }

  // Renders exactly what Download/Send would produce, inline, so it's easy
  // to confirm what's actually in the PDF (venue, custom sections, pricing,
  // etc.) without leaving the page — same pattern as the Contract tab's
  // Preview (see handleTogglePreview below).
  async function handleToggleProposalPreview() {
    if (showProposalPreview) {
      setShowProposalPreview(false);
      return;
    }
    setLoadingProposalPreview(true);
    try {
      const { patch, promise } = persistBooking();
      promise.catch((err) => showToast(err.message || 'Failed to save changes.', 'error'));
      const url = await getProposalPdfDataUrl({ booking: patch, client, businessInfo: currentUser.businessInfo || {} });
      setProposalPreviewUrl(url);
      setShowProposalPreview(true);
    } catch (err) {
      showToast(err.message || 'Failed to build preview', 'error');
    } finally {
      setLoadingProposalPreview(false);
    }
  }

  // Frozen at send time, same reasoning as Contract.snapshot — a later edit
  // to the booking/proposal shouldn't retroactively change what the client
  // is looking at on the public respond page, or already responded to.
  function buildProposalSnapshot(patch) {
    return {
      businessInfo: currentUser.businessInfo || {},
      client: client ? { firstName: client.firstName, lastName: client.lastName, email: client.email, phone: client.phone } : null,
      booking: {
        eventType: patch.eventType,
        eventDate: patch.eventDate,
        venue: patch.venue,
        notes: patch.notes,
        depositAmount: patch.depositAmount,
        depositDueDate: patch.depositDueDate,
        brideName: patch.brideName,
        groomName: patch.groomName,
      },
      proposal: {
        hours: patch.proposal?.hours,
        lineItems: patch.proposal?.lineItems || [],
        offerings: patch.proposal?.offerings || [],
        sections: patch.proposal?.sections || [],
      },
    };
  }

  async function handleSendProposal() {
    if (!client?.email) {
      showToast("This client doesn't have an email address on file", 'error');
      return;
    }
    setSendingProposal(true);
    try {
      const { patch, promise } = persistBooking();
      promise.catch((err) => showToast(err.message || 'Failed to save changes.', 'error'));
      const businessInfo = currentUser.businessInfo || {};
      const fromName = businessInfo.name || `${currentUser.firstName} ${currentUser.lastName}`;
      const recipientName = `${client.firstName} ${client.lastName}`.trim();
      // Created before the email goes out — the respond link only exists
      // here and in the email about to be sent below (same reasoning as
      // Contract's sign token: only the hash is ever persisted).
      const { proposalResponse: createdResponse, respondLink } = await sendProposalResponseLink({
        bookingId: booking.id,
        recipientEmail: client.email,
        recipientName,
        snapshot: buildProposalSnapshot(patch),
      });
      setProposalResponse(createdResponse);
      const pdfAttachment = await generateProposalPdfAttachment({ booking: patch, client, businessInfo });
      await sendEmail({
        to: client.email,
        subject: `Proposal from ${fromName}`,
        body: `<p>Hi ${client.firstName},</p><p>Please find attached our proposal for your event.</p><p><a href="${respondLink}">Click here to review and respond to the proposal</a></p><p>Let us know if you have any questions!</p><p>${fromName}</p>`,
        fromName,
        pdfAttachment,
      });
      const sentProposal = {
        ...(patch.proposal || {}),
        sentAt: new Date().toISOString(),
        sentTo: client.email,
        log: appendLogEntry(patch.proposal?.log, { type: 'sent', actorEmail: currentUser.email, note: null }),
      };
      enqueueBookingUpdate(booking.id, { proposal: sentProposal });
      update('proposal', sentProposal);
      showToast(`Proposal sent to ${client.email}`);
    } catch (err) {
      showToast(err.message || 'Failed to send proposal', 'error');
    } finally {
      setSendingProposal(false);
    }
  }

  // Records that a proposal was delivered outside the app's own send flow
  // (printed, texted, signed in person, etc.) — same "it's been sent" end
  // state as handleSendProposal, minus the email, plus a required reason
  // so there's a real audit trail for why it's marked sent without one. A
  // respond link is still generated (skipping only the email itself) in
  // case it's useful to share by hand, same as Contract's manual-sent path.
  async function handleMarkProposalSentManually(reason) {
    try {
      const { patch } = persistBooking();
      if (client?.email) {
        const { proposalResponse: createdResponse } = await sendProposalResponseLink({
          bookingId: booking.id,
          recipientEmail: client.email,
          recipientName: `${client.firstName} ${client.lastName}`.trim(),
          snapshot: buildProposalSnapshot(patch),
          manual: true,
          reason,
        });
        setProposalResponse(createdResponse);
      }
    } catch (err) {
      showToast(err.message || 'Failed to record the manual send.', 'error');
    }
    const sentProposal = {
      ...form.proposal,
      sentAt: new Date().toISOString(),
      sentTo: client?.email || form.proposal.sentTo || 'Marked sent manually',
      log: appendLogEntry(form.proposal.log, { type: 'manual_sent', actorEmail: currentUser.email, note: reason }),
    };
    enqueueBookingUpdate(booking.id, { proposal: sentProposal });
    update('proposal', sentProposal);
    showToast('Proposal marked as sent');
  }

  function handleAddProposalLogNote(note) {
    const updatedProposal = { ...form.proposal, log: appendLogEntry(form.proposal.log, { type: 'note', actorEmail: currentUser.email, note }) };
    enqueueBookingUpdate(booking.id, { proposal: updatedProposal });
    update('proposal', updatedProposal);
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
        brideName: form.brideName,
        groomName: form.groomName,
      },
      hours: contractHours,
      lineItems: contractLineItems,
      offerings: contractOfferings,
      title: contractTitle,
      sections: contractSections,
      style: {
        accentColor: currentUser.businessInfo?.accentColor || DEFAULT_ACCENT_COLOR,
        documentLayout: currentUser.businessInfo?.documentLayout,
        documentTextScale: currentUser.businessInfo?.documentTextScale,
      },
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
    setNewInvoiceAcceptPayment(true);
    setNewInvoicePrefillKind(null);
    setShowInvoicePreview(false);
    setInvoiceSubmitAttempted(false);
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
    setNewInvoiceAcceptPayment(inv.acceptPayment !== false);
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

  // Pre-fills a fresh invoice from the Deposit fields on Booking Info and
  // drops straight into the Invoices tab to review/send — bridges the
  // deposit note into a real, collectible invoice instead of leaving it a
  // manual honor-system checkbox.
  function handleCreateDepositInvoice() {
    resetInvoiceComposer();
    setNewInvoiceOfferings([
      { id: uid('offitem'), name: 'Deposit', details: '', type: 'general', amount: Number(form.depositAmount) || 0, unitCount: '', ratePerUnit: '' },
    ]);
    setNewInvoiceDueDate(form.depositDueDate || '');
    setNewInvoiceMemo(`Deposit for ${eventLabel}`);
    setNewInvoiceRecipientEmail(client?.email || '');
    setNewInvoiceRecipientName(client ? `${client.firstName} ${client.lastName}`.trim() : '');
    setNewInvoicePrefillKind('deposit');
    setActiveTab('invoices');
  }

  // Sibling to handleCreateDepositInvoice — used instead when the business
  // skips a deposit and bills the whole event in one shot.
  function handleCreateFullInvoice() {
    resetInvoiceComposer();
    setNewInvoiceOfferings([
      { id: uid('offitem'), name: 'Full Event Balance', details: '', type: 'general', amount: grandTotal, unitCount: '', ratePerUnit: '' },
    ]);
    setNewInvoiceMemo(`Full balance for ${eventLabel}`);
    setNewInvoiceRecipientEmail(client?.email || '');
    setNewInvoiceRecipientName(client ? `${client.firstName} ${client.lastName}`.trim() : '');
    setNewInvoicePrefillKind('full');
    setActiveTab('invoices');
  }

  // Used once something (a deposit, or any other invoice) has already been
  // invoiced — pre-fills whatever's left of the grand total rather than
  // making the business do that math by hand.
  function handleCreateFinalInvoice() {
    resetInvoiceComposer();
    setNewInvoiceOfferings([
      { id: uid('offitem'), name: 'Final Payment', details: '', type: 'general', amount: Math.max(remainingBalance, 0), unitCount: '', ratePerUnit: '' },
    ]);
    setNewInvoiceMemo(`Final payment for ${eventLabel}`);
    setNewInvoiceRecipientEmail(client?.email || '');
    setNewInvoiceRecipientName(client ? `${client.firstName} ${client.lastName}`.trim() : '');
    setNewInvoicePrefillKind('final');
    setActiveTab('invoices');
  }

  async function handleSaveInvoiceDraft() {
    setInvoiceSubmitAttempted(true);
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
        acceptPayment: newInvoiceAcceptPayment,
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
    setInvoiceSubmitAttempted(true);
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
        acceptPayment: newInvoiceAcceptPayment,
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

  async function handleDownloadInvoice() {
    try {
      await generateInvoicePdf({
        businessInfo: currentUser.businessInfo,
        client,
        event: { type: form.eventType, date: form.eventDate, venue: formatVenueLine(form.venue) },
        lineItems: newInvoiceOfferings,
        dueDate: newInvoiceDueDate,
        memo: newInvoiceMemo,
        status: 'draft',
        number: newInvoiceNumber ? Number(newInvoiceNumber) : null,
      });
    } catch (err) {
      showToast(err.message || 'Failed to generate PDF', 'error');
    }
  }

  async function handleDownloadExistingInvoice(inv) {
    try {
      await generateInvoicePdf({
        businessInfo: inv.snapshot?.businessInfo,
        client: inv.snapshot?.client,
        event: inv.snapshot?.event,
        lineItems: inv.snapshot?.lineItems,
        dueDate: inv.dueDate,
        memo: inv.memo,
        total: inv.total,
        status: inv.status,
        paidAmount: inv.paidAmount,
        number: inv.number,
        issueDate: inv.sentAt || inv.createdAt,
      });
    } catch (err) {
      showToast(err.message || 'Failed to generate PDF', 'error');
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
    setContractSubmitAttempted(true);
    if (!contractRecipientEmail.trim()) {
      showToast('Recipient email is required', 'error');
      return;
    }
    setSendingContract(true);
    try {
      persistBooking().promise.catch((err) => showToast(err.message || 'Failed to save changes.', 'error'));
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

  // Records that a contract was delivered outside GigWorks (printed,
  // texted, signed in person, etc.) — same "it's out" end state as
  // handleSendContract, minus the email, plus a required reason. A
  // Contract row doesn't exist until this call (there's no draft state),
  // so this is an alternate creation path rather than a later status flip.
  async function handleMarkContractSentManually(reason) {
    setContractSubmitAttempted(true);
    if (!contractRecipientEmail.trim()) {
      showToast('Recipient email is required', 'error');
      return;
    }
    setSendingContract(true);
    try {
      persistBooking().promise.catch((err) => showToast(err.message || 'Failed to save changes.', 'error'));
      const { contract: created, signLink, ownerSignLink } = await sendContract({
        bookingId: booking.id,
        recipientEmail: contractRecipientEmail.trim(),
        recipientName: contractRecipientName.trim(),
        snapshot: buildContractSnapshot(),
        terms: contractTerms,
        manual: true,
        reason,
      });
      setContract(created);
      // Manual mode skips the email, but the server still issues both sign
      // tokens — without capturing these, there'd be no way to actually get
      // the client a link to sign from.
      setLastSignLink(signLink);
      setLastOwnerSignLink(ownerSignLink);
      showToast('Contract marked as sent');
    } catch (err) {
      showToast(err.message || 'Failed to mark contract as sent', 'error');
    } finally {
      setSendingContract(false);
    }
  }

  async function handleAddContractLogNote(note) {
    const updated = await addContractLogNote(contract.id, note);
    setContract(updated);
  }

  // Covers a lost/never-sent client link — e.g. a contract marked sent
  // manually, where no email ever went out. Issues a fresh token, so any
  // previously shared link (if one existed) stops working.
  async function handleRegenerateClientLink() {
    setRegeneratingClientLink(true);
    try {
      const { contract: updated, signLink } = await regenerateClientSignLink(contract.id);
      setContract(updated);
      setLastSignLink(signLink);
      showToast('New client sign link generated');
    } catch (err) {
      showToast(err.message || 'Failed to generate a new link', 'error');
    } finally {
      setRegeneratingClientLink(false);
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
  async function createEventFromContract(navigateAfter) {
    if (!booking || !contract) return;
    const contractBooking = contract.snapshot.booking || {};
    const grandTotal = computeGrandTotal(contract.snapshot.lineItems, contract.snapshot.offerings);
    const name = [client ? `${client.firstName} ${client.lastName}` : '', contractBooking.eventType].filter(Boolean).join(' ') || 'New Event';
    const noteLines = [
      'Created from a fully signed contract.',
      contract.snapshot.hours ? `Estimated hours: ${contract.snapshot.hours}` : null,
      `Contract total: ${currency(grandTotal)}`,
    ].filter(Boolean);
    const event = await addEvent({
      name,
      eventType: contractBooking.eventType || '',
      eventDate: contractBooking.eventDate || '',
      clientId: booking.clientId || '',
      venue: { ...emptyVenue(), ...(contractBooking.venue || booking.venue) },
      contactEmail: client?.email || '',
      contactPhone: client?.phone || '',
      eventNote: noteLines.join(' '),
    });
    await enqueueBookingUpdate(booking.id, { convertedEventId: event.id });
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

  // The contract's frozen pricing is authoritative once it exists (it won't
  // change after signing); otherwise the proposal's still-live pricing is
  // the best number available. Used to size a percentage deposit and to
  // work out what's left to invoice after a deposit/full invoice goes out.
  const grandTotal = contract
    ? computeGrandTotal(contractLineItems, contractOfferings)
    : computeGrandTotal(form.proposal?.lineItems, form.proposal?.offerings);

  // A percent-based deposit's dollar amount is only ever set by the
  // percent input's own onChange (see the two Deposit sections below) —
  // it doesn't otherwise track grandTotal, so it went stale whenever
  // pricing changed some other way (e.g. adding an offering) after the
  // percent was set. This keeps it correct regardless of what moved
  // grandTotal.
  useEffect(() => {
    if (form.depositType !== 'percent' || form.depositPercent === '') return;
    const synced = Math.round((Number(form.depositPercent) / 100) * grandTotal * 100) / 100;
    if (synced !== form.depositAmount) update('depositAmount', synced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grandTotal, form.depositType, form.depositPercent]);

  const alreadyInvoiced = invoices.filter((inv) => inv.status !== 'void').reduce((sum, inv) => sum + (inv.total || 0), 0);
  const remainingBalance = grandTotal - alreadyInvoiced;
  // Used to make quick-created invoice memos self-explanatory (e.g. "Deposit
  // for Test Event on Dec 15, 2026") instead of a bare "Deposit" that doesn't
  // say which event/booking — or which date — it's for.
  const eventLabel = [form.eventName || form.eventType || 'your event', form.eventDate ? `on ${formatEventDate(form.eventDate)}` : null]
    .filter(Boolean)
    .join(' ');

  const canConvert = booking && !booking.convertedEventId;

  if (isEditing && !booking) {
    if (!bookingDetailLoaded) {
      return (
        <div className="max-w-2xl mx-auto text-center py-16">
          <span className="inline-block w-6 h-6 rounded-full border-2 border-slate-300 border-t-indigo-600 animate-spin" />
        </div>
      );
    }
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-slate-500 mb-4">This booking couldn't be found.</p>
        <button
          type="button"
          onClick={() => navigate('/bookings')}
          data-testid="booking-form-not-found-back-button"
          className={primaryButtonClass}
        >
          Back to Bookings
        </button>
      </div>
    );
  }

  const title = isEditing ? (client ? `${client.firstName} ${client.lastName}` : 'Booking') : 'Add Booking';

  return (
    <div className="max-w-6xl mx-auto">
      <div className="sticky top-0 z-10 bg-slate-50 pt-1 pb-3 -mt-1 flex items-center justify-between gap-4 mb-3 flex-wrap shadow-[0_4px_6px_-6px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleLeaveWithoutSaving}
            data-testid="booking-form-back-button"
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100"
            aria-label="Back to Bookings"
          >
            ←
          </button>
          <h2 className="text-2xl font-bold text-slate-800 truncate">{title}</h2>
        </div>
        <div className="flex gap-2 shrink-0">
          {booking?.convertedEventId ? (
            <button
              type="button"
              onClick={() => navigate(`/events/${booking.convertedEventId}`)}
              data-testid="booking-form-view-event-button"
              className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
            >
              View Event →
            </button>
          ) : canConvert && (
            <button
              type="button"
              onClick={handleConvert}
              data-testid="booking-form-convert-button"
              className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
            >
              Create Event →
            </button>
          )}
          {booking && (
            <button
              type="button"
              onClick={() => setHistoryModalOpen(true)}
              data-testid="booking-form-history-button"
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50"
            >
              History
            </button>
          )}
          <button type="button" onClick={handleLeaveWithoutSaving} data-testid="booking-form-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="submit"
            form="booking-form"
            disabled={saving}
            data-testid="booking-form-submit-button"
            className={`${primaryButtonClass} disabled:opacity-60 flex items-center gap-2`}
          >
            {saving && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            {isEditing ? 'Save Changes' : 'Add Booking'}
          </button>
        </div>
      </div>

      {booking?.convertedEventId && (
        <div data-testid="booking-form-converted-banner" className="flex items-center justify-between gap-3 text-sm bg-blue-50 border border-blue-100 text-blue-700 rounded-lg px-3 py-2 mb-6">
          <span>Converted to an event.</span>
          <button
            type="button"
            onClick={() => navigate(`/events/${booking.convertedEventId}`)}
            data-testid="booking-form-converted-view-event-button"
            className="font-semibold hover:underline shrink-0"
          >
            View Event →
          </button>
        </div>
      )}

      <PipelineStepper steps={pipelineSteps(booking, form.proposal, contract, invoices, proposalResponse)} />

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Badge color={proposalStatusInfo(form.proposal, proposalResponse).color}>Proposal: {proposalStatusInfo(form.proposal, proposalResponse).label}</Badge>
        <Badge color={contractStatusInfo(contract).color}>Contract: {contractStatusInfo(contract).label}</Badge>
      </div>

      <div className="flex overflow-x-auto border-b border-slate-200 mb-6">
        {TABS.map((t) => {
          const count = t.id === 'proposal' ? proposalDocs.length : t.id === 'contract' ? contractDocs.length : 0;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              data-testid={`booking-form-tab-${t.id}`}
              className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px flex items-center gap-2 ${
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

      {error && <div data-testid="booking-form-error-banner" className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

      <form
        id="booking-form"
        onSubmit={handleSubmit}
        onBlur={(e) => {
          if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) notifySaving();
        }}
        className="space-y-6"
      >
        <div className={activeTab === 'info' ? 'space-y-6' : 'hidden'}>
        {booking && (
          <div className={cardClass}>
            {submittedInquiryLink ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className={`${cardTitleClass} mb-1`}>Inquiry Link</h3>
                  <p className="text-sm text-slate-500">
                    {submittedInquiryLink.response?.firstName} {submittedInquiryLink.response?.lastName} responded to your inquiry link.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewingInquiry(true)}
                  data-testid="booking-form-review-inquiry-button"
                  className="shrink-0 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
                >
                  Review Response
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className={`${cardTitleClass} mb-1`}>Inquiry Link</h3>
                  <p className="text-sm text-slate-500">Send the client a secure link to fill in the event details themselves.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSendInquiryModalOpen(true)}
                  data-testid="booking-form-send-inquiry-link-button"
                  className="shrink-0 px-4 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
                >
                  Send Inquiry Link
                </button>
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className={cardClass}>
            <h3 className={cardTitleClass}>Booking Details</h3>
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Event Name</label>
                <input value={form.eventName} onChange={(e) => update('eventName', e.target.value)} data-testid="booking-form-event-name-input" className={inputClass} />
              </div>

              {isWedding(form.eventType) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Bride's Name</label>
                    <input value={form.brideName} onChange={(e) => update('brideName', e.target.value)} data-testid="booking-form-bridename-input" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Groom's Name</label>
                    <input value={form.groomName} onChange={(e) => update('groomName', e.target.value)} data-testid="booking-form-groomname-input" className={inputClass} />
                  </div>
                </div>
              )}

              <div>
                <label className={labelClass}>Client *</label>
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <ClientCombobox value={form.clientId} onChange={(id) => update('clientId', id)} testId="booking-form-client-combobox" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewClientModalOpen(true)}
                    data-testid="booking-form-new-client-button"
                    className="shrink-0 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
                  >
                    + New Client
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Event Date (tentative is fine)</label>
                  <input type="date" value={form.eventDate} onChange={(e) => update('eventDate', e.target.value)} data-testid="booking-form-event-date-input" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Event Type</label>
                  {!addingType ? (
                    <div className="flex gap-2">
                      <select
                        value={form.eventType}
                        onChange={(e) => {
                          const nextType = e.target.value;
                          setForm((f) => ({ ...f, eventType: nextType, ...(isWedding(nextType) ? {} : { brideName: '', groomName: '' }) }));
                        }}
                        data-testid="booking-form-event-type-select"
                        className={inputClass}
                      >
                        <option value="">Select a type…</option>
                        {eventTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button type="button" onClick={() => setAddingType(true)} data-testid="booking-form-add-event-type-button" className="shrink-0 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50">+ Add</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input autoFocus value={newTypeLabel} onChange={(e) => setNewTypeLabel(e.target.value)} placeholder="New event type" data-testid="booking-form-new-event-type-input" className={inputClass} />
                      <button type="button" onClick={handleAddType} data-testid="booking-form-save-event-type-button" className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Save</button>
                      <button type="button" onClick={() => setAddingType(false)} data-testid="booking-form-cancel-event-type-button" className="shrink-0 px-3 py-2 rounded-lg text-slate-500 text-sm">Cancel</button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className={labelClass}>Expected Guest Count</label>
                <input
                  type="number"
                  min="0"
                  value={form.guestCount}
                  onChange={(e) => update('guestCount', e.target.value)}
                  data-testid="booking-form-guest-count-input"
                  className={`${inputClass} max-w-[10rem]`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Disposition</label>
                  <select value={form.bookingStatus} onChange={(e) => update('bookingStatus', e.target.value)} data-testid="booking-form-status-select" className={inputClass}>
                    {BOOKING_DISPOSITIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-slate-400">Workflow progress is updated automatically from proposals, contracts, events, and payments.</p>
                </div>
                <div>
                  <label className={labelClass}>Priority</label>
                  <select value={form.priority} onChange={(e) => update('priority', e.target.value)} data-testid="booking-form-priority-select" className={inputClass}>
                    <option value="">None</option>
                    {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Next Follow-up Date</label>
                  <input type="date" value={form.nextFollowUpDate} onChange={(e) => update('nextFollowUpDate', e.target.value)} data-testid="booking-form-next-followup-date-input" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Referral Source</label>
                  <input value={form.referralSource} onChange={(e) => update('referralSource', e.target.value)} data-testid="booking-form-referral-source-input" className={inputClass} />
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
                <VenueCombobox
                  value={form.venue.name}
                  onChangeName={(name) => updateVenue('name', name)}
                  onSelectVenue={selectSavedVenue}
                  testId="booking-form-venue-name-input"
                />
                <p className="text-xs text-slate-400 mt-1">Choose a saved venue to copy its details, or keep typing to use and save a new venue.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Address 1</label>
                  <input value={form.venue.address1} onChange={(e) => updateVenue('address1', e.target.value)} data-testid="booking-form-venue-address1-input" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Address 2</label>
                  <input value={form.venue.address2} onChange={(e) => updateVenue('address2', e.target.value)} data-testid="booking-form-venue-address2-input" className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Venue Contact</label>
                  <input value={form.venue.contactName} onChange={(e) => updateVenue('contactName', e.target.value)} data-testid="booking-form-venue-contactname-input" className={inputClass} />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelClass}>Venue Contact Phone</label>
                    <input type="tel" value={form.venue.contactPhone} onChange={(e) => updateVenue('contactPhone', formatPhoneNumber(e.target.value))} data-testid="booking-form-venue-contactphone-input" className={inputClass} />
                  </div>
                  <div className="w-20">
                    <label className={labelClass}>Ext.</label>
                    <input value={form.venue.contactPhoneExt} onChange={(e) => updateVenue('contactPhoneExt', e.target.value)} data-testid="booking-form-venue-contactphoneext-input" className={inputClass} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Venue Contact Email</label>
                  <input
                    type="email"
                    value={form.venue.contactEmail}
                    onChange={(e) => updateVenue('contactEmail', formatEmailInput(e.target.value))}
                    data-testid="booking-form-venue-contactemail-input"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>City</label>
                  <input value={form.venue.city} onChange={(e) => updateVenue('city', e.target.value)} data-testid="booking-form-venue-city-input" className={inputClass} />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className={labelClass}>State</label>
                    <input value={form.venue.state} onChange={(e) => updateVenue('state', e.target.value)} data-testid="booking-form-venue-state-input" className={inputClass} />
                  </div>
                  <div className="w-24">
                    <label className={labelClass}>Zip</label>
                    <input value={form.venue.zip} onChange={(e) => updateVenue('zip', e.target.value)} data-testid="booking-form-venue-zip-input" className={inputClass} />
                  </div>
                </div>
              </div>
              <div>
                <label className={labelClass}>Event-day Venue Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Loading dock around back, no elevator access"
                  value={form.venue.locationNote}
                  onChange={(e) => updateVenue('locationNote', e.target.value)}
                  data-testid="booking-form-venue-location-note-textarea"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Load-in Instructions</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Load in through the back entrance, freight elevator to 2nd floor"
                  value={form.venue.loadInInfo}
                  onChange={(e) => updateVenue('loadInInfo', e.target.value)}
                  data-testid="booking-form-venue-load-in-textarea"
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>

        <div className={cardClass}>
          <h3 className={cardTitleClass}>Notes & Activity</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>Notes</label>
              <textarea rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} data-testid="booking-form-notes-textarea" className={inputClass} />
            </div>

            {booking && (
              <div>
                <label className={labelClass}>Activity Log</label>
                <div className="flex gap-2 mb-2">
                  <input
                    value={newActivityText}
                    onChange={(e) => setNewActivityText(e.target.value)}
                    placeholder="e.g. Called, left voicemail"
                    data-testid="booking-form-activity-input"
                    className={inputClass}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddActivity(); } }}
                  />
                  <button type="button" onClick={handleAddActivity} data-testid="booking-form-activity-add-button" className="shrink-0 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50">Add</button>
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

        {booking && (
          <div className={`${cardClass} flex items-center justify-between flex-wrap gap-3`}>
            <p className="text-sm text-slate-500">Booking info looks good — ready to put together a proposal?</p>
            <button
              type="button"
              onClick={() => { if (!form.proposal) handlePushToProposal(); setActiveTab('proposal'); }}
              data-testid="booking-form-info-continue-to-proposal-button"
              className={primaryButtonClass}
            >
              Continue to Proposal →
            </button>
          </div>
        )}
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
                data-testid="booking-form-push-to-proposal-button"
                className={primaryButtonClass}
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

                <div className="max-w-xs">
                  <label className={labelClass}>Estimated Hours</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.proposal.hours}
                    onChange={(e) => update('proposal', { ...form.proposal, hours: e.target.value })}
                    data-testid="booking-form-proposal-hours-input"
                    className={inputClass}
                  />
                </div>

                {(form.schedule || []).some((s) => s.time || s.name || s.details) && (
                  <CollapsibleSection
                    title="Schedule"
                    defaultOpen
                    testId="booking-form-proposal-schedule-toggle"
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
                  defaultOpen
                  badge={<span className="text-sm font-bold text-slate-800">{currency(computeGrandTotal(form.proposal.lineItems, form.proposal.offerings))}</span>}
                  testId="booking-form-proposal-pricing-toggle"
                >
                  <OfferingsEditor
                    offerings={form.proposal.offerings || []}
                    onChange={(offerings) => update('proposal', { ...form.proposal, offerings })}
                    onAddClick={() => setProposalOfferingPickerOpen(true)}
                  />

                  <div className="mt-5 pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-500">Deposit</span>
                      <div className="flex rounded-lg border border-slate-200 overflow-hidden text-[11px] font-semibold shrink-0">
                        <button
                          type="button"
                          onClick={() => update('depositType', 'fixed')}
                          data-testid="booking-form-proposal-deposit-type-fixed-button"
                          className={`px-2 py-1 ${form.depositType !== 'percent' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                          Fixed $
                        </button>
                        <button
                          type="button"
                          onClick={() => update('depositType', 'percent')}
                          disabled={grandTotal <= 0}
                          title={grandTotal <= 0 ? 'Add pricing above first' : undefined}
                          data-testid="booking-form-proposal-deposit-type-percent-button"
                          className={`px-2 py-1 border-l border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed ${form.depositType === 'percent' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                          % of Total
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Deposit Amount</label>
                        {form.depositType === 'percent' ? (
                          <>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={form.depositPercent}
                              onChange={(e) => {
                                const pct = e.target.value;
                                update('depositPercent', pct);
                                update('depositAmount', pct === '' ? '' : Math.round((Number(pct) / 100) * grandTotal * 100) / 100);
                              }}
                              data-testid="booking-form-proposal-deposit-percent-input"
                              className={inputClass}
                            />
                            <p className="mt-1 text-xs text-slate-400">
                              {form.depositPercent !== ''
                                ? `= ${currency((Number(form.depositPercent) / 100) * grandTotal)} of ${currency(grandTotal)}`
                                : `of ${currency(grandTotal)} total`}
                            </p>
                          </>
                        ) : (
                          <MoneyInput value={form.depositAmount} onChange={(v) => update('depositAmount', v)} testId="booking-form-proposal-deposit-amount-input" className={inputClass} />
                        )}
                      </div>
                      <div>
                        <label className={labelClass}>Deposit Due Date</label>
                        <input type="date" value={form.depositDueDate} onChange={(e) => update('depositDueDate', e.target.value)} data-testid="booking-form-proposal-deposit-due-date-input" className={inputClass} />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end mt-3 text-sm font-bold text-slate-800">
                    Grand Total: {currency(computeGrandTotal(form.proposal.lineItems, form.proposal.offerings))}
                  </div>
                </CollapsibleSection>

                <CollapsibleSection
                  title="Additional Sections"
                  subtitle="Riders, policies, or any other custom content"
                  defaultOpen
                  badge={(form.proposal.sections || []).length > 0 ? (
                    <span className="text-xs font-semibold text-slate-400">{form.proposal.sections.length}</span>
                  ) : null}
                  testId="booking-form-proposal-sections-toggle"
                >
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {proposalTemplates.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => { if (e.target.value) handleLoadProposalTemplate(e.target.value); }}
                        data-testid="booking-form-proposal-load-template-select"
                        className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs"
                      >
                        <option value="">Load from Template…</option>
                        {proposalTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}
                    {savingProposalTemplateAs ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={newProposalTemplateName}
                          onChange={(e) => setNewProposalTemplateName(e.target.value)}
                          placeholder="Template name"
                          data-testid="booking-form-proposal-new-template-name-input"
                          className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs w-36"
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveProposalTemplateAs(); } }}
                        />
                        <button type="button" onClick={handleSaveProposalTemplateAs} data-testid="booking-form-proposal-save-template-confirm-button" className="px-2 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700">Save</button>
                        <button type="button" onClick={() => { setSavingProposalTemplateAs(false); setNewProposalTemplateName(''); }} data-testid="booking-form-proposal-save-template-cancel-button" className="text-xs text-slate-500 px-1">Cancel</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSavingProposalTemplateAs(true)}
                        disabled={(form.proposal.sections || []).length === 0}
                        data-testid="booking-form-proposal-save-template-button"
                        className="px-2 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Save as Template
                      </button>
                    )}
                  </div>
                  <SectionsEditor
                    sections={form.proposal.sections || []}
                    onChange={(sections) => update('proposal', { ...form.proposal, sections })}
                  />
                </CollapsibleSection>
              </div>

              <div className={cardClass}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="text-sm text-slate-500" data-testid="booking-form-proposal-sent-status">
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
                      onClick={handleToggleProposalPreview}
                      disabled={loadingProposalPreview}
                      data-testid="booking-form-proposal-preview-button"
                      className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60 flex items-center gap-2"
                    >
                      {loadingProposalPreview && <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />}
                      {showProposalPreview ? 'Hide Preview' : 'Preview'}
                    </button>
                    <OverflowMenu testId="booking-form-proposal-more-actions-button">
                      <button
                        type="button"
                        onClick={handleDownloadProposal}
                        data-testid="booking-form-proposal-download-button"
                        className="block w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Download PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => setMarkingProposalSentManually(true)}
                        data-testid="booking-form-proposal-mark-sent-manually-button"
                        className="block w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Mark as Sent Manually
                      </button>
                    </OverflowMenu>
                    <button
                      type="button"
                      onClick={handleSendProposal}
                      disabled={sendingProposal || !client?.email}
                      title={!client?.email ? "Add an email address for this client first" : undefined}
                      data-testid="booking-form-proposal-send-button"
                      className={`${primaryButtonClass} disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
                    >
                      {sendingProposal && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                      {form.proposal.sentAt ? 'Resend Proposal' : 'Send Proposal'}
                    </button>
                  </div>
                </div>
                {proposalResponse?.status === 'revision_requested' && (
                  <div data-testid="booking-form-proposal-revision-banner" className="mt-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                    <div className="font-semibold">{proposalResponse.recipientName || proposalResponse.recipientEmail} requested changes</div>
                    {proposalResponse.responseNote && <div className="mt-1">"{proposalResponse.responseNote}"</div>}
                  </div>
                )}
                {proposalResponse?.status === 'accepted' && (
                  <div data-testid="booking-form-proposal-accepted-banner" className="mt-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
                    <div className="font-semibold">{proposalResponse.recipientName || proposalResponse.recipientEmail} accepted this proposal</div>
                    {proposalResponse.responseNote && <div className="mt-1">"{proposalResponse.responseNote}"</div>}
                  </div>
                )}
                {markingProposalSentManually && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <label className={labelClass}>Why was this marked as sent manually?</label>
                    <textarea
                      autoFocus
                      rows={2}
                      value={proposalManualSentReason}
                      onChange={(e) => setProposalManualSentReason(e.target.value)}
                      placeholder="e.g. Printed and handed to the client in person"
                      data-testid="booking-form-proposal-manual-sent-reason-input"
                      className={inputClass}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!proposalManualSentReason.trim()) return;
                          handleMarkProposalSentManually(proposalManualSentReason.trim());
                          setMarkingProposalSentManually(false);
                          setProposalManualSentReason('');
                        }}
                        disabled={!proposalManualSentReason.trim()}
                        data-testid="booking-form-proposal-manual-sent-confirm-button"
                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => { setMarkingProposalSentManually(false); setProposalManualSentReason(''); }}
                        data-testid="booking-form-proposal-manual-sent-cancel-button"
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {showProposalPreview && proposalPreviewUrl && (
                  <div className="mt-5 rounded-xl border border-slate-200 overflow-hidden">
                    <iframe title="Proposal preview" src={proposalPreviewUrl} data-testid="booking-form-proposal-preview-frame" className="w-full h-[70vh]" />
                  </div>
                )}
              </div>

              <div className={cardClass}>
                <h3 className={cardTitleClass}>Proposal Log</h3>
                <EventLogPanel
                  entries={[...(form.proposal.log || []), ...(proposalResponse?.log || [])].sort((a, b) => new Date(a.at) - new Date(b.at))}
                  labelForType={(entry) => PROPOSAL_LOG_LABELS[entry.type] || entry.type}
                  onAddNote={handleAddProposalLogNote}
                  testIdPrefix="booking-form-proposal-log"
                />
              </div>

              {(form.proposal.offerings || []).length > 0 && (
                <div className={`${cardClass} flex items-center justify-between flex-wrap gap-3`}>
                  <p className="text-sm text-slate-500">Pricing's in place — ready to turn this into a contract?</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('contract')}
                    data-testid="booking-form-proposal-continue-to-contract-button"
                    className={primaryButtonClass}
                  >
                    Continue to Contract →
                  </button>
                </div>
              )}

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
              <p className="text-sm text-slate-500 text-center pt-8 pb-4 max-w-md mx-auto">
                A contract is built from a proposal's pricing and details — push this booking to a proposal first, then come back here.
              </p>
              <div className="flex justify-center pb-8">
                <button
                  type="button"
                  onClick={() => { handlePushToProposal(); setActiveTab('proposal'); }}
                  data-testid="booking-form-contract-push-to-proposal-button"
                  className={primaryButtonClass}
                >
                  Push to Proposal
                </button>
              </div>
            </div>
          ) : !contract && (form.proposal.offerings || []).length === 0 ? (
            <div className={cardClass}>
              <p className="text-sm text-slate-500 text-center pt-8 pb-4 max-w-md mx-auto">
                This booking's proposal doesn't have any pricing yet — add at least one item there before moving it to a contract.
              </p>
              <div className="flex justify-center pb-8">
                <button
                  type="button"
                  onClick={() => setActiveTab('proposal')}
                  data-testid="booking-form-contract-finish-proposal-button"
                  className={primaryButtonClass}
                >
                  Go to Proposal
                </button>
              </div>
            </div>
          ) : !contract ? (
            <div className={cardClass}>
              <h3 className={cardTitleClass}>Move Proposal to Contract</h3>
              <p className="text-sm text-slate-500 mb-5 max-w-xl">
                Sends a contract for signature, built from the current proposal. Terms are locked once sent — the client signs first, then it's returned to you to countersign.
              </p>
              <div className="max-w-2xl mb-5">
                <label className={labelClass}>Contract Title</label>
                <input value={contractTitle} onChange={(e) => setContractTitle(e.target.value)} data-testid="booking-form-contract-title-input" className={inputClass} />
                <p className="mt-1 text-xs text-slate-400">Saved as your default title for future contracts, until changed.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5 max-w-2xl">
                <div>
                  <label className={labelClass}>Recipient Email *</label>
                  <input
                    type="email"
                    value={contractRecipientEmail}
                    onChange={(e) => setContractRecipientEmail(e.target.value)}
                    data-testid="booking-form-contract-recipient-email-input"
                    className={contractSubmitAttempted && !contractRecipientEmail.trim() ? `${inputClass} border-red-300 focus:border-red-400 focus:ring-red-100` : inputClass}
                  />
                  {contractSubmitAttempted && !contractRecipientEmail.trim() && (
                    <p className="mt-1 text-xs text-red-600" data-testid="booking-form-contract-recipient-email-error">Recipient email is required</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Recipient Name</label>
                  <input value={contractRecipientName} onChange={(e) => setContractRecipientName(e.target.value)} data-testid="booking-form-contract-recipient-name-input" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Estimated Hours</label>
                  <input type="number" min="0" step="0.5" value={contractHours} onChange={(e) => setContractHours(e.target.value)} data-testid="booking-form-contract-hours-input" className={inputClass} />
                </div>
              </div>
              <CollapsibleSection
                className="max-w-2xl mb-5"
                title="Pricing"
                defaultOpen
                badge={<span className="text-sm font-bold text-slate-800">{currency(computeGrandTotal(contractLineItems, contractOfferings))}</span>}
                testId="booking-form-contract-pricing-toggle"
              >
                {booking.proposal?.offerings?.length > 0 && (
                  <p className="text-xs text-slate-400 mb-3">
                    Copied from your Proposal — edit freely, this won't change the Proposal itself.
                  </p>
                )}
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
                subtitle="Riders, policies, or any other custom content"
                defaultOpen
                badge={contractSections.length > 0 ? <span className="text-xs font-semibold text-slate-400">{contractSections.length}</span> : null}
                testId="booking-form-contract-sections-toggle"
              >
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {contractTemplates.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) handleLoadContractTemplate(e.target.value); }}
                      data-testid="booking-form-contract-load-template-select"
                      className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs"
                    >
                      <option value="">Load from Template…</option>
                      {contractTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                  {savingContractTemplateAs ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={newContractTemplateName}
                        onChange={(e) => setNewContractTemplateName(e.target.value)}
                        placeholder="Template name"
                        data-testid="booking-form-contract-new-template-name-input"
                        className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs w-36"
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveContractTemplateAs(); } }}
                      />
                      <button type="button" onClick={handleSaveContractTemplateAs} data-testid="booking-form-contract-save-template-confirm-button" className="px-2 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700">Save</button>
                      <button type="button" onClick={() => { setSavingContractTemplateAs(false); setNewContractTemplateName(''); }} data-testid="booking-form-contract-save-template-cancel-button" className="text-xs text-slate-500 px-1">Cancel</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSavingContractTemplateAs(true)}
                      disabled={contractSections.length === 0}
                      data-testid="booking-form-contract-save-template-button"
                      className="px-2 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Save as Template
                    </button>
                  )}
                </div>
                <SectionsEditor sections={contractSections} onChange={setContractSections} />
              </CollapsibleSection>
              <div className="max-w-2xl mb-5">
                <label className={labelClass}>Terms</label>
                <textarea
                  rows={4}
                  placeholder="e.g. Cancellation policy, payment schedule, rider requirements…"
                  value={contractTerms}
                  onChange={(e) => setContractTerms(e.target.value)}
                  data-testid="booking-form-contract-terms-textarea"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-400">Stays editable after the contract is sent — everything else here locks.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleTogglePreview}
                  disabled={loadingContractPreview}
                  data-testid="booking-form-contract-preview-button"
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60 flex items-center gap-2"
                >
                  {loadingContractPreview && <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />}
                  {showContractPreview ? 'Hide Preview' : 'Preview'}
                </button>
                <OverflowMenu testId="booking-form-contract-more-actions-button">
                  <button
                    type="button"
                    onClick={() => setMarkingContractSentManually(true)}
                    disabled={!contractRecipientEmail.trim()}
                    data-testid="booking-form-contract-mark-sent-manually-button"
                    className="block w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Mark as Sent Manually
                  </button>
                </OverflowMenu>
                <button
                  type="button"
                  onClick={handleSendContract}
                  disabled={sendingContract || !contractRecipientEmail.trim()}
                  data-testid="booking-form-contract-send-button"
                  className={`${primaryButtonClass} disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
                >
                  {sendingContract && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                  Send Contract for Signature
                </button>
              </div>
              {markingContractSentManually && (
                <div className="mt-4 pt-4 border-t border-slate-100 max-w-2xl">
                  <label className={labelClass}>Why was this marked as sent manually?</label>
                  <textarea
                    autoFocus
                    rows={2}
                    value={contractManualSentReason}
                    onChange={(e) => setContractManualSentReason(e.target.value)}
                    placeholder="e.g. Printed and handed to the client in person"
                    data-testid="booking-form-contract-manual-sent-reason-input"
                    className={inputClass}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!contractManualSentReason.trim()) return;
                        await handleMarkContractSentManually(contractManualSentReason.trim());
                        setMarkingContractSentManually(false);
                        setContractManualSentReason('');
                      }}
                      disabled={!contractManualSentReason.trim() || sendingContract}
                      data-testid="booking-form-contract-manual-sent-confirm-button"
                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMarkingContractSentManually(false); setContractManualSentReason(''); }}
                      data-testid="booking-form-contract-manual-sent-cancel-button"
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {showContractPreview && contractPreviewUrl && (
                <div className="mt-5 rounded-xl border border-slate-200 overflow-hidden">
                  <iframe title="Contract preview" src={contractPreviewUrl} data-testid="booking-form-contract-preview-frame" className="w-full h-[70vh]" />
                </div>
              )}
            </div>
          ) : (
            <>
              <div className={cardClass}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-700" data-testid="booking-form-contract-status-banner">
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
                  <div className="flex gap-2">
                    {!contract.clientSignedAt && (
                      <button
                        type="button"
                        onClick={handleRegenerateClientLink}
                        disabled={regeneratingClientLink}
                        data-testid="booking-form-contract-regenerate-client-link-button"
                        className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                      >
                        {regeneratingClientLink ? 'Generating…' : 'Get Client Sign Link'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleDownloadContract}
                      data-testid="booking-form-contract-download-button"
                      className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50"
                    >
                      Download PDF
                    </button>
                  </div>
                </div>
                {(lastSignLink || lastOwnerSignLink) && (
                  <div className="mt-4 space-y-2">
                    {lastSignLink && (
                      <div className="flex items-center gap-2 text-xs bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg px-3 py-2" data-testid="booking-form-contract-client-link-banner">
                        <span className="font-semibold shrink-0">Client link:</span>
                        <span className="flex-1 truncate">{lastSignLink}</span>
                        <button
                          type="button"
                          onClick={() => { navigator.clipboard.writeText(lastSignLink); showToast('Link copied'); }}
                          data-testid="booking-form-contract-copy-client-link-button"
                          className="font-semibold hover:underline shrink-0"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                    {lastOwnerSignLink && (
                      <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 text-slate-600 rounded-lg px-3 py-2" data-testid="booking-form-contract-owner-link-banner">
                        <span className="font-semibold shrink-0">Your link:</span>
                        <span className="flex-1 truncate">{lastOwnerSignLink}</span>
                        <button
                          type="button"
                          onClick={() => { navigator.clipboard.writeText(lastOwnerSignLink); showToast('Link copied'); }}
                          data-testid="booking-form-contract-copy-owner-link-button"
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
                <CollapsibleSection
                  title="Contract Log"
                  subtitle="Sent/signed history and any notes you've added"
                  defaultOpen={false}
                  badge={(contract.log || []).length > 0 ? <span className="text-xs font-semibold text-slate-400">{contract.log.length}</span> : null}
                  className=""
                  testId="booking-form-contract-log-toggle"
                >
                  <EventLogPanel
                    entries={contract.log || []}
                    labelForType={(entry) => CONTRACT_LOG_LABELS[entry.type] || entry.type}
                    onAddNote={handleAddContractLogNote}
                    testIdPrefix="booking-form-contract-log"
                  />
                </CollapsibleSection>

                <CollapsibleSection
                  title="What Was Sent"
                  subtitle="The frozen snapshot the client received"
                  defaultOpen={false}
                  testId="booking-form-contract-what-was-sent-toggle"
                >
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
                </CollapsibleSection>
              </div>

              <div className={cardClass}>
                <h3 className={cardTitleClass}>Terms</h3>
                <textarea
                  rows={4}
                  placeholder="e.g. Cancellation policy, payment schedule, rider requirements…"
                  value={contractTerms}
                  onChange={(e) => setContractTerms(e.target.value)}
                  data-testid="booking-form-contract-terms-textarea"
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
                          <input value={ownerSignerName} onChange={(e) => setOwnerSignerName(e.target.value)} data-testid="booking-form-contract-owner-name-input" className={inputClass} />
                        </div>
                        <SignatureCanvas onChange={setOwnerSignatureImage} />
                        <button
                          type="button"
                          onClick={handleOwnerSign}
                          disabled={signingOwner}
                          data-testid="booking-form-contract-sign-button"
                          className={`${primaryButtonClass} disabled:opacity-60 flex items-center gap-2`}
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
                      data-testid="booking-form-contract-view-event-button"
                      className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
                    >
                      View Event →
                    </button>
                  ) : (
                    <p className="text-xs text-slate-400">Setting up your event…</p>
                  )}
                </div>
              )}

              {contract.status === 'fully_signed' && (
                <div className={`${cardClass} flex items-center justify-between flex-wrap gap-3`}>
                  <p className="text-sm text-slate-500">Signed and ready — go ahead and invoice for it.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('invoices')}
                    data-testid="booking-form-contract-continue-to-invoicing-button"
                    className={primaryButtonClass}
                  >
                    Continue to Invoicing →
                  </button>
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
                <div className="flex items-center justify-between mb-5">
                  <h3 className={`${cardTitleClass} mb-0`}>Deposit</h3>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden text-[11px] font-semibold shrink-0">
                    <button
                      type="button"
                      onClick={() => update('depositType', 'fixed')}
                      data-testid="booking-form-deposit-type-fixed-button"
                      className={`px-2 py-1 ${form.depositType !== 'percent' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      Fixed $
                    </button>
                    <button
                      type="button"
                      onClick={() => update('depositType', 'percent')}
                      disabled={grandTotal <= 0}
                      title={grandTotal <= 0 ? 'Add pricing to your Proposal or Contract first' : undefined}
                      data-testid="booking-form-deposit-type-percent-button"
                      className={`px-2 py-1 border-l border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed ${form.depositType === 'percent' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      % of Total
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Deposit Amount</label>
                    {form.depositType === 'percent' ? (
                      <>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={form.depositPercent}
                          onChange={(e) => {
                            const pct = e.target.value;
                            update('depositPercent', pct);
                            update('depositAmount', pct === '' ? '' : Math.round((Number(pct) / 100) * grandTotal * 100) / 100);
                          }}
                          data-testid="booking-form-deposit-percent-input"
                          className={inputClass}
                        />
                        <p className="mt-1 text-xs text-slate-400">
                          {form.depositPercent !== ''
                            ? `= ${currency((Number(form.depositPercent) / 100) * grandTotal)} of ${currency(grandTotal)}`
                            : `of ${currency(grandTotal)} total`}
                        </p>
                      </>
                    ) : (
                      <MoneyInput value={form.depositAmount} onChange={(v) => update('depositAmount', v)} testId="booking-form-deposit-amount-input" className={inputClass} />
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Deposit Due Date</label>
                    <input type="date" value={form.depositDueDate} onChange={(e) => update('depositDueDate', e.target.value)} data-testid="booking-form-deposit-due-date-input" className={inputClass} />
                  </div>
                  <div className="flex items-end pb-2.5">
                    <label className="flex items-center gap-1.5 text-sm text-slate-600">
                      <input type="checkbox" checked={form.depositPaid} onChange={(e) => update('depositPaid', e.target.checked)} data-testid="booking-form-deposit-paid-checkbox" />
                      Deposit paid
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  {alreadyInvoiced > 0 ? (
                    <button
                      type="button"
                      onClick={handleCreateFinalInvoice}
                      disabled={!booking || contract?.status !== 'fully_signed' || remainingBalance <= 0}
                      title={
                        !booking ? 'Save this booking first'
                          : contract?.status !== 'fully_signed' ? 'Available once the contract is fully signed'
                          : remainingBalance <= 0 ? 'Nothing left to invoice'
                          : undefined
                      }
                      data-testid="booking-form-create-final-invoice-button"
                      className="px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-600 text-xs font-semibold hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      Create Final Invoice →
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleCreateFullInvoice}
                        disabled={!booking || grandTotal <= 0 || contract?.status !== 'fully_signed'}
                        title={
                          !booking ? 'Save this booking first'
                            : grandTotal <= 0 ? 'Add pricing to your Proposal or Contract first'
                            : contract?.status !== 'fully_signed' ? 'Available once the contract is fully signed'
                            : undefined
                        }
                        data-testid="booking-form-create-full-invoice-button"
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        Create Full Invoice →
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateDepositInvoice}
                        disabled={!booking || !form.depositAmount || contract?.status !== 'fully_signed'}
                        title={
                          !booking ? 'Save this booking first'
                            : !form.depositAmount ? 'Enter a deposit amount first'
                            : contract?.status !== 'fully_signed' ? 'Available once the contract is fully signed'
                            : undefined
                        }
                        data-testid="booking-form-create-deposit-invoice-button"
                        className="px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-600 text-xs font-semibold hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        Create Deposit Invoice →
                      </button>
                    </>
                  )}
                </div>
              </div>

              {!editingInvoiceId && contract?.status !== 'fully_signed' ? (
                <div className={cardClass}>
                  <p className="text-sm text-slate-500 text-center pt-8 pb-4 max-w-md mx-auto">
                    Invoicing opens up once the contract for this booking is signed by both sides.
                  </p>
                  <div className="flex justify-center pb-8">
                    <button
                      type="button"
                      onClick={() => setActiveTab('contract')}
                      data-testid="booking-form-invoices-go-to-contract-button"
                      className={primaryButtonClass}
                    >
                      Go to Contract
                    </button>
                  </div>
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
                          data-testid="booking-form-invoice-number-input"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Recipient Email *</label>
                        <input
                          type="email"
                          value={newInvoiceRecipientEmail}
                          onChange={(e) => setNewInvoiceRecipientEmail(e.target.value)}
                          data-testid="booking-form-invoice-recipient-email-input"
                          className={invoiceSubmitAttempted && !newInvoiceRecipientEmail.trim() ? `${inputClass} border-red-300 focus:border-red-400 focus:ring-red-100` : inputClass}
                        />
                        {invoiceSubmitAttempted && !newInvoiceRecipientEmail.trim() && (
                          <p className="mt-1 text-xs text-red-600" data-testid="booking-form-invoice-recipient-email-error">Recipient email is required</p>
                        )}
                      </div>
                      <div>
                        <label className={labelClass}>Recipient Name</label>
                        <input value={newInvoiceRecipientName} onChange={(e) => setNewInvoiceRecipientName(e.target.value)} data-testid="booking-form-invoice-recipient-name-input" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Due Date</label>
                        <input type="date" value={newInvoiceDueDate} onChange={(e) => setNewInvoiceDueDate(e.target.value)} data-testid="booking-form-invoice-due-date-input" className={inputClass} />
                      </div>
                    </div>
                    <div className="max-w-2xl mb-5">
                      {newInvoicePrefillKind === 'deposit' ? (
                        <p className="text-xs text-slate-400 mb-3">
                          Pre-filled from the Deposit fields on Booking Info — edit freely, this won't change those fields.
                        </p>
                      ) : newInvoicePrefillKind === 'full' ? (
                        <p className="text-xs text-slate-400 mb-3">
                          Pre-filled with the full event balance — edit freely.
                        </p>
                      ) : newInvoicePrefillKind === 'final' ? (
                        <p className="text-xs text-slate-400 mb-3">
                          Pre-filled with what's left after prior invoices — edit freely.
                        </p>
                      ) : !editingInvoiceId && booking.proposal?.offerings?.length > 0 && (
                        <p className="text-xs text-slate-400 mb-3">
                          Copied from your Proposal — edit freely, this won't change the Proposal itself.
                        </p>
                      )}
                      <OfferingsEditor
                        offerings={newInvoiceOfferings}
                        onChange={setNewInvoiceOfferings}
                        onAddClick={() => setInvoiceOfferingPickerOpen(true)}
                      />
                      {invoiceSubmitAttempted && newInvoiceOfferings.length === 0 && (
                        <p className="mt-1 text-xs text-red-600" data-testid="booking-form-invoice-line-items-error">Add at least one line item before sending</p>
                      )}
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
                        data-testid="booking-form-invoice-memo-textarea"
                        className={inputClass}
                      />
                    </div>
                    <div className="max-w-2xl mb-5">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newInvoiceAcceptPayment}
                          onChange={(e) => setNewInvoiceAcceptPayment(e.target.checked)}
                          data-testid="booking-form-invoice-accept-payment-checkbox"
                          className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-slate-700">Accept Payment</span>
                          <span className="block text-xs text-slate-500">
                            {newInvoiceAcceptPayment
                              ? 'Recipient can pay online via Stripe. Turn off if this invoice is being paid outside GigWorks.'
                              : 'This invoice will be sent as a document only — no online payment option, no Stripe required.'}
                          </span>
                        </span>
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowInvoicePreview((v) => !v)}
                        data-testid="booking-form-invoice-preview-button"
                        className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50"
                      >
                        {showInvoicePreview ? 'Hide Preview' : 'Preview'}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadInvoice}
                        data-testid="booking-form-invoice-download-button"
                        className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50"
                      >
                        Download PDF
                      </button>
                      {editingInvoiceId && (
                        <button
                          type="button"
                          onClick={handleCancelEditInvoice}
                          disabled={savingInvoiceDraft || sendingNewInvoice}
                          data-testid="booking-form-invoice-cancel-edit-button"
                          className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveInvoiceDraft}
                        disabled={savingInvoiceDraft || sendingNewInvoice}
                        data-testid="booking-form-invoice-save-draft-button"
                        className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                      >
                        {savingInvoiceDraft ? 'Saving…' : editingInvoiceId ? 'Save Changes' : 'Save Draft'}
                      </button>
                      <button
                        type="button"
                        onClick={handleSendNewInvoice}
                        disabled={sendingNewInvoice || savingInvoiceDraft}
                        data-testid="booking-form-invoice-send-button"
                        className={`${primaryButtonClass} disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
                      >
                        {sendingNewInvoice && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                        Send Invoice
                      </button>
                    </div>
                    {showInvoicePreview && (
                      <div className="mt-5 max-w-2xl" data-testid="booking-form-invoice-preview-container">
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
                </>
              )}

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
                        <div key={inv.id} data-testid="booking-form-invoice-row" className="border border-slate-200 rounded-lg p-4">
                          <div className="flex items-center justify-between flex-wrap gap-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Badge color={statusMeta.color}>{statusMeta.label}</Badge>
                                {inv.acceptPayment === false && <Badge color="#94a3b8">No online payment</Badge>}
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
                                  data-testid="booking-form-invoice-edit-button"
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
                                  data-testid="booking-form-invoice-send-existing-button"
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
                                  data-testid="booking-form-invoice-copy-link-button"
                                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50"
                                >
                                  Copy Pay Link
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDownloadExistingInvoice(inv)}
                                data-testid="booking-form-invoice-download-existing-button"
                                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50"
                              >
                                Download
                              </button>
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
                                      data-testid="booking-form-invoice-partial-amount-input"
                                      className="w-24 pl-5 pr-2 py-1.5 rounded-lg border border-slate-300 text-xs"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleMarkInvoicePayment(inv.id, 'partial', Number(partialAmountDraft.value))}
                                    disabled={acting || !(Number(partialAmountDraft.value) > 0)}
                                    data-testid="booking-form-invoice-partial-save-button"
                                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPartialAmountDraft(null)}
                                    data-testid="booking-form-invoice-partial-cancel-button"
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
                                      data-testid="booking-form-invoice-mark-open-button"
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
                                      data-testid="booking-form-invoice-mark-partial-button"
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
                                      data-testid="booking-form-invoice-mark-paid-button"
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
                                  data-testid="booking-form-invoice-send-receipt-button"
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
                                  data-testid="booking-form-invoice-void-button"
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

      <HistoryModal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        title="Booking History"
        entries={booking?.history}
      />

      {booking && (
        <SendInquiryLinkModal
          open={sendInquiryModalOpen}
          onClose={() => setSendInquiryModalOpen(false)}
          bookingId={booking.id}
          defaultRecipientEmail={client?.email || ''}
          defaultRecipientName={client ? `${client.firstName} ${client.lastName}`.trim() : ''}
        />
      )}

      <ReviewInquiryModal
        open={reviewingInquiry}
        link={submittedInquiryLink}
        onClose={() => setReviewingInquiry(false)}
        onApplied={() => setSubmittedInquiryLink(null)}
        onApplyOverride={handleApplyInquiryOverride}
        currentClientId={form.clientId || null}
        navigateAfterApply={false}
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
        allowEnsemble
        onSelect={(template) => {
          const instance = { ...template, id: uid('offitem') };
          update('proposal', { ...form.proposal, offerings: [...(form.proposal?.offerings || []), instance] });
        }}
      />
      <OfferingPickerModal
        open={contractOfferingPickerOpen}
        onClose={() => setContractOfferingPickerOpen(false)}
        allowEnsemble
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
