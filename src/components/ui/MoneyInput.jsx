import { useState } from 'react';

// Dollar amount input — shows a fixed "$" prefix and comma-formats the value
// once you click away, while staying a plain editable number while focused.
// `value`/`onChange` are the raw numeric string the rest of the form already
// expects (e.g. "1500" or ""), same contract as a bare <input type="number">.
export default function MoneyInput({ value, onChange, placeholder, className = '' }) {
  const [focused, setFocused] = useState(false);

  const displayValue = focused || value === '' || value === null || value === undefined
    ? value ?? ''
    : Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, '');
          // Keep only the first decimal point — a stray extra one otherwise
          // makes Number(raw) resolve to NaN downstream.
          const firstDot = raw.indexOf('.');
          const cleaned = firstDot === -1 ? raw : raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
          onChange(cleaned);
        }}
        className={`${className} pl-6`}
      />
    </div>
  );
}
