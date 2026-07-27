import { useState } from 'react';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

// Reverse-chronological audit trail — shared by the Proposal and Contract
// tabs in BookingFormPage.jsx. Mixes system-generated entries (sent,
// signed, edited) with free-text notes a business adds by hand, so "what
// changed, when, and by whom" lives in one place instead of two
// near-duplicate list renderers.
export default function EventLogPanel({ entries, labelForType, onAddNote, testIdPrefix }) {
  const [noteText, setNoteText] = useState('');
  const sorted = [...(entries || [])].sort((a, b) => new Date(b.at) - new Date(a.at));

  function handleAdd() {
    if (!noteText.trim()) return;
    onAddNote(noteText.trim());
    setNoteText('');
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Add a note — e.g. client asked to revise the pricing"
          data-testid={`${testIdPrefix}-note-input`}
          className={inputClass}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
        />
        <button
          type="button"
          onClick={handleAdd}
          data-testid={`${testIdPrefix}-note-add-button`}
          className="shrink-0 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
        >
          Add
        </button>
      </div>
      {sorted.length > 0 ? (
        <div className="space-y-2 max-h-72 overflow-y-auto border border-slate-200 rounded-lg px-3 py-2">
          {sorted.map((entry) => (
            <div key={entry.id} data-testid={`${testIdPrefix}-entry`} className="text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
              <div className="flex items-center justify-between gap-2 text-slate-700 font-semibold">
                <span>{labelForType(entry)}</span>
                <span className="text-xs font-normal text-slate-400 shrink-0">
                  {new Date(entry.at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              {entry.note && <div className="text-slate-600 mt-0.5">{entry.note}</div>}
              {entry.actorEmail && <div className="text-xs text-slate-400 mt-0.5">by {entry.actorEmail}</div>}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
          No activity logged yet.
        </div>
      )}
    </div>
  );
}
