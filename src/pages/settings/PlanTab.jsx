import { useEffect, useState } from 'react';
import { useToast } from '../../components/ui/Toast';
import Badge from '../../components/ui/Badge';
import { getSubscriptionStatus, openBillingPortal } from '../../lib/subscription';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const STATUS_LABELS = {
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Payment Failed',
  canceled: 'Canceled',
  unpaid: 'Unpaid',
  incomplete: 'Incomplete',
  incomplete_expired: 'Expired',
};

const STATUS_COLORS = {
  trialing: '#6366f1',
  active: '#22c55e',
  past_due: '#eab308',
  canceled: '#94a3b8',
  unpaid: '#ef4444',
  incomplete: '#eab308',
  incomplete_expired: '#94a3b8',
};

export default function PlanTab() {
  const { showToast } = useToast();
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [openingPortal, setOpeningPortal] = useState(false);

  function load() {
    getSubscriptionStatus().then(setStatus).catch((err) => setLoadError(err.message));
  }

  useEffect(load, []);

  async function handleManageBilling() {
    setOpeningPortal(true);
    try {
      const url = await openBillingPortal();
      window.location.href = url;
    } catch (err) {
      showToast(err.message, 'error');
      setOpeningPortal(false);
    }
  }

  if (loadError) return <div data-testid="settings-plan-error-banner" className="text-sm text-red-600">{loadError}</div>;
  if (!status) return <div className="text-sm text-slate-400">Loading…</div>;

  const tier = status.tiers.find((t) => t.id === status.planTier);
  const label = STATUS_LABELS[status.subscriptionStatus] || 'No plan';
  const color = STATUS_COLORS[status.subscriptionStatus] || '#94a3b8';

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-1">Your Plan</h3>
        <p className="text-sm text-slate-500">
          What you pay GigWorks — separate from the Billing tab, which is how you get paid by your own clients.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Plan</div>
            <div className="text-sm font-semibold text-slate-800">{tier?.label || '—'}</div>
          </div>
          <Badge color={color}><span data-testid="settings-plan-status-badge">{label}</span></Badge>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Seats</div>
            <div className="text-sm text-slate-700" data-testid="settings-plan-seat-usage">
              {status.seatCount} of {status.seatLimit ?? '—'} used
            </div>
          </div>
          {status.subscriptionStatus === 'trialing' && status.trialEndsAt && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Trial Ends</div>
              <div className="text-sm text-slate-700">{formatDate(status.trialEndsAt)}</div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleManageBilling}
          disabled={openingPortal}
          data-testid="settings-plan-manage-billing-button"
          className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {openingPortal ? 'Opening…' : 'Manage Billing'}
        </button>
        <p className="text-xs text-slate-400 text-center -mt-2">
          Upgrade, downgrade, switch monthly/annual, update your payment method, or cancel.
        </p>
      </div>
    </div>
  );
}
