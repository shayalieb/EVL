import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import Badge from '../components/ui/Badge';
import { formatCurrency } from '../lib/format';
import { CalendarIcon, ClockIcon, DollarIcon, UsersIcon, WrenchIcon, AlertIcon } from '../components/ui/icons';

function currency(n) {
  return formatCurrency(n, { maximumFractionDigits: 0 });
}

function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function PanelHeading({ children, color, icon }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a`, color }}>
        {icon}
      </div>
      <h3 className="text-sm font-bold text-slate-700">{children}</h3>
    </div>
  );
}

function StatTile({ label, value, color = '#64748b', icon }) {
  return (
    <div className="relative bg-white rounded-xl border border-slate-200 px-5 py-4 overflow-hidden">
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} />
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</div>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a`, color }}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
    </div>
  );
}

export default function HomePage() {
  const {
    events, clients, contractors, eventStatuses,
    computeEventTotalCost, computeVendorStatus, computeClientEventCounts, getContractorById,
  } = useData();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const today = todayISO();
    const isCancelled = (e) => {
      const status = eventStatuses.find((s) => s.id === e.eventStatus);
      return (status?.label || '').toLowerCase() === 'cancelled';
    };

    const upcoming = events
      .filter((e) => e.eventDate >= today && !isCancelled(e))
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

    const pipelineValue = upcoming.reduce((sum, e) => sum + computeEventTotalCost(e), 0);
    const needsConfirmation = upcoming.filter((e) => computeVendorStatus(e).status === 'pending').length;

    const bookingCounts = new Map();
    for (const e of events) {
      for (const b of e.contractorBookings) {
        bookingCounts.set(b.contractorId, (bookingCounts.get(b.contractorId) || 0) + 1);
      }
    }
    const topContractors = [...bookingCounts.entries()]
      .map(([contractorId, count]) => ({ contractor: getContractorById(contractorId), count }))
      .filter((x) => x.contractor)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const followUpClients = clients
      .map((c) => ({ client: c, counts: computeClientEventCounts(c.id) }))
      .filter((x) => x.counts.pending > 0)
      .sort((a, b) => b.counts.pending - a.counts.pending)
      .slice(0, 5);

    return {
      totalEvents: events.length,
      upcomingCount: upcoming.length,
      pipelineValue,
      needsConfirmation,
      upcomingList: upcoming.slice(0, 5),
      topContractors,
      followUpClients,
    };
  }, [events, clients, eventStatuses, computeEventTotalCost, computeVendorStatus, computeClientEventCounts, getContractorById]);

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-4">Home</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatTile label="Total Events" value={stats.totalEvents} color="#64748b" icon={<CalendarIcon />} />
        <StatTile label="Upcoming Events" value={stats.upcomingCount} color="#2563eb" icon={<ClockIcon />} />
        <StatTile label="Pipeline Value" value={currency(stats.pipelineValue)} color="#4f46e5" icon={<DollarIcon />} />
        <StatTile label="Total Clients" value={clients.length} color="#7c3aed" icon={<UsersIcon />} />
        <StatTile label="Total Contractors" value={contractors.length} color="#0d9488" icon={<WrenchIcon />} />
        <StatTile
          label="Needs Confirmation"
          value={stats.needsConfirmation}
          color={stats.needsConfirmation > 0 ? '#d97706' : '#94a3b8'}
          icon={<AlertIcon />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <PanelHeading color="#2563eb" icon={<ClockIcon className="w-3.5 h-3.5" />}>Upcoming Events</PanelHeading>
          {stats.upcomingList.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-6">No upcoming events.</div>
          ) : (
            <div className="space-y-1">
              {stats.upcomingList.map((e) => {
                const status = eventStatuses.find((s) => s.id === e.eventStatus);
                const vendor = computeVendorStatus(e);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => navigate(`/events/${e.id}`)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{e.name}</div>
                      <div className="text-xs text-slate-400">{formatShortDate(e.eventDate)}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {status && <Badge color={status.color}>{status.label}</Badge>}
                      {vendor.status !== 'none' && (
                        <Badge color={vendor.status === 'confirmed' ? '#22c55e' : '#eab308'}>
                          {vendor.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <PanelHeading color="#0d9488" icon={<WrenchIcon className="w-3.5 h-3.5" />}>Top Contractors</PanelHeading>
            {stats.topContractors.length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-4">No bookings yet.</div>
            ) : (
              <div className="space-y-3">
                {stats.topContractors.map(({ contractor, count }) => (
                  <div key={contractor.id} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-700 truncate">{contractor.firstName} {contractor.lastName}</div>
                      <div className="text-xs text-slate-400">{contractor.contractorType1}</div>
                    </div>
                    <div className="text-slate-500 shrink-0">{count} booking{count === 1 ? '' : 's'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <PanelHeading color="#7c3aed" icon={<UsersIcon className="w-3.5 h-3.5" />}>Clients Needing Follow-up</PanelHeading>
            {stats.followUpClients.length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-4">All caught up.</div>
            ) : (
              <div className="space-y-3">
                {stats.followUpClients.map(({ client, counts }) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => navigate('/clients')}
                    className="w-full flex items-center justify-between text-sm hover:bg-slate-50 rounded-lg px-1 py-1 -mx-1"
                  >
                    <div className="font-medium text-slate-700 truncate">{client.firstName} {client.lastName}</div>
                    <div className="text-amber-600 font-semibold shrink-0">{counts.pending} pending</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
