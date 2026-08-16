import { useAuth } from '../context/AuthContext';

export default function PendingApprovalPage() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-sm text-center space-y-4">
        <h1 className="text-xl font-bold text-slate-800">You're on the list</h1>
        <p className="text-sm text-slate-500">
          Thanks for signing up. GigWorks is manually approving new accounts right now — we'll email you as soon
          as yours is ready, usually quickly.
        </p>
        <button
          type="button"
          onClick={logout}
          data-testid="pending-approval-logout-button"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
