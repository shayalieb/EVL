import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Tooltip from '../components/ui/Tooltip';
import Badge from '../components/ui/Badge';
import Tabs from '../components/ui/Tabs';
import { useToast } from '../components/ui/Toast';
import EventsCalendarView from '../components/events/EventsCalendarView';
import { formatCurrency as currency } from '../lib/format';

const VIEW_TABS = [
  { id: 'list', label: 'List View' },
  { id: 'calendar', label: 'Calendar View' },
];

function formatDateWithWeekday(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function EventsPage() {
  const { events, eventStatuses, deleteEvent, computeEventTotalCost, computeVendorStatus, getContractorById } = useData();
  const { can } = useAuth();
  const canEdit = can('manageEvents');
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('list');

  function handleDelete() {
    deleteEvent(deleteTarget.id);
    showToast('Event deleted');
    setDeleteTarget(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-slate-800">Events</h2>
        <button
          type="button"
          onClick={() => navigate('/events/new')}
          disabled={!canEdit}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add Event
        </button>
      </div>

      <div className="mb-4">
        <Tabs tabs={VIEW_TABS} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'calendar' ? (
        <EventsCalendarView
          events={events}
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
                <th className="px-4 py-3"># Contractors</th>
                <th className="px-4 py-3">Total Cost</th>
                <th className="px-4 py-3">Vendor Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    No events yet. Add your first event to start booking contractors.
                  </td>
                </tr>
              )}
              {events.map((evt) => {
                const status = eventStatuses.find((s) => s.id === evt.eventStatus);
                const total = computeEventTotalCost(evt);
                const vendor = computeVendorStatus(evt);
                const count = evt.contractorBookings.length;

                return (
                  <tr key={evt.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      {status && <Badge color={status.color}>{status.label}</Badge>}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/events/${evt.id}`)}
                          className="hover:text-indigo-600 hover:underline text-left"
                        >
                          {evt.name}
                        </button>
                      ) : (
                        <span>{evt.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDateWithWeekday(evt.eventDate)}</td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 text-slate-700 font-medium">{currency(total)}</td>
                    <td className="px-4 py-3">
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
                      {canEdit && (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => navigate(`/events/${evt.id}`)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                            aria-label="Edit event"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(evt)}
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
      </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete event?"
        description={`This will permanently delete "${deleteTarget?.name}" and its contractor bookings.`}
      />
    </div>
  );
}
