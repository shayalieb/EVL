import { useState } from 'react';
import Modal from './ui/Modal';
import { useData } from '../context/DataContext';
import { computeOfferingTotal } from '../lib/offerings';
import { formatCurrency as currency } from '../lib/format';

export default function OfferingPickerModal({ open, onClose, onSelect }) {
  const { offerings } = useData();
  const [query, setQuery] = useState('');
  const filtered = offerings.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()));

  function handleSelect(offering) {
    onSelect(offering);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Offering">
      <div className="space-y-3">
        {offerings.length > 0 && (
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search offerings…"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        )}
        {offerings.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-8">
            No offerings yet. Add one from the Offerings page first.
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-8">No offerings match &ldquo;{query}&rdquo;.</div>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-1.5">
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => handleSelect(o)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-left"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{o.name}</div>
                  <div className="text-xs text-slate-400">{o.type === 'perUnit' ? 'Per Unit' : 'General'}</div>
                </div>
                <div className="text-sm font-semibold text-slate-600 shrink-0">{currency(computeOfferingTotal(o))}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
