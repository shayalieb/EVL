import { useEffect, useRef, useState } from 'react';
import Modal from './ui/Modal';
import { askAssistant } from '../lib/assistant';
import { useToast } from './ui/Toast';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

// No persistence — the conversation lives only in this component's state
// and is gone once the modal closes. Good enough for "ask a quick
// question"; a real multi-session history would need a server-side model.
export default function AssistantModal({ open, onClose }) {
  const { showToast } = useToast();
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setMessages([]);
    setQuestion('');
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, asking]);

  async function handleAsk() {
    const trimmed = question.trim();
    if (!trimmed || asking) return;
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setQuestion('');
    setAsking(true);
    try {
      const answer = await askAssistant(trimmed, history);
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
    } catch (err) {
      showToast(err.message || 'The assistant is unavailable right now.', 'error');
      setMessages((prev) => prev.slice(0, -1));
      setQuestion(trimmed);
    } finally {
      setAsking(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="GigWorks Assistant" widthClass="max-w-2xl" testId="assistant-modal">
      <div className="space-y-4">
        {messages.length === 0 && (
          <div data-testid="assistant-empty-banner" className="text-sm text-slate-400 text-center py-6">
            Ask about your schedule, open proposals, overdue invoices, or a specific client.
          </div>
        )}

        {messages.length > 0 && (
          <div ref={listRef} className="max-h-96 overflow-y-auto space-y-3 pr-1">
            {messages.map((m, i) => (
              <div key={i} data-testid="assistant-message" className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-indigo-100 text-slate-800' : 'bg-slate-100 text-slate-800'}`}>
                  {m.content}
                </div>
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
            placeholder="e.g. What's on my schedule this week?"
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
      </div>
    </Modal>
  );
}
