import { useCallback, useEffect, useState } from 'react';

const buttonClass = 'w-7 h-7 rounded text-sm text-slate-700 hover:bg-slate-100';
const activeClass = 'bg-indigo-100 text-indigo-700 hover:bg-indigo-100';

export default function RichTextToolbar({ editorRef, onFormat }) {
  const [active, setActive] = useState({ bold: false, italic: false, underline: false });

  // Reflects the format at the current cursor/selection so a toggled style
  // (e.g. Bold) visibly stays "on" while the user keeps typing, instead of
  // looking like a one-off action with no lasting state.
  const refreshActive = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
    setActive({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    });
  }, [editorRef]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.addEventListener('keyup', refreshActive);
    el.addEventListener('mouseup', refreshActive);
    el.addEventListener('focus', refreshActive);
    document.addEventListener('selectionchange', refreshActive);
    return () => {
      el.removeEventListener('keyup', refreshActive);
      el.removeEventListener('mouseup', refreshActive);
      el.removeEventListener('focus', refreshActive);
      document.removeEventListener('selectionchange', refreshActive);
    };
  }, [editorRef, refreshActive]);

  function applyFormat(command, value) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false, value);
    onFormat();
    refreshActive();
  }

  return (
    <div className="flex items-center gap-1 mb-1.5">
      <button type="button" title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('bold')} className={`${buttonClass} font-bold ${active.bold ? activeClass : ''}`}>B</button>
      <button type="button" title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('italic')} className={`${buttonClass} italic ${active.italic ? activeClass : ''}`}>I</button>
      <button type="button" title="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('underline')} className={`${buttonClass} underline ${active.underline ? activeClass : ''}`}>U</button>
      <div className="w-px h-4 bg-slate-200 mx-1" />
      <button type="button" title="Smaller text" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('fontSize', '2')} className={`${buttonClass} text-xs`}>A-</button>
      <button type="button" title="Larger text" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('fontSize', '5')} className={`${buttonClass} text-base`}>A+</button>
    </div>
  );
}
