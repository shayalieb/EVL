import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePortalAuth } from '../../context/PortalAuthContext';

export default function PortalVerifyPage() {
  const { verify } = usePortalAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) { setError('This link is missing its token.'); return; }
    verify(token)
      .then(() => navigate('/portal', { replace: true }))
      .catch((err) => setError(err.message || 'This link is invalid or has expired.'));
    // Only ever run once per mount — verify() consumes the token server-side
    // (single-use), so re-running on a dependency change would just fail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-8 text-center">
        {error ? (
          <>
            <p className="text-sm text-red-600 mb-4" data-testid="portal-verify-error-message">{error}</p>
            <button
              type="button"
              onClick={() => navigate('/portal/login')}
              data-testid="portal-verify-back-to-login-button"
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Request a new link
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-500">Logging you in…</p>
        )}
      </div>
    </div>
  );
}
