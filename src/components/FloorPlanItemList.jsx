import { FLOOR_PLAN_ICONS } from '../lib/canvasEngine/floorPlanIcons';

// Only actual seating tables carry a meaningful seat count — a buffet/cake/
// gift table gets counted but never summed into the seat total, same as a
// real event floor plan report would only tally covers at guest tables.
export const SEATABLE_TABLE_IDS = new Set(['round-table', 'rect-table', 'cocktail-table']);

// Auto-generated breakdown of everything placed on the current page,
// grouped by item type with seat totals for seating tables — for handing
// to a caterer/vendor. Unlike Stage Plot's Production List (a separately
// maintained, manually-entered table), this is purely computed from
// scene.elements since nothing here isn't already fully described by
// what's been placed on the canvas. Deliberately not filtered by layer
// visibility — a hidden layer is an editing convenience, not a statement
// that those items aren't really part of the plan.
export default function FloorPlanItemList({ elements }) {
  const groups = new Map();
  for (const el of elements) {
    const key = el.iconId;
    const entry = groups.get(key) || {
      iconId: key,
      label: el.label || FLOOR_PLAN_ICONS[key]?.label || key,
      count: 0,
      seats: 0,
      isSeatable: SEATABLE_TABLE_IDS.has(key),
    };
    entry.count += 1;
    if (entry.isSeatable) entry.seats += Number(el.seats) || 0;
    groups.set(key, entry);
  }
  const rows = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  const totalSeats = rows.reduce((sum, r) => sum + r.seats, 0);

  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 mb-2">Table &amp; Item List</div>
      {rows.length === 0 ? (
        <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
          Nothing placed yet.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs" data-testid="floorplan-item-list">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500 uppercase tracking-wide">
                <th className="px-2 py-1.5">Item</th>
                <th className="px-2 py-1.5 text-right">Qty</th>
                <th className="px-2 py-1.5 text-right">Seats</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.iconId} data-testid="floorplan-item-list-row" className="border-b border-slate-50 last:border-0">
                  <td className="px-2 py-1.5 text-slate-700">{r.label}</td>
                  <td className="px-2 py-1.5 text-right text-slate-600">{r.count}</td>
                  <td className="px-2 py-1.5 text-right text-slate-600">{r.isSeatable ? r.seats : '—'}</td>
                </tr>
              ))}
            </tbody>
            {totalSeats > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold text-slate-700">
                  <td className="px-2 py-1.5" colSpan={2}>Total Seats</td>
                  <td className="px-2 py-1.5 text-right" data-testid="floorplan-item-list-total-seats">{totalSeats}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
