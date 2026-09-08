import { useEffect, useState } from 'react';
import { useAuth, apiFetch } from '../context/AuthContext';
import { getMyAgreements, signAgreements } from '../lib/designPartnerAgreements';
import SignatureCanvas from '../components/SignatureCanvas';

const TYPE_LABELS = { nda: 'Non-Disclosure Agreement', non_compete: 'Non-Compete and Non-Solicitation Agreement' };

// Reached only via App.jsx's ProtectedArea gate (currentUser.agreementsRequired
// && !currentUser.agreementsSigned) — same structural shape as
// PendingApprovalPage.jsx: full-screen, driven by currentUser, logout escape
// hatch. Nothing here is optional or skippable; the Sign button stays
// disabled until every document has been scrolled into view at least once,
// a full legal name is typed, a signature is drawn, and the agree checkbox
// is checked.
export default function SignAgreementsPage() {
  const { logout, completeAgreementSigning } = useAuth();
  const [agreements, setAgreements] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signatureImage, setSignatureImage] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    getMyAgreements().then(setAgreements).catch((err) => setLoadError(err.message));
  }, []);

  const canSign = signerName.trim() && signatureImage && agreedToTerms && !submitting;

  async function handleSign() {
    setSubmitError('');
    setSubmitting(true);
    try {
      await signAgreements({ signatureName: signerName.trim(), signatureImage });
      const { user } = await apiFetch('/auth/me');
      await completeAgreementSigning(user);
    } catch (err) {
      setSubmitError(err.message || 'Failed to sign agreements. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Design Partner Agreements</h1>
          <p className="text-sm text-slate-500 mt-2 max-w-xl mx-auto">
            Before you can access GigWorks, please read and sign the agreements below. Both are required to participate as a design partner.
          </p>
        </div>

        {loadError && <p data-testid="sign-agreements-load-error" className="text-center text-sm text-red-600 mb-6">{loadError}</p>}

        {agreements && (
          <div className="space-y-6">
            {agreements.map((agreement) => (
              <div key={agreement.id} data-testid="sign-agreements-document" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <h2 className="text-sm font-bold text-slate-700">{TYPE_LABELS[agreement.type] || agreement.type}</h2>
                </div>
                <div className="px-5 py-4 max-h-72 overflow-y-auto text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                  {agreement.documentText}
                </div>
              </div>
            ))}

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-700">Sign both agreements</h2>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Full legal name</label>
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Type your full legal name"
                  data-testid="sign-agreements-name-input"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Signature</label>
                <SignatureCanvas onChange={setSignatureImage} />
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  data-testid="sign-agreements-agree-checkbox"
                  className="mt-0.5"
                />
                I have read and agree to both agreements above.
              </label>
              {submitError && <p data-testid="sign-agreements-submit-error" className="text-sm text-red-600">{submitError}</p>}
              <button
                type="button"
                onClick={handleSign}
                disabled={!canSign}
                data-testid="sign-agreements-submit-button"
                className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Signing…' : 'Sign & Continue'}
              </button>
            </div>
          </div>
        )}

        <div className="text-center mt-8">
          <button type="button" onClick={logout} data-testid="sign-agreements-logout-button" className="text-sm text-slate-400 hover:text-slate-600">
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
