import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ContractorPickerRow from '../components/ContractorPickerRow';
import ContractorModal from '../components/ContractorModal';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { sendEmail } from '../lib/email/sendEmail';
import { renderEmailTemplate } from '../lib/mergeFields';

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';
const cardClass = 'bg-white rounded-2xl border border-slate-200 p-6';
const cardTitleClass = 'text-base font-bold text-slate-800 mb-5';

function currency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
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
    name: '', eventType: '', eventDate: '', eventDayOfTheWeek: '',
    clientId: '',
    venue: { name: '', address1: '', address2: '', city: '', state: '', zip: '', locationNote: '', loadInInfo: '' },
    contactPhone: '', contactPhoneExt: '', contactEmail: '',
    startTime: '', endTime: '',
    eventNote: '',
    contractorBookings: [],
  };
}

export default function EventFormPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const {
    events, eventTypes, addEventType, eventStatuses, inquiryStatuses, emailTemplates,
    contractors, clients, addEvent, updateEvent, computeDurationHours,
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
  const [editingContractor, setEditingContractor] = useState(null);
  const [bulkTemplateId, setBulkTemplateId] = useState('');
  const [bulkSending, setBulkSending] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dragIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const draftStatus = eventStatuses.find((s) => s.label.toLowerCase() === 'draft') || eventStatuses[0];
  const defaultInquiryStatus = inquiryStatuses[0];

  useEffect(() => {
    if (event) {
      setForm({
        name: event.name, eventType: event.eventType, eventDate: event.eventDate,
        eventDayOfTheWeek: event.eventDayOfTheWeek || dayOfWeekFromDate(event.eventDate),
        clientId: event.clientId || '',
        venue: { ...event.venue },
        contactPhone: event.contactPhone, contactPhoneExt: event.contactPhoneExt || '', contactEmail: event.contactEmail,
        startTime: event.startTime, endTime: event.endTime,
        eventNote: event.eventNote || '',
        contractorBookings: [...event.contractorBookings],
      });
    } else {
      setForm(emptyForm());
    }
    setError('');
    setAddingType(false);
    setPickerOpen(false);
  }, [eventId, event]);

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
  const totalCost = form.contractorBookings.reduce((sum, b) => {
    const c = contractors.find((x) => x.id === b.contractorId);
    return sum + (c ? Number(c.price) || 0 : 0);
  }, 0);

  function addContractorToEvent(contractorId) {
    setForm((f) => ({
      ...f,
      contractorBookings: [...f.contractorBookings, { contractorId, inquiryStatusId: defaultInquiryStatus?.id }],
    }));
    setPickerOpen(false);
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

  async function sendTemplateToContractor(contractor, templateId) {
    const template = emailTemplates.find((t) => t.id === templateId);
    if (!contractor || !template) return;
    const rendered = renderEmailTemplate({ template, event: form, contractor });
    await sendEmail({
      to: contractor.email,
      subject: rendered.subject,
      bodyText: rendered.body,
      fromName: currentUser.businessInfo?.name || `${currentUser.firstName} ${currentUser.lastName}`,
      replyTo: currentUser.businessInfo?.email || currentUser.email,
    });
    const emailedStatus = inquiryStatuses.find((s) => s.label === 'Emailed');
    if (emailedStatus) changeBookingStatus(contractor.id, emailedStatus.id);
  }

  async function handleSendEmail(contractorId, templateId) {
    const contractor = contractors.find((c) => c.id === contractorId);
    if (!contractor) return;
    try {
      await sendTemplateToContractor(contractor, templateId);
      showToast(`Email sent to ${contractor.firstName} ${contractor.lastName}`);
    } catch (err) {
      showToast(err.message || 'Failed to send email', 'error');
    }
  }

  async function handleSendToAll(templateId) {
    const recipients = form.contractorBookings
      .map((b) => contractors.find((c) => c.id === b.contractorId))
      .filter((c) => c && c.email);

    if (recipients.length === 0) {
      showToast('No contractors with an email address to send to', 'error');
      return;
    }

    let successCount = 0;
    for (const contractor of recipients) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await sendTemplateToContractor(contractor, templateId);
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
    if (err) { setError(err); return; }
    persistEvent(draftStatus?.id);
    showToast('Saved as draft');
    navigate('/events');
  }

  function handleSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
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

  const showBulkRow = form.contractorBookings.length > 0 && emailTemplates.length > 0;
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
            {availableContractors.length === 0 && (
              <div className="px-3 py-3 text-xs text-slate-400">All contractors already added.</div>
            )}
            {availableContractors.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => addContractorToEvent(c.id)}
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

      {error && <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

      <form id="event-form" onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        <div className={cardClass}>
          <div className="flex items-center justify-between mb-5">
            <h3 className={`${cardTitleClass} mb-0`}>Contractors</h3>
            {!showBulkRow && addContractorButton}
          </div>

          {showBulkRow && (
            <div className="flex items-center gap-3 px-3 pb-2">
              <span className="cursor-grab text-slate-300 select-none invisible" aria-hidden="true">⠿</span>
              <div className="flex-1 min-w-0 text-xs font-semibold text-slate-500">Bulk send</div>
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
                onClick={async () => {
                  setBulkSending(true);
                  try {
                    await handleSendToAll(bulkTemplateId);
                  } finally {
                    setBulkSending(false);
                  }
                }}
                disabled={!bulkTemplateId || bulkSending}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {bulkSending && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                Send to All
              </button>
              <div className="shrink-0 ml-3 w-32" aria-hidden="true" />
              <div className="w-20 shrink-0" aria-hidden="true" />
              <div className="shrink-0 w-6" aria-hidden="true" />
              {addContractorButton}
            </div>
          )}

          {form.contractorBookings.length === 0 ? (
            <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
              No contractors added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {form.contractorBookings.map((b, i) => (
                <ContractorPickerRow
                  key={b.contractorId}
                  booking={b}
                  index={i}
                  contractor={contractors.find((c) => c.id === b.contractorId)}
                  inquiryStatuses={inquiryStatuses}
                  emailTemplates={emailTemplates}
                  onStatusChange={changeBookingStatus}
                  onRemove={removeContractorFromEvent}
                  onSendEmail={handleSendEmail}
                  onOpenContractor={setEditingContractor}
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
      </form>

      <ContractorModal
        open={!!editingContractor}
        onClose={() => setEditingContractor(null)}
        contractor={editingContractor}
      />
    </div>
  );
}
