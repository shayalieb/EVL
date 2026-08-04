import { useEffect, useRef, useState } from 'react';
import Modal from './ui/Modal';
import RichTextToolbar from './ui/RichTextToolbar';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';
// The body is HTML (the rendered set list) — edit it as a rendered WYSIWYG
// preview via contentEditable, same shape as PrepEmailModal.jsx.
const bodyEditableClass = 'w-full min-h-[220px] max-h-[420px] overflow-y-auto px-3.5 py-3 rounded-lg border border-slate-300 text-sm bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

// Recipients are the event's booked band members (not filtered to any
// prep-group subset, unlike PrepEmailModal) — a set list is relevant to
// whoever's playing, not just whoever's on the prep sheet's crew list. No
// separate document picker: sheet music already attached to this set
// list's songs rides along automatically, same "no extra checkbox" pattern
// EventFormPage's Requests-attached documents already use.
export default function SetListEmailModal({ open, onClose, bandMembers, initialSubject, initialBody, sending, onConfirm }) {
  const [subject, setSubject] = useState('');
  const [hasBody, setHasBody] = useState(false);
  const bodyRef = useRef(null);
  const [recipientIds, setRecipientIds] = useState([]);

  useEffect(() => {
    if (open) {
      setSubject(initialSubject || '');
      if (bodyRef.current) bodyRef.current.innerHTML = initialBody || '';
      setHasBody(!!initialBody?.trim());
      setRecipientIds([]);
    }
  }, [open, initialSubject, initialBody]);

  function handleBodyInput() {
    setHasBody(!!bodyRef.current?.textContent?.trim());
  }

  function toggleRecipient(id) {
    setRecipientIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (recipientIds.length === 0) return;
    onConfirm({ subject, body: bodyRef.current?.innerHTML || '', recipientIds });
  }

  return (
    <Modal open={open} onClose={onClose} title="Email Set List" widthClass="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Recipients</label>
          {bandMembers.length === 0 ? (
            <p className="text-sm text-slate-400">No band members with an email are booked on this event yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {bandMembers.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${
                    recipientIds.includes(c.id) ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={recipientIds.includes(c.id)}
                    onChange={() => toggleRecipient(c.id)}
                    data-testid="setlist-email-recipient-checkbox"
                    className="sr-only"
                  />
                  {c.firstName} {c.lastName}
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="setlist-email-subject-input" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Body</label>
          <RichTextToolbar editorRef={bodyRef} onFormat={handleBodyInput} />
          <div
            ref={bodyRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleBodyInput}
            data-testid="setlist-email-body-input"
            className={bodyEditableClass}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} data-testid="setlist-email-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="submit"
            disabled={sending || !subject.trim() || !hasBody || recipientIds.length === 0}
            data-testid="setlist-email-send-button"
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
