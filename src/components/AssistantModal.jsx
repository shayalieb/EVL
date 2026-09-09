import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './ui/Modal';
import AssistantActionCard from './AssistantActionCard';
import { askAssistant, confirmAssistantAction, listAssistantActivity, getAssistantMessages, clearAssistantMessages, getAssistantTrainingProgress, saveAssistantTrainingProgress } from '../lib/assistant';
import { relatedRecordPath } from '../lib/reminders';
import { useToast } from './ui/Toast';
import { useAuth } from '../context/AuthContext';
import { ASSISTANT_GUIDES } from '../lib/assistantGuides';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const STARTER_PROMPTS = ['What needs my attention this week?', 'Teach me how to create and send an invoice', 'Show my overdue invoices', 'How do I build a stage plot?'];

function formatActivityTime(iso) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Assistant answers use a deliberately small, safe subset of Markdown.
// Rendering tokens as React text/components keeps account content escaped
// while preventing formatting markers such as **Settings** from appearing
// literally in the conversation.
function InlineAssistantContent({ text }) {
  const parts = String(text || '').split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[0.9em] text-slate-800">{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function AssistantMessageContent({ content }) {
  const lines = String(content || '').split('\n');
  return <div className="space-y-1.5">{lines.map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={index} className="h-1" />;
    if (/^#{1,3}\s+/.test(trimmed)) return <p key={index} className="pt-1 font-bold text-slate-900"><InlineAssistantContent text={trimmed.replace(/^#{1,3}\s+/, '')} /></p>;
    const numbered = trimmed.match(/^(\d+)[.)]\s+(.+)/);
    if (numbered) return <div key={index} className="grid grid-cols-[1.5rem_1fr] gap-1"><span className="font-bold text-indigo-600">{numbered[1]}.</span><span><InlineAssistantContent text={numbered[2]} /></span></div>;
    const bullet = trimmed.match(/^[-*•]\s+(.+)/);
    if (bullet) return <div key={index} className="grid grid-cols-[1rem_1fr] gap-1"><span className="font-bold text-indigo-500">•</span><span><InlineAssistantContent text={bullet[1]} /></span></div>;
    return <p key={index}><InlineAssistantContent text={trimmed} /></p>;
  })}</div>;
}

// Chat history persists server-side for 7 days (AssistantMessage — see
// server/src/routes/assistant.js), private to whoever's logged in; loaded
// fresh each time this modal opens rather than kept alive in memory across
// closes. Reloaded messages are plain text only — a `pendingAction` is
// never reconstructed for one (re-showing a confirm button for a days-old
// proposal, e.g. a reschedule, could be actively wrong by the time someone
// clicks it), only messages from the *current* open session ever carry one.
// The Activity tab is a different, smaller thing: a durable audit trail of
// confirmed writes (AssistantAction rows), not chat transcripts.
//
// A message can carry a `pendingAction` (a proposed write, shown via
// AssistantActionCard, confirmed or dismissed independently — nothing is
// ever applied from this component without that explicit confirm) or a
// `link` (a plain navigation shortcut, no confirmation needed since
// nothing changes).
export default function AssistantModal({ open, onClose, initialView = 'chat', initialGuideId = null, onTrainingChanged = null }) {
  const { showToast } = useToast();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [confirmingIndex, setConfirmingIndex] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activeGuideId, setActiveGuideId] = useState(null);
  const [guideStep, setGuideStep] = useState(0);
  const [trainingProgress, setTrainingProgress] = useState([]);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [savingTraining, setSavingTraining] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setView(initialView);
    setActiveGuideId(initialGuideId);
    setGuideStep(0);
    setQuestion('');
    setMessagesLoading(true);
    getAssistantMessages()
      .then((list) => setMessages(list.map(({ role, content }) => ({ role, content }))))
      .catch(() => setMessages([]))
      .finally(() => setMessagesLoading(false));
    setTrainingLoading(true);
    getAssistantTrainingProgress()
      .then((list) => {
        setTrainingProgress(list);
        if (initialGuideId) {
          const guide = ASSISTANT_GUIDES.find((item) => item.id === initialGuideId);
          const completed = list.find((item) => item.guideId === initialGuideId)?.completedSteps || [];
          const nextStep = guide?.steps.findIndex((_, index) => !completed.includes(index)) ?? 0;
          setGuideStep(nextStep < 0 ? 0 : nextStep);
        }
      })
      .catch(() => setTrainingProgress([]))
      .finally(() => setTrainingLoading(false));
  }, [open, initialView, initialGuideId]);

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

  async function handleAsk(inputQuestion = question) {
    const trimmed = String(inputQuestion || '').trim();
    if (!trimmed || asking) return;
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setQuestion('');
    setAsking(true);
    try {
      const { answer, pendingAction, link } = await askAssistant(trimmed);
      setMessages((prev) => [...prev, { role: 'assistant', content: answer, pendingAction, link }]);
    } catch (err) {
      showToast(err.message || 'The assistant is unavailable right now.', 'error');
      setMessages((prev) => prev.slice(0, -1));
      setQuestion(trimmed);
    } finally {
      setAsking(false);
    }
  }

  async function handleConfirmAction(index, proposalId, clientChoice) {
    setConfirmingIndex(index);
    try {
      await confirmAssistantAction(proposalId, clientChoice);
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

  async function handleClearChat() {
    if (clearing || messages.length === 0) return;
    if (!window.confirm("Clear your chat history with the Assistant? This can't be undone.")) return;
    setClearing(true);
    try {
      await clearAssistantMessages();
      setMessages([]);
    } catch (err) {
      showToast(err.message || 'Failed to clear chat', 'error');
    } finally {
      setClearing(false);
    }
  }

  function goTo(recordType, recordId) {
    const path = relatedRecordPath({ relatedType: recordType, relatedId: recordId });
    if (path) { onClose(); navigate(path); }
  }

  const availableGuides = ASSISTANT_GUIDES.filter((guide) => !guide.permission || can(guide.permission));
  const activeGuide = availableGuides.find((guide) => guide.id === activeGuideId);

  function guideProgress(guideId) {
    return trainingProgress.find((item) => item.guideId === guideId) || { completedSteps: [], completedAt: null };
  }

  function openGuide(guide) {
    setActiveGuideId(guide.id);
    const completed = guideProgress(guide.id).completedSteps || [];
    setGuideStep(guide.steps.findIndex((_, index) => !completed.includes(index)) === -1 ? 0 : guide.steps.findIndex((_, index) => !completed.includes(index)));
  }

  async function updateGuideProgress(guide, completedSteps, completed = false) {
    setSavingTraining(true);
    try {
      const saved = await saveAssistantTrainingProgress(guide.id, { completedSteps, completed, clearDismissal: true });
      setTrainingProgress((previous) => [...previous.filter((item) => item.guideId !== guide.id), saved]);
      onTrainingChanged?.(saved);
      return saved;
    } catch (error) {
      showToast(error.message || 'Failed to save training progress.', 'error');
      return null;
    } finally {
      setSavingTraining(false);
    }
  }

  async function completeCurrentStep() {
    const completed = guideProgress(activeGuide.id).completedSteps || [];
    const nextCompleted = [...new Set([...completed, guideStep])].sort((a, b) => a - b);
    const guideDone = nextCompleted.length === activeGuide.steps.length;
    const saved = await updateGuideProgress(activeGuide, nextCompleted, guideDone);
    if (!saved) return;
    if (guideDone) {
      showToast('Guide completed. Nice work!');
      setActiveGuideId(null);
    } else {
      const nextStep = activeGuide.steps.findIndex((_, index) => !nextCompleted.includes(index));
      setGuideStep(nextStep);
    }
  }

  function openTrainingStep(step) {
    onClose();
    navigate(step.path);
  }

  function askAboutStep(step) {
    setView('chat');
    handleAsk(`Teach me how to ${step.title.toLowerCase()}. Give me the exact steps and explain why each one matters.`);
  }

  return (
    <Modal open={open} onClose={onClose} title="GigWorks Assistant" widthClass="max-w-2xl" testId="assistant-modal">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 -mt-1 pb-3">
          <div className="flex gap-1" role="tablist" aria-label="Assistant view">
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
              aria-selected={view === 'learn'}
              onClick={() => setView('learn')}
              data-testid="assistant-tab-learn"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${view === 'learn' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              Learn
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
          {view === 'chat' && messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearChat}
              disabled={clearing}
              data-testid="assistant-clear-chat-button"
              className="text-xs font-semibold text-slate-400 hover:text-red-600 disabled:opacity-60"
            >
              Clear chat
            </button>
          )}
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
        ) : view === 'learn' ? (
          <div className="max-h-[32rem] overflow-y-auto pr-1" data-testid="assistant-learn-panel">
            {trainingLoading ? <div className="py-8 text-center text-sm text-slate-400">Loading your training…</div> : !activeGuide ? (
              <div>
                <div className="mb-4">
                  <h3 className="font-bold text-slate-800">Guided training</h3>
                  <p className="mt-1 text-sm text-slate-500">Choose a real workflow. GigWorks will take you through it in the right order.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {availableGuides.map((guide) => {
                    const progress = guideProgress(guide.id);
                    const count = progress.completedSteps?.length || 0;
                    return (
                    <button key={guide.id} type="button" onClick={() => openGuide(guide)} className="rounded-xl border border-slate-200 p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/40" data-testid="assistant-guide-card">
                      <div className="font-semibold text-slate-800">{guide.title}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">{guide.description}</div>
                      <div className={`mt-3 text-[11px] font-semibold uppercase tracking-wide ${progress.completedAt ? 'text-emerald-700' : 'text-indigo-600'}`}>{progress.completedAt ? 'Completed ✓' : count ? `${count} of ${guide.steps.length} complete · Resume` : `${guide.steps.length} steps · ${guide.duration}`}</div>
                    </button>
                  );})}
                </div>
              </div>
            ) : (
              <div>
                <button type="button" onClick={() => setActiveGuideId(null)} className="mb-3 text-xs font-semibold text-indigo-600 hover:underline">← All guides</button>
                <h3 className="font-bold text-slate-800">{activeGuide.title}</h3>
                <p className="mt-1 text-sm text-slate-500">Step {guideStep + 1} of {activeGuide.steps.length} · {guideProgress(activeGuide.id).completedSteps?.length || 0} complete</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${((guideProgress(activeGuide.id).completedSteps?.length || 0) / activeGuide.steps.length) * 100}%` }} /></div>
                <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4" data-testid="assistant-guide-step">
                  <div className="text-xs font-bold uppercase tracking-wide text-indigo-600">Current step</div>
                  <div className="mt-1 font-bold text-slate-800">{activeGuide.steps[guideStep].title}</div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{activeGuide.steps[guideStep].description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => openTrainingStep(activeGuide.steps[guideStep])} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">Open this step →</button>
                    <button type="button" onClick={() => askAboutStep(activeGuide.steps[guideStep])} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Ask Assistant</button>
                    {!guideProgress(activeGuide.id).completedSteps?.includes(guideStep) && <button type="button" onClick={completeCurrentStep} disabled={savingTraining} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60">{savingTraining ? 'Saving…' : 'Mark complete & continue'}</button>}
                  </div>
                </div>
                <ol className="mt-4 space-y-2">
                  {activeGuide.steps.map((step, index) => (
                    <li key={step.title}><button type="button" onClick={() => setGuideStep(index)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${index === guideStep ? 'bg-slate-100 font-semibold text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${guideProgress(activeGuide.id).completedSteps?.includes(index) ? 'bg-emerald-100 text-emerald-700' : index === guideStep ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{guideProgress(activeGuide.id).completedSteps?.includes(index) ? '✓' : index + 1}</span>{step.title}</button></li>
                  ))}
                </ol>
                <div className="mt-4 flex justify-between">
                  <button type="button" onClick={() => setGuideStep((step) => Math.max(0, step - 1))} disabled={guideStep === 0} className="text-xs font-semibold text-slate-500 disabled:opacity-40">← Previous</button>
                  <button type="button" onClick={() => setGuideStep((step) => Math.min(activeGuide.steps.length - 1, step + 1))} disabled={guideStep === activeGuide.steps.length - 1} className="text-xs font-semibold text-indigo-600 disabled:opacity-40">Next step →</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {messagesLoading && <div data-testid="assistant-messages-loading" className="text-sm text-slate-400 text-center py-6">Loading…</div>}

            {!messagesLoading && messages.length === 0 && (
              <div data-testid="assistant-empty-banner" className="text-sm text-slate-400 text-center py-6">
                <p>Ask about your work, request a safe change, or use the Assistant as a step-by-step training guide.</p>
                <div className="mt-4 grid gap-2 text-left sm:grid-cols-2">{STARTER_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => handleAsk(prompt)} className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">{prompt}</button>)}</div>
              </div>
            )}

            {!messagesLoading && messages.length > 0 && (
              <div ref={listRef} className="max-h-96 overflow-y-auto space-y-3 pr-1">
                {messages.map((m, i) => (
                  <div key={i} data-testid="assistant-message" className={`flex flex-col gap-2 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {m.content && (
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-indigo-100 text-slate-800' : 'bg-slate-100 text-slate-800'}`}>
                        <AssistantMessageContent content={m.content} />
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
                          onConfirm={(proposalId, clientChoice) => handleConfirmAction(i, proposalId, clientChoice)}
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
                  onClick={() => handleAsk()}
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
