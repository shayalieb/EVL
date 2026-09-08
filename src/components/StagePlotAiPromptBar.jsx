import { useState } from 'react';
import { SparkleIcon } from './ui/icons';

const inputClass = 'flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

// Natural-language shortcut for adding rows to the production/backline
// lists below — e.g. "Add 8pc drum mics". Submitting only proposes rows
// (see StagePlotProposalCard.jsx); nothing is added until the user confirms.
export default function StagePlotAiPromptBar({ onSubmit, loading }) {
  const [prompt, setPrompt] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    await onSubmit(trimmed);
    setPrompt('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
      <SparkleIcon className="h-4 w-4 shrink-0 text-indigo-500" />
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g. Add 8pc drum mics"
        disabled={loading}
        data-testid="stage-plot-ai-prompt-input"
        className={inputClass}
      />
      <button
        type="submit"
        disabled={loading || !prompt.trim()}
        data-testid="stage-plot-ai-prompt-submit-button"
        className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
      >
        {loading && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
        Ask AI
      </button>
    </form>
  );
}
