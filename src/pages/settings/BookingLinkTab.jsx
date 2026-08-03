import { useEffect, useState } from 'react';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { getGeneralInquiryLink, regenerateGeneralInquiryLink } from '../../lib/inquiryLinks';

export default function BookingLinkTab() {
  const { showToast } = useToast();
  const [link, setLink] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    getGeneralInquiryLink().then(setLink).catch((err) => setLoadError(err.message));
  }, []);

  async function handleCopy() {
    await navigator.clipboard.writeText(link);
    showToast('Link copied');
  }

  async function handleRegenerate() {
    setConfirmOpen(false);
    setRegenerating(true);
    try {
      const fresh = await regenerateGeneralInquiryLink();
      setLink(fresh);
      showToast('Link regenerated');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRegenerating(false);
    }
  }

  if (loadError) return <div data-testid="settings-booking-link-error-banner" className="text-sm text-red-600">{loadError}</div>;

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-1">Booking Link</h3>
        <p className="text-sm text-slate-500">
          Paste this link on your own website (as a button or a "Book with us" link). Anyone who fills it out lands in your Bookings inbox for review, just like any other inquiry — and the link keeps working for every visitor, it's never used up.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Your Booking Link</div>
          {link ? (
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                data-testid="settings-booking-link-url-input"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm bg-slate-50 text-slate-600"
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                onClick={handleCopy}
                data-testid="settings-booking-link-copy-button"
                className="shrink-0 px-4 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
              >
                Copy
              </button>
            </div>
          ) : (
            <div className="text-sm text-slate-400">Loading…</div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={!link || regenerating}
          data-testid="settings-booking-link-regenerate-button"
          className="text-xs font-semibold text-slate-500 hover:text-red-600 disabled:opacity-50"
        >
          {regenerating ? 'Regenerating…' : 'Regenerate Link'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleRegenerate}
        title="Regenerate booking link?"
        description="The current link will stop working immediately — if it's already embedded on your website, you'll need to swap in the new one there too."
        confirmLabel="Regenerate"
      />
    </div>
  );
}
