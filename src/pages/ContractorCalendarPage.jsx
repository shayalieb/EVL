import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE } from '../context/AuthContext';
import { getContractorCalendarByToken } from '../lib/contractors';
import EventsCalendarView from '../components/events/EventsCalendarView';

// EventsCalendarView colors events by looking up `evt.eventStatus` in an
// `eventStatuses` list — reused as-is (no changes to that shared component)
// by relabeling each gig's server-derived bucket as its "eventStatus" and
// supplying this 2-entry list instead of the account's real (unrelated)
// event-status colors. Matches the green/yellow used for the same
// confirmed/tentative buckets elsewhere (see ContractorPickerRow.jsx).
const BUCKET_COLORS = [
  { id: 'confirmed', color: '#22c55e' },
  { id: 'tentative', color: '#eab308' },
];

export default function ContractorCalendarPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getContractorCalendarByToken(token)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err.message || 'This link is invalid.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  // "Add to Home Screen" support — this is a single-page SPA (one
  // index.html), so a per-contractor manifest/icon can only be scoped by
  // injecting these tags at runtime rather than baking them into the
  // static HTML. Both iOS Safari and Android Chrome read the live DOM at
  // the moment of the user's manual "Add to Home Screen" action, not a
  // frozen initial-load snapshot, so this works reliably. Removed on
  // unmount so it doesn't leak into other pages of the app.
  useEffect(() => {
    // API_BASE (same resolution apiFetch uses) rather than a hardcoded
    // relative /api path — in production that's proxied to the backend by
    // vercel.json, but locally the frontend (5173) and backend (4000) are
    // different origins with no such proxy, so a relative path here would
    // silently 404 the manifest fetch outside of production.
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = `${API_BASE}/contractor-calendar/${token}/manifest.webmanifest`;
    document.head.appendChild(manifestLink);

    const appleCapable = document.createElement('meta');
    appleCapable.name = 'apple-mobile-web-app-capable';
    appleCapable.content = 'yes';
    document.head.appendChild(appleCapable);

    const appleTitle = document.createElement('meta');
    appleTitle.name = 'apple-mobile-web-app-title';
    appleTitle.content = 'My Gigs';
    document.head.appendChild(appleTitle);

    const appleIcon = document.createElement('link');
    appleIcon.rel = 'apple-touch-icon';
    appleIcon.href = '/icons/gig-calendar-180.png';
    document.head.appendChild(appleIcon);

    return () => {
      manifestLink.remove();
      appleCapable.remove();
      appleTitle.remove();
      appleIcon.remove();
    };
  }, [token]);

  if (loading) {
    return <div data-testid="contractor-calendar-loading" className="min-h-screen flex items-center justify-center text-sm text-slate-400">Loading…</div>;
  }
  if (error || !data) {
    return (
      <div data-testid="contractor-calendar-error" className="min-h-screen flex items-center justify-center text-sm text-red-600 px-4 text-center">
        {error || 'This link is invalid.'}
      </div>
    );
  }

  const { contractor, businessInfo, gigs } = data;
  const calendarEvents = gigs.map((g) => ({ ...g, eventStatus: g.bucket }));

  return (
    <div data-testid="contractor-calendar-page" className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {businessInfo?.logo
              ? <img src={businessInfo.logo} alt={businessInfo.name} className="h-8 max-w-[140px] object-contain" />
              : <div className="text-sm font-bold text-slate-800 truncate">{businessInfo?.name || 'GigWorks'}</div>}
          </div>
          <span className="text-sm text-slate-500">Hi, {contractor.firstName}</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Confirmed</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Pending</span>
        </div>

        {/* The calendar grid below only ever shows one month at a time,
            defaulting to the current one — a contractor whose gigs are all
            in a future month would see a blank grid with no indication
            anything's scheduled. This list is always visible regardless of
            which month the grid is showing. */}
        {gigs.length === 0 ? (
          <div data-testid="contractor-calendar-empty" className="bg-white rounded-xl border border-slate-200 text-sm text-slate-400 text-center py-6">No upcoming gigs yet.</div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {gigs.map((g) => (
              <div key={g.id} data-testid="contractor-calendar-gig-row" className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{g.name}</div>
                  <div className="text-xs text-slate-400">
                    {g.eventDate ? new Date(`${g.eventDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBD'}
                    {g.venue?.name ? ` · ${g.venue.name}` : ''}
                  </div>
                </div>
                <span
                  className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: g.bucket === 'confirmed' ? '#22c55e1a' : '#eab3081a', color: g.bucket === 'confirmed' ? '#16a34a' : '#a16207' }}
                >
                  {g.bucket === 'confirmed' ? 'Confirmed' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        )}

        <EventsCalendarView events={calendarEvents} eventStatuses={BUCKET_COLORS} onSelectEvent={() => {}} />

        <p className="text-xs text-slate-400 text-center pt-2">
          Add this page to your home screen for quick access — tap Share then &quot;Add to Home Screen&quot; (iOS) or the menu then &quot;Install app&quot; (Android).
        </p>
      </div>
    </div>
  );
}
