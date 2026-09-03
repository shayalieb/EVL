import { useEffect, useRef, useState } from 'react';
import { stagePlotNotesToPlainText } from '../lib/stagePlotNotes';

// Plain-text notes editor shared by the Production and Backline lists.
// Legacy rich-text values are flattened on open so previously saved notes
// remain readable while the unreliable contentEditable toolbar is retired.
export default function CanvasNotesPopover({ initialHtml, onCommit, onClose, testIdPrefix = 'canvas-notes-popover' }) {
  const editorRef = useRef(null);
  const [notes, setNotes] = useState(() => stagePlotNotesToPlainText(initialHtml));

  useEffect(() => {
    const raf = requestAnimationFrame(() => editorRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  function commitAndClose() {
    onCommit(notes.trim());
    onClose();
  }

  return (
    <div
      className="absolute z-20 right-0 mt-1 bg-white rounded-lg border border-slate-300 shadow-lg p-3 w-72"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) commitAndClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') commitAndClose(); }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-slate-500">Notes</span>
        <button type="button" onClick={commitAndClose} data-testid={`${testIdPrefix}-done-button`} className="text-xs font-semibold text-indigo-600">Done</button>
      </div>
      <textarea
        ref={editorRef}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Add plain-text notes…"
        rows={5}
        data-testid={`${testIdPrefix}-editor`}
        className="w-full resize-y px-2.5 py-2 rounded border border-slate-300 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
    </div>
  );
}
