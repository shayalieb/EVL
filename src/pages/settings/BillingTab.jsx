import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../components/ui/Toast';
import Badge from '../../components/ui/Badge';
import { getConnectStatus, startStripeConnect, refreshConnectStatus } from '../../lib/billing';

export default function BillingTab() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [connecting, setConnecting] = useState(false);

  function load() {
    getConnectStatus().then(setStatus).catch((err) => setLoadError(err.message));
  }

  useEffect(load, []);

  // Back from Stripe's hosted onboarding — the account.updated webhook can
  // lag this redirect by a few seconds, so get an immediate, accurate read
  // rather than waiting on it. stripeRefresh=1 means the Account Link itself
  // expired mid-onboarding (Stripe's own refresh_url) — just start over
  // rather than making the user click Connect again.
  useEffect(() => {
    if (searchParams.get('stripeReturn') === '1') {
      refreshConnectStatus().then(setStatus).catch((err) => showToast(err.message, 'error'));
      setSearchParams((p) => { p.delete('stripeReturn'); return p; }, { replace: true });
    } else if (searchParams.get('stripeRefresh') === '1') {
      setSearchParams((p) => { p.delete('stripeRefresh'); return p; }, { replace: true });
      handleConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect() {
    setConnecting(true);
    try {
      const url = await startStripeConnect();
      // Account Links must load top-level, not in an iframe/popup.
      window.location.href = url;
    } catch (err) {
      showToast(err.message, 'error');
      setConnecting(false);
    }
  }

  if (loadError) return <div className="text-sm text-red-600">{loadError}</div>;
  if (!status) return <div className="text-sm text-slate-400">Loading…</div>;

  const label = status.chargesEnabled
    ? 'Connected'
    : status.connected
      ? 'Onboarding Incomplete'
      : 'Not Connected';
  const color = status.chargesEnabled ? '#22c55e' : status.connected ? '#eab308' : '#94a3b8';

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-1">Payments</h3>
        <p className="text-sm text-slate-500">
          Connect a Stripe account to send invoices and collect payment directly into your own bank account — GigWorks never touches the money.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Stripe Status</div>
          <Badge color={color}>{label}</Badge>
        </div>
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {connecting ? 'Redirecting…' : status.connected ? 'Finish Onboarding' : 'Connect Stripe'}
        </button>
      </div>

      {!status.chargesEnabled && (
        <p className="text-xs text-slate-400">
          You won't be able to send invoices until this shows Connected.
        </p>
      )}
    </div>
  );
}
