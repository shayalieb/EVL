// Renders one help article's `blocks` array (see src/lib/helpArticles.js for
// the shape) — a small fixed set of block types rather than a markdown
// parser, since the content is hand-authored data, not user input.
export default function HelpArticleContent({ blocks }) {
  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'h':
            return <h3 key={i} className="text-sm font-bold text-slate-800 pt-1">{block.text}</h3>;
          case 'p':
            return <p key={i} className="text-sm text-slate-600 leading-relaxed">{block.text}</p>;
          case 'steps':
            return (
              <ol key={i} className="space-y-2">
                {block.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2.5 text-sm text-slate-600 leading-relaxed">
                    <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center justify-center">{j + 1}</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            );
          case 'list':
            return (
              <ul key={i} className="space-y-1.5">
                {block.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-slate-600 leading-relaxed">
                    <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            );
          case 'tip':
            return (
              <div key={i} className="flex items-start gap-2 text-sm text-indigo-700 bg-indigo-50 rounded-lg px-3.5 py-2.5">
                <span aria-hidden="true">💡</span>
                <span>{block.text}</span>
              </div>
            );
          case 'note':
            return (
              <div key={i} className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 rounded-lg px-3.5 py-2.5">
                <span aria-hidden="true">⚠️</span>
                <span>{block.text}</span>
              </div>
            );
          case 'image':
            return (
              <figure key={i} className="!mt-5">
                <img
                  src={block.src}
                  alt={block.alt}
                  loading="lazy"
                  className="w-full rounded-lg border border-slate-200 shadow-sm"
                />
                {block.caption && (
                  <figcaption className="mt-1.5 text-xs text-slate-400 text-center">{block.caption}</figcaption>
                )}
              </figure>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
