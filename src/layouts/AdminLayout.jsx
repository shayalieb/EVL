import { Link, NavLink, Outlet } from 'react-router-dom';
import Logo from '../components/ui/Logo';

const NAV_ITEMS = [
  { to: '/admin/accounts', label: 'Accounts', icon: '🏢' },
  { to: '/admin/support', label: 'Support', icon: '💬' },
  { to: '/admin/admins', label: 'Admins', icon: '🔑' },
];

export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-20 border-b border-slate-200 bg-white flex items-center justify-between px-4 sm:px-6 shrink-0">
        <Link to="/admin/accounts" className="flex items-center gap-2">
          <Logo className="h-14 w-auto" />
        </Link>
        <div className="hidden sm:block text-lg font-bold text-slate-500">Platform Admin</div>
        <Link to="/home" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          Back to app
        </Link>
      </header>

      <div className="flex flex-1 min-h-0">
        <nav className="w-full sm:w-56 shrink-0 border-r border-slate-200 bg-white">
          <div className="p-3 space-y-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${
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
