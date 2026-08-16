// Illustrative previews for the landing page's feature section — same
// approach as LandingDashboardPreview: hand-built to match the app's real
// visual language (badges, card style, browser chrome) rather than generic
// stock mockups, since there are no real product screenshots to use here.
// Sample data only.

function BrowserChrome({ label, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/60 overflow-hidden text-left">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border-b border-slate-100">
        <span className="w-2 h-2 rounded-full bg-red-300" />
        <span className="w-2 h-2 rounded-full bg-amber-300" />
        <span className="w-2 h-2 rounded-full bg-emerald-300" />
        <span className="ml-2 text-[10px] text-slate-400 font-mono truncate">{label}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const PIPELINE_STAGES = ['Inquiry', 'Proposal', 'Contract', 'Invoiced'];

export function ClientsPipelinePreview() {
  return (
    <BrowserChrome label="app.gigworks.io/bookings/chen-martinez">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-slate-800">Chen–Martinez Wedding</div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Signed
        </span>
      </div>
      <div className="flex items-center gap-1 mb-4">
        {PIPELINE_STAGES.map((stage, i) => (
          <div key={stage} className="flex items-center flex-1">
            <div className={`h-1.5 flex-1 rounded-full ${i <= 2 ? 'bg-indigo-500' : 'bg-slate-200'}`} />
            {i < PIPELINE_STAGES.length - 1 && <span className="w-1" />}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 -mt-2 mb-4 px-0.5">
        {PIPELINE_STAGES.map((stage) => <span key={stage}>{stage}</span>)}
      </div>
      <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
        <div className="flex items-center justify-between px-3 py-2 text-xs">
          <span className="text-slate-500">Proposal</span>
          <span className="text-emerald-600 font-medium">e-signed Oct 2</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 text-xs">
          <span className="text-slate-500">Deposit invoice</span>
          <span className="text-emerald-600 font-medium">$500 paid</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 text-xs">
          <span className="text-slate-500">Balance invoice</span>
          <span className="text-amber-600 font-medium">$2,100 due Oct 15</span>
        </div>
      </div>
    </BrowserChrome>
  );
}

const ROSTER = [
  { initials: 'DK', name: 'Dana K. — Sax', status: 'Confirmed', color: '#22c55e' },
  { initials: 'MT', name: 'Marcus T. — Drums', status: 'Confirmed', color: '#22c55e' },
  { initials: 'JR', name: 'Jamie R. — DJ', status: 'Pending', color: '#eab308' },
];

export function RosterConfirmPreview() {
  return (
    <BrowserChrome label="app.gigworks.io/contractors">
      <div className="text-sm font-semibold text-slate-800 mb-3">Roster — Sat, Oct 17</div>
      <div className="space-y-2 mb-4">
        {ROSTER.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-6 h-6 shrink-0 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center">
                {r.initials}
              </span>
              <span className="text-slate-600 truncate">{r.name}</span>
            </div>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0"
              style={{ backgroundColor: `${r.color}22`, color: r.color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color }} />
              {r.status}
            </span>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 flex items-center gap-2">
        <span className="text-sm" aria-hidden="true">📱</span>
        <span className="text-[11px] text-indigo-700 leading-snug">
          Jamie can confirm from their own gig calendar link — no app login needed.
        </span>
      </div>
    </BrowserChrome>
  );
}

const STAGE_ITEMS = [
  { icon: '🎤', x: '20%', y: '30%' },
  { icon: '🥁', x: '50%', y: '55%' },
  { icon: '🎸', x: '75%', y: '25%' },
  { icon: '🔊', x: '12%', y: '68%' },
  { icon: '🔊', x: '85%', y: '68%' },
];

export function DayOfPreview() {
  return (
    <BrowserChrome label="app.gigworks.io/events/chen-martinez/stage-plot">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-slate-800">Stage Plot — Ballroom A</div>
      </div>
      <div className="relative h-28 rounded-lg bg-slate-50 border border-dashed border-slate-300 mb-4 overflow-hidden">
        {STAGE_ITEMS.map((item, i) => (
          <span
            key={i}
            className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-md bg-white border border-slate-200 shadow-sm flex items-center justify-center text-xs"
            style={{ left: item.x, top: item.y }}
            aria-hidden="true"
          >
            {item.icon}
          </span>
        ))}
      </div>
      <div className="text-[11px] font-semibold text-slate-500 mb-1.5">Set List — Reception</div>
      <ol className="space-y-1 text-xs text-slate-600">
        <li className="flex items-center gap-2"><span className="text-slate-300">1.</span> Signed, Sealed, Delivered</li>
        <li className="flex items-center gap-2"><span className="text-slate-300">2.</span> At Last</li>
        <li className="flex items-center gap-2 text-slate-400"><span className="text-slate-300">3.</span> Uptown Funk</li>
      </ol>
    </BrowserChrome>
  );
}
