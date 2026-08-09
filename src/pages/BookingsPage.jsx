import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { PRIORITIES } from './BookingFormPage';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import Tooltip from '../components/ui/Tooltip';
import SearchInput from '../components/ui/SearchInput';
import FilterSelect from '../components/ui/FilterSelect';
import Pagination from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';
import { formatCurrency as currency, formatEventDate } from '../lib/format';
import { matchesSearch } from '../lib/search';
import { usePagination } from '../lib/usePagination';
import { listInquiryLinks } from '../lib/inquiryLinks';
import { listContracts } from '../lib/contracts';
import { listInvoices } from '../lib/invoices';
import { pipelineSteps, currentPipelineStep } from '../lib/bookingPipeline';
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

// Soft, informational-only signal that the manually-set bookingStatus badge
// may no longer reflect reality — never blocks or auto-corrects anything.
// Heuristic: once the real pipeline is at Signed or later, a status that
// still isn't flagged `isBooked` is worth a second look.
function stageAheadOfStatus(stage, status) {
  return ['Signed', 'Event', 'Payment'].includes(stage.label) && !status?.isBooked;
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

export default function BookingsPage() {
  const { bookings, bookingStatuses, eventTypes, clients, deleteBooking, convertBookingToEvent } = useData();
  const { can } = useAuth();
  const canEdit = can('manageBookings');
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [depositFilter, setDepositFilter] = useState('');
  const [sendInquiryModalOpen, setSendInquiryModalOpen] = useState(false);
  const [pendingInquiries, setPendingInquiries] = useState([]);
  const [reviewingInquiry, setReviewingInquiry] = useState(null);
  // Account-wide, fetched once — same lightweight local-fetch pattern
  // HomePage.jsx already uses for its own invoices (not routed through
  // DataContext, since neither is read anywhere else on this page). Feeds
  // the Stage column below: each row derives its real pipeline position via
  // the same pipelineSteps() BookingFormPage's own stepper uses, rather than
  // this list only ever showing the separate, manually-set status badge.
  const [contracts, setContracts] = useState([]);
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    let cancelled = false;
    listInquiryLinks({ status: 'submitted' }).then((links) => { if (!cancelled) setPendingInquiries(links); }).catch(() => {});
    listContracts().then((list) => { if (!cancelled) setContracts(list); }).catch(() => {});
    listInvoices().then((list) => { if (!cancelled) setInvoices(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function handleInquiryApplied(linkId) {
    setPendingInquiries((prev) => prev.filter((l) => l.id !== linkId));
  }

  function depositStatus(b) {
    if (b.depositPaid) return 'paid';
    if (b.depositAmount) return 'due';
    return 'none';
  }

  const hasFilters = !!(search || statusFilter || priorityFilter || eventTypeFilter || depositFilter);
  const filteredBookings = bookings.filter((b) => {
    if (statusFilter && b.bookingStatus !== statusFilter) return false;
    if (priorityFilter && b.priority !== priorityFilter) return false;
    if (eventTypeFilter && b.eventType !== eventTypeFilter) return false;
    if (depositFilter && depositStatus(b) !== depositFilter) return false;
    const client = clients.find((c) => c.id === b.clientId);
    return matchesSearch(search, [client?.firstName, client?.lastName, b.eventType, b.notes]);
  });
  const { page, setPage, pageCount, pageItems: pagedBookings, pageSize, totalItems } = usePagination(filteredBookings);

  function openAdd() {
    navigate('/bookings/new');
  }

  function openEdit(booking) {
    navigate(`/bookings/${booking.id}`);
  }

  function handleDelete() {
    deleteBooking(deleteTarget.id);
    showToast('Booking deleted');
    setDeleteTarget(null);
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-slate-800">Bookings</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSendInquiryModalOpen(true)}
            disabled={!canEdit}
            data-testid="bookings-send-inquiry-link-button"
            className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Send Inquiry Link
          </button>
          <button
            type="button"
            onClick={openAdd}
            disabled={!canEdit}
            data-testid="bookings-add-button"
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
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

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search bookings…" className="w-64" testId="bookings-search-input" />
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          allLabel="All Statuses"
          options={bookingStatuses.map((s) => ({ value: s.id, label: s.label }))}
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">Status</th>
                <th className="hidden sm:table-cell px-4 py-3">Stage</th>
                <th className="px-4 py-3">Client</th>
                <th className="hidden sm:table-cell px-4 py-3">Follow-up</th>
                <th className="px-4 py-3">Event Date</th>
                <th className="hidden sm:table-cell px-4 py-3">Event Type</th>
                <th className="hidden sm:table-cell px-4 py-3">Deposit</th>
                <th className="hidden sm:table-cell px-4 py-3 text-center">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBookings.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    {bookings.length === 0
                      ? 'No bookings yet. Add an inquiry or quote to start tracking the sales pipeline.'
                      : 'No bookings match your search or filters.'}
                  </td>
                </tr>
              )}
              {pagedBookings.map((b) => {
                const status = bookingStatuses.find((s) => s.id === b.bookingStatus);
                const client = clients.find((c) => c.id === b.clientId);
                const canConvert = !b.convertedEventId;
                const priority = PRIORITIES.find((p) => p.value === b.priority);
                const tone = followUpTone(b.nextFollowUpDate);
                const contract = contracts
                  .filter((c) => c.bookingId === b.id)
                  .sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))[0] || null;
                const bookingInvoices = invoices.filter((inv) => inv.bookingId === b.id);
                const stage = currentPipelineStep(pipelineSteps(b, b.proposal, contract, bookingInvoices));
                const stageMismatch = stageAheadOfStatus(stage, status);

                return (
                  <tr key={b.id} data-testid="booking-row" className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {status && <Badge color={status.color}>{status.label}</Badge>}
                        {stageMismatch && (
                          <Tooltip content={`Pipeline shows this is at "${stage.label}" already — status may be out of date.`}>
                            <span data-testid="booking-row-stage-mismatch-hint" className="text-amber-500 cursor-default" aria-label="Status may be out of date">⚠</span>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      <Badge color={stageColor(stage)}>{stage.label}</Badge>
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
                      {canEdit && (
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
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} testId="bookings-pagination" />
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete booking?"
        description="This will permanently delete this booking record."
      />

      <SendInquiryLinkModal open={sendInquiryModalOpen} onClose={() => setSendInquiryModalOpen(false)} />

      <ReviewInquiryModal
        open={!!reviewingInquiry}
        link={reviewingInquiry}
        onClose={() => setReviewingInquiry(null)}
        onApplied={handleInquiryApplied}
      />
    </div>
  );
}
