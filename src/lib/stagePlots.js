import { apiFetch } from '../context/AuthContext';

export async function getOrCreateStagePlot(eventId) {
  const data = await apiFetch(`/stage-plots/${encodeURIComponent(eventId)}`);
  return data.stagePlot;
}

export async function saveStagePlotPage(eventId, pageId, { scene, name, thumbnailBase64 } = {}) {
  const data = await apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ scene, name, thumbnailBase64 }),
  });
  return data.page;
}

export async function addStagePlotPage(eventId, name) {
  const data = await apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/pages`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return data.page;
}

export async function deleteStagePlotPage(eventId, pageId) {
  return apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/pages/${pageId}`, { method: 'DELETE' });
}

export async function addStagePlotChannel(eventId, channel) {
  const data = await apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/channels`, {
    method: 'POST',
    body: JSON.stringify(channel),
  });
  return data.channel;
}

export async function updateStagePlotChannel(eventId, channelId, patch) {
  const data = await apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/channels/${channelId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.channel;
}

export async function deleteStagePlotChannel(eventId, channelId) {
  return apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/channels/${channelId}`, { method: 'DELETE' });
}

// channelNumber is the only sort field there is (see the model's schema
// comment) — reordering means renumbering every row 1..N to match
// `orderedIds`, which must list every one of this stage plot's channel ids
// exactly once. Returns the full list, freshly numbered, since the server
// is the source of truth for the final channelNumber values.
export async function reorderStagePlotChannels(eventId, orderedIds) {
  const data = await apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/channels/reorder`, {
    method: 'POST',
    body: JSON.stringify({ orderedIds }),
  });
  return data.channels;
}

export async function addStagePlotBacklineItem(eventId, item) {
  const data = await apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/backline-items`, {
    method: 'POST',
    body: JSON.stringify(item),
  });
  return data.item;
}

export async function updateStagePlotBacklineItem(eventId, itemId, patch) {
  const data = await apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/backline-items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.item;
}

export async function deleteStagePlotBacklineItem(eventId, itemId) {
  return apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/backline-items/${itemId}`, { method: 'DELETE' });
}

// Not apiFetch — this redirects (302) to a signed Supabase Storage URL,
// which fetch()'s default redirect:'follow' resolves transparently into
// the actual PNG bytes. Used by stagePlotPdf.js to pull each page's
// browser-rendered snapshot back down for embedding at PDF-export time.
// Two separate fetches, deliberately with different credentials modes: the
// first hits our own API (needs the session cookie), the second hits
// Supabase's signed URL directly (must NOT send credentials — its response
// carries a wildcard CORS header, which browsers reject for credentialed
// requests). See the server route's comment for the full reasoning.
export async function fetchStagePlotPageThumbnail(eventId, pageId) {
  const { url } = await apiFetch(`/stage-plots/${encodeURIComponent(eventId)}/pages/${pageId}/thumbnail`);
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}
