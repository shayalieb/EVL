import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/ui/Logo';
import SubmitButton from '../components/ui/SubmitButton';
import { formatPhoneNumber } from '../lib/format';

const inputClass = 'w-full px-3.5 py-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition';
const labelClass = 'block text-sm font-semibold text-slate-700 mb-1.5';
const PLAN_LABELS = { solo: 'Solo', team: 'Team', studio: 'Studio' };

// Keep in sync with server/src/lib/verticals.js's SIGNUP_VERTICALS list.
// party_planning and photography are pulled from signup entirely to keep
// launch focused — add them back here (and to SIGNUP_VERTICALS) to reopen.
const VERTICAL_OPTIONS = [
  { id: 'band_orchestra', label: 'Band & Orchestra', description: 'Book musicians and crew for gigs', active: true },
];

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const selectedPlan = searchParams.get('plan');
  const selectedInterval = searchParams.get('interval');
  const validPlanSelection = ['solo', 'team', 'studio'].includes(selectedPlan) && ['month', 'year'].includes(selectedInterval);
  const [tab, setTab] = useState(searchParams.get('mode') === 'signup' && validPlanSelection ? 'signup' : 'signin');
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
    if (validPlanSelection) {
      sessionStorage.setItem('gigworksSelectedPlan', JSON.stringify({ plan: selectedPlan, interval: selectedInterval }));
    }
  }, [selectedInterval, selectedPlan, validPlanSelection]);

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
    await signUp({
      firstName, lastName, businessName, email, phone, password, vertical,
      selectedPlan,
      billingInterval: selectedInterval,
    });
    setSubmitting(false);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <div className="absolute inset-0" aria-hidden="true">
        <div className="absolute -top-40 -left-32 h-[34rem] w-[34rem] rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="absolute -bottom-48 right-[-8rem] h-[36rem] w-[36rem] rounded-full bg-fuchsia-500/15 blur-3xl" />
      </div>
      <div className="relative min-h-screen max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] items-center gap-10 px-4 sm:px-8 py-8 lg:py-12">
        <section className="hidden lg:block text-white px-8" aria-label="About GigWorks">
          <Link to="/" className="inline-block mb-14 rounded-xl bg-white px-4 py-3 shadow-lg"><Logo className="h-9 w-auto" /></Link>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300 mb-5">Built for the people behind the gig</p>
          <h2 className="text-4xl xl:text-5xl font-bold leading-tight max-w-xl">Run the booking, staff the roster, and prepare the stage—all in one place.</h2>
          <p className="mt-6 text-lg leading-relaxed text-slate-300 max-w-lg">GigWorks keeps client paperwork, contractor confirmations, payments, stage plots, set lists, and production details connected to the same event.</p>
          <div className="mt-10 grid grid-cols-2 gap-4 max-w-lg">
            {['One source of truth for every gig', 'Secure client and contractor links', 'Built-in contracts and payments', 'Day-of tools your crew can use'].map((item) => (
              <div key={item} className="flex items-start gap-2.5 text-sm text-slate-200"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">✓</span><span>{item}</span></div>
            ))}
          </div>
        </section>

        <div className="w-full max-w-lg mx-auto">
          <div className="lg:hidden flex justify-center mb-6"><Link to="/" className="rounded-xl bg-white px-4 py-3 shadow-lg"><Logo className="h-9 w-auto" /></Link></div>
          <div className="bg-white rounded-3xl shadow-2xl shadow-black/30 border border-white/70 p-6 sm:p-9">
            <div className="mb-7">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">GigWorks</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">{tab === 'signup' ? 'Create your account' : tab === 'forgot' ? 'Reset your password' : 'Welcome back'}</h1>
              <p className="text-sm text-slate-500 mt-2">{tab === 'signup' ? `You selected ${PLAN_LABELS[selectedPlan]} · ${selectedInterval === 'year' ? 'Annual' : 'Monthly'} billing.` : tab === 'forgot' ? 'We’ll help you get back into your account.' : 'Sign in to manage your bookings, roster, and event details.'}</p>
            </div>

            {tab === 'signup' && <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800"><span className="font-semibold">14-day free trial</span> · No charge until your trial ends.</div>}

            {(authError || localError) && (
              <div data-testid="auth-error-banner" role="alert" className="mb-5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                {localError || authError}
              </div>
            )}

            <div className="lg:hidden mb-5 text-center"><Link to="/" className="text-xs font-semibold text-slate-500 hover:text-indigo-600">← Back to GigWorks</Link></div>

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
              <div><label htmlFor="reset-email" className={labelClass}>Email address</label><input id="reset-email" type="email" required placeholder="you@example.com" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} data-testid="auth-forgot-email-input" className={inputClass} /></div>
              <SubmitButton loading={submitting} testId="auth-forgot-submit-button">Send Reset Link</SubmitButton>
              <button type="button" onClick={backToSignIn} data-testid="auth-forgot-back-button" className="w-full text-sm font-semibold text-slate-500 hover:text-slate-700">
                Back to sign in
              </button>
            </form>
          )
        ) : tab === 'signin' ? (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div><label htmlFor="signin-email" className={labelClass}>Email address</label><input id="signin-email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="auth-signin-email-input" className={inputClass} /></div>
            <div><div className="flex items-center justify-between mb-1.5"><label htmlFor="signin-password" className="text-sm font-semibold text-slate-700">Password</label><button type="button" onClick={() => switchTab('forgot')} data-testid="auth-forgot-password-link" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">Forgot password?</button></div><input id="signin-password" type="password" autoComplete="current-password" required placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="auth-signin-password-input" className={inputClass} /></div>
            <SubmitButton loading={submitting} testId="auth-signin-submit-button">Sign In</SubmitButton>
            <p className="text-center text-xs text-slate-400 pt-1">Your account and event information are protected.</p>
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
            <button type="button" onClick={() => switchTab('signin')} className="w-full text-sm font-semibold text-slate-500 hover:text-slate-700">Back to sign in</button>
          </form>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
