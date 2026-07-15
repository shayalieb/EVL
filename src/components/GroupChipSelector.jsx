import { useState } from 'react';

export default function GroupChipSelector({
  groups, allOptions, activeGroup, onSelectGroup, onAddGroup, onRemoveGroup,
  emptyLabel = 'No groups yet', addLabel = 'Add group…',
}) {
  const [selectedToAdd, setSelectedToAdd] = useState('');
  const availableOptions = allOptions.filter((t) => !groups.includes(t));

  function handleAdd() {
    if (!selectedToAdd) return;
    onAddGroup(selectedToAdd);
    setSelectedToAdd('');
  }

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 flex-wrap">
        {groups.length === 0 && (
          <span className="px-3.5 py-1.5 text-sm text-slate-400">{emptyLabel}</span>
        )}
        {groups.map((g) => (
          <span key={g} className="inline-flex items-center">
            {onSelectGroup ? (
              <button
                type="button"
                onClick={() => onSelectGroup(g)}
                className={`pl-3.5 pr-1.5 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                  activeGroup === g ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {g}
              </button>
            ) : (
              <span className="pl-3.5 pr-1.5 py-1.5 text-sm font-semibold text-slate-700">{g}</span>
            )}
            <button
              type="button"
              onClick={() => onRemoveGroup(g)}
              className="pr-2.5 text-slate-300 hover:text-red-600"
              aria-label={`Remove ${g}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      {availableOptions.length > 0 && (
        <div className="flex items-center gap-1.5">
          <select
            value={selectedToAdd}
            onChange={(e) => setSelectedToAdd(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs"
          >
            <option value="">{addLabel}</option>
            {availableOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!selectedToAdd}
            className="px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-600 text-xs font-semibold hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add
          </button>
        </div>
      )}
    </div>
  );
}
