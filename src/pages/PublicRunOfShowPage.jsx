import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicRunOfShow } from '../lib/runOfShowShare';
import { runOfShowTypeInfo, RUN_OF_SHOW_TYPE_BADGE_CLASSES } from '../lib/runOfShow';

export default function PublicRunOfShowPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { getPublicRunOfShow(token).then(setData).catch((err) => setError(err.message)); }, [token]);
  if (error) return <PublicShell><div className="mx-auto max-w-lg rounded-xl border border-red-100 bg-white p-8 text-center"><h1 className="text-xl font-bold text-slate-800">Run of show unavailable</h1><p className="mt-2 text-sm text-slate-500">{error}</p></div></PublicShell>;
  if (!data) return <PublicShell><p className="text-center text-sm text-slate-500">Loading run of show…</p></PublicShell>;
  const { event } = data;
  const venue = typeof event.venue === 'object' && event.venue ? event.venue : {};
  const schedule = (event.schedule || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  return (
    <PublicShell>
      <header className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-indigo-600">Shared from GigWorks</div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{event.name || 'Run of Show'}</h1>
            <p className="mt-1 text-sm text-slate-500">{[event.eventType, event.eventDate, venue.name || venue.venueName].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex gap-2 print:hidden"><button type="button" onClick={() => window.print()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Print / Save PDF</button></div>
        </div>
        <p className="mt-3 text-xs text-slate-400">Last updated {new Date(event.updatedAt).toLocaleString()}</p>
      </header>
      <main className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-6 print:border-0 print:p-0 print:shadow-none">
        {schedule.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No schedule has been added yet.</p>
        ) : (
          <div className="space-y-2">
            {schedule.map((item) => {
              const info = runOfShowTypeInfo(item.type);
              return (
                <div key={item.id} className="flex items-start gap-3 border-b border-slate-100 pb-2 last:border-0">
                  <span className="w-16 shrink-0 pt-0.5 text-sm font-semibold text-slate-700 tabular-nums">{item.time || '—'}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${RUN_OF_SHOW_TYPE_BADGE_CLASSES[info.color]}`}>{info.icon} {info.label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800">{item.name || '—'}</p>
                    {item.details && <p className="text-sm text-slate-500">{item.details}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </PublicShell>
  );
}

function PublicShell({ children }) { return <div className="min-h-screen bg-slate-50 px-3 py-6 text-slate-800 sm:px-6"><div className="mx-auto max-w-3xl">{children}</div></div>; }
