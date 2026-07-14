export default function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`px-3.5 py-1.5 rounded-md text-sm font-semibold transition-colors ${
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
