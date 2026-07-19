import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import { getThread, markThreadRead, sendThreadedEmail, logManualContact } from '../lib/email/threads';
import { useToast } from './ui/Toast';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

const CONTACT_CHANNELS = ['Phone Call', 'Text Message', 'In Person', 'Other'];

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function EmailThreadModal({ open, onClose, eventId, contractorId, contractorEmail, contractorLabel, fromName, onChanged }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [thread, setThread] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logChannel, setLogChannel] = useState(CONTACT_CHANNELS[0]);
  const [logNote, setLogNote] = useState('');
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReplyBody('');
    setLogOpen(false);
    setLogChannel(CONTACT_CHANNELS[0]);
    setLogNote('');
    setLoading(true);
    (async () => {
      try {
        const t = await getThread(eventId, contractorId);
        setThread(t);
        if (t?.unreadCount > 0) {
          await markThreadRead(t.id);
          onChanged?.();
        }
      } catch (err) {
        showToast(err.message || 'Failed to load email history', 'error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventId, contractorId]);

  const lastSubject = thread?.messages?.[thread.messages.length - 1]?.subject;
  const replySubject = lastSubject ? (lastSubject.startsWith('Re: ') ? lastSubject : `Re: ${lastSubject}`) : 'Re:';

  async function handleReply() {
    if (!replyBody.trim() || sending) return;
    setSending(true);
    try {
      await sendThreadedEmail({
        eventId, contractorId, contractorEmail,
        subject: replySubject, body: replyBody, fromName,
      });
      setReplyBody('');
      const t = await getThread(eventId, contractorId);
      setThread(t);
      onChanged?.();
      showToast('Reply sent');
    } catch (err) {
      showToast(err.message || 'Failed to send reply', 'error');
    } finally {
      setSending(false);
    }
  }

  async function handleLogContact() {
    if (!logNote.trim() || logging) return;
    setLogging(true);
    try {
      await logManualContact({ eventId, contractorId, contractorEmail, channel: logChannel, note: logNote });
      setLogNote('');
      setLogOpen(false);
      const t = await getThread(eventId, contractorId);
      setThread(t);
      onChanged?.();
      showToast('Contact logged');
    } catch (err) {
      showToast(err.message || 'Failed to log contact', 'error');
    } finally {
      setLogging(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Communication log${contractorLabel ? ` — ${contractorLabel}` : ''}`} widthClass="max-w-2xl">
      <div className="space-y-4">
        {loading && <div className="text-sm text-slate-400 text-center py-6">Loading…</div>}

        {!loading && (!thread || thread.messages.length === 0) && (
          <div className="text-sm text-slate-400 text-center py-6">No contact logged yet.</div>
        )}

        {!loading && thread && thread.messages.length > 0 && (
          <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
            {thread.messages.map((m) => (
              m.direction === 'manual' ? (
                <div key={m.id} className="flex justify-center">
                  <div className="max-w-[85%] rounded-xl px-4 py-2 text-sm bg-amber-50 border border-amber-100 text-slate-700">
                    <div className="text-xs font-semibold text-amber-700 mb-1">📞 {m.subject}</div>
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    <div className="text-[10px] mt-1.5 text-slate-400 text-center">{formatTimestamp(m.createdAt)}</div>
                  </div>
                </div>
              ) : (
                <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                      m.direction === 'outbound' ? 'bg-indigo-100 text-slate-800' : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    <div className={`text-xs font-semibold mb-1 ${m.direction === 'outbound' ? 'text-indigo-500' : 'opacity-70'}`}>{m.subject}</div>
                    <div className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: m.body }} />
                    <div className={`text-[10px] mt-1.5 ${m.direction === 'outbound' ? 'text-indigo-400' : 'text-slate-400'}`}>
                      {formatTimestamp(m.createdAt)}
                    </div>
                  </div>
                </div>
              )
            ))}
          </div>
        )}

        <div className="border-t border-slate-100 pt-3">
          <textarea
            rows={3}
            placeholder="Write a reply…"
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            className={inputClass}
          />
          <div className="flex justify-between items-center mt-2">
            <button
              type="button"
              onClick={() => setLogOpen((v) => !v)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100"
            >
              {logOpen ? 'Cancel log entry' : '+ Log a non-email contact'}
            </button>
            <button
              type="button"
              onClick={handleReply}
              disabled={sending || !replyBody.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
            >
              {sending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              Reply
            </button>
          </div>

          {logOpen && (
            <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <select value={logChannel} onChange={(e) => setLogChannel(e.target.value)} className={inputClass}>
                {CONTACT_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <textarea
                rows={2}
                placeholder="e.g. Called, confirmed load-in time"
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                className={inputClass}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleLogContact}
                  disabled={logging || !logNote.trim()}
                  className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50 disabled:opacity-60 flex items-center gap-2"
                >
                  {logging && <span className="w-3.5 h-3.5 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />}
                  Log Contact
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
