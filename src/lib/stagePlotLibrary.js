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
