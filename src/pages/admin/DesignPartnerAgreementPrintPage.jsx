import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../../context/AuthContext';
import Logo from '../../components/ui/Logo';

const AGREEMENT_TYPE_LABELS = { nda: 'Non-Disclosure Agreement', non_compete: 'Non-Compete and Non-Solicitation Agreement' };

// A bare, no-AppLayout/no-AdminLayout page (reached via a top-level route
// gated by DevOnlyRoute in App.jsx, same convention as dev/canvas-demo) —
// deliberately NOT the "View" modal on AdminAccountProfilePage.jsx, which
// renders the document text in a fixed-height scroll container that
// browsers won't print past. This page has no scroll container at all, so
// browser print (Ctrl+P / Cmd+P) or "Save as PDF" captures the whole
// document, correctly paginated, as an actual legal record.
export default function DesignPartnerAgreementPrintPage() {
  const { accountId, agreementId } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch(`/admin/accounts/${accountId}/profile`).then((data) => setProfile(data.profile)).catch((err) => setError(err.message));
  }, [accountId]);

  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!profile) return <div className="p-8 text-sm text-slate-400">Loading…</div>;

  const agreement = profile.designPartnerAgreements.find((a) => a.id === agreementId);
  if (!agreement) return <div className="p-8 text-sm text-red-600">Agreement not found.</div>;

  return (
    <div className="min-h-screen bg-white">
      <div className="print:hidden border-b border-slate-200 bg-slate-50 px-6 py-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">Printable legal record — not part of the signed document itself.</p>
        <button
          type="button"
          onClick={() => window.print()}
          data-testid="agreement-print-button"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
        >
          Print / Save as PDF
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10 print:px-0 print:py-0">
        <div className="flex items-center justify-between mb-8">
          {profile.business.name ? <span className="text-lg font-bold text-slate-800">{profile.business.name}</span> : <Logo className="h-8 w-auto" />}
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Design Partner Program</span>
        </div>

        <h1 className="text-xl font-bold text-slate-800 mb-1">{AGREEMENT_TYPE_LABELS[agreement.type] || agreement.type}</h1>
        <p className="text-xs text-slate-400 mb-6">
          {agreement.signedAt ? `Signed ${new Date(agreement.signedAt).toLocaleString()}` : 'Not yet signed'}
          {agreement.expiresAt && ` · Obligations active until ${new Date(agreement.expiresAt).toLocaleDateString()}`}
        </p>

        <div className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">{agreement.documentText}</div>

        <div className="mt-10 pt-6 border-t border-slate-200">
          {agreement.signedAt ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Electronically signed by {agreement.signatureName} on {new Date(agreement.signedAt).toLocaleString()}</p>
              {agreement.signatureImage && <img src={agreement.signatureImage} alt={`${agreement.signatureName}'s signature`} className="h-20 border border-slate-200 rounded-lg bg-white" />}
            </>
          ) : (
            <p className="text-sm font-semibold text-amber-600">Not yet signed.</p>
          )}
        </div>
      </div>
    </div>
  );
}
