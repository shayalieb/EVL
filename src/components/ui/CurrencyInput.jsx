import { useState } from 'react';
import { formatCurrency } from '../../lib/format';

export default function CurrencyInput({ value, onChange, className = '', ...props }) {
  const [focused, setFocused] = useState(false);
  const displayValue = focused ? value : (value === '' ? '' : formatCurrency(Number(value) || 0));

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={focused ? value : displayValue.replace(/^\$/, '')}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        className={`pl-6 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 ${className}`}
        {...props}
      />
    </div>
  );
}
