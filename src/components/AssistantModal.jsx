import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './ui/Modal';
import AssistantActionCard from './AssistantActionCard';
import { askAssistant, confirmAssistantAction, listAssistantActivity } from '../lib/assistant';
import { relatedRecordPath } from '../lib/reminders';
import { useToast } from './ui/Toast';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

function formatActivityTime(iso) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// No persistence — the chat conversation lives only in this component's
// state and is gone once the modal closes. Good enough for "ask a quick
// question"; a real multi-session *conversation* history would need a
// server-side model of its own. The Activity tab is a different, smaller
// thing: a durable audit trail of confirmed writes (AssistantAction rows),
// not chat transcripts — see server/src/routes/assistant.js's
// GET /activity.
//
// A message can carry a `pendingAction` (a proposed write, shown via
// AssistantActionCard, confirmed or dismissed independently — nothing is
// ever applied from this component without that explicit confirm) or a
// `link` (a plain navigation shortcut, no confirmation needed since
// nothing changes).
export default function AssistantModal({ open, onClose }) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [view, setView] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [confirmingIndex, setConfirmingIndex] = useState(null);
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setView('chat');
    setMessages([]);
    setQuestion('');
  }, [open]);

  useEffect(() => {
    if (!open || view !== 'activity') return;
    let cancelled = false;
    setActivityLoading(true);
    listAssistantActivity()
      .then((list) => { if (!cancelled) setActivity(list); })
      .catch((err) => { if (!cancelled) showToast(err.message || 'Failed to load activity', 'error'); })
      .finally(() => { if (!cancelled) setActivityLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, asking]);

  async function handleAsk() {
    const trimmed = question.trim();
    if (!trimmed || asking) return;
    const history = messages.filter((m) => m.content).map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setQuestion('');
    setAsking(true);
    try {
      const { answer, pendingAction, link } = await askAssistant(trimmed, history);
      setMessages((prev) => [...prev, { role: 'assistant', content: answer, pendingAction, link }]);
    } catch (err) {
      showToast(err.message || 'The assistant is unavailable right now.', 'error');
      setMessages((prev) => prev.slice(0, -1));
      setQuestion(trimmed);
    } finally {
      setAsking(false);
    }
  }

  async function handleConfirmAction(index, type, fields, description) {
    setConfirmingIndex(index);
    try {
      await confirmAssistantAction(type, fields, description);
      setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, pendingAction: { ...m.pendingAction, done: true } } : m)));
      showToast('Done.');
    } catch (err) {
      showToast(err.message || 'Failed to complete that action.', 'error');
    } finally {
      setConfirmingIndex(null);
    }
  }

  function handleDismissAction(index) {
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, pendingAction: { ...m.pendingAction, dismissed: true } } : m)));
  }

  function goTo(recordType, recordId) {
    const path = relatedRecordPath({ relatedType: recordType, relatedId: recordId });
    if (path) { onClose(); navigate(path); }
  }

  return (
    <Modal open={open} onClose={onClose} title="GigWorks Assistant" widthClass="max-w-2xl" testId="assistant-modal">
      <div className="space-y-4">
        <div className="flex gap-1 border-b border-slate-100 -mt-1 pb-3" role="tablist" aria-label="Assistant view">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'chat'}
            onClick={() => setView('chat')}
            data-testid="assistant-tab-chat"
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${view === 'chat' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'activity'}
            onClick={() => setView('activity')}
            data-testid="assistant-tab-activity"
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${view === 'activity' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Activity
          </button>
        </div>

        {view === 'activity' ? (
          <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
            {activityLoading && <div data-testid="assistant-activity-loading" className="text-sm text-slate-400 text-center py-6">Loading…</div>}
            {!activityLoading && activity.length === 0 && (
              <div data-testid="assistant-activity-empty" className="text-sm text-slate-400 text-center py-6">Nothing yet — confirmed actions will show up here.</div>
            )}
            {!activityLoading && activity.map((a) => (
              <div key={a.id} data-testid="assistant-activity-row" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="text-sm text-slate-700">{a.description}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-slate-400">{formatActivityTime(a.createdAt)}</span>
                  {a.targetType && a.targetId && (
                    <button type="button" onClick={() => goTo(a.targetType, a.targetId)} className="text-xs font-semibold text-indigo-600 hover:underline">
                      View →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {messages.length === 0 && (
              <div data-testid="assistant-empty-banner" className="text-sm text-slate-400 text-center py-6">
                Ask about your schedule, open proposals, overdue invoices, a client, or a contractor — ask it to create a reminder, add a client, or update a booking — or ask "how do I..." for training and getting-started help.
              </div>
            )}

            {messages.length > 0 && (
              <div ref={listRef} className="max-h-96 overflow-y-auto space-y-3 pr-1">
                {messages.map((m, i) => (
                  <div key={i} data-testid="assistant-message" className={`flex flex-col gap-2 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {m.content && (
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-indigo-100 text-slate-800' : 'bg-slate-100 text-slate-800'}`}>
                        {m.content}
                      </div>
                    )}
                    {m.link && (
                      <button
                        type="button"
                        onClick={() => goTo(m.link.recordType, m.link.recordId)}
                        data-testid="assistant-link-button"
                        className="text-xs font-semibold text-indigo-600 hover:underline"
                      >
                        View {m.link.label} →
                      </button>
                    )}
                    {m.pendingAction && !m.pendingAction.done && !m.pendingAction.dismissed && (
                      <div className="w-full max-w-[85%]">
                        <AssistantActionCard
                          pendingAction={m.pendingAction}
                          confirming={confirmingIndex === i}
                          onConfirm={(type, fields) => handleConfirmAction(i, type, fields, m.pendingAction.description)}
                          onDismiss={() => handleDismissAction(i)}
                        />
                      </div>
                    )}
                    {m.pendingAction?.done && <div className="text-xs text-slate-400">✓ Done</div>}
                    {m.pendingAction?.dismissed && <div className="text-xs text-slate-400">Dismissed</div>}
                  </div>
                ))}
                {asking && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl px-4 py-2.5 text-sm bg-slate-100 text-slate-400">Thinking…</div>
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-slate-100 pt-3">
              <textarea
                rows={2}
                placeholder="e.g. Remind me to follow up with Jamie next week"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
                data-testid="assistant-input-textarea"
                className={inputClass}
              />
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={handleAsk}
                  disabled={asking || !question.trim()}
                  data-testid="assistant-send-button"
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
                >
                  {asking && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                  Ask
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
