import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import { bulkEmailContractors } from '../lib/contractors';
import { isValidEmailAddress } from '../lib/format';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

// Sends the same subject/body to every selected contractor in one request
// (see bulkEmailContractors) — a plain broadcast, not a per-recipient
// merge-field template like EventFormPage's per-event bulk send, since
// there's no event/booking context to personalize against here.
export default function BulkEmailModal({ open, onClose, contractors }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (open) {
      setSubject('');
      setBody('');
      setSending(false);
      setResult(null);
    }
  }, [open]);

  const withEmail = contractors.filter((c) => isValidEmailAddress(c.email));
  const withoutEmail = contractors.filter((c) => !isValidEmailAddress(c.email));

  async function handleSend() {
    if (!subject.trim() || !body.trim() || sending) return;
    setSending(true);
    try {
      const res = await bulkEmailContractors({
        contractorIds: contractors.map((c) => c.id),
        subject,
        body,
      });
      setResult(res);
    } catch (err) {
      setResult({ sentCount: 0, skipped: [], error: err.message || 'Failed to send.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Email ${contractors.length} Contractor${contractors.length === 1 ? '' : 's'}`} widthClass="max-w-lg">
      {result ? (
        <div className="space-y-4">
          {result.error ? (
            <div data-testid="bulk-email-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{result.error}</div>
          ) : (
            <div data-testid="bulk-email-result-summary" className="text-sm text-slate-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              Sent to {result.sentCount} contractor{result.sentCount === 1 ? '' : 's'}.
            </div>
          )}
          {result.skipped?.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Not sent ({result.skipped.length})
              </div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {result.skipped.map((s) => (
                  <li key={s.contractorId} data-testid="bulk-email-skipped-row" className="text-sm text-slate-600 flex items-center justify-between gap-2">
                    <span>{s.name}</span>
                    <span className="text-xs text-slate-400">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              data-testid="bulk-email-done-button"
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Recipients ({withEmail.length})
            </div>
            <div className="text-sm text-slate-600 max-h-24 overflow-y-auto">
              {withEmail.map((c) => `${c.firstName} ${c.lastName}`).join(', ') || '—'}
            </div>
            {withoutEmail.length > 0 && (
              <div data-testid="bulk-email-no-address-note" className="text-xs text-amber-600 mt-1.5">
                {withoutEmail.length} selected contractor{withoutEmail.length === 1 ? '' : 's'} need a valid email and will be skipped: {withoutEmail.map((c) => `${c.firstName} ${c.lastName}`).join(', ')}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              data-testid="bulk-email-subject-input"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Message</label>
            <textarea
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              data-testid="bulk-email-body-textarea"
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              data-testid="bulk-email-cancel-button"
              className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !subject.trim() || !body.trim() || withEmail.length === 0}
              data-testid="bulk-email-send-button"
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {sending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              Send
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
