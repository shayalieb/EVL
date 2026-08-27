import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSubscriptionStatus, startCheckout } from '../lib/subscription';

function formatPrice(cents) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

// Shown for two distinct account states (see App.jsx's gate): an account
// that's never started a subscription (accountApproved: false — no plan
// picked yet), or one whose subscription lapsed after being active
// (accountApproved: true, subscriptionBlocked: true) — the second gets a
// "reactivate" framing instead of the picker, since they've already been a
// paying customer once.
export default function PendingApprovalPage() {
  const { currentUser, logout } = useAuth();
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [preferredPlan] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('gigworksSelectedPlan'));
      return ['solo', 'team', 'studio'].includes(saved?.plan) ? saved.plan : null;
    } catch {
      return null;
    }
  });
  const [interval, setInterval] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('gigworksSelectedPlan'))?.interval === 'year' ? 'year' : 'month';
    } catch {
      return 'month';
    }
  });
  const [startingTier, setStartingTier] = useState(null);
  const [checkoutError, setCheckoutError] = useState('');

  useEffect(() => {
    getSubscriptionStatus().then(setStatus).catch((err) => setLoadError(err.message));
  }, []);

  async function handleStart(tierId) {
    setCheckoutError('');
    setStartingTier(tierId);
    try {
      const url = await startCheckout(tierId, interval);
      // Stripe Checkout must load top-level, not in an iframe/popup.
      window.location.href = url;
    } catch (err) {
      setCheckoutError(err.message);
      setStartingTier(null);
    }
  }

  const reactivating = currentUser?.subscriptionBlocked;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-16">
      <div className="max-w-4xl mx-auto text-center space-y-3 mb-10">
        <h1 className="text-2xl font-bold text-slate-800">
          {reactivating ? 'Your subscription needs attention' : 'Choose your plan'}
        </h1>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          {reactivating
            ? "Your GigWorks subscription is no longer active. Pick a plan below to pick up right where you left off."
            : 'Start a 14-day free trial — no charge until it ends, cancel anytime.'}
        </p>
      </div>

      {loadError && <p className="text-center text-sm text-red-600" data-testid="plan-picker-error">{loadError}</p>}

      {status && (
        <>
          <div className="flex justify-center mb-8">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              {['month', 'year'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setInterval(opt)}
                  data-testid={`plan-picker-interval-${opt}`}
                  className={`px-4 py-1.5 rounded-md text-sm font-semibold ${
                    interval === opt ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {opt === 'month' ? 'Monthly' : 'Annual'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-3xl mx-auto">
            {status.tiers.map((tier) => {
              const cents = interval === 'year' ? tier.annualAmountCents : tier.monthlyAmountCents;
              const perMonth = interval === 'year' ? cents / 12 : cents;
              return (
                <div key={tier.id} className={`relative bg-white rounded-xl p-6 flex flex-col ${preferredPlan === tier.id ? 'border-2 border-indigo-500 shadow-md' : 'border border-slate-200'}`} data-testid={`plan-picker-card-${tier.id}`}>
                  {preferredPlan === tier.id && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                      Your selection
                    </span>
                  )}
                  <div className="text-sm font-bold text-slate-700 mb-1">{tier.label}</div>
                  <div className="text-xs text-slate-400 mb-4">{tier.seatLimit} team member{tier.seatLimit === 1 ? '' : 's'}</div>
                  <div className="mb-1">
                    <span className="text-3xl font-bold text-slate-800">{formatPrice(perMonth)}</span>
                    <span className="text-sm text-slate-400"> /mo</span>
                  </div>
                  {interval === 'year' && (
                    <div className="text-xs text-slate-400 mb-4">{formatPrice(cents)} billed annually</div>
                  )}
                  {interval === 'month' && <div className="mb-4" />}
                  <button
                    type="button"
                    onClick={() => handleStart(tier.id)}
                    disabled={startingTier !== null}
                    data-testid={`plan-picker-start-${tier.id}`}
                    className="mt-auto px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {startingTier === tier.id ? 'Starting…' : 'Start 14-day free trial'}
                  </button>
                </div>
              );
            })}
          </div>

          {checkoutError && <p className="text-center text-sm text-red-600 mt-6" data-testid="plan-picker-checkout-error">{checkoutError}</p>}
        </>
      )}

      <div className="text-center mt-10">
        <button
          type="button"
          onClick={logout}
          data-testid="pending-approval-logout-button"
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
