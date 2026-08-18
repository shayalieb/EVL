import { useEffect, useRef } from 'react';
import RichTextToolbar from './ui/RichTextToolbar';

// Rich-text notes editor shown as a small popover anchored to whatever
// triggered it (a table cell's "Notes" button, an icon on the canvas) —
// shared by StagePlotBacklineList.jsx and StagePlotChannelList.jsx so both
// edit rich text the same, safe way. contentEditable isn't a controlled
// input, so its content has to be set imperatively when it opens (same
// pattern as CanvasStage.jsx's icon-notes popup and PrepEmailModal.jsx's
// body editor) — commit reads editorRef.current.innerHTML directly, never
// a derived/stripped preview string, so formatting round-trips intact.
// Only one of these is ever open at a time per list, so there's no need
// for callers to manage per-row editor refs themselves.
export default function CanvasNotesPopover({ initialHtml, onCommit, onClose, testIdPrefix = 'canvas-notes-popover' }) {
  const editorRef = useRef(null);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialHtml || '';
    const raf = requestAnimationFrame(() => editorRef.current?.focus());
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RichTextToolbar requires onFormat but this popover has no live preview
  // to refresh — commitAndClose reads editorRef directly when it matters.
  function handleInput() {}

  function commitAndClose() {
    onCommit(editorRef.current?.innerHTML || '');
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
      <RichTextToolbar editorRef={editorRef} onFormat={handleInput} />
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-testid={`${testIdPrefix}-editor`}
        className="w-full min-h-[70px] max-h-40 overflow-y-auto px-2 py-1.5 rounded border border-slate-300 text-sm outline-none focus:border-indigo-400"
      />
    </div>
  );
}
