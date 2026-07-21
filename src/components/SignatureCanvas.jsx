import { useEffect, useRef, useState } from 'react';

// Draw-to-sign pad. Exposes the drawing as a base64 PNG via onChange —
// parent components read that value at submit time rather than this
// component owning any submit logic itself.
export default function SignatureCanvas({ onChange, height = 160 }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;

    function resize() {
      // clientWidth is 0 while an ancestor tab pane is display:none (the
      // booking/contract forms keep every tab mounted and toggle visibility
      // via CSS) — a one-time mount measurement would permanently size the
      // backing store to zero if this canvas first mounted on a hidden tab.
      // ResizeObserver re-fires once the pane becomes visible and the
      // element gets real layout, so re-measure every time size changes.
      if (canvas.clientWidth === 0) return;
      const ctx = canvas.getContext('2d');
      // Backing store at devicePixelRatio so the signature isn't blurry on
      // retina displays, while CSS keeps the element at its layout size.
      const ratio = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * ratio;
      canvas.height = height * ratio;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#1e293b';
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [height]);

  function getPoint(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    drawing.current = true;
    const { x, y } = getPoint(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = getPoint(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasDrawn) setHasDrawn(true);
  }

  function stop() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL('image/png'));
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange('');
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{ height, touchAction: 'none' }}
        className="w-full rounded-lg border border-slate-300 bg-white cursor-crosshair"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={stop}
        onMouseLeave={stop}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={stop}
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs text-slate-400">Sign above with your mouse, trackpad, or finger</span>
        {hasDrawn && (
          <button type="button" onClick={handleClear} className="text-xs font-semibold text-slate-400 hover:text-red-600">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
