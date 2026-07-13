import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export default function AuthPage() {
  const [tab, setTab] = useState('signin');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const { signIn, signUp, authError, startSimulatedGoogleSignIn } = useAuth();
  const navigate = useNavigate();

  function handleSignIn(e) {
    e.preventDefault();
    setLocalError('');
    signIn({ email, password });
  }

  function handleSignUp(e) {
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
    signUp({ firstName, lastName, email, phone, password });
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setLocalError('');
    const result = await startSimulatedGoogleSignIn();
    setGoogleLoading(false);
    if (result.status === 'needs_profile') {
      navigate('/complete-profile');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 text-white text-2xl font-bold mb-3">E</div>
          <h1 className="text-2xl font-bold text-slate-800">EVL</h1>
          <p className="text-sm text-slate-500">Event Vendor Logistics</p>
        </div>

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

        {(authError || localError) && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {localError || authError}
          </div>
        )}

        {tab === 'signin' ? (
          <form onSubmit={handleSignIn} className="space-y-3">
            <input type="email" required placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            <button type="submit" className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700">
              Sign In
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
            <button type="submit" className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700">
              Create Account
            </button>
          </form>
        )}

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400">OR</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          className="w-full py-2.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {googleLoading ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-indigo-600 animate-spin" />
              Connecting…
            </>
          ) : (
            <>
              <span className="text-base">G</span>
              Continue with Google
            </>
          )}
        </button>
      </div>
    </div>
  );
}
