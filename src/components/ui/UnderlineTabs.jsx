import { useRef } from 'react';

const tabClass = (selected) => `shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px flex items-center gap-2 ${
  selected ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
}`;

// The page-section strip used on bookings, events and settings. `tabs` switch what is shown below and are announced as
// tabs (selected state, arrow keys). `tools` are different: they open something on top of the page (a full-screen
// editor, a history popup), so they sit apart on the right, look like buttons, and say they open a dialog. Mixing
// the two in one row made every "tab" look like it behaved the same way.
export default function UnderlineTabs({ label, tabs, active, onSelect, tools = [] }) {
  const listRef = useRef(null);
  const selectedId = tabs.some((tab) => tab.id === active) ? active : tabs[0]?.id;

  function handleKeyDown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const items = [...listRef.current.querySelectorAll('[role="tab"]')];
    const index = items.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
    items[next].click();
  }

  return (
    <div className="mb-6 sm:flex sm:items-end sm:border-b sm:border-slate-200">
      <div className="flex overflow-x-auto border-b border-slate-200 sm:min-w-0 sm:flex-1 sm:border-b-0">
        <div role="tablist" aria-label={label} ref={listRef} onKeyDown={handleKeyDown} className="flex">
          {tabs.map((tab) => {
            const selected = tab.id === selectedId;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => onSelect(tab.id)}
                data-testid={tab.testId}
                className={tabClass(selected)}
              >
                {tab.label}
                {tab.badge}
              </button>
            );
          })}
        </div>
      </div>
      {tools.length > 0 && (
        // Under the tabs on a phone (where a right-hand group would fall off the edge unseen), beside them on wider screens.
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0 sm:shrink-0 sm:pb-1.5 sm:pl-4">
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              aria-haspopup="dialog"
              onClick={tool.onClick}
              data-testid={tool.testId}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 sm:py-1.5"
            >
              {tool.label}
              <span aria-hidden="true" className="text-slate-400">↗</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
