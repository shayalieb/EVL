import { useRef } from 'react';

export default function Tabs({ tabs, activeTab, onChange }) {
  const tabRefs = useRef([]);

  function handleKeyDown(event, index) {
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100" role="tablist">
      {tabs.map((tab, index) => (
        <button
          ref={(node) => { tabRefs.current[index] = node; }}
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          role="tab"
          aria-selected={activeTab === tab.id}
          tabIndex={activeTab === tab.id ? 0 : -1}
          data-testid={`tabs-tab-${tab.id}-button`}
          className={`min-h-11 px-3.5 py-2 rounded-md text-sm font-semibold transition-colors ${
            activeTab === tab.id
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
