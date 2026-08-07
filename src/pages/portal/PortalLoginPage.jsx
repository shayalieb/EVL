import { useState } from 'react';
import { usePortalAuth } from '../../context/PortalAuthContext';

export default function PortalLoginPage() {
  const { requestLink } = usePortalAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await requestLink(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-8">
        <h1 className="text-xl font-bold text-slate-800 mb-1 text-center">Client Portal</h1>
        <p className="text-sm text-slate-500 text-center mb-6">View your event details, documents, and payment status.</p>

        {sent ? (
          <div className="text-center text-sm text-slate-600" data-testid="portal-login-sent-message">
            <p>If that email is on file with us, we've sent a login link to <strong>{email}</strong>.</p>
            <p className="mt-2 text-slate-400">It expires in 30 minutes — check spam if you don't see it.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div data-testid="portal-login-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="portal-login-email-input"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              data-testid="portal-login-submit-button"
              className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Email me a login link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
