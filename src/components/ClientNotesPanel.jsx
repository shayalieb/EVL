import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  CLIENT_NOTE_TYPES, listClientNotes, createClientNote, updateClientNote, deleteClientNote,
} from '../lib/clients';
import { createReminder, fetchReminders, completeReminder } from '../lib/reminders';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const TYPE_STYLES = {
  general: 'bg-slate-100 text-slate-600',
  call: 'bg-sky-100 text-sky-700',
  meeting: 'bg-violet-100 text-violet-700',
  preference: 'bg-emerald-100 text-emerald-700',
  issue: 'bg-rose-100 text-rose-700',
};

function formatWhen(value) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function toDateInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toDateInput(d);
}

// Notes log + follow-up reminders for one saved client. Lives inside the
// client modal, so follow-ups are created inline rather than by stacking the
// Reminder modal on top of it.
export default function ClientNotesPanel({ client, canEdit, onChanged, bare = false }) {
  const { currentUser, role } = useAuth();
  const clientId = client.id;
  const clientName = `${client.firstName} ${client.lastName}`.trim();
  const [notes, setNotes] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [draftType, setDraftType] = useState('general');
  const [draftPinned, setDraftPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [followOpen, setFollowOpen] = useState(false);
  const [followDate, setFollowDate] = useState(tomorrow());
  const [followNote, setFollowNote] = useState('');
  const [followEmail, setFollowEmail] = useState(false);

  const isManager = role === 'owner' || role === 'admin';
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [noteList, reminders] = await Promise.all([listClientNotes(clientId), fetchReminders()]);
      setNotes(noteList);
      setFollowUps(reminders.filter((r) => r.relatedType === 'client' && r.relatedId === clientId && !r.completedAt));
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load notes.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const reload = useCallback(async () => { await load(); onChanged?.(); }, [load, onChanged]);

  async function addNote(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await createClientNote(clientId, { body: draft, type: draftType, pinned: draftPinned });
      setDraft(''); setDraftType('general'); setDraftPinned(false);
      await reload();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function run(action) {
    try { await action(); await reload(); } catch (err) { setError(err.message); }
  }

  async function addFollowUp(e) {
    e.preventDefault();
    if (!followNote.trim() || !followDate) return;
    const remindAt = new Date(`${followDate}T09:00`);
    if (remindAt <= new Date()) { setError('Choose a future date for the follow-up.'); return; }
    setSaving(true);
    try {
      await createReminder({
        relatedType: 'client',
        relatedId: clientId,
        relatedName: clientName,
        note: followNote.trim(),
        remindAt: remindAt.toISOString(),
        emailEnabled: followEmail,
        emailTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setFollowNote(''); setFollowOpen(false); setFollowEmail(false); setFollowDate(tomorrow());
      await reload();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  const pinned = notes.find((n) => n.pinned);
  const canModify = (note) => canEdit && (isManager || note.authorUserId === currentUser?.id);

  return (
    <section data-testid="client-notes-panel" className={`space-y-4 ${bare ? 'pt-4' : 'mt-6 border-t border-slate-100 pt-4'}`}>
      {error && <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

      {pinned && (
        <div data-testid="client-pinned-note" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="text-xs font-bold uppercase tracking-wide text-amber-700">📌 Pinned</span>
          <p className="mt-0.5 whitespace-pre-wrap">{pinned.body}</p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-bold text-slate-700">Follow-ups</h4>
          {canEdit && !followOpen && (
            <button type="button" onClick={() => setFollowOpen(true)} data-testid="client-add-followup-button" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">+ Add follow-up</button>
          )}
        </div>
        {followUps.length === 0 && !followOpen && <p className="text-sm text-slate-400">No follow-ups scheduled.</p>}
        <ul className="space-y-1">
          {followUps.map((r) => {
            const overdue = new Date(r.remindAt) < new Date();
            return (
              <li key={r.id} data-testid="client-followup-item" className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <span className={`font-semibold ${overdue ? 'text-rose-600' : 'text-slate-700'}`}>{formatWhen(r.remindAt)}{overdue ? ' · overdue' : ''}</span>
                  <span className="text-slate-500"> — {r.note}</span>
                </div>
                {canEdit && <button type="button" onClick={() => run(() => completeReminder(r.id, true))} className="shrink-0 text-xs font-semibold text-emerald-600 hover:text-emerald-700">Done</button>}
              </li>
            );
          })}
        </ul>
        {followOpen && (
          <form onSubmit={addFollowUp} className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input type="date" min={toDateInput(new Date())} value={followDate} onChange={(e) => setFollowDate(e.target.value)} aria-label="Follow-up date" data-testid="client-followup-date" className={inputClass} />
              <input value={followNote} onChange={(e) => setFollowNote(e.target.value)} placeholder="e.g. Check in about the proposal" aria-label="Follow-up note" data-testid="client-followup-note" className={`${inputClass} sm:col-span-2`} />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={followEmail} onChange={(e) => setFollowEmail(e.target.checked)} /> Email me when it's due</label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFollowOpen(false)} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="submit" disabled={saving || !followNote.trim()} data-testid="client-followup-save" className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40">Save follow-up</button>
            </div>
          </form>
        )}
      </div>

      <div>
        <h4 className="text-sm font-bold text-slate-700 mb-2">Notes</h4>
        {canEdit && (
          <form onSubmit={addNote} className="space-y-2 mb-3">
            <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={5000} placeholder="Add a note — call summary, preference, issue…" aria-label="New note" data-testid="client-note-input" className={inputClass} />
            <div className="flex flex-wrap items-center gap-3">
              <select value={draftType} onChange={(e) => setDraftType(e.target.value)} aria-label="Note type" data-testid="client-note-type" className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-600">
                {CLIENT_NOTE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={draftPinned} onChange={(e) => setDraftPinned(e.target.checked)} /> Pin to top</label>
              <button type="submit" disabled={saving || !draft.trim()} data-testid="client-note-add" className="ml-auto px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40">Add note</button>
            </div>
          </form>
        )}
        {loading ? <p className="text-sm text-slate-400">Loading…</p> : notes.length === 0 ? <p className="text-sm text-slate-400">No notes yet.</p> : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} data-testid="client-note-item" className="rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${TYPE_STYLES[n.type] || TYPE_STYLES.general}`}>{CLIENT_NOTE_TYPES.find((t) => t.value === n.type)?.label || 'General'}</span>
                  <span>{n.authorName || 'Unknown'} · {formatWhen(n.createdAt)}{n.updatedAt !== n.createdAt && new Date(n.updatedAt) - new Date(n.createdAt) > 1000 ? ' · edited' : ''}</span>
                  {n.pinned && <span title="Pinned">📌</span>}
                </div>
                {editingId === n.id ? (
                  <div className="mt-1 space-y-2">
                    <textarea rows={3} value={editBody} onChange={(e) => setEditBody(e.target.value)} maxLength={5000} aria-label="Edit note" className={inputClass} />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                      <button type="button" disabled={!editBody.trim()} onClick={() => run(async () => { await updateClientNote(clientId, n.id, { body: editBody }); setEditingId(null); })} className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40">Save</button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{n.body}</p>
                )}
                {canEdit && editingId !== n.id && (
                  <div className="mt-1 flex gap-3 text-xs font-semibold">
                    <button type="button" onClick={() => run(() => updateClientNote(clientId, n.id, { pinned: !n.pinned }))} className="text-slate-500 hover:text-amber-600">{n.pinned ? 'Unpin' : 'Pin'}</button>
                    {canModify(n) && <button type="button" onClick={() => { setEditingId(n.id); setEditBody(n.body); }} className="text-slate-500 hover:text-indigo-600">Edit</button>}
                    {canModify(n) && (confirmDeleteId === n.id ? (
                      <>
                        <button type="button" onClick={() => { setConfirmDeleteId(null); run(() => deleteClientNote(clientId, n.id)); }} className="text-red-600 hover:text-red-700">Confirm delete</button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-slate-500">Cancel</button>
                      </>
                    ) : <button type="button" onClick={() => setConfirmDeleteId(n.id)} className="text-slate-500 hover:text-red-600">Delete</button>)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
