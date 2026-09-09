import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import LinkExpirationPicker from './LinkExpirationPicker';
import { createStagePlotShare, getStagePlotShare, publishStagePlotRevision, restoreStagePlotRevision, revokeStagePlotShare } from '../lib/stagePlotShare';
import { useToast } from './ui/Toast';

export default function StagePlotShareModal({ open, onClose, eventId, onRestored }) {
  const { showToast } = useToast();
  const [share, setShare] = useState(null);
  const [expiration, setExpiration] = useState({ preset: '30_days', expiresAt: '' });
  const [busy, setBusy] = useState(false);
  const [revisions, setRevisions] = useState([]);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');

  useEffect(() => {
    if (!open) return;
    getStagePlotShare(eventId).then((data) => { setShare(data.share); setRevisions(data.revisions || []); setHasUnpublishedChanges(!!data.hasUnpublishedChanges); }).catch((error) => showToast(error.message, 'error'));
  }, [eventId, open, showToast]);

  async function create() {
    setBusy(true);
    try {
      const result = await createStagePlotShare(eventId, expiration);
      setShare(result.share);
      setRevisions((current) => [result.revision, ...current]);
      setHasUnpublishedChanges(false);
      showToast(active ? 'A replacement link was created' : 'Stage plot sharing is ready');
    } catch (error) { showToast(error.message, 'error'); } finally { setBusy(false); }
  }

  async function publish() {
    setBusy(true);
    try {
      const result = await publishStagePlotRevision(eventId, revisionNote);
      setShare(result.share);
      setRevisions((current) => [result.revision, ...current]);
      setRevisionNote('');
      setHasUnpublishedChanges(false);
      showToast(`Revision ${result.revision.revisionNumber} published`);
    } catch (error) { showToast(error.message, 'error'); } finally { setBusy(false); }
  }

  async function restore(revisionNumber) {
    if (!window.confirm(`Restore Revision ${revisionNumber} to the editor? The shared link will remain unchanged until you publish again.`)) return;
    setBusy(true);
    try {
      const result = await restoreStagePlotRevision(eventId, revisionNumber);
      onRestored?.(result.stagePlot);
      setHasUnpublishedChanges(true);
      showToast(`Revision ${revisionNumber} restored as an unpublished draft`);
    } catch (error) { showToast(error.message, 'error'); } finally { setBusy(false); }
  }

  async function copy() {
    await navigator.clipboard.writeText(share.url);
    showToast('Share link copied');
  }

  async function revoke() {
    setBusy(true);
    try { await revokeStagePlotShare(eventId); setShare((current) => current ? { ...current, status: 'revoked' } : null); showToast('Share link revoked'); }
    catch (error) { showToast(error.message, 'error'); } finally { setBusy(false); }
  }

  const active = share?.status === 'active';
  return (
    <Modal open={open} onClose={onClose} title="Share stage plot" widthClass="max-w-xl">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Create a secure read-only link for a venue or sound engineer. Editing tools and internal account information are never shown.</p>
        {active && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-xs font-bold uppercase text-emerald-700">Active link</div>
            <div className="mt-2 flex gap-2"><input readOnly value={share.url} className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm" /><button type="button" onClick={copy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Copy</button></div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="font-bold text-indigo-600">Revision {share.publishedRevisionNumber || '—'}</span>
              <span>{share.expiresAt ? `Expires ${new Date(share.expiresAt).toLocaleString()}` : 'No expiration'}</span>
              <span>{share.viewCount || 0} view{share.viewCount === 1 ? '' : 's'}</span>
              <span>{share.lastViewedAt ? `Last opened ${new Date(share.lastViewedAt).toLocaleString()}` : 'Not opened yet'}</span>
            </div>
          </div>
        )}
        {active && hasUnpublishedChanges && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">The editor has changes that recipients cannot see yet.{share.viewCount > 0 ? ` Recipients may already have viewed Revision ${share.publishedRevisionNumber}.` : ''}</div>}
        {active && (
          <div className="rounded-lg border border-slate-200 p-3">
            <label className="block text-xs font-semibold text-slate-600">What changed? <span className="font-normal text-slate-400">Optional</span><textarea value={revisionNote} onChange={(event) => setRevisionNote(event.target.value)} maxLength={1000} rows={2} placeholder="e.g. Moved drums stage right and updated monitor mixes" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
            <button type="button" disabled={busy || !hasUnpublishedChanges} onClick={publish} className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Publish Update</button>
            {!hasUnpublishedChanges && <span className="ml-3 text-xs text-slate-400">Shared revision matches the editor.</span>}
          </div>
        )}
        <LinkExpirationPicker value={expiration} onChange={setExpiration} label={active ? 'Replacement link expiration' : 'Link expiration'} testId="stageplot-share-expiration" />
        <p className="text-xs text-slate-500">Creating a replacement immediately disables the old URL.</p>
        <div className="flex flex-wrap justify-end gap-2">
          {active && <button type="button" disabled={busy} onClick={revoke} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50">Revoke link</button>}
          <button type="button" disabled={busy} onClick={create} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Working…' : active ? 'Create replacement' : 'Create share link'}</button>
        </div>
        {revisions.length > 0 && <div><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Revision history</h3><div className="max-h-56 space-y-2 overflow-y-auto">{revisions.map((revision) => <div key={revision.revisionNumber} className="rounded-lg border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold text-slate-700">Revision {revision.revisionNumber}{revision.revisionNumber === share?.publishedRevisionNumber ? ' · Published' : ''}</div><div className="text-xs text-slate-400">{new Date(revision.publishedAt).toLocaleString()}{revision.publishedByName ? ` · ${revision.publishedByName}` : ''}</div></div><button type="button" disabled={busy} onClick={() => restore(revision.revisionNumber)} className="text-xs font-semibold text-indigo-600 disabled:opacity-40">Restore</button></div>{revision.note && <p className="mt-2 text-xs text-slate-600">{revision.note}</p>}<p className="mt-1 text-[11px] text-slate-400">{revision.summary?.changedSections?.join(', ') || 'Published snapshot'}</p></div>)}</div></div>}
      </div>
    </Modal>
  );
}
