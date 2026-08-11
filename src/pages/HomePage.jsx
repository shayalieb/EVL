import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import Badge from '../components/ui/Badge';
import { formatCurrency } from '../lib/format';
import { listInvoices } from '../lib/invoices';
import { CalendarIcon, ClockIcon, DollarIcon, UsersIcon, WrenchIcon, AlertIcon } from '../components/ui/icons';

import Skeleton from '../components/ui/Skeleton';

// At-risk window for the "needs attention soon" panel below — events inside
// this many days that still have unconfirmed vendors are the ones actually
// worth surfacing; further out, "pending" is just normal pipeline state, not
// yet a risk.
const AT_RISK_WINDOW_DAYS = 14;

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

function StatTile({ label, value, color = '#64748b', icon, testId }) {
  return (
    <div data-testid={testId} className="relative bg-white rounded-xl border border-slate-200 px-5 py-4 overflow-hidden shadow-xs hover:shadow-md transition-shadow duration-200">
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
    events, bookings, clients, contractors, eventStatuses,
    computeEventTotalCost, computeVendorStatus, computeClientEventCounts, getContractorById,
  } = useData();
  const navigate = useNavigate();

  const [invoices, setInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listInvoices()
      .then((list) => { if (!cancelled) setInvoices(list); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setInvoicesLoading(false); });
    return () => { cancelled = true; };
  }, []);

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

    const atRiskCutoff = new Date();
    atRiskCutoff.setDate(atRiskCutoff.getDate() + AT_RISK_WINDOW_DAYS);
    const atRiskCutoffISO = atRiskCutoff.toISOString().slice(0, 10);
    const atRiskEvents = upcoming
      .filter((e) => e.eventDate <= atRiskCutoffISO && computeVendorStatus(e).status === 'pending')
      .slice(0, 5);

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
      atRiskEvents,
      topContractors,
      followUpClients,
    };
  }, [events, clients, eventStatuses, computeEventTotalCost, computeVendorStatus, computeClientEventCounts, getContractorById]);

  const overdueInvoices = useMemo(() => {
    const today = todayISO();
    return invoices
      .filter((inv) => (inv.status === 'sent' || inv.status === 'partial') && inv.dueDate && inv.dueDate.slice(0, 10) < today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);
  }, [invoices]);

  function daysOverdue(dueDate) {
    return Math.max(1, Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000));
  }

  // Same per-gig margin math as EventFormPage's Financials tab benchmark —
  // only gigs with real invoiced revenue count (an unbooked/unconverted
  // event has no real margin to include), so this reads as "how are the
  // gigs we've actually billed doing", not diluted by every event ever
  // created. worst is null when there's only one qualifying gig, so it
  // isn't shown as both the best AND the worst result.
  const financialsSnapshot = useMemo(() => {
    const gigs = [];
    let totalRevenue = 0;
    let totalCosts = 0;
    for (const evt of events) {
      const evtBooking = bookings.find((b) => b.convertedEventId === evt.id);
      if (!evtBooking) continue;
      const evtRevenue = invoices
        .filter((inv) => inv.bookingId === evtBooking.id && inv.status !== 'void' && inv.status !== 'draft')
        .reduce((sum, inv) => sum + (inv.total || 0), 0);
      if (evtRevenue <= 0) continue;
      const evtCost = computeEventTotalCost(evt);
      totalRevenue += evtRevenue;
      totalCosts += evtCost;
      gigs.push({ id: evt.id, name: evt.name, margin: ((evtRevenue - evtCost) / evtRevenue) * 100 });
    }
    const avgMargin = gigs.length ? gigs.reduce((sum, g) => sum + g.margin, 0) / gigs.length : null;
    const sorted = [...gigs].sort((a, b) => b.margin - a.margin);
    return {
      totalRevenue,
      totalCosts,
      avgMargin,
      count: gigs.length,
      bestGig: sorted[0] || null,
      worstGig: sorted.length > 1 ? sorted[sorted.length - 1] : null,
    };
  }, [events, bookings, invoices, computeEventTotalCost]);

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-4">Home</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatTile label="Total Events" value={stats.totalEvents} color="#64748b" icon={<CalendarIcon />} testId="home-stat-total-events" />
        <StatTile label="Upcoming Events" value={stats.upcomingCount} color="#2563eb" icon={<ClockIcon />} testId="home-stat-upcoming-events" />
        <StatTile label="Pipeline Value" value={currency(stats.pipelineValue)} color="#4f46e5" icon={<DollarIcon />} testId="home-stat-pipeline-value" />
        <StatTile label="Total Clients" value={clients.length} color="#7c3aed" icon={<UsersIcon />} testId="home-stat-total-clients" />
        <StatTile label="Total Contractors" value={contractors.length} color="#0d9488" icon={<WrenchIcon />} testId="home-stat-total-contractors" />
        <StatTile
          label="Needs Confirmation"
          value={stats.needsConfirmation}
          color={stats.needsConfirmation > 0 ? '#d97706' : '#94a3b8'}
          icon={<AlertIcon />}
          testId="home-stat-needs-confirmation"
        />
      </div>

      {invoicesLoading ? (
        <Skeleton className="h-40 w-full rounded-xl mb-6" />
      ) : financialsSnapshot.count > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <PanelHeading color="#0d9488" icon={<DollarIcon className="w-3.5 h-3.5" />}>Financials Snapshot</PanelHeading>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Total Revenue</div>
              <div className="text-xl font-bold text-slate-800" data-testid="home-financials-total-revenue">{currency(financialsSnapshot.totalRevenue)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Total Contractor Costs</div>
              <div className="text-xl font-bold text-slate-800" data-testid="home-financials-total-costs">{currency(financialsSnapshot.totalCosts)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Average Margin</div>
              <div className="text-xl font-bold text-slate-800" data-testid="home-financials-avg-margin">
                {financialsSnapshot.avgMargin.toFixed(1)}%
              </div>
            </div>
          </div>
          {(financialsSnapshot.bestGig || financialsSnapshot.worstGig) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-slate-100">
              {financialsSnapshot.bestGig && (
                <button
                  type="button"
                  onClick={() => navigate(`/events/${financialsSnapshot.bestGig.id}`)}
                  data-testid="home-financials-best-gig"
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-emerald-100 bg-emerald-50/50 hover:bg-emerald-50 text-left"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Best Margin</div>
                    <div className="text-sm font-medium text-slate-800 truncate">{financialsSnapshot.bestGig.name}</div>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 shrink-0">{financialsSnapshot.bestGig.margin.toFixed(1)}%</span>
                </button>
              )}
              {financialsSnapshot.worstGig && (
                <button
                  type="button"
                  onClick={() => navigate(`/events/${financialsSnapshot.worstGig.id}`)}
                  data-testid="home-financials-worst-gig"
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-red-100 bg-red-50/50 hover:bg-red-50 text-left"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-red-600 uppercase tracking-wide">Lowest Margin</div>
                    <div className="text-sm font-medium text-slate-800 truncate">{financialsSnapshot.worstGig.name}</div>
                  </div>
                  <span className="text-sm font-bold text-red-600 shrink-0">{financialsSnapshot.worstGig.margin.toFixed(1)}%</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Money/risk at a glance — the two things most likely to actually
          cost a solo operator, surfaced before the general-purpose panels
          below rather than buried in per-booking tabs. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <PanelHeading color="#e11d48" icon={<DollarIcon className="w-3.5 h-3.5" />}>Overdue Invoices</PanelHeading>
          {invoicesLoading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ) : overdueInvoices.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-6">No overdue invoices.</div>
          ) : (
            <div className="space-y-1">
              {overdueInvoices.map((inv) => (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => navigate(`/bookings/${inv.bookingId}`)}
                  data-testid="home-overdue-invoice-row"
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 text-left"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{inv.recipientName || `Invoice #${inv.number}`}</div>
                    <div className="text-xs text-slate-400">Due {formatShortDate(inv.dueDate.slice(0, 10))}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-slate-700">{currency(inv.total - inv.paidAmount)}</span>
                    <Badge color="#e11d48">{daysOverdue(inv.dueDate)}d overdue</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <PanelHeading color="#d97706" icon={<AlertIcon className="w-3.5 h-3.5" />}>At-Risk Events</PanelHeading>
          {stats.atRiskEvents.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-6">Nothing unconfirmed in the next {AT_RISK_WINDOW_DAYS} days.</div>
          ) : (
            <div className="space-y-1">
              {stats.atRiskEvents.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => navigate(`/events/${e.id}`)}
                  data-testid="home-at-risk-event-row"
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 text-left"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{e.name}</div>
                    <div className="text-xs text-slate-400">{formatShortDate(e.eventDate)}</div>
                  </div>
                  <Badge color="#eab308">Unconfirmed</Badge>
                </button>
              ))}
            </div>
          )}
        </div>
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
                    data-testid="home-upcoming-event-card"
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
                  <div key={contractor.id} data-testid="home-top-contractor-row" className="flex items-center justify-between text-sm">
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
                    data-testid="home-followup-client-row"
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
