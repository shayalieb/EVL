import { useEffect, useState } from 'react';
import Modal from './ui/Modal';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

export default function EmailPreviewModal({ open, onClose, recipientLabel, note, initialSubject, initialBody, sending, onConfirm }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (open) {
      setSubject(initialSubject || '');
      setBody(initialBody || '');
    }
  }, [open, initialSubject, initialBody]);

  function handleSubmit(e) {
    e.preventDefault();
    onConfirm({ subject, body });
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
          <textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} className={inputClass} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="submit"
            disabled={sending || !subject.trim() || !body.trim()}
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
