import { useState } from 'react';
import Modal from './ui/Modal';
import { createInquiryLink } from '../lib/inquiryLinks';
import { formatEmailInput } from '../lib/format';
import { useToast } from './ui/Toast';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

// Standalone from any booking — the common case is a client who just
// called/emailed and doesn't have a booking started yet. If the agent
// already knows the client's email, filling it in here also sends the link
// via the app in the same step; otherwise the link is just shown to copy.
export default function SendInquiryLinkModal({ open, onClose }) {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null); // { inquiryLink, emailSent, emailError }
  const [error, setError] = useState('');
  const { showToast } = useToast();

  function handleClose() {
    setRecipientEmail('');
    setRecipientName('');
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
      });
      setResult(data);
    } catch (err) {
      setError(err.message || 'Failed to generate link');
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(result.inquiryLink);
      showToast('Link copied');
    } catch {
      showToast('Failed to copy link', 'error');
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Send Inquiry Link">
      {!result ? (
        <form onSubmit={handleGenerate} className="space-y-4">
          <p className="text-sm text-slate-500">
            Generates a secure link the client can use to fill out their own event details. You'll review it and apply it to a new booking once they submit.
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
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={handleClose} data-testid="send-inquiry-link-modal-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={generating} data-testid="send-inquiry-link-modal-generate-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
              {generating ? 'Generating…' : 'Generate Link'}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          {result.emailSent && (
            <div data-testid="send-inquiry-link-modal-emailed-banner" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              Emailed to {recipientEmail.trim()}.
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
                onClick={handleCopy}
                data-testid="send-inquiry-link-modal-copy-button"
                className="shrink-0 px-4 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
              >
                Copy
              </button>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button type="button" onClick={handleClose} data-testid="send-inquiry-link-modal-done-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
