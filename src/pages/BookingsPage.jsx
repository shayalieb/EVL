import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { PRIORITIES } from './BookingFormPage';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import Tooltip from '../components/ui/Tooltip';
import { useToast } from '../components/ui/Toast';
import { formatCurrency as currency, formatEventDate } from '../lib/format';

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
  const { bookings, bookingStatuses, clients, deleteBooking, convertBookingToEvent } = useData();
  const { can } = useAuth();
  const canEdit = can('manageBookings');
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState(null);

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

  function handleConvert(booking) {
    const event = convertBookingToEvent(booking.id);
    if (!event) return;
    showToast('Booking converted to event');
    navigate(`/events/${event.id}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-slate-800">Bookings</h2>
        <button
          type="button"
          onClick={openAdd}
          disabled={!canEdit}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add Booking
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Follow-up</th>
                <th className="px-4 py-3">Event Date</th>
                <th className="px-4 py-3">Event Type</th>
                <th className="px-4 py-3">Quoted Total</th>
                <th className="px-4 py-3">Deposit</th>
                <th className="px-4 py-3 text-center">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    No bookings yet. Add an inquiry or quote to start tracking the sales pipeline.
                  </td>
                </tr>
              )}
              {bookings.map((b) => {
                const status = bookingStatuses.find((s) => s.id === b.bookingStatus);
                const client = clients.find((c) => c.id === b.clientId);
                const canConvert = !b.convertedEventId && status?.isBooked;
                const priority = PRIORITIES.find((p) => p.value === b.priority);
                const tone = followUpTone(b.nextFollowUpDate);

                return (
                  <tr key={b.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      {status && <Badge color={status.color}>{status.label}</Badge>}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      <div className="flex items-center gap-2">
                        {priority && (
                          <Tooltip content={`${priority.label} priority`}>
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: priority.color }} />
                          </Tooltip>
                        )}
                        {canEdit ? (
                          <button type="button" onClick={() => openEdit(b)} className="hover:text-indigo-600 hover:underline text-left">
                            {client ? `${client.firstName} ${client.lastName}` : '—'}
                          </button>
                        ) : (
                          <span>{client ? `${client.firstName} ${client.lastName}` : '—'}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 text-slate-600">{b.eventType || '—'}</td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{b.quotedTotal ? currency(b.quotedTotal) : '—'}</td>
                    <td className="px-4 py-3">
                      {b.depositPaid ? (
                        <Badge color="#22c55e">Paid{b.depositAmount ? ` ${currency(b.depositAmount)}` : ''}</Badge>
                      ) : b.depositAmount ? (
                        <Badge color="#eab308">{currency(b.depositAmount)}{b.depositDueDate ? ` due ${formatEventDate(b.depositDueDate)}` : ''}</Badge>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
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
                              className="px-2 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 whitespace-nowrap"
                            >
                              View Event →
                            </button>
                          ) : canConvert && (
                            <button
                              type="button"
                              onClick={() => handleConvert(b)}
                              className="px-2 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 whitespace-nowrap"
                            >
                              Convert to Event →
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(b)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                            aria-label="Edit booking"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(b)}
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
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete booking?"
        description="This will permanently delete this booking record."
      />
    </div>
  );
}
