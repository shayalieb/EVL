import { apiFetch } from '../context/AuthContext';

export async function getAllStagePlotLibraryItems() {
  const data = await apiFetch('/stage-plot-library');
  return data.stagePlotLibrary || [];
}

export async function saveEventStagePlotToLibrary(eventId, name) {
  const data = await apiFetch(`/stage-plot-library/from-event/${encodeURIComponent(eventId)}`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return data.stagePlot;
}

// "+ Add Stage Plot" on the library page — a blank template with no event
// behind it, built directly in StagePlotLibraryEditorPage.jsx.
export async function createStagePlotLibraryItem(name) {
  const data = await apiFetch('/stage-plot-library', { method: 'POST', body: JSON.stringify({ name }) });
  return data.stagePlot;
}

// Full detail (pages/channels/backlineItems) for the library editor to load
// — the list/summary endpoints intentionally omit scene JSON.
export async function getStagePlotLibraryItemDetail(id) {
  const data = await apiFetch(`/stage-plot-library/${encodeURIComponent(id)}`);
  return data.stagePlot;
}

export async function saveStagePlotLibraryPage(id, pageId, { scene, name, thumbnailBase64 } = {}) {
  const data = await apiFetch(`/stage-plot-library/${encodeURIComponent(id)}/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ scene, name, thumbnailBase64 }),
  });
  return data.page;
}

export async function addStagePlotLibraryPage(id, name) {
  const data = await apiFetch(`/stage-plot-library/${encodeURIComponent(id)}/pages`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return data.page;
}

export async function deleteStagePlotLibraryPage(id, pageId) {
  return apiFetch(`/stage-plot-library/${encodeURIComponent(id)}/pages/${pageId}`, { method: 'DELETE' });
}

export async function addStagePlotLibraryChannel(id, channel) {
  const data = await apiFetch(`/stage-plot-library/${encodeURIComponent(id)}/channels`, {
    method: 'POST',
    body: JSON.stringify(channel),
  });
  return data.channel;
}

export async function updateStagePlotLibraryChannel(id, channelId, patch) {
  const data = await apiFetch(`/stage-plot-library/${encodeURIComponent(id)}/channels/${channelId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.channel;
}

export async function deleteStagePlotLibraryChannel(id, channelId) {
  return apiFetch(`/stage-plot-library/${encodeURIComponent(id)}/channels/${channelId}`, { method: 'DELETE' });
}

export async function reorderStagePlotLibraryChannels(id, orderedIds) {
  const data = await apiFetch(`/stage-plot-library/${encodeURIComponent(id)}/channels/reorder`, {
    method: 'POST',
    body: JSON.stringify({ orderedIds }),
  });
  return data.channels;
}

export async function addStagePlotLibraryBacklineItem(id, item) {
  const data = await apiFetch(`/stage-plot-library/${encodeURIComponent(id)}/backline-items`, {
    method: 'POST',
    body: JSON.stringify(item),
  });
  return data.item;
}

export async function updateStagePlotLibraryBacklineItem(id, itemId, patch) {
  const data = await apiFetch(`/stage-plot-library/${encodeURIComponent(id)}/backline-items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.item;
}

export async function deleteStagePlotLibraryBacklineItem(id, itemId) {
  return apiFetch(`/stage-plot-library/${encodeURIComponent(id)}/backline-items/${itemId}`, { method: 'DELETE' });
}

export async function renameStagePlotLibraryItem(id, name) {
  const data = await apiFetch(`/stage-plot-library/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  return data.stagePlot;
}

export async function deleteStagePlotLibraryItemApi(id) {
  return apiFetch(`/stage-plot-library/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Same two-fetch pattern as fetchStagePlotPageThumbnail in stagePlots.js —
// the first hop needs the session cookie, the second (Supabase's signed
// URL) must NOT send credentials, since its response carries a wildcard
// Access-Control-Allow-Origin that browsers reject for credentialed
// requests.
export async function fetchStagePlotLibraryThumbnail(id) {
  const { url } = await apiFetch(`/stage-plot-library/${encodeURIComponent(id)}/thumbnail`).catch(() => ({ url: null }));
  if (!url) return null;
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
