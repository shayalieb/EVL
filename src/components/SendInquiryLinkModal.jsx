import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import { createInquiryLink, listInquiryLinks, regenerateInquiryLink } from '../lib/inquiryLinks';
import { formatEmailInput } from '../lib/format';
import { useToast } from './ui/Toast';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

function daysUntil(dateStr) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function ExpiryBadge({ expiresAt }) {
  const days = daysUntil(expiresAt);
  if (days <= 0) return <span className="text-xs font-semibold text-red-600">Expired</span>;
  return <span className="text-xs text-slate-400">Expires in {days} day{days === 1 ? '' : 's'}</span>;
}

// Standalone from any booking (bookingId omitted) — the common case is a
// client who just called/emailed and doesn't have a booking started yet. If
// bookingId is given (sent from an in-progress Booking), links are scoped to
// that booking and Applying a response later merges into it instead of
// creating a new one — see src/lib/applyInquiry.js.
export default function SendInquiryLinkModal({ open, onClose, bookingId, defaultRecipientEmail = '', defaultRecipientName = '' }) {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [result, setResult] = useState(null); // { inquiryLink, emailSent, emailError }
  const [links, setLinks] = useState([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    if (!open) return;
    setRecipientEmail(defaultRecipientEmail);
    setRecipientName(defaultRecipientName);
    setResult(null);
    setError('');
    refreshLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bookingId]);

  function refreshLinks() {
    setLoadingLinks(true);
    listInquiryLinks({ status: 'open', ...(bookingId ? { bookingId } : {}) })
      .then(setLinks)
      .catch(() => {})
      .finally(() => setLoadingLinks(false));
  }

  function handleClose() {
    setResult(null);
    setError('');
    onClose();
  }

  async function handleGenerate(e) {
    e.preventDefault();
    setError('');
    setGenerating(true);
    try {
      const data = await createInquiryLink({
        recipientEmail: recipientEmail.trim() || undefined,
        recipientName: recipientName.trim() || undefined,
        bookingId: bookingId || undefined,
      });
      setResult(data);
      refreshLinks();
    } catch (err) {
      setError(err.message || 'Failed to generate link');
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegenerate(link) {
    setRegeneratingId(link.id);
    try {
      const data = await regenerateInquiryLink(link.id);
      setResult(data);
      refreshLinks();
    } catch (err) {
      showToast(err.message || 'Failed to regenerate link', 'error');
    } finally {
      setRegeneratingId(null);
    }
  }

  async function handleCopy(url) {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied');
    } catch {
      showToast('Failed to copy link', 'error');
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Send Inquiry Link">
      <div className="space-y-5">
        <form onSubmit={handleGenerate} className="space-y-4">
          <p className="text-sm text-slate-500">
            Generates a secure link the client can use to fill out their own event details. It's valid for 30 days.
          </p>
          {error && <div data-testid="send-inquiry-link-modal-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className={labelClass}>Recipient Name (optional)</label>
            <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} data-testid="send-inquiry-link-modal-name-input" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Recipient Email (optional — emails the link now if provided)</label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(formatEmailInput(e.target.value))}
              data-testid="send-inquiry-link-modal-email-input"
              className={inputClass}
            />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={generating} data-testid="send-inquiry-link-modal-generate-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
              {generating ? 'Generating…' : 'Generate Link'}
            </button>
          </div>
        </form>

        {result && (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            {result.emailSent && (
              <div data-testid="send-inquiry-link-modal-emailed-banner" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                Emailed successfully.
              </div>
            )}
            {result.emailError && (
              <div data-testid="send-inquiry-link-modal-email-error-banner" className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                {result.emailError}
              </div>
            )}
            <div>
              <label className={labelClass}>Share this link with the client</label>
              <div className="flex gap-2">
                <input readOnly value={result.inquiryLink} data-testid="send-inquiry-link-modal-url-input" className={`${inputClass} bg-slate-50`} onFocus={(e) => e.target.select()} />
                <button
                  type="button"
                  onClick={() => handleCopy(result.inquiryLink)}
                  data-testid="send-inquiry-link-modal-copy-button"
                  className="shrink-0 px-4 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        )}

        {!loadingLinks && links.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Sent, Awaiting Response</h4>
            <div className="space-y-2">
              {links.map((link) => (
                <div key={link.id} data-testid="send-inquiry-link-modal-existing-row" className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-700 truncate">{link.recipientName || link.recipientEmail || 'No recipient given'}</div>
                    <ExpiryBadge expiresAt={link.expiresAt} />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRegenerate(link)}
                    disabled={regeneratingId === link.id}
                    data-testid="send-inquiry-link-modal-regenerate-button"
                    className="shrink-0 text-indigo-600 font-semibold hover:underline disabled:opacity-50"
                  >
                    {regeneratingId === link.id ? 'Regenerating…' : 'Regenerate'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button type="button" onClick={handleClose} data-testid="send-inquiry-link-modal-done-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Done</button>
        </div>
      </div>
    </Modal>
  );
}
