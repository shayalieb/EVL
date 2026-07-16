import { useEffect, useRef, useState } from 'react';
import Modal from './ui/Modal';
import RichTextToolbar from './ui/RichTextToolbar';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';
// The body is HTML (merge-rendered templates) — edit it as a rendered
// WYSIWYG preview via contentEditable rather than showing raw markup in a
// textarea, which non-technical users can't be expected to hand-edit.
const bodyEditableClass = 'w-full min-h-[220px] max-h-[420px] overflow-y-auto px-3.5 py-3 rounded-lg border border-slate-300 text-sm bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export default function EmailPreviewModal({ open, onClose, recipientLabel, note, initialSubject, initialBody, sending, onConfirm }) {
  const [subject, setSubject] = useState('');
  const [hasBody, setHasBody] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (open) {
      setSubject(initialSubject || '');
      if (bodyRef.current) bodyRef.current.innerHTML = initialBody || '';
      setHasBody(!!initialBody?.trim());
    }
  }, [open, initialSubject, initialBody]);

  function handleBodyInput() {
    setHasBody(!!bodyRef.current?.textContent?.trim());
  }

  function handleSubmit(e) {
    e.preventDefault();
    onConfirm({ subject, body: bodyRef.current?.innerHTML || '' });
  }

  return (
    <Modal open={open} onClose={onClose} title={`Preview email${recipientLabel ? ` — ${recipientLabel}` : ''}`} widthClass="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {note && (
          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{note}</div>
        )}

        <div>
          <label className={labelClass}>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Body</label>
          <RichTextToolbar editorRef={bodyRef} onFormat={handleBodyInput} />
          <div
            ref={bodyRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleBodyInput}
            className={bodyEditableClass}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="submit"
            disabled={sending || !subject.trim() || !hasBody}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
          >
            {sending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            Send
          </button>
        </div>
      </form>
    </Modal>
  );
}
