import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import MarkCompleteModal from '../components/MarkCompleteModal';
import Tooltip from '../components/ui/Tooltip';
import Badge from '../components/ui/Badge';
import Tabs from '../components/ui/Tabs';
import { useToast } from '../components/ui/Toast';
import EventsCalendarView from '../components/events/EventsCalendarView';
import SearchInput from '../components/ui/SearchInput';
import FilterSelect from '../components/ui/FilterSelect';
import Pagination from '../components/ui/Pagination';
import { formatCurrency as currency } from '../lib/format';
import { matchesSearch } from '../lib/search';
import { usePagination } from '../lib/usePagination';

const VIEW_TABS = [
  { id: 'list', label: 'List View' },
  { id: 'calendar', label: 'Calendar View' },
  { id: 'completed', label: 'Completed' },
];

function formatDateWithWeekday(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function EventsPage() {
  const {
    events, bookings, eventStatuses, eventTypes,
    deleteEvent, completeEvent, restoreEvent, completeBooking,
    computeEventTotalCost, computeVendorStatus, getContractorById,
  } = useData();
  const { can } = useAuth();
  const canEdit = can('manageEvents');
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [contractorsFilter, setContractorsFilter] = useState('');

  function handleDelete() {
    deleteEvent(deleteTarget.id);
    showToast('Event deleted');
    setDeleteTarget(null);
  }

  // The reverse of BookingsPage's lookup — a Booking points forward at its
  // converted Event via convertedEventId, so finding the source booking
  // from here means searching for it rather than following a field.
  function handleMarkComplete(evt) {
    const linkedBooking = bookings.find((b) => b.convertedEventId === evt.id);
    if (linkedBooking && !linkedBooking.completedAt) {
      setCompleteTarget({ event: evt, linkedBooking });
      return;
    }
    completeEvent(evt.id);
    showToast('Event marked complete');
  }

  async function handleConfirmComplete({ includePrimary, includeLinked }) {
    const { event: evt, linkedBooking } = completeTarget;
    if (includePrimary) await completeEvent(evt.id);
    if (includeLinked && linkedBooking) await completeBooking(linkedBooking.id);
    showToast('Marked complete');
    setCompleteTarget(null);
  }

  function handleRestore(evt) {
    restoreEvent(evt.id);
    showToast('Event restored to active');
  }

  const hasFilters = !!(search || statusFilter || vendorFilter || eventTypeFilter || contractorsFilter);
  const filteredEvents = events.filter((evt) => {
    if (activeTab === 'completed' ? !evt.completedAt : !!evt.completedAt) return false;
    if (statusFilter && evt.eventStatus !== statusFilter) return false;
    if (vendorFilter && computeVendorStatus(evt).status !== vendorFilter) return false;
    if (eventTypeFilter && evt.eventType !== eventTypeFilter) return false;
    if (contractorsFilter === 'has' && evt.contractorBookings.length === 0) return false;
    if (contractorsFilter === 'none' && evt.contractorBookings.length > 0) return false;
    return matchesSearch(search, [evt.name, evt.eventType]);
  });
  // Calendar view needs the full filtered set (it lays events out by date,
  // not in a scrollable list), so only the table view paginates.
  const { page, setPage, pageCount, pageItems: pagedEvents, pageSize, totalItems } = usePagination(filteredEvents);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-slate-800">Events</h2>
        <button
          type="button"
          onClick={() => navigate('/events/new')}
          disabled={!canEdit}
          data-testid="events-add-button"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add Event
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <Tabs tabs={VIEW_TABS} activeTab={activeTab} onChange={setActiveTab} />
        <div className="flex items-center gap-2 flex-wrap">
          <SearchInput value={search} onChange={setSearch} placeholder="Search events…" className="w-56" testId="events-search-input" />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            allLabel="All Statuses"
            options={eventStatuses.map((s) => ({ value: s.id, label: s.label }))}
            testId="events-status-filter"
          />
          <FilterSelect
            value={vendorFilter}
            onChange={setVendorFilter}
            allLabel="All Vendor Statuses"
            options={[
              { value: 'confirmed', label: 'Confirmed' },
              { value: 'pending', label: 'Pending' },
              { value: 'none', label: 'None' },
            ]}
            testId="events-vendor-filter"
          />
          <FilterSelect
            value={eventTypeFilter}
            onChange={setEventTypeFilter}
            allLabel="All Event Types"
            options={eventTypes.map((t) => ({ value: t, label: t }))}
            testId="events-event-type-filter"
          />
          <FilterSelect
            value={contractorsFilter}
            onChange={setContractorsFilter}
            allLabel="All Contractor Counts"
            options={[
              { value: 'has', label: 'Has Contractors' },
              { value: 'none', label: 'No Contractors' },
            ]}
            testId="events-contractors-filter"
          />
          {hasFilters && (
            <button
              type="button"
              onClick={() => { setSearch(''); setStatusFilter(''); setVendorFilter(''); setEventTypeFilter(''); setContractorsFilter(''); }}
              data-testid="events-clear-filters-button"
              className="text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {activeTab === 'calendar' ? (
        <EventsCalendarView
          events={filteredEvents}
          eventStatuses={eventStatuses}
          onSelectEvent={(evt) => navigate(`/events/${evt.id}`)}
        />
      ) : (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Event Name</th>
                <th className="px-4 py-3">Date</th>
                <th className="hidden sm:table-cell px-4 py-3"># Contractors</th>
                <th className="hidden sm:table-cell px-4 py-3">Total Cost</th>
                <th className="hidden sm:table-cell px-4 py-3">Vendor Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    {activeTab === 'completed'
                      ? 'No completed events yet.'
                      : events.length === 0
                        ? 'No events yet. Add your first event to start booking contractors.'
                        : 'No events match your search or filters.'}
                  </td>
                </tr>
              )}
              {pagedEvents.map((evt) => {
                const status = eventStatuses.find((s) => s.id === evt.eventStatus);
                const total = computeEventTotalCost(evt);
                const vendor = computeVendorStatus(evt);
                const count = evt.contractorBookings.length;

                return (
                  <tr key={evt.id} data-testid="event-row" className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      {status && <Badge color={status.color}>{status.label}</Badge>}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/events/${evt.id}`)}
                          data-testid="event-row-name-link"
                          className="hover:text-indigo-600 hover:underline text-left"
                        >
                          {evt.name}
                        </button>
                      ) : (
                        <span>{evt.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDateWithWeekday(evt.eventDate)}</td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      {count === 0 ? (
                        <span className="text-slate-400">0</span>
                      ) : (
                        <Tooltip content={
                          <div className="space-y-1">
                            {evt.contractorBookings.map((b) => {
                              const c = getContractorById(b.contractorId);
                              if (!c) return null;
                              return (
                                <div key={b.contractorId}>
                                  {c.firstName} {c.lastName} — {c.contractorType1}{c.contractorType2 ? ` / ${c.contractorType2}` : ''}
                                </div>
                              );
                            })}
                          </div>
                        }>
                          <span className="underline decoration-dotted cursor-default text-slate-700">{count}</span>
                        </Tooltip>
                      )}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-slate-700 font-medium">{currency(total)}</td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      {vendor.status === 'none' ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <Tooltip content={
                          <div className="space-y-2">
                            {vendor.pending.length > 0 && (
                              <div>
                                <div className="font-semibold text-slate-300">Waiting on:</div>
                                {vendor.pending.map((p) => p.contractor && (
                                  <div key={p.contractor.id}>{p.contractor.firstName} {p.contractor.lastName} ({p.inqStatus?.label || 'Unknown'})</div>
                                ))}
                              </div>
                            )}
                            {vendor.confirmed.length > 0 && (
                              <div>
                                <div className="font-semibold text-slate-300">Confirmed:</div>
                                {vendor.confirmed.map((p) => p.contractor && (
                                  <div key={p.contractor.id}>{p.contractor.firstName} {p.contractor.lastName}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        }>
                          <span>
                            <Badge color={vendor.status === 'confirmed' ? '#22c55e' : '#eab308'}>
                              {vendor.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                            </Badge>
                          </span>
                        </Tooltip>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canEdit && activeTab === 'completed' ? (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleRestore(evt)}
                            data-testid="event-row-restore-button"
                            className="px-2 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 whitespace-nowrap"
                          >
                            ↺ Restore
                          </button>
                        </div>
                      ) : canEdit && (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => navigate(`/events/${evt.id}`)}
                            data-testid="event-row-edit-button"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                            aria-label="Edit event"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMarkComplete(evt)}
                            data-testid="event-row-complete-button"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                            aria-label="Mark event complete"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(evt)}
                            data-testid="event-row-delete-button"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                            aria-label="Delete event"
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
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} testId="events-pagination" />
      </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete event?"
        description={`This removes "${deleteTarget?.name}" and its contractor bookings from your active events. It's permanently erased after 30 days — until then it can still be recovered.`}
        confirmText={deleteTarget?.name || undefined}
      />

      <MarkCompleteModal
        open={!!completeTarget}
        onClose={() => setCompleteTarget(null)}
        onConfirm={handleConfirmComplete}
        primaryLabel={`Event: ${completeTarget?.event?.name || 'this event'}`}
        linkedLabel={completeTarget?.linkedBooking ? `Also mark its booking: ${completeTarget.linkedBooking.eventName || 'this booking'}` : null}
      />
    </div>
  );
}
