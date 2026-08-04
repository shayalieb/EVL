import { useEffect, useState } from 'react';

// Rasterizes an inline SVG string into an HTMLImageElement Konva's <Image>
// component can draw — Konva has no native vector/SVG node, so icon
// artwork (see iconRegistry.js) goes through this rather than being drawn
// as primitive Konva shapes by hand. Decoded images are cached by markup
// string since the same icon gets placed on a canvas many times and
// shouldn't re-decode its SVG on every instance.
const cache = new Map();

export function useSvgImage(svgMarkup) {
  const [image, setImage] = useState(() => (svgMarkup ? cache.get(svgMarkup) || null : null));

  useEffect(() => {
    if (!svgMarkup) { setImage(null); return; }
    const cached = cache.get(svgMarkup);
    if (cached) { setImage(cached); return; }

    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      cache.set(svgMarkup, img);
      setImage(img);
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgMarkup)))}`;
    return () => { cancelled = true; };
  }, [svgMarkup]);

  return image;
}
