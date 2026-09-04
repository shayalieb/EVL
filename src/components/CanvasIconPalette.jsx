import { useState } from 'react';

// Shared drag-source palette for canvas tools (Stage Plot today; Floor Plan
// could reuse this too) — groups icons by their `category` field with
// section headers, since a flat grid stopped being scannable once the
// stage-plot icon set grew past ~15 entries.
//
// Each tile supports two ways to place an icon: dragging it (native HTML5
// DnD, read by CanvasStage.jsx's onDrop) for desktop, and tapping it to
// "arm" it for click-to-place (onIconTap, read by CanvasStage's
// 'place-icon' mode) for anywhere drag-and-drop doesn't exist — which is
// every touch device, since native HTML5 DnD has no touch equivalent at
// all. `activeIconId` highlights whichever tile is currently armed.
//
// The category dropdown narrows the scroll list to one category at a time —
// added once Stage Plot's icon set grew past 60 entries across 14
// categories, at which point even the grouped/scrollable list got long
// enough that jumping straight to "Brass & Woodwind" beat scrolling past
// everything before it. Defaults to "All", so nothing changes for anyone
// who never touches it.
export default function CanvasIconPalette({ icons, title, testIdPrefix, onIconTap, activeIconId, creditNote }) {
  const categories = [...new Set(icons.map((i) => i.category))];
  const [activeCategory, setActiveCategory] = useState('All');
  const visibleCategories = activeCategory === 'All' ? categories : [activeCategory];

  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 mb-2">{title}</div>
      <select
        value={activeCategory}
        onChange={(e) => setActiveCategory(e.target.value)}
        data-testid={`${testIdPrefix}-category-select`}
        className="w-full mb-2 px-2 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600 bg-white"
      >
        <option value="All">All Categories</option>
        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
      </select>
      {onIconTap && (
        <p className="text-[10px] text-slate-400 mb-2 leading-snug">
          Drag an icon onto the plot, or tap one then tap the plot to place it.
        </p>
      )}
      <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
        {visibleCategories.map((category) => (
          <div key={category}>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{category}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {icons.filter((i) => i.category === category).map((iconDef) => (
                <div
                  key={iconDef.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/x-canvas-icon', iconDef.id)}
                  onClick={() => onIconTap?.(iconDef.id)}
                  data-testid={`${testIdPrefix}-${iconDef.id}`}
                  title={iconDef.label}
                  className={`flex flex-col items-center gap-1 px-1.5 py-2 rounded-lg border cursor-grab select-none hover:border-indigo-300 hover:bg-indigo-50 ${
                    iconDef.id === activeIconId ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <span className="w-7 h-7" dangerouslySetInnerHTML={{ __html: iconDef.svg }} />
                  <span className="text-[10px] text-center leading-tight text-slate-600">{iconDef.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {creditNote && <p className="text-[9px] text-slate-300 mt-2 leading-snug">{creditNote}</p>}
    </div>
  );
}
