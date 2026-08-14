// Illustrative, not a real screenshot — hand-built to match the actual
// app's own visual language (see layouts/AppLayout.jsx for the real nav
// items/icons, HomePage.jsx and Badge.jsx for the real card/pill styling)
// so it reads as "here's genuinely what this looks like," not a generic
// stock SaaS dashboard mockup. Sample data only.
const NAV_ITEMS = [
  { icon: '🏠', label: 'Home', active: true },
  { icon: '🤝', label: 'Bookings' },
  { icon: '📅', label: 'Events' },
  { icon: '🧰', label: 'Contractors' },
  { icon: '🎵', label: 'Set Lists' },
];

const STATS = [
  { label: 'This Weekend', value: '3' },
  { label: 'Pipeline Value', value: '$24.5k' },
  { label: 'Vendors Confirmed', value: '12/14' },
];

const GIGS = [
  { name: 'Chen–Martinez Wedding', date: 'Sat, Oct 17', status: 'Confirmed', color: '#22c55e' },
  { name: 'Riverside Corporate Gala', date: 'Fri, Oct 23', status: 'Confirmed', color: '#22c55e' },
  { name: 'Brooklyn Loft Reception', date: 'Sat, Nov 1', status: 'Pending', color: '#eab308' },
];

export default function LandingDashboardPreview() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white shadow-2xl shadow-indigo-950/40 overflow-hidden text-left">
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 text-xs text-slate-400 font-mono">app.gigworks.io</span>
      </div>
      <div className="flex">
        <div className="w-12 sm:w-44 shrink-0 bg-slate-50 border-r border-slate-100 py-4">
          <div className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 hidden sm:block">Overview</div>
          {NAV_ITEMS.map((item) => (
            <div
              key={item.label}
              className={`mx-2 mb-0.5 px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center sm:justify-start gap-2 ${
                item.active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500'
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </div>
          ))}
        </div>
        <div className="flex-1 p-4 sm:p-5 bg-slate-50/60 min-w-0">
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
            {STATS.map((s) => (
              <div key={s.label} className="bg-white rounded-lg border border-slate-200 px-2 sm:px-3 py-2.5">
                <div className="text-[9px] sm:text-xs leading-tight text-slate-400">{s.label}</div>
                <div className="text-base sm:text-xl font-bold text-slate-800">{s.value}</div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-3 sm:p-4">
            <div className="text-xs font-semibold text-slate-500 mb-2.5">Upcoming Gigs</div>
            <div className="space-y-2">
              {GIGS.map((g) => (
                <div key={g.name} className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-700 truncate">{g.name}</div>
                    <div className="text-slate-400 text-[11px] sm:text-xs">{g.date}</div>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold shrink-0"
                    style={{ backgroundColor: `${g.color}22`, color: g.color }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: g.color }} />
                    {g.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
