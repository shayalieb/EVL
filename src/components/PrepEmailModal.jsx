import { useEffect, useRef, useState } from 'react';
import Modal from './ui/Modal';
import RichTextToolbar from './ui/RichTextToolbar';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';
// The body is HTML (the rendered prep sheet) — edit it as a rendered
// WYSIWYG preview via contentEditable rather than showing raw markup in a
// textarea, which non-technical users can't be expected to hand-edit.
const bodyEditableClass = 'w-full min-h-[220px] max-h-[420px] overflow-y-auto px-3.5 py-3 rounded-lg border border-slate-300 text-sm bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PrepEmailModal({ open, onClose, prepContractors, documents, initialSubject, initialBody, sending, onConfirm }) {
  const [subject, setSubject] = useState('');
  const [hasBody, setHasBody] = useState(false);
  const bodyRef = useRef(null);
  const [recipientIds, setRecipientIds] = useState([]);
  const [documentIds, setDocumentIds] = useState([]);

  useEffect(() => {
    if (open) {
      setSubject(initialSubject || '');
      if (bodyRef.current) bodyRef.current.innerHTML = initialBody || '';
      setHasBody(!!initialBody?.trim());
      setRecipientIds([]);
      setDocumentIds([]);
    }
  }, [open, initialSubject, initialBody]);

  function handleBodyInput() {
    setHasBody(!!bodyRef.current?.textContent?.trim());
  }

  function toggleRecipient(id) {
    setRecipientIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function toggleDocument(id) {
    setDocumentIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (recipientIds.length === 0) return;
    onConfirm({ subject, body: bodyRef.current?.innerHTML || '', recipientIds, documentIds });
  }

  return (
    <Modal open={open} onClose={onClose} title="Email Prep Sheet" widthClass="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Recipients</label>
          {prepContractors.length === 0 ? (
            <p className="text-sm text-slate-400">Add a group to the prep sheet first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {prepContractors.map((c) => (
                <label
                  key={c.contractorId}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${
                    recipientIds.includes(c.contractorId) ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={recipientIds.includes(c.contractorId)}
                    onChange={() => toggleRecipient(c.contractorId)}
                    className="sr-only"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          )}
        </div>

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

        {documents.length > 0 && (
          <div>
            <label className={labelClass}>Attach Documents</label>
            <div className="space-y-1">
              {documents.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={documentIds.includes(d.id)} onChange={() => toggleDocument(d.id)} />
                  {d.filename} <span className="text-xs text-slate-400">({formatSize(d.size)})</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="submit"
            disabled={sending || !subject.trim() || !hasBody || recipientIds.length === 0}
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
