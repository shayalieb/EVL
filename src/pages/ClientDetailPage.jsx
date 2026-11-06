import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import ClientModal from '../components/ClientModal';
import ClientNotesPanel from '../components/ClientNotesPanel';
import ClientClassification from '../components/ClientClassification';
import UnderlineTabs from '../components/ui/UnderlineTabs';
import Badge from '../components/ui/Badge';
import { getClientOverview } from '../lib/clients';
import { formatCurrency, formatEventDate } from '../lib/format';

const KIND_STYLES = {
  client: { icon: '👤', color: '#64748b' },
  booking: { icon: '📥', color: '#8b5cf6' },
  proposal: { icon: '📄', color: '#6366f1' },
  event: { icon: '🎤', color: '#d97706' },
  contract: { icon: '✍️', color: '#0ea5e9' },
  invoice: { icon: '🧾', color: '#e11d48' },
  payment: { icon: '💵', color: '#059669' },
  email: { icon: '✉️', color: '#0891b2' },
  note: { icon: '📝', color: '#ca8a04' },
};

const INVOICE_COLORS = { draft: '#94a3b8', sent: '#0ea5e9', partial: '#d97706', paid: '#059669', void: '#94a3b8' };
const CONTRACT_LABELS = { sent: 'Sent', owner_signed: 'Countersigned', client_signed: 'Signed by client', fully_signed: 'Fully signed' };

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Stat({ label, value, tone = '', testId }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div data-testid={testId} className={`mt-1 text-lg font-bold ${tone || 'text-slate-800'}`}>{value}</div>
    </div>
  );
}

function EmptyNote({ children }) {
  return <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">{children}</p>;
}

function SectionHeading({ children }) {
  return <h3 className="mb-2 text-sm font-bold text-slate-700">{children}</h3>;
}

export default function ClientDetailPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = useAuth();
  const { clients } = useData();
  const canEdit = can('manageClients');
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const requestedTab = searchParams.get('tab');

  const load = useCallback(async () => {
    try {
      setOverview(await getClientOverview(clientId));
      setError('');
    } catch (err) {
      setError(err.status === 404 ? 'This client could not be found.' : err.message || 'Could not load this client.');
    }
  }, [clientId]);

  useEffect(() => { setOverview(null); load(); }, [load]);
  // The cached client list may hold a newer copy after an edit in the modal.
  const cached = clients?.find?.((c) => c.id === clientId);
  const client = overview ? { ...overview.client, ...(cached && cached.updatedAt > overview.client.updatedAt ? cached : {}) } : null;

  if (error) {
    return (
      <div>
        <Link to="/clients" className="text-sm font-semibold text-indigo-600 hover:underline">← Clients</Link>
        <p role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-6 text-sm text-red-600">{error}</p>
      </div>
    );
  }
  if (!overview) return <p className="text-sm text-slate-400">Loading client…</p>;

  const { stats, access } = overview;
  const money = stats.money;
  const fullName = `${client.firstName} ${client.lastName}`.trim();
  const address = [client.address1, client.address2, [client.city, client.state].filter(Boolean).join(', '), client.zip].filter(Boolean).join(' · ');

  const tabs = [
    { id: 'overview', label: 'Overview', testId: 'client-tab-overview' },
    { id: 'timeline', label: 'Timeline', testId: 'client-tab-timeline' },
    ...(access.bookings || access.events ? [{ id: 'work', label: `Events & bookings (${stats.bookingCount + stats.eventCount})`, testId: 'client-tab-work' }] : []),
    ...(access.bookings ? [{ id: 'money', label: 'Money', testId: 'client-tab-money' }] : []),
  ];
  const activeTab = tabs.some((t) => t.id === requestedTab) ? requestedTab : 'overview';

  return (
    <div data-testid="client-detail-page">
      <Link to="/clients" className="text-sm font-semibold text-indigo-600 hover:underline">← Clients</Link>
      <div className="mt-2 mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 data-testid="client-detail-name" className="truncate text-2xl font-bold text-slate-800">{fullName}</h2>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            {client.email && <a href={`mailto:${client.email}`} className="hover:text-indigo-600">{client.email}</a>}
            {client.phone && <a href={`tel:${client.phone}`} className="hover:text-indigo-600">{client.phone}</a>}
            {address && <span>{address}</span>}
          </div>
          <ClientClassification client={client} effectiveStage={overview.effectiveStage} canEdit={canEdit} onSaved={load} />
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {access.bookings && (
              <button type="button" onClick={() => navigate(`/bookings/new?clientId=${client.id}`)} data-testid="client-detail-new-booking" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">+ New booking</button>
            )}
            <button type="button" onClick={() => setEditOpen(true)} data-testid="client-detail-edit" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Edit details</button>
          </div>
        )}
      </div>

      <UnderlineTabs label="Client sections" tabs={tabs} active={activeTab} onSelect={(id) => setSearchParams((prev) => { prev.set('tab', id); return prev; }, { replace: true })} />

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {money && <Stat label="Lifetime paid" value={formatCurrency(money.paid)} testId="client-stat-paid" />}
            {money && <Stat label="Balance due" value={formatCurrency(money.outstanding)} tone={money.overdue > 0 ? 'text-rose-600' : money.outstanding > 0 ? 'text-amber-600' : ''} testId="client-stat-balance" />}
            <Stat
              label="Next event"
              value={stats.nextEvent ? <Link to={`/events/${stats.nextEvent.id}`} className="hover:text-indigo-600">{formatEventDate(stats.nextEvent.eventDate)}</Link> : '—'}
              testId="client-stat-next-event"
            />
            <Stat label="Last contact" value={stats.lastContactAt ? new Date(stats.lastContactAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'} testId="client-stat-last-contact" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 pb-4">
            <ClientNotesPanel client={client} canEdit={canEdit} onChanged={load} bare />
          </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        overview.timeline.length === 0 ? <EmptyNote>Nothing has happened with this client yet.</EmptyNote> : (
          <ol data-testid="client-timeline" className="space-y-3">
            {overview.timeline.map((item, index) => {
              const style = KIND_STYLES[item.kind] || KIND_STYLES.client;
              const body = (
                <>
                  <div className="text-sm font-medium text-slate-800">{item.title}</div>
                  {item.detail && <div className="mt-0.5 whitespace-pre-wrap text-sm text-slate-500">{item.detail}</div>}
                  <div className="mt-0.5 text-xs text-slate-400">{formatDateTime(item.at)}</div>
                </>
              );
              return (
                <li key={`${item.at}-${index}`} data-testid="client-timeline-item" className="flex gap-3">
                  <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm" style={{ backgroundColor: `${style.color}1f` }}>{style.icon}</span>
                  {item.link ? <Link to={item.link} className="min-w-0 rounded-lg hover:bg-slate-50">{body}</Link> : <div className="min-w-0">{body}</div>}
                </li>
              );
            })}
          </ol>
        )
      )}

      {activeTab === 'work' && (
        <div className="space-y-6">
          {access.bookings && (
            <div>
              <SectionHeading>Bookings</SectionHeading>
              {overview.bookings.length === 0 ? <EmptyNote>No bookings for this client.</EmptyNote> : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {overview.bookings.map((b) => (
                    <li key={b.id} data-testid="client-booking-row">
                      <Link to={`/bookings/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-800">{b.eventName || 'Untitled booking'}</div>
                          <div className="text-xs text-slate-400">{b.eventDate ? formatEventDate(b.eventDate) : 'No date'}{b.eventType ? ` · ${b.eventType}` : ''}</div>
                        </div>
                        <Badge color={b.completedAt ? '#059669' : '#8b5cf6'}>{b.completedAt ? 'Completed' : b.statusLabel || 'In progress'}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {access.events && (
            <div>
              <SectionHeading>Events</SectionHeading>
              {overview.events.length === 0 ? <EmptyNote>No events for this client.</EmptyNote> : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {overview.events.map((e) => (
                    <li key={e.id} data-testid="client-event-row">
                      <Link to={`/events/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-800">{e.name || 'Untitled event'}</div>
                          <div className="text-xs text-slate-400">{e.eventDate ? formatEventDate(e.eventDate) : 'No date'}{e.eventType ? ` · ${e.eventType}` : ''}</div>
                        </div>
                        <Badge color={e.completedAt ? '#059669' : '#d97706'}>{e.completedAt ? 'Completed' : e.statusLabel || 'Scheduled'}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'money' && money && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Billed" value={formatCurrency(money.billed)} />
            <Stat label="Paid" value={formatCurrency(money.paid)} />
            <Stat label="Outstanding" value={formatCurrency(money.outstanding)} tone={money.outstanding > 0 ? 'text-amber-600' : ''} />
            <Stat label="Overdue" value={formatCurrency(money.overdue)} tone={money.overdue > 0 ? 'text-rose-600' : ''} />
          </div>
          <div>
            <SectionHeading>Invoices</SectionHeading>
            {overview.invoices.length === 0 ? <EmptyNote>No invoices yet.</EmptyNote> : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {overview.invoices.map((i) => (
                  <li key={i.id} data-testid="client-invoice-row">
                    <Link to={`/bookings/${i.bookingId}?tab=invoices`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-800">Invoice #{i.displayNumber} · {i.bookingName}</div>
                        <div className="text-xs text-slate-400">
                          {formatCurrency(i.total)}{i.paidAmount > 0 && i.status !== 'paid' ? ` · ${formatCurrency(i.paidAmount)} paid` : ''}{i.dueDate ? ` · due ${new Date(i.dueDate).toLocaleDateString()}` : ''}
                        </div>
                      </div>
                      <Badge color={INVOICE_COLORS[i.status] || '#94a3b8'}>{i.status[0].toUpperCase() + i.status.slice(1)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <SectionHeading>Contracts</SectionHeading>
            {overview.contracts.length === 0 ? <EmptyNote>No contracts yet.</EmptyNote> : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {overview.contracts.map((c) => (
                  <li key={c.id}>
                    <Link to={`/bookings/${c.bookingId}?tab=contract`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                      <div className="truncate text-sm font-semibold text-slate-800">Contract #{c.displayNumber} · {c.bookingName}</div>
                      <Badge color={c.status === 'fully_signed' ? '#059669' : c.status === 'superseded' ? '#94a3b8' : '#0ea5e9'}>{CONTRACT_LABELS[c.status] || 'Replaced'}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <ClientModal open={editOpen} onClose={() => { setEditOpen(false); load(); }} client={client} hideNotes />
    </div>
  );
}
