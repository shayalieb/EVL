import { useEffect, useState } from 'react';

// Rasterizes an inline SVG string into an HTMLImageElement Konva's <Image>
// component can draw — Konva has no native vector/SVG node, so icon
// artwork (see iconRegistry.js) goes through this rather than being drawn
// as primitive Konva shapes by hand. Decoded images are cached by markup
// string since the same icon gets placed on a canvas many times and
// shouldn't re-decode its SVG on every instance.
const cache = new Map();
const pending = new Map(); // svgMarkup -> Promise, so concurrent requests for the same icon share one decode

function withRenderedSize(svgMarkup, width, height) {
  if (!svgMarkup || !width || !height) return svgMarkup;
  return svgMarkup.replace('<svg ', `<svg width="${Math.ceil(width)}" height="${Math.ceil(height)}" `);
}

function decode(svgMarkup, width, height) {
  const sizedMarkup = withRenderedSize(svgMarkup, width, height);
  const cacheKey = sizedMarkup;
  const cached = cache.get(cacheKey);
  if (cached) return Promise.resolve(cached);
  const inFlight = pending.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      cache.set(cacheKey, img);
      pending.delete(cacheKey);
      resolve(img);
    };
    img.onerror = () => {
      pending.delete(cacheKey);
      resolve(null);
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(sizedMarkup)))}`;
  });
  pending.set(cacheKey, promise);
  return promise;
}

export function useSvgImage(svgMarkup, width, height) {
  const cacheKey = withRenderedSize(svgMarkup, width, height);
  const [image, setImage] = useState(() => (cacheKey ? cache.get(cacheKey) || null : null));

  useEffect(() => {
    if (!svgMarkup) { setImage(null); return; }
    let cancelled = false;
    decode(svgMarkup, width, height).then((img) => { if (!cancelled) setImage(img); });
    return () => { cancelled = true; };
  }, [svgMarkup, width, height]);

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

export function useCanvasImage(src) {
  const [image, setImage] = useState(null);
  useEffect(() => {
    if (!src) { setImage(null); return undefined; }
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => { if (!cancelled) setImage(img); };
    img.onerror = () => { if (!cancelled) setImage(null); };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);
  return image;
}
