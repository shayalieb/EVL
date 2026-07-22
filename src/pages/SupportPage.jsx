import { useEffect, useState } from 'react';
import { apiFetch } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { FileIcon } from '../components/ui/icons';
import { sendSupportMessage, supportAttachmentDownloadUrl, formatFileSize } from '../lib/support';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const MAX_FILES = 3;

function PendingFiles({ files, onRemove }) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((f, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full bg-slate-100 text-xs text-slate-600">
          <FileIcon className="w-3.5 h-3.5 text-slate-400" />
          {f.name}
          <button type="button" onClick={() => onRemove(i)} className="w-4 h-4 flex items-center justify-center rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label={`Remove ${f.name}`}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

function MessageAttachments({ attachments, dark }) {
  if (!attachments?.length) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {attachments.map((a) => (
        <a
          key={a.id}
          href={supportAttachmentDownloadUrl(a.id)}
          target="_blank"
          rel="noreferrer"
          className={`flex items-center gap-1.5 text-xs underline ${dark ? 'text-indigo-100' : 'text-indigo-600'}`}
        >
          <FileIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{a.filename}</span>
          <span className="opacity-70 shrink-0">({formatFileSize(a.size)})</span>
        </a>
      ))}
    </div>
  );
}

function pickFiles(existing, incoming) {
  return [...existing, ...Array.from(incoming || [])].slice(0, MAX_FILES);
}

export default function SupportPage() {
  const { showToast } = useToast();
  const [threads, setThreads] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [startFiles, setStartFiles] = useState([]);
  const [replyBody, setReplyBody] = useState('');
  const [replyFiles, setReplyFiles] = useState([]);
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
      await sendSupportMessage('/support/threads', { subject, body, files: startFiles });
      setSubject('');
      setBody('');
      setStartFiles([]);
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
      await sendSupportMessage(`/support/threads/${thread.id}/messages`, { body: replyBody, files: replyFiles });
      setReplyBody('');
      setReplyFiles([]);
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
          <PendingFiles files={startFiles} onRemove={(i) => setStartFiles((prev) => prev.filter((_, idx) => idx !== i))} />
          <div className="flex items-center justify-between">
            <label className={`text-xs font-semibold cursor-pointer ${startFiles.length >= MAX_FILES ? 'text-slate-300 cursor-not-allowed' : 'text-indigo-600 hover:text-indigo-700'}`}>
              + Attach a file
              <input
                type="file"
                multiple
                disabled={startFiles.length >= MAX_FILES}
                onChange={(e) => { setStartFiles((prev) => pickFiles(prev, e.target.files)); e.target.value = ''; }}
                className="hidden"
              />
            </label>
            <button type="submit" disabled={sending} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
              {sending ? 'Sending…' : 'Send Message'}
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 flex flex-col h-[500px]">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="font-bold text-slate-800">{openThread.subject}</div>
            <div className="text-xs text-slate-500">{openThread.status === 'closed' ? 'Closed' : 'Open'}</div>
            {openThread.replyToAlias && (
              <div className="text-xs text-slate-400 mt-0.5">You can also reply from your email — just reply to our messages.</div>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
            {openThread.messages.map((m) => (
              <div key={m.id} className={`flex ${m.direction === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${m.direction === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                  {m.body}
                  <MessageAttachments attachments={m.attachments} dark={m.direction === 'user'} />
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={(e) => handleReply(openThread, e)} className="p-4 border-t border-slate-100 space-y-2">
            <PendingFiles files={replyFiles} onRemove={(i) => setReplyFiles((prev) => prev.filter((_, idx) => idx !== i))} />
            <div className="flex gap-2">
              <input
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Reply…"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              <label className={`px-3 py-2 rounded-lg border text-sm font-semibold cursor-pointer flex items-center ${replyFiles.length >= MAX_FILES ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>
                📎
                <input
                  type="file"
                  multiple
                  disabled={replyFiles.length >= MAX_FILES}
                  onChange={(e) => { setReplyFiles((prev) => pickFiles(prev, e.target.files)); e.target.value = ''; }}
                  className="hidden"
                />
              </label>
              <button type="submit" disabled={sending} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                Send
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
