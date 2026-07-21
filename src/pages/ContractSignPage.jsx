import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Logo from '../components/ui/Logo';
import SignatureCanvas from '../components/SignatureCanvas';
import { viewContractByToken, submitContractSignature } from '../lib/contracts';
import { getContractPdfDataUrl } from '../lib/contractPdf';
import { formatCurrency as currency } from '../lib/format';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

function toSignature(name, image, signedAt) {
  return signedAt ? { name, image, signedAt } : null;
}

export default function ContractSignPage() {
  const { token } = useParams();
  const [email, setEmail] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [contract, setContract] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signatureImage, setSignatureImage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!contract) return;
    let cancelled = false;
    getContractPdfDataUrl({
      snapshot: contract.snapshot,
      clientSignature: toSignature(contract.clientSignatureName, contract.clientSignatureImage, contract.clientSignedAt),
      ownerSignature: toSignature(contract.ownerSignatureName, contract.ownerSignatureImage, contract.ownerSignedAt),
    }).then((url) => { if (!cancelled) setPdfUrl(url); });
    return () => { cancelled = true; };
  }, [contract]);

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

  async function handleSign(e) {
    e.preventDefault();
    setError('');
    if (!signatureImage) {
      setError('Please draw your signature above.');
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
  const canSignNow = !alreadySigned && (role === 'client' ? status === 'sent' : status === 'client_signed');
  const waitingOnOtherParty = role === 'owner' && status === 'sent';
  const lineItems = snapshot.lineItems || [];
  const itemsTotal = lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const grandTotal = (Number(snapshot.booking?.quotedTotal) || 0) + itemsTotal;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Logo className="h-10 w-auto" />
          <div>
            <div className="font-bold text-slate-800">{snapshot.businessInfo?.name || 'Event Contract'}</div>
            <div className="text-xs text-slate-400">Contract for {snapshot.client?.firstName} {snapshot.client?.lastName}</div>
          </div>
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
        {waitingOnOtherParty && (
          <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Waiting for the client to sign first — you'll be notified when it's your turn.
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-6">
          {pdfUrl ? (
            <iframe title="Contract PDF" src={pdfUrl} className="w-full h-[70vh]" />
          ) : (
            <div className="h-[70vh] flex items-center justify-center text-sm text-slate-400">Loading contract…</div>
          )}
        </div>

        {canSignNow && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-base font-bold text-slate-800 mb-4">
              {role === 'client' ? 'Sign as the client' : 'Countersign as the business'}
            </h3>
            <form onSubmit={handleSign} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Full Legal Name</label>
                <input
                  required
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Type your full name"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Signature</label>
                <SignatureCanvas onChange={setSignatureImage} />
              </div>
              <div className="text-xs text-slate-400">
                Grand Total: <span className="font-semibold text-slate-600">{currency(grandTotal)}</span>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
              >
                {submitting && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                Sign Contract
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
