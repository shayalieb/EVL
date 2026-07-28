import { useEffect, useState } from 'react';
import { apiFetch, useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import SearchInput from '../../components/ui/SearchInput';
import FilterSelect from '../../components/ui/FilterSelect';
import { matchesSearch } from '../../lib/search';
import { FileIcon } from '../../components/ui/icons';
import { sendSupportMessage, supportAttachmentDownloadUrl, formatFileSize } from '../../lib/support';

const MAX_FILES = 3;

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: '#94a3b8' },
  { value: 'normal', label: 'Normal', color: '#64748b' },
  { value: 'high', label: 'High', color: '#f59e0b' },
  { value: 'urgent', label: 'Urgent', color: '#ef4444' },
];
const PRIORITY_INFO = Object.fromEntries(PRIORITY_OPTIONS.map((p) => [p.value, p]));

function PriorityBadge({ priority }) {
  if (!priority || priority === 'normal') return null;
  const info = PRIORITY_INFO[priority];
  if (!info) return null;
  return (
    <span
      className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
      style={{ backgroundColor: `${info.color}22`, color: info.color }}
    >
      {info.label}
    </span>
  );
}

function pickFiles(existing, incoming) {
  return [...existing, ...Array.from(incoming || [])].slice(0, MAX_FILES);
}

function PendingFiles({ files, onRemove }) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((f, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full bg-slate-100 text-xs text-slate-600">
          <FileIcon className="w-3.5 h-3.5 text-slate-400" />
          {f.name}
          <button type="button" onClick={() => onRemove(i)} data-testid="admin-support-pending-file-remove-button" className="w-4 h-4 flex items-center justify-center rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label={`Remove ${f.name}`}>
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
          href={supportAttachmentDownloadUrl(a.id, { admin: true })}
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

export default function AdminSupportPage() {
  const { currentUser } = useAuth();
  const [threads, setThreads] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [assignableAdmins, setAssignableAdmins] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [replyFilter, setReplyFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');

  function load() {
    apiFetch('/admin/support/threads')
      .then((data) => setThreads(data.threads))
      .catch((err) => setLoadError(err.message));
  }

  useEffect(load, []);
  useEffect(() => {
    apiFetch('/admin/support/assignable-admins')
      .then((data) => setAssignableAdmins(data.admins))
      .catch(() => {});
  }, []);

  if (loadError) return <div data-testid="admin-support-load-error-banner" className="text-sm text-red-600">{loadError}</div>;
  if (!threads) return <div className="text-sm text-slate-400">Loading…</div>;

  const active = threads.find((t) => t.id === activeId);
  const hasFilters = !!(search || statusFilter || replyFilter || priorityFilter || assignedFilter);
  const filteredThreads = threads.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (replyFilter === 'needs-reply' && !(t.unreadFromUser > 0)) return false;
    if (replyFilter === 'read' && t.unreadFromUser > 0) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    if (assignedFilter === 'mine' && t.assignedAdminId !== currentUser?.id) return false;
    if (assignedFilter === 'unassigned' && t.assignedAdminId) return false;
    return matchesSearch(search, [t.subject, t.account.owner?.firstName, t.account.owner?.lastName]);
  });

  return (
    <div className="max-w-5xl">
      <h2 className="text-2xl font-bold text-slate-800 mb-4">Support</h2>
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search threads…" className="w-64" testId="admin-support-search-input" />
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          allLabel="All Statuses"
          options={[
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
          ]}
          testId="admin-support-status-filter"
        />
        <FilterSelect
          value={priorityFilter}
          onChange={setPriorityFilter}
          allLabel="All Priorities"
          options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
          testId="admin-support-priority-filter"
        />
        <FilterSelect
          value={assignedFilter}
          onChange={setAssignedFilter}
          allLabel="Anyone"
          options={[
            { value: 'mine', label: 'Assigned to Me' },
            { value: 'unassigned', label: 'Unassigned' },
          ]}
          testId="admin-support-assigned-filter"
        />
        <FilterSelect
          value={replyFilter}
          onChange={setReplyFilter}
          allLabel="All Threads"
          options={[
            { value: 'needs-reply', label: 'Needs Reply' },
            { value: 'read', label: 'Read' },
          ]}
          testId="admin-support-reply-filter"
        />
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(''); setStatusFilter(''); setReplyFilter(''); setPriorityFilter(''); setAssignedFilter(''); }}
            data-testid="admin-support-clear-filters-button"
            className="text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex gap-4 h-[calc(100vh-270px)] min-h-[400px]">
        <div className="w-72 shrink-0 bg-white rounded-xl border border-slate-200 overflow-y-auto">
          {filteredThreads.length === 0 && (
            <div className="p-4 text-sm text-slate-400">
              {threads.length === 0 ? 'No support threads yet.' : 'No threads match your search or filters.'}
            </div>
          )}
          {filteredThreads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveId(t.id)}
              data-testid="admin-support-thread-row"
              className={`w-full text-left px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 ${activeId === t.id ? 'bg-indigo-50' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800 truncate">{t.subject}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <PriorityBadge priority={t.priority} />
                  {t.unreadFromUser > 0 && (
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {t.unreadFromUser}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-xs text-slate-500 truncate">
                {t.account.owner ? `${t.account.owner.firstName} ${t.account.owner.lastName}` : 'Unknown account'}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {t.status === 'closed' ? 'Closed' : 'Open'} · {new Date(t.lastMessageAt).toLocaleString()}
                {t.assignedAdmin && ` · ${t.assignedAdmin.firstName}`}
              </div>
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200">
          {active ? (
            <ThreadDetail thread={active} assignableAdmins={assignableAdmins} onChanged={load} />
          ) : (
            <div className="p-6 text-sm text-slate-400">Select a thread to view the conversation.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadDetail({ thread, assignableAdmins, onChanged }) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('messages');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    setDetail(null);
    setTab('messages');
    apiFetch(`/admin/support/threads/${thread.id}`)
      .then((data) => {
        setDetail(data.thread);
        if (thread.unreadFromUser > 0) {
          apiFetch(`/admin/support/threads/${thread.id}/read`, { method: 'PATCH' })
            .then(onChanged)
            .catch(() => {});
        }
      })
      .catch((err) => showToast(err.message, 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  async function handleSend(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      const data = await sendSupportMessage(`/admin/support/threads/${thread.id}/messages`, { body, files });
      setDetail((prev) => ({ ...prev, messages: [...prev.messages, data.message] }));
      setBody('');
      setFiles([]);
      onChanged();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSending(false);
    }
  }

  async function handleAddNote(e) {
    e.preventDefault();
    if (!noteBody.trim()) return;
    setSavingNote(true);
    try {
      const data = await apiFetch(`/admin/support/threads/${thread.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: noteBody }),
      });
      setDetail((prev) => ({ ...prev, notes: [...prev.notes, data.note] }));
      setNoteBody('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSavingNote(false);
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

  async function handlePriorityChange(priority) {
    try {
      await apiFetch(`/admin/support/threads/${thread.id}`, { method: 'PATCH', body: JSON.stringify({ priority }) });
      setDetail((prev) => ({ ...prev, priority }));
      onChanged();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleAssigneeChange(assignedAdminId) {
    try {
      const data = await apiFetch(`/admin/support/threads/${thread.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedAdminId: assignedAdminId || null }),
      });
      setDetail((prev) => ({ ...prev, assignedAdminId: data.assignedAdminId, assignedAdmin: data.assignedAdmin }));
      onChanged();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (!detail) return <div className="p-6 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-wrap gap-2">
        <div>
          <div className="font-bold text-slate-800">{detail.subject}</div>
          <div className="text-xs text-slate-500">{detail.account.owner?.email}</div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={detail.priority || 'normal'}
            onChange={(e) => handlePriorityChange(e.target.value)}
            data-testid="admin-support-priority-select"
            className="text-xs px-2 py-1.5 rounded-lg border border-slate-300 text-slate-600"
          >
            {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select
            value={detail.assignedAdminId || ''}
            onChange={(e) => handleAssigneeChange(e.target.value)}
            data-testid="admin-support-assignee-select"
            className="text-xs px-2 py-1.5 rounded-lg border border-slate-300 text-slate-600 max-w-[140px]"
          >
            <option value="">Unassigned</option>
            {assignableAdmins.map((a) => <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>)}
          </select>
          <button type="button" onClick={toggleStatus} data-testid="admin-support-toggle-status-button" className="text-xs font-semibold text-slate-500 hover:text-slate-700">
            {thread.status === 'closed' ? 'Reopen' : 'Close'}
          </button>
        </div>
      </div>

      <div className="flex border-b border-slate-100 px-5">
        <button
          type="button"
          onClick={() => setTab('messages')}
          data-testid="admin-support-messages-tab"
          className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === 'messages' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          Messages
        </button>
        <button
          type="button"
          onClick={() => setTab('notes')}
          data-testid="admin-support-notes-tab"
          className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center gap-1.5 ${tab === 'notes' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          Notes
          {detail.notes.length > 0 && <span className="text-[10px]">({detail.notes.length})</span>}
        </button>
      </div>

      {tab === 'messages' ? (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
            {detail.messages.map((m) => (
              <div key={m.id} className={`flex ${m.direction === 'admin' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${m.direction === 'admin' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                  {m.body}
                  <MessageAttachments attachments={m.attachments} dark={m.direction === 'admin'} />
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSend} className="p-4 border-t border-slate-100 space-y-2">
            <PendingFiles files={files} onRemove={(i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))} />
            <div className="flex gap-2">
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Reply…"
                data-testid="admin-support-reply-input"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              <label className={`px-3 py-2 rounded-lg border text-sm font-semibold cursor-pointer flex items-center ${files.length >= MAX_FILES ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>
                📎
                <input
                  type="file"
                  multiple
                  disabled={files.length >= MAX_FILES}
                  onChange={(e) => { setFiles((prev) => pickFiles(prev, e.target.files)); e.target.value = ''; }}
                  data-testid="admin-support-reply-file-input"
                  className="hidden"
                />
              </label>
              <button type="submit" disabled={sending} data-testid="admin-support-reply-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                Send
              </button>
            </div>
          </form>
        </>
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
            <p className="text-xs text-slate-400">Internal notes — visible to admins only, never shown to the account.</p>
            {detail.notes.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No notes yet.</div>}
            {detail.notes.map((n) => (
              <div key={n.id} className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                <div className="text-xs font-semibold text-amber-700">{n.author.firstName} {n.author.lastName}</div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap break-words mt-0.5">{n.body}</div>
                <div className="text-[10px] text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddNote} className="flex gap-2 p-4 border-t border-slate-100">
            <input
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Add an internal note…"
              data-testid="admin-support-note-input"
              className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
            <button type="submit" disabled={savingNote} data-testid="admin-support-note-submit-button" className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-60">
              Add
            </button>
          </form>
        </>
      )}
    </div>
  );
}
