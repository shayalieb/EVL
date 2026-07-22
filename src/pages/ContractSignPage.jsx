import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Logo from '../components/ui/Logo';
import ContractDocument from '../components/ContractDocument';
import { viewContractByToken, submitContractSignature } from '../lib/contracts';
import { generateContractPdf } from '../lib/contractPdf';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

function toSignature(name, image, signedAt) {
  return signedAt ? { name, image, signedAt } : null;
}

export default function ContractSignPage() {
  const { token } = useParams();
  const [email, setEmail] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [contract, setContract] = useState(null);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signatureImage, setSignatureImage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const signHereRef = useRef(null);

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    setVerifying(true);
    try {
      const data = await viewContractByToken(token, email.trim());
      setContract(data);
      setVerifiedEmail(email.trim());
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleSignClick() {
    setError('');
    if (!signatureImage) {
      signHereRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setError('Please draw your signature in the "Sign Here" box below.');
      return;
    }
    if (!signerName.trim()) {
      signHereRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setError('Please type your full legal name.');
      return;
    }
    setSubmitting(true);
    try {
      const data = await submitContractSignature(token, {
        email: verifiedEmail,
        signatureName: signerName.trim(),
        signatureImage,
      });
      setContract(data);
    } catch (err) {
      setError(err.message || 'Failed to submit signature.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      await generateContractPdf({
        snapshot: contract.snapshot,
        terms: contract.terms,
        clientSignature: toSignature(contract.clientSignatureName, contract.clientSignatureImage, contract.clientSignedAt),
        ownerSignature: toSignature(contract.ownerSignatureName, contract.ownerSignatureImage, contract.ownerSignedAt),
      });
    } finally {
      setDownloading(false);
    }
  }

  if (!contract) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
          <div className="text-center mb-6">
            <Logo className="h-12 w-auto mx-auto mb-3" />
            <p className="text-sm text-slate-500">Confirm your email to view this contract</p>
          </div>
          <form onSubmit={handleVerify} className="space-y-3">
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
            )}
            <input
              type="email"
              required
              autoFocus
              placeholder="Email address this was sent to"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={verifying}
              className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {verifying && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  const { role, status, snapshot } = contract;
  const alreadySigned = role === 'client' ? !!contract.clientSignedAt : !!contract.ownerSignedAt;
  const canSignNow = !alreadySigned;
  const clientSignature = toSignature(contract.clientSignatureName, contract.clientSignatureImage, contract.clientSignedAt);
  const ownerSignature = toSignature(contract.ownerSignatureName, contract.ownerSignatureImage, contract.ownerSignedAt);

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 pb-28">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Logo className="h-10 w-auto" />
            <div>
              <div className="font-bold text-slate-800">{snapshot.businessInfo?.name || 'Event Contract'}</div>
              <div className="text-xs text-slate-400">Contract for {snapshot.client?.firstName} {snapshot.client?.lastName}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-white disabled:opacity-60 shrink-0"
          >
            {downloading ? 'Preparing…' : 'Download a copy (PDF)'}
          </button>
        </div>

        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        {status === 'fully_signed' && (
          <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            This contract has been signed by both parties.
          </div>
        )}
        {alreadySigned && status !== 'fully_signed' && (
          <div className="mb-4 text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            You've signed this contract. Waiting on the other party.
          </div>
        )}

        <ContractDocument
          snapshot={snapshot}
          terms={contract.terms}
          clientSignature={clientSignature}
          ownerSignature={ownerSignature}
          role={role}
          canSignNow={canSignNow}
          signerName={signerName}
          onSignerNameChange={setSignerName}
          onSignatureChange={setSignatureImage}
          signHereRef={signHereRef}
        />
      </div>

      {canSignNow && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400 hidden sm:block">
              {role === 'client' ? 'Review the contract, then sign in the box above.' : 'Review the contract, then countersign in the box above.'}
            </span>
            <button
              type="button"
              onClick={handleSignClick}
              disabled={submitting}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              Sign Contract
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
