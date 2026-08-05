import { useEffect, useState } from 'react';

// Rasterizes an inline SVG string into an HTMLImageElement Konva's <Image>
// component can draw — Konva has no native vector/SVG node, so icon
// artwork (see iconRegistry.js) goes through this rather than being drawn
// as primitive Konva shapes by hand. Decoded images are cached by markup
// string since the same icon gets placed on a canvas many times and
// shouldn't re-decode its SVG on every instance.
const cache = new Map();
const pending = new Map(); // svgMarkup -> Promise, so concurrent requests for the same icon share one decode

function decode(svgMarkup) {
  const cached = cache.get(svgMarkup);
  if (cached) return Promise.resolve(cached);
  const inFlight = pending.get(svgMarkup);
  if (inFlight) return inFlight;

  const promise = new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      cache.set(svgMarkup, img);
      pending.delete(svgMarkup);
      resolve(img);
    };
    img.onerror = () => {
      pending.delete(svgMarkup);
      resolve(null);
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgMarkup)))}`;
  });
  pending.set(svgMarkup, promise);
  return promise;
}

export function useSvgImage(svgMarkup) {
  const [image, setImage] = useState(() => (svgMarkup ? cache.get(svgMarkup) || null : null));

  useEffect(() => {
    if (!svgMarkup) { setImage(null); return; }
    let cancelled = false;
    decode(svgMarkup).then((img) => { if (!cancelled) setImage(img); });
    return () => { cancelled = true; };
  }, [svgMarkup]);

  return image;
}

// Decodes every icon in a registry up front (fire-and-forget — callers
// don't need the result, just the side effect of populating the shared
// cache) so the very first time any given icon is placed on a canvas it
// renders immediately instead of a Rect placeholder briefly flashing while
// its SVG decodes. See CanvasStage.jsx's mount-time call.
export function preloadIconRegistry(iconRegistry) {
  if (!iconRegistry) return;
  for (const entry of Object.values(iconRegistry)) {
    if (entry?.svg) decode(entry.svg);
  }
}
