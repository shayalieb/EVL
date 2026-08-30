import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/ui/Logo';
import { BellIcon } from '../components/ui/icons';
import { fetchReminders, completeReminder, relatedRecordPath } from '../lib/reminders';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/home', label: 'Home', icon: '🏠' },
      { to: '/bookings', label: 'Bookings', icon: '🤝' },
      { to: '/events', label: 'Events', icon: '📅' },
      { to: '/financials', label: 'Financials', icon: '💵' },
      { to: '/reminders', label: 'Reminders', icon: '🔔' },
    ],
  },
  {
    label: 'Resources',
    items: [
      { to: '/clients', label: 'Clients', icon: '👤' },
      { to: '/venues', label: 'Venues', icon: '📍' },
      { to: '/contractors', label: 'Contractors', icon: '🧰' },
      { to: '/offerings', label: 'Offerings', icon: '🎁' },
      { to: '/set-lists', label: 'Set Lists', icon: '🎵', vertical: 'band_orchestra' },
      { to: '/stage-plot-library', label: 'Stage Plot Library', icon: '🎛️', vertical: 'band_orchestra' },
      { to: '/email-templates', label: 'Email Templates', icon: '✉️' },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/help', label: 'Help', icon: '💬' },
      { to: '/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
];

export default function AppLayout() {
  const { currentUser, logout, sizeWarning } = useAuth();
  const [sizeWarningDismissed, setSizeWarningDismissed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [reminders, setReminders] = useState([]);
  const [bellOpen, setBellOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    // Skips the fetch while this tab is in the background — a user with
    // several tabs open was polling from every one of them every 60s
    // regardless of which they were actually looking at. visibilitychange
    // below re-fires load() the moment a backgrounded tab comes back, so
    // this only delays a stale bell, never leaves it stale indefinitely.
    const load = () => {
      if (document.hidden) return;
      fetchReminders()
        .then((list) => { if (!cancelled) setReminders(list); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 60 * 1000);
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', load);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);

  useEffect(() => {
    function closeMenus(event) {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      setBellOpen(false);
      setMobileNavOpen(false);
    }
    document.addEventListener('keydown', closeMenus);
    return () => document.removeEventListener('keydown', closeMenus);
  }, []);

  const pendingReminders = reminders
    .filter((r) => !r.completedAt)
    .sort((a, b) => new Date(a.remindAt) - new Date(b.remindAt));
  const dueReminders = pendingReminders.filter((r) => new Date(r.remindAt) <= new Date());

  async function handleMarkDone(id) {
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, completedAt: new Date().toISOString() } : r)));
    try {
      await completeReminder(id, true);
    } catch {
      // best effort — next poll will reconcile if this failed
    }
  }
  // Nav items with a `vertical` tag (e.g. Set Lists, band/orchestra only)
  // stay hidden for accounts that don't have it active — this is UX only,
  // same caveat as VerticalGate in App.jsx: the real authorization is
  // server-side, hiding a link here just avoids showing a dead end.
  const navGroups = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.vertical || currentUser?.activeVerticals?.includes(item.vertical)),
    }))
    .map((group, i) => (
      currentUser?.isPlatformAdmin && i === NAV_GROUPS.length - 1
        ? { ...group, items: [...group.items, { to: '/admin', label: 'Admin', icon: '🛡️' }] }
        : group
    ));
  if (currentUser?.planTier === 'agency') navGroups[0] = { ...navGroups[0], items: [...navGroups[0].items, { to: '/agency/groups', label: 'Managed Groups', icon: '🏢' }] };

  async function handleLogout() {
    await logout();
    navigate('/auth');
  }

  const initials = `${currentUser?.firstName?.[0] || ''}${currentUser?.lastName?.[0] || ''}`.toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <a href="#main-content" onClick={() => requestAnimationFrame(() => document.getElementById('main-content')?.focus())} className="fixed left-3 top-3 z-[100] -translate-y-20 focus:translate-y-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
        Skip to main content
      </a>
      <header className="h-20 border-b border-slate-200 bg-white flex items-center justify-between px-4 sm:px-6 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="sm:hidden min-w-11 min-h-11 text-slate-500 p-2 rounded-lg"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Toggle navigation"
            aria-expanded={mobileNavOpen}
            aria-controls="primary-navigation"
          >
            ☰
          </button>
          <Link to="/home" className="flex items-center gap-3">
            <Logo className="h-14 w-auto" />
            {currentUser?.businessInfo?.logo && (
              <>
                <span className="h-8 w-px bg-slate-200" aria-hidden="true" />
                <img
                  src={currentUser.businessInfo.logo}
                  alt={currentUser.businessInfo.name ? `${currentUser.businessInfo.name} logo` : 'Company logo'}
                  className="h-10 w-auto max-w-[7rem] object-contain"
                />
              </>
            )}
          </Link>
        </div>

        <div className="hidden sm:block text-lg font-bold text-slate-500">
          Event and Gig Management
        </div>

        <div className="flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setBellOpen((v) => !v)}
            data-testid="reminders-bell-button"
            className="relative min-w-11 min-h-11 p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Reminders"
            aria-expanded={bellOpen}
            aria-haspopup="dialog"
          >
            <BellIcon className="w-5 h-5" />
            {dueReminders.length > 0 && (
              <span
                data-testid="reminders-bell-badge"
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white"
              >
                {dueReminders.length}
              </span>
            )}
          </button>
          {bellOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setBellOpen(false)} />
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-slate-100 z-20 overflow-hidden" role="dialog" aria-label="Reminder notifications">
                <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">Reminders</div>
                {pendingReminders.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-slate-400 text-center">No reminders</div>
                ) : (
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                    {pendingReminders.slice(0, 8).map((r) => {
                      const overdue = new Date(r.remindAt) <= new Date();
                      const path = relatedRecordPath(r);
                      const body = (
                        <div className="min-w-0 flex-1">
                          {r.relatedName && (
                            <div className="text-xs font-semibold text-slate-500 truncate">{r.relatedName}</div>
                          )}
                          <div className="text-sm text-slate-700 truncate">{r.note}</div>
                          <div className={`text-xs mt-0.5 ${overdue ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                            {new Date(r.remindAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                          </div>
                        </div>
                      );
                      return (
                        <div key={r.id} className="px-4 py-2.5 flex items-start gap-2">
                          {path ? (
                            <Link to={path} onClick={() => setBellOpen(false)} className="min-w-0 flex-1 hover:opacity-80" data-testid={`reminders-bell-related-link-${r.id}`}>
                              {body}
                            </Link>
                          ) : body}
                          <button
                            type="button"
                            onClick={() => handleMarkDone(r.id)}
                            data-testid={`reminders-bell-markdone-${r.id}`}
                            className="shrink-0 min-h-11 px-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                          >
                            Done
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <NavLink
                  to="/reminders"
                  onClick={() => setBellOpen(false)}
                  className="block px-4 py-2.5 text-sm text-center text-indigo-600 font-semibold hover:bg-slate-50 border-t border-slate-100"
                >
                  View all reminders
                </NavLink>
              </div>
            </>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="min-h-11 flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100"
            aria-label="Account menu"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center text-sm">
              {initials || '?'}
            </span>
            <span className="hidden sm:block text-sm font-medium text-slate-700">
              {currentUser?.firstName} {currentUser?.lastName}
            </span>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-44 bg-white rounded-lg shadow-lg border border-slate-100 z-20 overflow-hidden" role="menu">
                <NavLink
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  role="menuitem"
                >
                  Settings
                </NavLink>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                  role="menuitem"
                >
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <nav
          id="primary-navigation"
          aria-label="Primary navigation"
          className={`${mobileNavOpen ? 'block' : 'hidden'} sm:block w-full sm:w-56 shrink-0 border-r border-slate-200 bg-white sm:min-h-0`}
        >
          <div className="p-3 space-y-4">
            {navGroups.map((group) => (
              <div key={group.label} className="space-y-1">
                <div className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{group.label}</div>
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileNavOpen(false)}
                    className={({ isActive }) =>
                      `nav-item flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${
                        isActive ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'
                      }`
                    }
                  >
                    <span aria-hidden="true">{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </div>
        </nav>

        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 p-4 sm:p-6 overflow-y-auto">
          {sizeWarning && !sizeWarningDismissed && (
            <div data-testid="account-size-warning-banner" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span>{sizeWarning.message}</span>
              <button
                type="button"
                onClick={() => setSizeWarningDismissed(true)}
                data-testid="account-size-warning-dismiss-button"
                className="shrink-0 text-amber-600 hover:text-amber-800 font-semibold"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
