import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { PRIORITIES } from '../lib/bookingPriorities';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ScrollShadow from '../components/ui/ScrollShadow';
import MarkCompleteModal from '../components/MarkCompleteModal';
import Badge from '../components/ui/Badge';
import Tabs from '../components/ui/Tabs';
import Tooltip from '../components/ui/Tooltip';
import SearchInput from '../components/ui/SearchInput';
import FilterSelect from '../components/ui/FilterSelect';
import Pagination from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';
import { formatCurrency as currency, formatEventDate } from '../lib/format';
import { queryBookings } from '../lib/bookings';
import { getEvent } from '../lib/events';
import { useServerList } from '../lib/useServerList';
import { listInquiryLinks, deleteInquiryLink } from '../lib/inquiryLinks';
import { listContracts } from '../lib/contracts';
import { listProposalResponses } from '../lib/proposalResponses';
import { listInvoices } from '../lib/invoices';
import { pipelineSteps, currentPipelineStep } from '../lib/bookingPipeline';
import { BOOKING_DISPOSITIONS, dispositionInfo } from '../lib/bookingDisposition';
import SendInquiryLinkModal from '../components/SendInquiryLinkModal';
import ReviewInquiryModal from '../components/ReviewInquiryModal';

// Rough "how far along" color for the Stage column — not the full palette
// PipelineStepper uses (that's built for a multi-step visual, not a single
// glanceable label), just early/mid/late plus a distinct green for
// actually-paid.
function stageColor(stage) {
  if (stage.label === 'Payment' && stage.state === 'done') return '#22c55e';
  if (stage.label === 'Booking' || stage.label === 'Proposal') return '#94a3b8';
  return '#6366f1';
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function followUpTone(dateStr) {
  if (!dateStr) return 'none';
  if (dateStr < todayISO()) return 'overdue';
  if (dateStr === todayISO()) return 'today';
  return 'upcoming';
}

const VIEW_TABS = [
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
];

export default function BookingsPage() {
  const {
    bookingStatuses, eventTypes,
    deleteBooking, completeBooking, restoreBooking, completeEvent, convertBookingToEvent,
  } = useData();
  const { can } = useAuth();
  const canEdit = can('manageBookings');
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('active');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [depositFilter, setDepositFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('createdAt');
  const [sendInquiryModalOpen, setSendInquiryModalOpen] = useState(false);
  const [pendingInquiries, setPendingInquiries] = useState([]);
  const [reviewingInquiry, setReviewingInquiry] = useState(null);
  // Sent (status 'open') inquiry links awaiting a response — the reusable
  // account-wide link is excluded, it's managed from Settings instead and
  // stays 'open' forever by design (see InquiryLink.isReusable). Unused ones
  // also age out automatically after 48h (inquiryLinkPurger.js); this list
  // is the manual "delete it now" equivalent.
  const [sentInquiries, setSentInquiries] = useState([]);
  const [deleteInquiryTarget, setDeleteInquiryTarget] = useState(null);
  // Account-wide, fetched once — same lightweight local-fetch pattern
  // HomePage.jsx already uses for its own invoices (not routed through
  // DataContext, since neither is read anywhere else on this page). Feeds
  // the Stage column below: each row derives its real pipeline position via
  // the same pipelineSteps() BookingFormPage's own stepper uses, rather than
  // this list only ever showing the separate, manually-set status badge.
  const [contracts, setContracts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [proposalResponses, setProposalResponses] = useState([]);

  useEffect(() => {
    let cancelled = false;
    listInquiryLinks({ status: 'submitted' }).then((links) => { if (!cancelled) setPendingInquiries(links); }).catch(() => {});
    listInquiryLinks({ status: 'open' }).then((links) => { if (!cancelled) setSentInquiries(links.filter((l) => !l.isReusable)); }).catch(() => {});
    listContracts().then((list) => { if (!cancelled) setContracts(list); }).catch(() => {});
    listInvoices().then((list) => { if (!cancelled) setInvoices(list); }).catch(() => {});
    listProposalResponses().then((list) => { if (!cancelled) setProposalResponses(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Each booking's most recent proposal response only — a resend (e.g.
  // after a revision request) creates a new row rather than overwriting
  // the old one, same as Contract, so `proposalResponses` can hold more
  // than one per booking.
  const latestProposalResponseByBooking = new Map();
  for (const pr of proposalResponses) {
    if (!latestProposalResponseByBooking.has(pr.bookingId)) latestProposalResponseByBooking.set(pr.bookingId, pr);
  }
  const pendingRevisionRequests = [...latestProposalResponseByBooking.values()].filter((pr) => pr.status === 'revision_requested');

  function handleInquiryApplied(linkId) {
    setPendingInquiries((prev) => prev.filter((l) => l.id !== linkId));
  }

  async function handleDeleteInquiryLink() {
    const target = deleteInquiryTarget;
    setDeleteInquiryTarget(null);
    try {
      await deleteInquiryLink(target.id);
      setSentInquiries((prev) => prev.filter((l) => l.id !== target.id));
      showToast('Inquiry link deleted');
    } catch (err) {
      showToast(err.message || 'Failed to delete inquiry link', 'error');
    }
  }

  const hasFilters = !!(search || statusFilter || priorityFilter || eventTypeFilter || depositFilter);
  const { items: pagedBookings, pageCount, pageSize, total: totalItems, loading, error, refresh } = useServerList(
    () => queryBookings({ page, pageSize: 25, view: activeTab, search, status: statusFilter, priority: priorityFilter, eventType: eventTypeFilter, deposit: depositFilter, sort, direction: sort === 'eventDate' || sort === 'eventName' ? 'asc' : 'desc' }),
    [page, activeTab, search, statusFilter, priorityFilter, eventTypeFilter, depositFilter, sort],
  );
  useEffect(() => { setPage(1); }, [activeTab, search, statusFilter, priorityFilter, eventTypeFilter, depositFilter]);

  function openAdd() {
    navigate('/bookings/new');
  }

  function openEdit(booking) {
    navigate(`/bookings/${booking.id}`);
  }

  async function handleDelete() {
    await deleteBooking(deleteTarget.id);
    refresh();
    showToast('Booking deleted');
    setDeleteTarget(null);
  }

  // Bookings have no single name field (unlike Event) — same fallback
  // chain as the row's own display label above.
  function deleteTargetLabel() {
    if (!deleteTarget) return '';
    if (deleteTarget.eventName) return deleteTarget.eventName;
    const client = deleteTarget.client;
    if (client) return `${client.firstName} ${client.lastName}`;
    return deleteTarget.eventType || '';
  }

  async function handleConvert(booking) {
    try {
      const event = await convertBookingToEvent(booking.id);
      if (!event) return;
      showToast('Event created');
      navigate(`/events/${event.id}`);
    } catch (err) {
      showToast(err.message || 'Failed to create event', 'error');
    }
  }

  // A booking's linked event (if any, and not already completed) gets a
  // "complete this too?" prompt — otherwise there's nothing to choose
  // between, so it just completes directly.
  async function handleMarkComplete(booking) {
    let linkedEvent = null;
    if (booking.convertedEventId) {
      try { linkedEvent = await getEvent(booking.convertedEventId); } catch { /* deleted/missing link */ }
    }
    if (linkedEvent && !linkedEvent.completedAt) {
      setCompleteTarget({ booking, linkedEvent });
      return;
    }
    await completeBooking(booking.id);
    refresh();
    showToast('Booking marked complete');
  }

  async function handleConfirmComplete({ includePrimary, includeLinked }) {
    const { booking, linkedEvent } = completeTarget;
    if (includePrimary) await completeBooking(booking.id);
    if (includeLinked && linkedEvent) await completeEvent(linkedEvent.id);
    refresh();
    showToast('Marked complete');
    setCompleteTarget(null);
  }

  async function handleRestore(booking) {
    await restoreBooking(booking.id);
    refresh();
    showToast('Booking restored to active');
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-2xl font-bold text-slate-800">Bookings</h2>
        <div className="grid grid-cols-1 min-[390px]:grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setSendInquiryModalOpen(true)}
            disabled={!canEdit}
            data-testid="bookings-send-inquiry-link-button"
            className="min-h-11 px-4 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Send Inquiry Link
          </button>
          <button
            type="button"
            onClick={openAdd}
            disabled={!canEdit}
            data-testid="bookings-add-button"
            className="min-h-11 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add Booking
          </button>
        </div>
      </div>

      {pendingInquiries.length > 0 && (
        <div data-testid="bookings-pending-inquiries-banner" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-sm font-semibold text-amber-800 mb-2">
            {pendingInquiries.length} new inquiry response{pendingInquiries.length > 1 ? 's' : ''} to review
          </div>
          <div className="space-y-1">
            {pendingInquiries.map((link) => (
              <div key={link.id} data-testid="bookings-pending-inquiry-row" className="flex items-center justify-between text-sm">
                <span>
                  {link.response?.firstName} {link.response?.lastName}
                  {link.response?.eventType ? ` — ${link.response.eventType}` : ''}
                  {link.response?.eventDate ? ` on ${formatEventDate(link.response.eventDate)}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setReviewingInquiry(link)}
                  data-testid="bookings-review-inquiry-button"
                  className="text-indigo-600 font-semibold hover:underline"
                >
                  Review
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {sentInquiries.length > 0 && (
        <div data-testid="bookings-sent-inquiries-banner" className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-sm font-semibold text-slate-600 mb-2">
            {sentInquiries.length} inquiry link{sentInquiries.length > 1 ? 's' : ''} awaiting a response
          </div>
          <div className="space-y-1">
            {sentInquiries.map((link) => (
              <div key={link.id} data-testid="bookings-sent-inquiry-row" className="flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {link.recipientEmail
                    ? `Emailed to ${link.recipientName || link.recipientEmail}`
                    : 'Link copied (not emailed)'}
                  {' — sent '}{formatEventDate((link.sentAt || link.createdAt).slice(0, 10))}
                </span>
                <button
                  type="button"
                  onClick={() => setDeleteInquiryTarget(link)}
                  data-testid="bookings-delete-sent-inquiry-button"
                  className="text-slate-400 hover:text-red-600 font-semibold"
                  aria-label="Delete inquiry link"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingRevisionRequests.length > 0 && (
        <div data-testid="bookings-revision-requests-banner" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="text-sm font-semibold text-red-800 mb-2">
            {pendingRevisionRequests.length} proposal{pendingRevisionRequests.length > 1 ? 's' : ''} with requested changes
          </div>
          <div className="space-y-1">
            {pendingRevisionRequests.map((pr) => (
              <div key={pr.id} data-testid="bookings-revision-request-row" className="flex items-center justify-between text-sm gap-3">
                <span className="text-red-700 truncate">
                  <span className="font-semibold">{pr.recipientName || pr.recipientEmail}</span>
                  {pr.responseNote ? ` — "${pr.responseNote}"` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/bookings/${pr.bookingId}`)}
                  data-testid="bookings-review-revision-request-button"
                  className="text-red-700 font-semibold hover:underline shrink-0"
                >
                  Review
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <Tabs tabs={VIEW_TABS} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search bookings…" className="w-64" testId="bookings-search-input" />
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          allLabel="All Dispositions"
          options={BOOKING_DISPOSITIONS.map((item) => ({ value: item.id, label: item.label }))}
          testId="bookings-status-filter"
        />
        <FilterSelect
          value={priorityFilter}
          onChange={setPriorityFilter}
          allLabel="All Priorities"
          options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))}
          testId="bookings-priority-filter"
        />
        <FilterSelect
          value={eventTypeFilter}
          onChange={setEventTypeFilter}
          allLabel="All Event Types"
          options={eventTypes.map((t) => ({ value: t, label: t }))}
          testId="bookings-event-type-filter"
        />
        <FilterSelect
          value={depositFilter}
          onChange={setDepositFilter}
          allLabel="All Deposits"
          options={[
            { value: 'paid', label: 'Deposit Paid' },
            { value: 'due', label: 'Deposit Due' },
            { value: 'none', label: 'No Deposit' },
          ]}
          testId="bookings-deposit-filter"
        />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort bookings" className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-600">
          <option value="createdAt">Newest added</option>
          <option value="eventDate">Event date</option>
          <option value="eventName">Event name</option>
          <option value="updatedAt">Recently updated</option>
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(''); setStatusFilter(''); setPriorityFilter(''); setEventTypeFilter(''); setDepositFilter(''); }}
            data-testid="bookings-clear-filters-button"
            className="text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <ScrollShadow>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">Workflow Stage</th>
                <th className="hidden sm:table-cell px-4 py-3">Disposition</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Event</th>
                <th className="hidden sm:table-cell px-4 py-3">Follow-up</th>
                <th className="px-4 py-3">Event Date</th>
                <th className="hidden sm:table-cell px-4 py-3">Event Type</th>
                <th className="hidden sm:table-cell px-4 py-3">Deposit</th>
                <th className="hidden sm:table-cell px-4 py-3 text-center">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && pagedBookings.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                    {error || (activeTab === 'completed' ? 'No completed bookings yet.' : totalItems === 0 && !hasFilters ? (
                      <div className="flex flex-col items-center gap-3">
                        <div>
                          <p className="font-semibold text-slate-600">Create your first booking</p>
                          <p className="text-sm mt-1">Add one yourself, or send a client an inquiry link to collect their details.</p>
                        </div>
                        {canEdit && (
                          <div className="flex flex-wrap justify-center gap-2">
                            <button type="button" onClick={openAdd} className="min-h-11 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">+ Add Booking</button>
                            <button type="button" onClick={() => setSendInquiryModalOpen(true)} className="min-h-11 rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50">Send Inquiry Link</button>
                          </div>
                        )}
                      </div>
                    ) : 'No bookings match your search or filters.')}
                  </td>
                </tr>
              )}
              {pagedBookings.map((b) => {
                const disposition = dispositionInfo(b.bookingStatus, bookingStatuses);
                const client = b.client;
                const canConvert = !b.convertedEventId;
                const priority = PRIORITIES.find((p) => p.value === b.priority);
                const tone = followUpTone(b.nextFollowUpDate);
                const contract = contracts
                  .filter((c) => c.bookingId === b.id)
                  .sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))[0] || null;
                const bookingInvoices = invoices.filter((inv) => inv.bookingId === b.id);
                const stage = currentPipelineStep(pipelineSteps(b, b.proposal, contract, bookingInvoices, latestProposalResponseByBooking.get(b.id)));
                const proposalRevisionRequested = latestProposalResponseByBooking.get(b.id)?.status === 'revision_requested';

                return (
                  <tr key={b.id} data-testid="booking-row" className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Badge color={stageColor(stage)}>{stage.label}</Badge>
                        {proposalRevisionRequested && (
                          <Tooltip content="The client requested changes to the proposal">
                            <span data-testid="booking-row-revision-requested-hint" className="text-red-500 cursor-default" aria-label="Proposal revision requested">✎</span>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      <Badge color={disposition.color}>{disposition.label}</Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      <div className="flex items-center gap-2">
                        {priority && (
                          <Tooltip content={`${priority.label} priority`}>
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: priority.color }} />
                          </Tooltip>
                        )}
                        {canEdit ? (
                          <button type="button" onClick={() => openEdit(b)} data-testid="booking-row-client-link" className="hover:text-indigo-600 hover:underline text-left">
                            {client ? `${client.firstName} ${client.lastName}` : '—'}
                          </button>
                        ) : (
                          <span>{client ? `${client.firstName} ${client.lastName}` : '—'}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {b.eventName && (b.convertedEventId || canEdit) ? (
                        <button
                          type="button"
                          onClick={() => (b.convertedEventId ? navigate(`/events/${b.convertedEventId}`) : openEdit(b))}
                          title={b.convertedEventId ? 'Open event' : 'Open booking'}
                          data-testid="booking-row-event-name-link"
                          className="hover:text-indigo-600 hover:underline text-left"
                        >
                          {b.eventName}
                        </button>
                      ) : (
                        b.eventName || <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      {b.nextFollowUpDate ? (
                        <span className={
                          tone === 'overdue' ? 'text-red-600 font-semibold' :
                          tone === 'today' ? 'text-amber-600 font-semibold' :
                          'text-slate-600'
                        }>
                          {formatEventDate(b.nextFollowUpDate)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{b.eventDate ? formatEventDate(b.eventDate) : '—'}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-slate-600">{b.eventType || '—'}</td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      {b.depositPaid ? (
                        <Badge color="#22c55e">Paid{b.depositAmount ? ` ${currency(b.depositAmount)}` : ''}</Badge>
                      ) : b.depositAmount ? (
                        <Badge color="#eab308">{currency(b.depositAmount)}{b.depositDueDate ? ` due ${formatEventDate(b.depositDueDate)}` : ''}</Badge>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-center">
                      {b.notes ? (
                        <Tooltip content={b.notes}>
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold cursor-default">
                            1
                          </span>
                        </Tooltip>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canEdit && activeTab === 'completed' ? (
                        <div className="flex justify-end items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleRestore(b)}
                            data-testid="booking-row-restore-button"
                            className="px-2 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 whitespace-nowrap"
                          >
                            ↺ Restore
                          </button>
                        </div>
                      ) : canEdit && (
                        <div className="flex justify-end items-center gap-1">
                          {b.convertedEventId ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/events/${b.convertedEventId}`)}
                              data-testid="booking-row-view-event-link"
                              className="px-2 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 whitespace-nowrap"
                            >
                              View Event →
                            </button>
                          ) : canConvert && (
                            <button
                              type="button"
                              onClick={() => handleConvert(b)}
                              data-testid="booking-row-convert-button"
                              className="px-2 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 whitespace-nowrap"
                            >
                              Create Event →
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(b)}
                            data-testid="booking-row-edit-button"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                            aria-label="Edit booking"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMarkComplete(b)}
                            data-testid="booking-row-complete-button"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                            aria-label="Mark booking complete"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(b)}
                            data-testid="booking-row-delete-button"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                            aria-label="Delete booking"
                          >
                            🗑
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollShadow>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} testId="bookings-pagination" />
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete booking?"
        description="This removes the booking from your active list. It's permanently erased after 30 days — until then it can still be recovered."
        confirmText={deleteTargetLabel() || undefined}
      />

      <MarkCompleteModal
        open={!!completeTarget}
        onClose={() => setCompleteTarget(null)}
        onConfirm={handleConfirmComplete}
        primaryLabel={`Booking: ${completeTarget?.booking?.eventName || 'this booking'}`}
        linkedLabel={completeTarget?.linkedEvent ? `Also mark its event: ${completeTarget.linkedEvent.name || 'this event'}` : null}
      />

      <SendInquiryLinkModal open={sendInquiryModalOpen} onClose={() => setSendInquiryModalOpen(false)} />

      <ReviewInquiryModal
        open={!!reviewingInquiry}
        link={reviewingInquiry}
        onClose={() => setReviewingInquiry(null)}
        onApplied={handleInquiryApplied}
      />

      <ConfirmDialog
        open={!!deleteInquiryTarget}
        onClose={() => setDeleteInquiryTarget(null)}
        onConfirm={handleDeleteInquiryLink}
        title="Delete inquiry link?"
        description={`This permanently deletes the link${deleteInquiryTarget?.recipientEmail ? ` sent to ${deleteInquiryTarget.recipientName || deleteInquiryTarget.recipientEmail}` : ''} — it'll stop working immediately.`}
      />
    </div>
  );
}
