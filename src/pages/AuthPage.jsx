import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/ui/Logo';
import SubmitButton from '../components/ui/SubmitButton';
import { formatPhoneNumber } from '../lib/format';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

// Keep in sync with server/src/lib/verticals.js's SIGNUP_VERTICALS list.
// party_planning and photography are pulled from signup entirely to keep
// launch focused — add them back here (and to SIGNUP_VERTICALS) to reopen.
const VERTICAL_OPTIONS = [
  { id: 'band_orchestra', label: 'Band & Orchestra', description: 'Book musicians and crew for gigs', active: true },
];

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('mode') === 'signup' ? 'signup' : 'signin');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [vertical, setVertical] = useState(VERTICAL_OPTIONS[0].id);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { signIn, signUp, authError, clearAuthError, requestPasswordReset } = useAuth();

  // Preserve a landing-page plan selection across account creation. The
  // pending-account screen reads this only as a UI preference; Stripe and
  // the backend still validate the tier and interval before checkout.
  useEffect(() => {
    const plan = searchParams.get('plan');
    const interval = searchParams.get('interval');
    if (['solo', 'team', 'studio'].includes(plan) && ['month', 'year'].includes(interval)) {
      sessionStorage.setItem('gigworksSelectedPlan', JSON.stringify({ plan, interval }));
    }
  }, [searchParams]);

  // Switches tabs and clears whatever error was showing — otherwise a
  // failed sign-in attempt's error banner (authError lives in context, not
  // scoped to a tab) keeps showing on top of the forgot-password form,
  // making an unrelated stale error look like the reset request itself failed.
  function switchTab(next) {
    setTab(next);
    setLocalError('');
    clearAuthError();
  }

  async function handleSignIn(e) {
    e.preventDefault();
    setLocalError('');
    setSubmitting(true);
    await signIn({ email, password });
    setSubmitting(false);
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setLocalError('');
    setSubmitting(true);
    const result = await requestPasswordReset(resetEmail);
    setSubmitting(false);
    if (result.ok) {
      setResetSent(true);
    } else {
      setLocalError(result.error);
    }
  }

  function backToSignIn() {
    switchTab('signin');
    setResetSent(false);
    setResetEmail('');
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setLocalError('');
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setLocalError('Please fill in all required fields.');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    await signUp({ firstName, lastName, businessName, email, phone, password, vertical });
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <Logo className="h-12 w-auto mx-auto mb-3" />
          <p className="text-sm text-slate-500">Event Vendor Logistics</p>
        </div>

        {tab !== 'forgot' && (
          <div className="flex border-b mb-6">
            <button
              type="button"
              onClick={() => switchTab('signin')}
              data-testid="auth-tab-signin"
              className={`flex-1 py-2 font-semibold border-b-2 ${tab === 'signin' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchTab('signup')}
              data-testid="auth-tab-signup"
              className={`flex-1 py-2 font-semibold border-b-2 ${tab === 'signup' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}
            >
              Sign Up
            </button>
          </div>
        )}

        {(authError || localError) && (
          <div data-testid="auth-error-banner" className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {localError || authError}
          </div>
        )}

        {tab === 'forgot' ? (
          resetSent ? (
            <div className="space-y-4 text-center">
              <p data-testid="auth-reset-sent-message" className="text-sm text-slate-600">
                If an account exists for that email, we've sent a link to reset the password.
              </p>
              <button type="button" onClick={backToSignIn} data-testid="auth-back-to-signin-link" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-3">
              <p className="text-sm text-slate-500">Enter your email and we'll send you a reset link.</p>
              <input type="email" required placeholder="Email address" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} data-testid="auth-forgot-email-input" className={inputClass} />
              <SubmitButton loading={submitting} testId="auth-forgot-submit-button">Send Reset Link</SubmitButton>
              <button type="button" onClick={backToSignIn} data-testid="auth-forgot-back-button" className="w-full text-sm font-semibold text-slate-500 hover:text-slate-700">
                Back to sign in
              </button>
            </form>
          )
        ) : tab === 'signin' ? (
          <form onSubmit={handleSignIn} className="space-y-3">
            <input type="email" required placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="auth-signin-email-input" className={inputClass} />
            <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="auth-signin-password-input" className={inputClass} />
            <SubmitButton loading={submitting} testId="auth-signin-submit-button">Sign In</SubmitButton>
            <button type="button" onClick={() => switchTab('forgot')} data-testid="auth-forgot-password-link" className="w-full text-sm font-medium text-indigo-600 hover:text-indigo-700">
              Forgot password?
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignUp} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input required placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="auth-signup-firstname-input" className={inputClass} />
              <input required placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="auth-signup-lastname-input" className={inputClass} />
            </div>
            <input placeholder="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} data-testid="auth-signup-business-name-input" className={inputClass} />
            <input type="email" required placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="auth-signup-email-input" className={inputClass} />
            <input type="tel" placeholder="(555) 555-0100" value={phone} onChange={(e) => setPhone(formatPhoneNumber(e.target.value))} data-testid="auth-signup-phone-input" className={inputClass} />
            <input type="password" required minLength={8} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="auth-signup-password-input" className={inputClass} />
            <input type="password" required placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} data-testid="auth-signup-confirm-password-input" className={inputClass} />
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1.5">What kind of business is this?</div>
              <div className="space-y-1.5">
                {VERTICAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={!opt.active}
                    onClick={() => setVertical(opt.id)}
                    data-testid={`auth-signup-vertical-${opt.id}-button`}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                      !opt.active
                        ? 'border-slate-100 text-slate-300 cursor-not-allowed'
                        : vertical === opt.id
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-semibold flex items-center gap-2">
                      {opt.label}
                      {!opt.active && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">
                          Not accepting signups
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{opt.description}</div>
                  </button>
                ))}
              </div>
            </div>
            <SubmitButton loading={submitting} testId="auth-signup-submit-button">Create Account</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
