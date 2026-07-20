import { useEffect, useState } from 'react';
import { apiFetch } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';

export default function AdminSupportPage() {
  const [threads, setThreads] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [activeId, setActiveId] = useState(null);

  function load() {
    apiFetch('/admin/support/threads')
      .then((data) => setThreads(data.threads))
      .catch((err) => setLoadError(err.message));
  }

  useEffect(load, []);

  if (loadError) return <div className="text-sm text-red-600">{loadError}</div>;
  if (!threads) return <div className="text-sm text-slate-400">Loading…</div>;

  const active = threads.find((t) => t.id === activeId);

  return (
    <div className="max-w-5xl">
      <h2 className="text-2xl font-bold text-slate-800 mb-4">Support</h2>
      <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[400px]">
        <div className="w-72 shrink-0 bg-white rounded-xl border border-slate-200 overflow-y-auto">
          {threads.length === 0 && <div className="p-4 text-sm text-slate-400">No support threads yet.</div>}
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveId(t.id)}
              className={`w-full text-left px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 ${activeId === t.id ? 'bg-indigo-50' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800 truncate">{t.subject}</span>
                {t.unreadFromUser > 0 && (
                  <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {t.unreadFromUser}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {t.account.owner ? `${t.account.owner.firstName} ${t.account.owner.lastName}` : 'Unknown account'}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{t.status === 'closed' ? 'Closed' : 'Open'} · {new Date(t.lastMessageAt).toLocaleString()}</div>
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200">
          {active ? (
            <ThreadDetail thread={active} onChanged={load} />
          ) : (
            <div className="p-6 text-sm text-slate-400">Select a thread to view the conversation.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadDetail({ thread, onChanged }) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setDetail(null);
    apiFetch(`/admin/support/threads/${thread.id}`)
      .then((data) => setDetail(data.thread))
      .catch((err) => showToast(err.message, 'error'));
  }, [thread.id]);

  async function handleSend(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      const data = await apiFetch(`/admin/support/threads/${thread.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      setDetail((prev) => ({ ...prev, messages: [...prev.messages, data.message] }));
      setBody('');
      onChanged();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSending(false);
    }
  }

  async function toggleStatus() {
    const nextStatus = thread.status === 'closed' ? 'open' : 'closed';
    try {
      await apiFetch(`/admin/support/threads/${thread.id}`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
      showToast(nextStatus === 'closed' ? 'Thread closed' : 'Thread reopened');
      onChanged();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (!detail) return <div className="p-6 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <div className="font-bold text-slate-800">{detail.subject}</div>
          <div className="text-xs text-slate-500">{detail.account.owner?.email}</div>
        </div>
        <button type="button" onClick={toggleStatus} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
          {thread.status === 'closed' ? 'Reopen' : 'Close'}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
        {detail.messages.map((m) => (
          <div key={m.id} className={`flex ${m.direction === 'admin' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${m.direction === 'admin' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
              {m.body}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="flex gap-2 p-4 border-t border-slate-100">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Reply…"
          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <button type="submit" disabled={sending} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
          Send
        </button>
      </form>
    </div>
  );
}
