import { useAuth } from '../context/AuthContext';

export default function NoAccountAccessPage() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-sm text-center space-y-4">
        <h1 className="text-xl font-bold text-slate-800">No account access</h1>
        <p className="text-sm text-slate-500">
          Your access to this account has been removed. Contact your account owner or admin if you think this is a mistake.
        </p>
        <button
          type="button"
          onClick={logout}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
