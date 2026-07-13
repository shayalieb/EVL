import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/contractors', label: 'Contractors', icon: '🎧' },
  { to: '/events', label: 'Events', icon: '📅' },
  { to: '/email-templates', label: 'Email Templates', icon: '✉️' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function AppLayout() {
  const { currentUser, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/auth');
  }

  const initials = `${currentUser?.firstName?.[0] || ''}${currentUser?.lastName?.[0] || ''}`.toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-4 sm:px-6 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="sm:hidden text-slate-500 p-1"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            ☰
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center">E</div>
            <span className="font-bold text-slate-800">EVL</span>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100"
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
              <div className="absolute right-0 mt-2 w-44 bg-white rounded-lg shadow-lg border border-slate-100 z-20 overflow-hidden">
                <NavLink
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Settings
                </NavLink>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                >
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <nav
          className={`${mobileNavOpen ? 'block' : 'hidden'} sm:block w-full sm:w-56 shrink-0 border-r border-slate-200 bg-white sm:min-h-0`}
        >
          <div className="p-3 space-y-1">
            {NAV_ITEMS.map((item) => (
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
                <span>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <main className="flex-1 min-w-0 p-4 sm:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
