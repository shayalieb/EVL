import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Logo from '../components/ui/Logo';
import { viewInvoiceByToken, startInvoiceCheckout } from '../lib/invoices';
import { computeOfferingTotal } from '../lib/offerings';
import { formatCurrency as currency, formatEventDate } from '../lib/format';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export default function InvoicePayPage() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [email, setEmail] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [payingNow, setPayingNow] = useState(false);

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    setVerifying(true);
    try {
      const data = await viewInvoiceByToken(token, email.trim(), sessionId);
      setInvoice(data);
      setVerifiedEmail(email.trim());
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setVerifying(false);
    }
  }

  async function handlePayNow() {
    setError('');
    setPayingNow(true);
    try {
      const url = await startInvoiceCheckout(token, verifiedEmail);
      // Full top-level redirect to Stripe's hosted Checkout page.
      window.location.href = url;
    } catch (err) {
      setError(err.message || 'Failed to start checkout.');
      setPayingNow(false);
    }
  }

  if (!invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
          <div className="text-center mb-6">
            <Logo className="h-12 w-auto mx-auto mb-3" />
            <p className="text-sm text-slate-500">Confirm your email to view this invoice</p>
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

  const { snapshot, dueDate, memo, status, total } = invoice;
  const lineItems = snapshot.lineItems || [];

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 pb-28">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Logo className="h-10 w-auto" />
          <div>
            <div className="font-bold text-slate-800">{snapshot.businessInfo?.name || 'Invoice'}</div>
            <div className="text-xs text-slate-400">Invoice for {snapshot.client?.firstName} {snapshot.client?.lastName}</div>
          </div>
        </div>

        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        {status === 'paid' && (
          <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            Paid{invoice.paidAt ? ` on ${formatEventDate(invoice.paidAt.slice(0, 10))}` : ''}. Thank you!
          </div>
        )}
        {status === 'void' && (
          <div className="mb-4 text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
            This invoice has been voided and is no longer payable.
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h1 className="text-lg font-bold text-slate-800">Invoice</h1>
            {dueDate && <div className="text-xs text-slate-400">Due {formatEventDate(dueDate.slice(0, 10))}</div>}
          </div>

          <div className="space-y-3 mb-6">
            {lineItems.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                <div>
                  <div className="text-sm font-semibold text-slate-700">{item.name}</div>
                  {item.details && <div className="text-xs text-slate-400 mt-0.5">{item.details}</div>}
                </div>
                <div className="text-sm font-semibold text-slate-700 shrink-0">{currency(computeOfferingTotal(item))}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <span className="text-sm font-bold text-slate-800">Total</span>
            <span className="text-lg font-bold text-slate-800">{currency(total)}</span>
          </div>

          {memo && (
            <div className="mt-6 pt-6 border-t border-slate-100 text-sm text-slate-600 whitespace-pre-wrap">{memo}</div>
          )}
        </div>
      </div>

      {status === 'sent' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400 hidden sm:block">Secure payment powered by Stripe</span>
            <button
              type="button"
              onClick={handlePayNow}
              disabled={payingNow}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {payingNow && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              Pay {currency(total)} Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
