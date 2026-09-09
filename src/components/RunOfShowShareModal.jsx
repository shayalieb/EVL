import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import LinkExpirationPicker from './LinkExpirationPicker';
import { createRunOfShowShare, getRunOfShowShare, revokeRunOfShowShare } from '../lib/runOfShowShare';
import { useToast } from './ui/Toast';

// Trimmed version of StagePlotShareModal.jsx — no revision/publish history,
// since the public link always reads the event's live schedule (see
// runOfShow.js's server route comment for why a Run of Show has no
// publish step the way Stage Plot does).
export default function RunOfShowShareModal({ open, onClose, eventId }) {
  const { showToast } = useToast();
  const [share, setShare] = useState(null);
  const [expiration, setExpiration] = useState({ preset: '30_days', expiresAt: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    getRunOfShowShare(eventId).then((data) => setShare(data.share)).catch((error) => showToast(error.message, 'error'));
  }, [eventId, open, showToast]);

  const active = share?.status === 'active';

  async function create() {
    setBusy(true);
    try {
      const result = await createRunOfShowShare(eventId, expiration);
      setShare(result.share);
      showToast(active ? 'A replacement link was created' : 'Run of show sharing is ready');
    } catch (error) { showToast(error.message, 'error'); } finally { setBusy(false); }
  }

  async function copy() {
    await navigator.clipboard.writeText(share.url);
    showToast('Share link copied');
  }

  async function revoke() {
    setBusy(true);
    try { await revokeRunOfShowShare(eventId); setShare((current) => current ? { ...current, status: 'revoked' } : null); showToast('Share link revoked'); }
    catch (error) { showToast(error.message, 'error'); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Share run of show" widthClass="max-w-xl">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Create a read-only link for the venue, crew, or band members. It always shows the current schedule — no need to republish after an edit.</p>
        {active && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-xs font-bold uppercase text-emerald-700">Active link</div>
            <div className="mt-2 flex gap-2"><input readOnly value={share.url} className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm" /><button type="button" onClick={copy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Copy</button></div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>{share.expiresAt ? `Expires ${new Date(share.expiresAt).toLocaleString()}` : 'No expiration'}</span>
              <span>{share.viewCount || 0} view{share.viewCount === 1 ? '' : 's'}</span>
              <span>{share.lastViewedAt ? `Last opened ${new Date(share.lastViewedAt).toLocaleString()}` : 'Not opened yet'}</span>
            </div>
          </div>
        )}
        <LinkExpirationPicker value={expiration} onChange={setExpiration} label={active ? 'Replacement link expiration' : 'Link expiration'} testId="run-of-show-share-expiration" />
        <p className="text-xs text-slate-500">Creating a replacement immediately disables the old URL.</p>
        <div className="flex flex-wrap justify-end gap-2">
          {active && <button type="button" disabled={busy} onClick={revoke} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50">Revoke link</button>}
          <button type="button" disabled={busy} onClick={create} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Working…' : active ? 'Create replacement' : 'Create share link'}</button>
        </div>
      </div>
    </Modal>
  );
}
