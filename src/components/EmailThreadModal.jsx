import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import Modal from './ui/Modal';
import { getThread, markThreadRead, sendThreadedEmail, logManualContact } from '../lib/email/threads';
import { useToast } from './ui/Toast';
import { getMessagingProfile, sendSmsMessage, updateSmsConsent } from '../lib/messaging';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

const CONTACT_CHANNELS = ['Phone Call', 'Text Message', 'In Person', 'Other'];

const AI_CLASSIFICATION_BADGE = {
  confirmed: { label: 'AI: Confirmed', className: 'bg-emerald-100 text-emerald-700' },
  declined: { label: 'AI: Declined', className: 'bg-red-100 text-red-700' },
  ambiguous: { label: 'Needs Review', className: 'bg-amber-100 text-amber-700' },
};

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function EmailThreadModal({ open, onClose, eventId, contractorId, contractorEmail, contractorPhone, contractorSmsConsent = 'unknown', initialChannel = 'email', contractorLabel, fromName, onChanged, onOutreachSent }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [thread, setThread] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logChannel, setLogChannel] = useState(CONTACT_CHANNELS[0]);
  const [logNote, setLogNote] = useState('');
  const [logging, setLogging] = useState(false);
  const [channel, setChannel] = useState(initialChannel);
  const [messagingProfile, setMessagingProfile] = useState(null);
  const [smsConsent, setSmsConsent] = useState(contractorSmsConsent || 'unknown');

  useEffect(() => {
    if (!open) return;
    setReplyBody('');
    setChannel(initialChannel);
    setSmsConsent(contractorSmsConsent || 'unknown');
    setLogOpen(false);
    setLogChannel(CONTACT_CHANNELS[0]);
    setLogNote('');
    setLoading(true);
    (async () => {
      try {
        const [t, profile] = await Promise.all([getThread(eventId, contractorId), getMessagingProfile().catch(() => null)]);
        setThread(t);
        setMessagingProfile(profile);
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
      if (channel === 'sms') await sendSmsMessage({ eventId, contractorId, body: replyBody });
      else await sendThreadedEmail({ eventId, contractorId, contractorEmail, subject: replySubject, body: replyBody, fromName });
      setReplyBody('');
      const t = await getThread(eventId, contractorId);
      setThread(t);
      onChanged?.();
      onOutreachSent?.(channel);
      showToast(channel === 'sms' ? 'Text message sent' : 'Reply sent');
    } catch (err) {
      showToast(err.message || 'Failed to send reply', 'error');
    } finally {
      setSending(false);
    }
  }

  async function confirmSmsPermission() {
    try { await updateSmsConsent(contractorId, 'opted_in'); setSmsConsent('opted_in'); showToast('Text permission recorded'); }
    catch (error) { showToast(error.message || 'Unable to record permission', 'error'); }
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
      onOutreachSent?.('manual');
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
        {loading && <div data-testid="email-thread-loading-banner" className="text-sm text-slate-400 text-center py-6">Loading…</div>}

        {!loading && (!thread || thread.messages.length === 0) && (
          <div data-testid="email-thread-empty-banner" className="text-sm text-slate-400 text-center py-6">No contact logged yet.</div>
        )}

        {!loading && thread && thread.messages.length > 0 && (
          <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
            {thread.messages.map((m) => (
              m.direction === 'manual' ? (
                <div key={m.id} data-testid="email-thread-message" className="flex justify-center">
                  <div className="max-w-[85%] rounded-xl px-4 py-2 text-sm bg-amber-50 border border-amber-100 text-slate-700">
                    <div className="text-xs font-semibold text-amber-700 mb-1">📞 {m.subject}</div>
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    <div className="text-[10px] mt-1.5 text-slate-400 text-center">{formatTimestamp(m.createdAt)}</div>
                  </div>
                </div>
              ) : (
                <div key={m.id} data-testid="email-thread-message" className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                      m.direction === 'outbound' ? 'bg-indigo-100 text-slate-800' : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    <div className={`flex items-center gap-1.5 mb-1 ${m.direction === 'outbound' ? 'text-indigo-500' : 'opacity-70'}`}>
                      <span className="text-xs font-semibold">{m.channel === 'sms' ? 'SMS' : m.subject}</span>
                      {m.direction === 'inbound' && AI_CLASSIFICATION_BADGE[m.aiClassification] && (
                        <span
                          data-testid="email-thread-ai-classification-badge"
                          className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${AI_CLASSIFICATION_BADGE[m.aiClassification].className}`}
                        >
                          {AI_CLASSIFICATION_BADGE[m.aiClassification].label}
                        </span>
                      )}
                    </div>
                    <div className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(m.body) }} />
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
          <div className="mb-3 flex gap-2" role="group" aria-label="Reply channel"><button type="button" onClick={() => setChannel('email')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${channel === 'email' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Email</button><button type="button" onClick={() => setChannel('sms')} disabled={messagingProfile?.status !== 'active' || !contractorPhone} className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${channel === 'sms' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>SMS</button></div>
          {channel === 'sms' && smsConsent !== 'opted_in' && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{smsConsent === 'opted_out' ? 'This contractor has opted out. Gigworks will not send another text.' : <div className="flex flex-wrap items-center justify-between gap-2"><span>Before texting, confirm this contractor agreed to receive operational messages.</span><button type="button" onClick={confirmSmsPermission} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold">Record permission</button></div>}</div>}
          <textarea
            rows={3}
            placeholder={channel === 'sms' ? 'Write a text message…' : 'Write an email reply…'}
            maxLength={channel === 'sms' ? 1600 : undefined}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            data-testid="email-thread-reply-textarea"
            className={inputClass}
          />
          <div className="flex justify-between items-center mt-2">
            <button
              type="button"
              onClick={() => setLogOpen((v) => !v)}
              data-testid="email-thread-log-toggle-button"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100"
            >
              {logOpen ? 'Cancel log entry' : '+ Log a non-email contact'}
            </button>
            <button
              type="button"
              onClick={handleReply}
              disabled={sending || !replyBody.trim() || (channel === 'sms' && smsConsent !== 'opted_in')}
              data-testid="email-thread-reply-button"
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
            >
              {sending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              {channel === 'sms' ? 'Send text' : 'Reply'}
            </button>
          </div>

          {logOpen && (
            <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <select value={logChannel} onChange={(e) => setLogChannel(e.target.value)} data-testid="email-thread-log-channel-select" className={inputClass}>
                {CONTACT_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <textarea
                rows={2}
                placeholder="e.g. Called, confirmed load-in time"
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                data-testid="email-thread-log-note-textarea"
                className={inputClass}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleLogContact}
                  disabled={logging || !logNote.trim()}
                  data-testid="email-thread-log-submit-button"
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
