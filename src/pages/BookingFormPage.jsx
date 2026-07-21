import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ClientModal from '../components/ClientModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { uid } from '../lib/storage';
import { listBookingDocuments, uploadBookingDocument, deleteBookingDocument, bookingDocumentDownloadUrl } from '../lib/bookingDocuments';
import { generateProposalPdf, generateProposalPdfAttachment } from '../lib/proposalPdf';
import { getContractForBooking, sendContract, ownerSignContract } from '../lib/contracts';
import { generateContractPdf } from '../lib/contractPdf';
import { sendEmail } from '../lib/email/send';
import { formatCurrency as currency, formatEventDate } from '../lib/format';
import { FileIcon } from '../components/ui/icons';
import SignatureCanvas from '../components/SignatureCanvas';

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
];

function emptyForm() {
  return {
    // Generated up front so document uploads on a not-yet-saved booking still
    // have a stable bookingId to attach to — mirrors EventFormPage.
    id: uid('bkg'),
    clientId: '', eventDate: '', eventType: '',
    package: '', quotedTotal: '',
    depositAmount: '', depositDueDate: '', depositPaid: false,
    bookingStatus: '', priority: '', nextFollowUpDate: '',
    contractSignedDate: '', referralSource: '', notes: '', activityLog: [],
    proposal: null,
  };
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

function LineItemsEditor({ items, onChange }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');

  function handleAdd() {
    if (!name.trim()) return;
    onChange([...items, { id: uid('item'), name: name.trim(), amount: amount === '' ? 0 : Number(amount) }]);
    setName('');
    setAmount('');
  }

  function handleRemove(id) {
    onChange(items.filter((i) => i.id !== id));
  }

  return (
    <div>
      <label className={labelClass}>Additional Items</label>
      {items.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm">
              <span className="flex-1 text-slate-700">{item.name}</span>
              <span className="text-slate-600 font-medium">{currency(item.amount)}</span>
              <button
                type="button"
                onClick={() => handleRemove(item.id)}
                className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                aria-label={`Remove ${item.name}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" className={inputClass} />
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="w-32 shrink-0 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <button type="button" onClick={handleAdd} className="shrink-0 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50">+ Add</button>
      </div>
    </div>
  );
}

function computeGrandTotal(quotedTotal, lineItems) {
  const itemsTotal = (lineItems || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  return (Number(quotedTotal) || 0) + itemsTotal;
}

export default function BookingFormPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const {
    bookings, clients, eventTypes, addEventType, bookingStatuses,
    addBooking, updateBooking, convertBookingToEvent, addEvent,
  } = useData();
  const { can, currentUser } = useAuth();
  const { showToast } = useToast();

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
  const [sendingContract, setSendingContract] = useState(false);
  const [lastSignLink, setLastSignLink] = useState('');
  const [ownerSignerName, setOwnerSignerName] = useState('');
  const [ownerSignatureImage, setOwnerSignatureImage] = useState('');
  const [signingOwner, setSigningOwner] = useState(false);

  const client = clients.find((c) => c.id === form.clientId);

  useEffect(() => {
    if (booking) {
      setForm({
        id: booking.id,
        clientId: booking.clientId || '',
        eventDate: booking.eventDate || '',
        eventType: booking.eventType || '',
        package: booking.package || '',
        quotedTotal: booking.quotedTotal ?? '',
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
      setForm(emptyForm());
    }
    setError('');
    setAddingType(false);
    setNewActivityText('');
  }, [bookingId, booking, bookingStatuses]);

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

  // Seeds the contract-prep panel from the current proposal each time a
  // different booking loads — only relevant before a contract exists, since
  // the panel is hidden once one has been sent.
  useEffect(() => {
    if (!booking) return;
    setContractHours(booking.proposal?.hours || '');
    setContractLineItems(booking.proposal?.lineItems || []);
    setLastSignLink('');
    setOwnerSignerName('');
    setOwnerSignatureImage('');
  }, [booking?.id]);

  useEffect(() => {
    if (!client) return;
    setContractRecipientEmail((prev) => prev || client.email || '');
    setContractRecipientName((prev) => prev || `${client.firstName} ${client.lastName}`.trim());
  }, [client?.id]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
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
      quotedTotal: form.quotedTotal === '' ? null : Number(form.quotedTotal),
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
    persistBooking();
    setSaving(false);
    showToast(booking ? 'Booking updated' : 'Booking added');
    navigate('/bookings');
  }

  function handleConvert() {
    const event = convertBookingToEvent(booking.id);
    if (!event) return;
    showToast('Booking converted to event');
    navigate(`/events/${event.id}`);
  }

  function handlePushToProposal() {
    const proposal = { hours: '', lineItems: [], sentAt: null, sentTo: null };
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
        package: form.package,
        quotedTotal: form.quotedTotal === '' ? null : Number(form.quotedTotal),
        depositAmount: form.depositAmount === '' ? null : Number(form.depositAmount),
        depositDueDate: form.depositDueDate,
        depositPaid: form.depositPaid,
        notes: form.notes,
      },
      hours: contractHours,
      lineItems: contractLineItems,
    };
  }

  async function handleSendContract() {
    if (!contractRecipientEmail.trim()) {
      showToast('Recipient email is required', 'error');
      return;
    }
    setSendingContract(true);
    try {
      persistBooking();
      const { contract: created, signLink, emailError } = await sendContract({
        bookingId: booking.id,
        recipientEmail: contractRecipientEmail.trim(),
        recipientName: contractRecipientName.trim(),
        snapshot: buildContractSnapshot(),
      });
      setContract(created);
      setLastSignLink(signLink);
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

  function handleCreateEventFromContract() {
    if (!booking || !contract) return;
    const contractBooking = contract.snapshot.booking || {};
    const grandTotal = computeGrandTotal(contractBooking.quotedTotal, contract.snapshot.lineItems);
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
      contactEmail: client?.email || '',
      contactPhone: client?.phone || '',
      eventNote: noteLines.join(' '),
    });
    updateBooking(booking.id, { convertedEventId: event.id });
    showToast('Event created from signed contract');
    navigate(`/events/${event.id}`);
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
            onClick={() => navigate('/bookings')}
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
          <button type="button" onClick={() => navigate('/bookings')} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
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

      <form id="booking-form" onSubmit={handleSubmit} className="space-y-6">
        <div className={activeTab === 'info' ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : 'hidden'}>
          <div className={cardClass}>
            <h3 className={cardTitleClass}>Booking Details</h3>
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Client *</label>
                <div className="flex gap-2">
                  <select required value={form.clientId} onChange={(e) => update('clientId', e.target.value)} className={inputClass}>
                    <option value="">Select a client…</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                  </select>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Package / Pricing Tier</label>
                  <input value={form.package} onChange={(e) => update('package', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Quoted Total</label>
                  <input type="number" min="0" step="0.01" value={form.quotedTotal} onChange={(e) => update('quotedTotal', e.target.value)} className={inputClass} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Deposit Amount</label>
                  <input type="number" min="0" step="0.01" value={form.depositAmount} onChange={(e) => update('depositAmount', e.target.value)} className={inputClass} />
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
            <h3 className={cardTitleClass}>Notes & Activity</h3>
            <div className="space-y-5">
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
                    <div className="text-xs text-slate-400">{form.package || '—'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
                    <div className={labelClass}>Quoted Total</div>
                    <div className="px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
                      {form.quotedTotal ? currency(form.quotedTotal) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className={labelClass}>Deposit</div>
                    <div className="px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
                      {form.depositAmount ? currency(form.depositAmount) : '—'}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100">
                  <LineItemsEditor
                    items={form.proposal.lineItems || []}
                    onChange={(items) => update('proposal', { ...form.proposal, lineItems: items })}
                  />
                  <div className="flex justify-end mt-3 text-sm font-bold text-slate-800">
                    Grand Total: {currency(computeGrandTotal(form.quotedTotal, form.proposal.lineItems))}
                  </div>
                </div>
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
              <div className="max-w-2xl mb-5">
                <LineItemsEditor items={contractLineItems} onChange={setContractLineItems} />
                <div className="flex justify-end mt-3 text-sm font-bold text-slate-800">
                  Grand Total: {currency(computeGrandTotal(form.quotedTotal, contractLineItems))}
                </div>
              </div>
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
          ) : (
            <>
              <div className={cardClass}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-700">
                      {contract.status === 'sent' && 'Waiting on client signature'}
                      {contract.status === 'client_signed' && 'Client signed — your turn to countersign'}
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
                {lastSignLink && (
                  <div className="mt-4 flex items-center gap-2 text-xs bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg px-3 py-2">
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
              </div>

              {contract.status === 'client_signed' && (
                <div className={cardClass}>
                  <h3 className={cardTitleClass}>Client Signature</h3>
                  <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
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

                  <h3 className={cardTitleClass}>Your Signature</h3>
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
                </div>
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
                    <button
                      type="button"
                      onClick={handleCreateEventFromContract}
                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
                    >
                      Create Event →
                    </button>
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
      </form>

      <ClientModal
        open={newClientModalOpen}
        onClose={() => setNewClientModalOpen(false)}
        onSaved={(record) => update('clientId', record.id)}
      />

      <ConfirmDialog
        open={!!docPendingDelete}
        onClose={() => setDocPendingDelete(null)}
        onConfirm={confirmDeleteDocument}
        title="Remove document?"
        description={`This will remove "${docPendingDelete?.filename}" from this booking. This can't be undone.`}
      />
    </div>
  );
}
