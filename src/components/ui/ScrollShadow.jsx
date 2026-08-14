import { useEffect, useRef, useState } from 'react';

// Wraps a horizontally-scrollable child (a wide table) with edge fades that
// hint there's more to see off-screen — the app's data tables already
// scroll correctly inside their own container on narrow viewports (rather
// than breaking the page), but nothing signaled that a swipe was possible,
// so the remaining columns were only ever found by accident. Fades are
// driven by actual scroll position (not just "on/off"), so the right-edge
// hint disappears once you've actually scrolled to the end instead of
// pointing at nothing.
export default function ScrollShadow({ children, className = '' }) {
  const ref = useRef(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  function update() {
    const el = ref.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 4);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

  return (
    <div className="relative">
      <div ref={ref} onScroll={update} className={`overflow-x-auto ${className}`}>
        {children}
      </div>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent transition-opacity duration-150 ${showLeft ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent transition-opacity duration-150 flex items-center justify-end ${showRight ? 'opacity-100' : 'opacity-0'}`}
      >
        <span className="text-slate-300 text-xs pr-1">›</span>
      </div>
    </div>
  );
}
