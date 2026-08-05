// Shared drag-source palette for canvas tools (Stage Plot today; Floor Plan
// could reuse this too) — groups icons by their `category` field with
// section headers, since a flat grid stopped being scannable once the
// stage-plot icon set grew past ~15 entries. Each icon tile is the actual
// drag source (native HTML5 DnD, read by CanvasStage.jsx's onDrop).
export default function CanvasIconPalette({ icons, title, testIdPrefix }) {
  const categories = [...new Set(icons.map((i) => i.category))];

  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 mb-2">{title}</div>
      <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
        {categories.map((category) => (
          <div key={category}>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{category}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {icons.filter((i) => i.category === category).map((iconDef) => (
                <div
                  key={iconDef.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/x-canvas-icon', iconDef.id)}
                  data-testid={`${testIdPrefix}-${iconDef.id}`}
                  title={iconDef.label}
                  className="flex flex-col items-center gap-1 px-1.5 py-2 rounded-lg border border-slate-200 bg-slate-50 cursor-grab select-none hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <span className="w-7 h-7" dangerouslySetInnerHTML={{ __html: iconDef.svg }} />
                  <span className="text-[10px] text-center leading-tight text-slate-600">{iconDef.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
