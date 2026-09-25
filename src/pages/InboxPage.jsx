import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { API_BASE, apiFetch, csrfHeader, useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';

const fieldClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const buttonClass = 'rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50';
const notifyCounts = () => window.dispatchEvent(new Event('inbox-changed'));

function RecordPicker({ type, value, onChange }) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      apiFetch(`/${type}?page=1&pageSize=20&search=${encodeURIComponent(search)}`)
        .then((data) => { if (active) { setItems(data[type]?.items || []); setError(''); } })
        .catch(() => { if (active) setError('Could not load records.'); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [type, search]);
  const label = type === 'clients' ? 'client' : 'booking';
  return <div className="flex flex-wrap items-center gap-2">
    <input aria-label={`Search ${type}`} placeholder={`Find ${label}`} className={`${fieldClass} w-40`} value={search} onChange={(e) => setSearch(e.target.value)} />
    <select aria-label={`Linked ${label}`} className={`${fieldClass} max-w-64`} value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">No {label} linked</option>
      {value && !items.some((item) => item.id === value) && <option value={value}>Current {label}</option>}
      {items.map((item) => <option key={item.id} value={item.id}>{type === 'clients' ? `${item.firstName} ${item.lastName}` : item.eventName || 'Untitled booking'}</option>)}
    </select>
    {value && <Link className="text-sm text-indigo-600" to={type === 'clients' ? `/clients?open=${encodeURIComponent(value)}` : `/bookings/${encodeURIComponent(value)}`}>Open {label} ↗</Link>}
    {error && <span className="text-xs text-red-600">{error}</span>}
  </div>;
}

export default function InboxPage() {
  const { currentUser, updateCurrentUser, can } = useAuth();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('thread');
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const [threads, setThreads] = useState([]);
  const [thread, setThread] = useState(null);
  const [view, setView] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [olderMessages, setOlderMessages] = useState(false);
  const [address, setAddress] = useState(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const fileInput = useRef(null);
  const listRequest = useRef(0);

  const loadList = useCallback(async () => {
    const request = ++listRequest.current;
    const query = new URLSearchParams({ page, search, unread: view === 'unread', archived: view === 'archived' });
    const data = await apiFetch(`/inbox?${query}`);
    if (request !== listRequest.current) return;
    setThreads(data.threads); setHasMore(data.hasMore); setAddress(data.receivingAddress); setTrackingActive(data.replyTrackingActive); setError('');
  }, [page, search, view]);
  useEffect(() => {
    let active = true;
    const load = () => loadList().catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    const delay = setTimeout(load, 200);
    const interval = setInterval(load, 60000);
    return () => { active = false; clearTimeout(delay); clearInterval(interval); };
  }, [loadList]);

  const loadThread = useCallback(async (id) => {
    const data = await apiFetch(`/inbox/${encodeURIComponent(id)}`);
    if (selectedRef.current !== id) return;
    setThread((previous) => {
      if (previous?.id !== id) return data.thread;
      const messages = new Map(previous.messages.map((m) => [m.id, m]));
      data.thread.messages.forEach((m) => messages.set(m.id, m));
      return { ...data.thread, messages: [...messages.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) };
    });
    setOlderMessages(data.hasMore);
    const unreadIds = data.thread.messages.filter((m) => m.direction === 'inbound' && !m.readAt).map((m) => m.id);
    if (unreadIds.length) {
      await apiFetch(`/inbox/${encodeURIComponent(id)}/read`, { method: 'POST', body: JSON.stringify({ messageIds: unreadIds }) });
      notifyCounts();
      setThreads((previous) => previous.map((t) => t.id === id ? { ...t, unreadCount: Math.max(0, t.unreadCount - unreadIds.length) } : t));
    }
  }, []);
  useEffect(() => {
    setThread(null); setDraft(''); setFiles([]);
    if (fileInput.current) fileInput.current.value = '';
    if (!selectedId) { setLoadingThread(false); return; }
    setLoadingThread(true);
    loadThread(selectedId).catch((e) => { if (selectedRef.current === selectedId) showToast(e.message, 'error'); }).finally(() => { if (selectedRef.current === selectedId) setLoadingThread(false); });
    const timer = setInterval(() => loadThread(selectedId).catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, [selectedId, loadThread, showToast]);

  async function updateThread(patch) {
    try {
      const data = await apiFetch(`/inbox/${encodeURIComponent(thread.id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
      setThread((t) => ({ ...t, ...data.thread })); await loadList(); notifyCounts();
    } catch (e) { showToast(e.message, 'error'); }
  }
  async function sendReply(e) {
    e.preventDefault();
    if (files.length > 3 || files.some((file) => file.size > 5 * 1024 * 1024)) return showToast('Attach at most 3 files, up to 5 MB each.', 'error');
    setSending(true);
    const id = thread.id;
    try {
      const data = new FormData(); data.append('body', draft); files.forEach((file) => data.append('attachments', file));
      const response = await fetch(`${API_BASE}/inbox/${encodeURIComponent(id)}/reply`, { method: 'POST', credentials: 'include', headers: csrfHeader(), body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Reply failed.');
      if (selectedRef.current === id) { setDraft(''); setFiles([]); if (fileInput.current) fileInput.current.value = ''; }
      await loadThread(id); await loadList(); showToast('Reply sent');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setSending(false); }
  }
  async function download(attachment) {
    try {
      const data = await apiFetch(`/inbox/${encodeURIComponent(thread.id)}/attachments/${encodeURIComponent(attachment.id)}`);
      const link = document.createElement('a');
      let blobUrl;
      if (data.base64) { blobUrl = URL.createObjectURL(new Blob([Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0))], { type: 'application/octet-stream' })); link.href = blobUrl; }
      else { link.href = data.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      link.download = data.filename; link.click();
      if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (e) { showToast(e.message, 'error'); }
  }
  async function loadOlder() {
    try {
      const data = await apiFetch(`/inbox/${encodeURIComponent(thread.id)}?before=${encodeURIComponent(thread.messages[0].createdAt)}`);
      setThread((t) => ({ ...t, messages: [...data.thread.messages, ...t.messages] })); setOlderMessages(data.hasMore);
      const messageIds = data.thread.messages.filter((m) => m.direction === 'inbound' && !m.readAt).map((m) => m.id);
      if (messageIds.length) { await apiFetch(`/inbox/${encodeURIComponent(thread.id)}/read`, { method: 'POST', body: JSON.stringify({ messageIds }) }); notifyCounts(); }
    } catch (e) { showToast(e.message, 'error'); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap justify-between items-start gap-3">
      <div><h1 className="text-2xl font-bold text-slate-800">Inbox</h1><p className="text-sm text-slate-500 mt-1">Shared conversations with your clients and contacts.</p></div>
      <button className={buttonClass} onClick={() => loadList().then(() => selectedId && loadThread(selectedId)).catch((e) => setError(e.message))}>Refresh</button>
    </div>
    <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
      {address ? <>Receive new emails at <strong>{address}</strong>. Replies to GigWorks emails also appear here.</> : <>Set up a receiving domain in <Link className="underline" to="/settings?tab=emailDomain">Email Domain settings</Link> to receive new emails. {trackingActive ? 'Tracked replies are active through GigWorks.' : 'Reply tracking is not configured yet.'}</>}
      <p className="mt-1 text-xs text-indigo-700">Event-specific contractor conversations remain in Contact History.</p>
    </div>
    {can('manageSettings') && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={currentUser.inboxSettings?.emailNotifications !== false} onChange={(e) => updateCurrentUser({ inboxSettings: { ...currentUser.inboxSettings, emailNotifications: e.target.checked } })} />Email the account owner when new messages arrive</label>}
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid lg:grid-cols-[320px_minmax(0,1fr)] rounded-xl border border-slate-200 bg-white overflow-hidden min-h-[540px]">
      <section aria-label="Conversations" className="border-b lg:border-b-0 lg:border-r border-slate-200">
        <div className="p-3 space-y-2 border-b border-slate-100">
          <input className={`${fieldClass} w-full`} aria-label="Search inbox" placeholder="Search email or subject" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          <div className="flex gap-1">{[['all', 'All'], ['unread', 'Unread'], ['archived', 'Archived']].map(([key, label]) => <button key={key} aria-pressed={view === key} className={`rounded-md px-3 py-1.5 text-sm ${view === key ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500'}`} onClick={() => { setView(key); setPage(0); }}>{label}</button>)}</div>
        </div>
        {loading ? <p className="p-5 text-sm text-slate-500">Loading conversations…</p> : !threads.length ? <p className="p-5 text-sm text-slate-500">No conversations here yet.</p> : threads.map((t) => <button key={t.id} className={`w-full text-left p-4 border-b border-slate-100 ${selectedId === t.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`} disabled={sending} onClick={() => { if (!draft || window.confirm('Discard your unsent reply?')) setParams({ thread: t.id }); }}>
          <div className="flex items-center gap-2"><span className={`truncate text-sm ${t.unreadCount ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{t.contactEmail}</span>{t.unreadCount > 0 && <span className="ml-auto rounded-full bg-indigo-600 text-white px-2 text-xs" aria-label={`${t.unreadCount} unread`}>{t.unreadCount}</span>}</div>
          <div className="truncate text-sm mt-1 text-slate-700">{t.subject}</div><div className="text-xs text-slate-400 mt-1">{new Date(t.lastMessageAt).toLocaleString()}</div>
        </button>)}
        {(page > 0 || hasMore) && <div className="flex justify-between p-3"><button className={buttonClass} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button><button className={buttonClass} disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>Next</button></div>}
      </section>
      <section aria-label="Selected conversation" className="min-w-0">
        {loadingThread ? <p className="p-8 text-slate-500">Loading conversation…</p> : !thread ? <div className="p-10 text-center text-slate-400">Select a conversation to read or reply.</div> : <>
          <div className="p-4 border-b border-slate-200 space-y-3"><div className="flex justify-between gap-3"><div className="min-w-0"><h2 className="font-semibold text-slate-800 break-words">{thread.subject}</h2><p className="text-sm text-slate-500 break-all">{thread.contactEmail}</p></div><button className={buttonClass} onClick={() => updateThread({ archived: !thread.archivedAt })}>{thread.archivedAt ? 'Restore' : 'Archive'}</button></div>
            {thread.contractorId && <Link className="block text-sm text-indigo-600" to={`/contractors?open=${encodeURIComponent(thread.contractorId)}`}>Open contractor ↗</Link>}
            {thread.eventId && <Link className="block text-sm text-indigo-600" to={`/events/${encodeURIComponent(thread.eventId)}`}>Open event ↗</Link>}
            <RecordPicker type="clients" value={thread.clientId} onChange={(clientId) => updateThread({ clientId })} />
            <RecordPicker type="bookings" value={thread.bookingId} onChange={(bookingId) => updateThread({ bookingId })} />
          </div>
          <div className="p-4 space-y-4 max-h-[540px] overflow-y-auto">{olderMessages && <button className={buttonClass} onClick={loadOlder}>Load older messages</button>}{thread.messages.map((m) => <article key={m.id} className={`rounded-xl border p-4 ${m.direction === 'outbound' ? 'bg-slate-50 border-slate-200' : 'bg-white border-indigo-100'}`}>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500 mb-3"><span className="break-all">{m.direction === 'outbound' ? 'Sent' : 'From'}: {m.fromAddress}</span><span>{new Date(m.createdAt).toLocaleString()} · {m.deliveryStatus}</span></div>
            <div className="text-sm text-slate-700 break-words [&_a]:text-indigo-600 [&_a]:underline [&_table]:max-w-full" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(m.body, { FORBID_TAGS: ['img', 'style', 'iframe', 'form'], FORBID_ATTR: ['style'] }) }} />
            {m.attachments?.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{m.attachments.map((a) => <button key={a.id} className={`${buttonClass} max-w-full truncate`} onClick={() => download(a)}>↓ {a.filename} ({Math.ceil(a.size / 1024)} KB)</button>)}</div>}
          </article>)}</div>
          <form onSubmit={sendReply} className="p-4 border-t border-slate-200 space-y-3">
            <label className="block text-sm text-slate-600">Reply to {thread.contactEmail}<textarea aria-label="Reply message" className={`${fieldClass} block w-full mt-2 min-h-28`} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={50000} disabled={sending || !trackingActive} required /></label>
            <div className="flex flex-wrap justify-between items-center gap-3"><label className="text-xs text-slate-500">Attachments · up to 3 files, 5 MB each<input ref={fileInput} type="file" multiple disabled={sending} className="block mt-1 text-xs max-w-64" onChange={(e) => setFiles(Array.from(e.target.files || []))} /></label><button type="submit" className="rounded-lg bg-indigo-600 text-white text-sm font-semibold px-5 py-2 disabled:opacity-50" disabled={sending || !draft.trim() || !trackingActive}>{sending ? 'Sending…' : 'Send reply'}</button></div>
          </form>
        </>}
      </section>
    </div>
  </div>;
}
