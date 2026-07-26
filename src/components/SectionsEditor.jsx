import { useState } from 'react';
import { uid } from '../lib/storage';

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

// A custom section = a title (rendered as a highlighted separator bar in the
// PDF) plus an optional short value and/or a longer free-text block — used
// for both the Proposal and Contract composers (BookingFormPage.jsx) and
// their saved templates (settings/TemplatesTab.jsx) so any of them can
// carry arbitrary extra content (riders, policies, custom line notes)
// beyond their fixed fields.
export default function SectionsEditor({ sections, onChange }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [value, setValue] = useState('');

  function handleAdd() {
    if (!title.trim()) return;
    onChange([...sections, { id: uid('section'), title: title.trim(), text: text.trim(), value: value.trim() }]);
    setTitle('');
    setText('');
    setValue('');
  }

  function handleRemove(id) {
    onChange(sections.filter((s) => s.id !== id));
  }

  function handleUpdate(id, field, val) {
    onChange(sections.map((s) => (s.id === id ? { ...s, [field]: val } : s)));
  }

  return (
    <div>
      <label className={labelClass}>Custom Sections</label>
      {sections.length > 0 && (
        <div className="space-y-2 mb-3">
          {sections.map((s) => (
            <div key={s.id} data-testid="booking-form-section-row" className="border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={s.title}
                  onChange={(e) => handleUpdate(s.id, 'title', e.target.value)}
                  placeholder="Section title"
                  data-testid="booking-form-section-title-input"
                  className={`${inputClass} font-semibold`}
                />
                <button
                  type="button"
                  onClick={() => handleRemove(s.id)}
                  data-testid="booking-form-section-remove-button"
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                  aria-label={`Remove ${s.title || 'section'}`}
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <textarea
                  rows={2}
                  value={s.text}
                  onChange={(e) => handleUpdate(s.id, 'text', e.target.value)}
                  placeholder="Text (optional)"
                  data-testid="booking-form-section-text-textarea"
                  className={inputClass}
                />
                <input
                  value={s.value}
                  onChange={(e) => handleUpdate(s.id, 'value', e.target.value)}
                  placeholder="Value (optional)"
                  data-testid="booking-form-section-value-input"
                  className={inputClass}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="border border-dashed border-slate-300 rounded-lg p-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New section title" data-testid="booking-form-section-new-title-input" className={`${inputClass} mb-2`} />
        <div className="grid grid-cols-2 gap-2 mb-2">
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Text (optional)" data-testid="booking-form-section-new-text-textarea" className={inputClass} />
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value (optional)" data-testid="booking-form-section-new-value-input" className={inputClass} />
        </div>
        <button type="button" onClick={handleAdd} data-testid="booking-form-section-add-button" className="px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50">+ Add Section</button>
      </div>
    </div>
  );
}
