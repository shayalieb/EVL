import { useEffect, useState } from 'react';
import { apiFetch } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export default function SupportPage() {
  const { showToast } = useToast();
  const [threads, setThreads] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);

  function load() {
    apiFetch('/support/threads')
      .then((data) => setThreads(data.threads))
      .catch((err) => setLoadError(err.message));
  }

  useEffect(load, []);

  async function handleStart(e) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    try {
      await apiFetch('/support/threads', { method: 'POST', body: JSON.stringify({ subject, body }) });
      setSubject('');
      setBody('');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSending(false);
    }
  }

  async function handleReply(thread, e) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setSending(true);
    try {
      await apiFetch(`/support/threads/${thread.id}/messages`, { method: 'POST', body: JSON.stringify({ body: replyBody }) });
      setReplyBody('');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSending(false);
    }
  }

  if (loadError) return <div className="text-sm text-red-600">{loadError}</div>;
  if (!threads) return <div className="text-sm text-slate-400">Loading…</div>;

  const openThread = threads.find((t) => t.status === 'open') || threads[0];

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-slate-800 mb-4">Help</h2>

      {!openThread ? (
        <form onSubmit={handleStart} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <p className="text-sm text-slate-500">Have an issue or a question? Send us a message and we'll get back to you.</p>
          <input required placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
          <textarea required placeholder="Describe your issue…" rows={4} value={body} onChange={(e) => setBody(e.target.value)} className={inputClass} />
          <button type="submit" disabled={sending} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
            {sending ? 'Sending…' : 'Send Message'}
          </button>
        </form>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 flex flex-col h-[500px]">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="font-bold text-slate-800">{openThread.subject}</div>
            <div className="text-xs text-slate-500">{openThread.status === 'closed' ? 'Closed' : 'Open'}</div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
            {openThread.messages.map((m) => (
              <div key={m.id} className={`flex ${m.direction === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${m.direction === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                  {m.body}
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={(e) => handleReply(openThread, e)} className="flex gap-2 p-4 border-t border-slate-100">
            <input
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Reply…"
              className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <button type="submit" disabled={sending} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
