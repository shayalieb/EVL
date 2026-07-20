import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/ui/Logo';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export default function AuthPage() {
  const [tab, setTab] = useState('signin');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { signIn, signUp, authError, requestPasswordReset } = useAuth();

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
    await requestPasswordReset(resetEmail);
    setSubmitting(false);
    setResetSent(true);
  }

  function backToSignIn() {
    setTab('signin');
    setResetSent(false);
    setResetEmail('');
    setLocalError('');
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setLocalError('');
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setLocalError('Please fill in all required fields.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    await signUp({ firstName, lastName, email, phone, password });
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
              onClick={() => setTab('signin')}
              className={`flex-1 py-2 font-semibold border-b-2 ${tab === 'signin' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setTab('signup')}
              className={`flex-1 py-2 font-semibold border-b-2 ${tab === 'signup' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}
            >
              Sign Up
            </button>
          </div>
        )}

        {(authError || localError) && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {localError || authError}
          </div>
        )}

        {tab === 'forgot' ? (
          resetSent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-slate-600">
                If an account exists for that email, we've sent a link to reset the password.
              </p>
              <button type="button" onClick={backToSignIn} className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-3">
              <p className="text-sm text-slate-500">Enter your email and we'll send you a reset link.</p>
              <input type="email" required placeholder="Email address" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className={inputClass} />
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                Send Reset Link
              </button>
              <button type="button" onClick={backToSignIn} className="w-full text-sm font-semibold text-slate-500 hover:text-slate-700">
                Back to sign in
              </button>
            </form>
          )
        ) : tab === 'signin' ? (
          <form onSubmit={handleSignIn} className="space-y-3">
            <input type="email" required placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              Sign In
            </button>
            <button type="button" onClick={() => setTab('forgot')} className="w-full text-sm font-medium text-indigo-600 hover:text-indigo-700">
              Forgot password?
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignUp} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
              <input required placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
            </div>
            <input type="email" required placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            <input type="tel" placeholder="Contact phone number" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            <input type="password" required placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} />
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              Create Account
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
