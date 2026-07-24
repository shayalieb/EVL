import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/ui/Logo';
import SubmitButton from '../components/ui/SubmitButton';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { resetPassword } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    const result = await resetPassword({ token, newPassword });
    setSubmitting(false);
    if (result.ok) {
      setDone(true);
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <Logo className="h-12 w-auto mx-auto mb-3" />
          <p className="text-sm text-slate-500">Reset your password</p>
        </div>

        {!token ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-center">
            This reset link is missing its token. Request a new one from the sign-in page.
          </p>
        ) : done ? (
          <div className="space-y-4 text-center">
            <p data-testid="reset-password-done-message" className="text-sm text-slate-600">Your password has been reset.</p>
            <Link to="/auth" data-testid="reset-password-back-to-signin-link" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div data-testid="reset-password-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <input type="password" required minLength={8} placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} data-testid="reset-password-new-password-input" className={inputClass} />
            <input type="password" required placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} data-testid="reset-password-confirm-password-input" className={inputClass} />
            <SubmitButton loading={submitting} testId="reset-password-submit-button">Reset Password</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
