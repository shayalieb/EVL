import { SearchIcon } from './icons';

export default function SearchInput({ value, onChange, placeholder = 'Search…', className = '', testId }) {
  return (
    <div className={`relative ${className}`}>
      <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        data-testid={testId}
        className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          data-testid={testId ? `${testId}-clear-button` : undefined}
          className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  );
}
