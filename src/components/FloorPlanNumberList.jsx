const cellInputClass = 'w-full px-1.5 py-1 rounded border border-transparent hover:border-slate-200 focus:border-indigo-400 text-xs bg-transparent';

// A numbered legend tying each placed item to a name/description note — the
// floor-plan equivalent of Stage Plot's production list, but with no separate
// table: number/name/description live directly on the scene element (see
// sceneModel.js), so this is purely a view over scene.elements plus the
// callbacks FloorPlanPageEditor.jsx already has in scope for mutating them.
export default function FloorPlanNumberList({ elements, selectedElementId, onSelectElement, onAssignNumber, onUpdateElement, onClearNumber }) {
  const numbered = elements.filter((e) => e.number != null).sort((a, b) => a.number - b.number);
  const selectedIsNumbered = elements.find((e) => e.id === selectedElementId)?.number != null;

  return (
    <div className="w-96 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-slate-500">Item Notes</div>
        <button
          type="button"
          onClick={() => onAssignNumber(selectedElementId)}
          disabled={!selectedElementId || selectedIsNumbered}
          data-testid="floorplan-add-note-for-selected-button"
          className="text-xs font-semibold text-indigo-600 disabled:opacity-40"
          title={!selectedElementId ? 'Select an item on the canvas first' : selectedIsNumbered ? 'This item already has a number' : 'Assign the next number to the selected item'}
        >
          + Add Note for Selected Item
        </button>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-400">
            <tr>
              <th className="px-2 py-1.5 text-left w-8">#</th>
              <th className="px-2 py-1.5 text-left">Item</th>
              <th className="px-2 py-1.5 text-left">Name</th>
              <th className="px-2 py-1.5 text-left">Description</th>
              <th className="px-2 py-1.5 w-6" />
            </tr>
          </thead>
          <tbody>
            {numbered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-slate-400">No numbered items yet.</td>
              </tr>
            )}
            {numbered.map((el) => (
              <tr
                key={el.id}
                data-testid="floorplan-number-row"
                className={`border-t border-slate-100 ${el.id === selectedElementId ? 'bg-indigo-50' : ''}`}
              >
                <td className="px-2 py-1 text-slate-400">{el.number}</td>
                <td className="px-1 py-1">
                  <button
                    type="button"
                    onClick={() => onSelectElement(el.id)}
                    title="Select this item on the canvas"
                    data-testid="floorplan-number-select-item-button"
                    className="text-left text-slate-600 hover:text-indigo-600"
                  >
                    {el.label || el.iconId}
                  </button>
                </td>
                <td className="px-1 py-1">
                  <input
                    value={el.name || ''}
                    onChange={(e) => onUpdateElement(el.id, { name: e.target.value })}
                    placeholder="e.g. Head Table"
                    data-testid="floorplan-number-name-input"
                    className={cellInputClass}
                  />
                </td>
                <td className="px-1 py-1">
                  {/* Read-only rich-text preview — Description can now
                      contain formatting set via the canvas icon popup
                      (CanvasStage.jsx), which a plain <input> can't display
                      (it would show raw tags). Editing happens by
                      double-clicking the item on canvas; this cell's click
                      just jumps the selection there. */}
                  <button
                    type="button"
                    onClick={() => onSelectElement(el.id)}
                    title="Double-click this item on the canvas to edit its description"
                    data-testid="floorplan-number-description-preview"
                    className="w-full text-left px-1.5 py-1 rounded hover:bg-slate-50 text-xs text-slate-600 truncate [&_*]:inline"
                    dangerouslySetInnerHTML={{ __html: el.description?.trim() ? el.description : '<span class="text-slate-300">Notes for the venue/vendor…</span>' }}
                  />
                </td>
                <td className="px-1 py-1">
                  <button type="button" onClick={() => onClearNumber(el.id)} data-testid="floorplan-number-clear-button" className="text-slate-300 hover:text-red-500">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
