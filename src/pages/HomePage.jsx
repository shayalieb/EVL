import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import Badge from '../components/ui/Badge';
import { formatCurrency } from '../lib/format';
import { getDashboard } from '../lib/dashboard';
import { CalendarIcon, ClockIcon, DollarIcon, UsersIcon, WrenchIcon, AlertIcon, ClipboardIcon } from '../components/ui/icons';

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

function WelcomeStep({ icon, title, description, actionLabel, onClick, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="text-left bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all duration-200"
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600 mb-3">
        {icon}
      </div>
      <div className="text-sm font-bold text-slate-800 mb-1">{title}</div>
      <p className="text-sm text-slate-500 mb-3">{description}</p>
      <span className="text-sm font-semibold text-indigo-600">{actionLabel} →</span>
    </button>
  );
}

export default function HomePage() {
  const { eventStatuses } = useData();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  useEffect(() => {
    let cancelled = false;
    getDashboard()
      .then((result) => { if (!cancelled) setDashboard(result); })
      .catch((error) => { if (!cancelled) setDashboardError(error.message || 'Unable to load the dashboard.'); })
      .finally(() => { if (!cancelled) setDashboardLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const stats = dashboard?.stats;
  const overdueInvoices = dashboard?.overdueInvoices || [];
  const financialsSnapshot = dashboard?.financials;

  function daysOverdue(dueDate) {
    return Math.max(1, Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000));
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-4">Home</h2>

      {dashboardLoading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : dashboardError || !dashboard ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{dashboardError || 'Unable to load the dashboard.'}</div>
      ) : dashboard.isFreshAccount ? (
        <div data-testid="home-welcome-panel">
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <h3 className="text-lg font-bold text-slate-800 mb-1">
              Welcome{currentUser?.firstName ? `, ${currentUser.firstName}` : ''}
              {currentUser?.businessInfo?.name ? ` — let's get ${currentUser.businessInfo.name} set up` : ''}
            </h3>
            <p className="text-sm text-slate-500">
              This dashboard fills in once you're tracking real bookings — here's where to start.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <WelcomeStep
              icon={<ClipboardIcon className="w-4 h-4" />}
              title="Add your business details"
              description="Your name and logo show up on every invoice, contract, and client-facing form — right now they'd just say “Your Business.”"
              actionLabel="Go to Settings"
              onClick={() => navigate('/settings?tab=business')}
              testId="home-welcome-step-business-info"
            />
            <WelcomeStep
              icon={<WrenchIcon className="w-4 h-4" />}
              title={dashboard.counts.contractors ? `Check your contractor roster (${dashboard.counts.contractors} added)` : 'Add your first contractor'}
              description={dashboard.counts.contractors
                ? 'Confirm names, contact information, roles, and pricing before assigning the roster to an event.'
                : 'Add the people or vendors you hire, including their role and pricing, so they are ready for future events.'}
              actionLabel={dashboard.counts.contractors ? 'View Contractors' : 'Add a Contractor'}
              onClick={() => navigate('/contractors')}
              testId="home-welcome-step-contractors"
            />
            <WelcomeStep
              icon={<CalendarIcon className="w-4 h-4" />}
              title="Create your first booking"
              description="Start tracking a real inquiry, or send a client a link to fill in their own event details."
              actionLabel="Add a Booking"
              onClick={() => navigate('/bookings/new')}
              testId="home-welcome-step-booking"
            />
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <span>Not sure how Bookings and Events fit together?</span>
            <button type="button" onClick={() => navigate('/help?article=bookings-vs-events')} className="font-semibold text-indigo-600 hover:underline">
              Read the quick guide →
            </button>
          </div>
        </div>
      ) : (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatTile label="Total Events" value={dashboard.counts.events} color="#64748b" icon={<CalendarIcon />} testId="home-stat-total-events" />
        <StatTile label="Upcoming Events" value={stats.upcomingCount} color="#2563eb" icon={<ClockIcon />} testId="home-stat-upcoming-events" />
        <StatTile label="Upcoming Costs" value={currency(stats.pipelineValue)} color="#4f46e5" icon={<DollarIcon />} testId="home-stat-pipeline-value" />
        <StatTile label="Total Clients" value={dashboard.counts.clients} color="#7c3aed" icon={<UsersIcon />} testId="home-stat-total-clients" />
        <StatTile label="Total Contractors" value={dashboard.counts.contractors} color="#0d9488" icon={<WrenchIcon />} testId="home-stat-total-contractors" />
        <StatTile
          label="Needs Confirmation"
          value={stats.needsConfirmation}
          color={stats.needsConfirmation > 0 ? '#d97706' : '#94a3b8'}
          icon={<AlertIcon />}
          testId="home-stat-needs-confirmation"
        />
      </div>

      {(financialsSnapshot.count > 0 || financialsSnapshot.incomplete.length > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <PanelHeading color="#0d9488" icon={<DollarIcon className="w-3.5 h-3.5" />}>Financials Snapshot</PanelHeading>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Reviewed Revenue</div>
              <div className="text-xl font-bold text-slate-800" data-testid="home-financials-total-revenue">{currency(financialsSnapshot.totalRevenue)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Reviewed Contractor Costs</div>
              <div className="text-xl font-bold text-slate-800" data-testid="home-financials-total-costs">{currency(financialsSnapshot.totalCosts)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Average Margin</div>
              <div className="text-xl font-bold text-slate-800" data-testid="home-financials-avg-margin">
                {financialsSnapshot.avgMargin == null ? '—' : `${financialsSnapshot.avgMargin.toFixed(1)}%`}
              </div>
              <div className="text-xs text-slate-400 mt-1">Weighted across {financialsSnapshot.count} fully costed {financialsSnapshot.count === 1 ? 'event' : 'events'}</div>
            </div>
          </div>
          {financialsSnapshot.incomplete.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3" data-testid="home-financials-incomplete-panel">
              <div className="text-xs font-bold uppercase tracking-wide text-amber-800 mb-2">Costing needs review</div>
              <div className="space-y-1">
                {financialsSnapshot.incomplete.slice(0, 5).map((event) => (
                  <button key={event.id} type="button" onClick={() => navigate(`/events/${event.id}`)} className="w-full flex items-center justify-between gap-3 text-left text-sm text-amber-900 hover:underline">
                    <span className="truncate">{event.name || 'Unnamed event'}</span>
                    <span className="text-xs text-amber-700 shrink-0">{event.reason} →</span>
                  </button>
                ))}
              </div>
            </div>
          )}
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
          {overdueInvoices.length === 0 ? (
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
                const vendor = { status: e.vendorStatus };
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
      </>
      )}
    </div>
  );
}
