const PALETTE = ['#94a3b8', '#64748b', '#eab308', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#6366f1', '#3b82f6', '#06b6d4', '#22c55e', '#16a34a'];

export default function ColorPicker({ value, onChange }) {
  const isCustom = !PALETTE.includes(value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          data-testid="color-picker-swatch-button"
          className="w-6 h-6 rounded-full ring-offset-2"
          style={{ backgroundColor: color, boxShadow: value === color ? `0 0 0 2px white, 0 0 0 4px ${color}` : 'none' }}
          aria-label={`Choose color ${color}`}
        />
      ))}
      {/* Native color picker for any hex, not just the fixed palette above —
          sized/clipped to look like the swatch buttons it sits alongside. */}
      <label
        className="relative w-6 h-6 rounded-full overflow-hidden cursor-pointer shrink-0"
        style={{
          backgroundColor: isCustom ? value : '#fff',
          backgroundImage: isCustom ? 'none' : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
          boxShadow: isCustom ? `0 0 0 2px white, 0 0 0 4px ${value}` : '0 0 0 1px #cbd5e1',
        }}
        title="Custom color"
      >
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#4f46e5'}
          onChange={(e) => onChange(e.target.value)}
          data-testid="color-picker-custom-input"
          className="absolute -top-1 -left-1 w-8 h-8 cursor-pointer opacity-0"
          aria-label="Choose a custom color"
        />
      </label>
    </div>
  );
}
