const PALETTE = ['#94a3b8', '#64748b', '#eab308', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#6366f1', '#3b82f6', '#06b6d4', '#22c55e', '#16a34a'];

export default function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className="w-6 h-6 rounded-full ring-offset-2"
          style={{ backgroundColor: color, boxShadow: value === color ? `0 0 0 2px white, 0 0 0 4px ${color}` : 'none' }}
          aria-label={`Choose color ${color}`}
        />
      ))}
    </div>
  );
}
