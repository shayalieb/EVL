export default function FilterSelect({ value, onChange, options, allLabel = 'All', className = '' }) {
  const active = value !== '';
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`px-3 py-2 rounded-lg border text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 ${
        active ? 'border-indigo-300 bg-indigo-50 text-indigo-700 font-medium' : 'border-slate-300 bg-white text-slate-600'
      } ${className}`}
    >
      <option value="">{allLabel}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
