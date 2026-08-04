import { apiFetch } from '../context/AuthContext';

export async function getOrCreateFloorPlan(eventId) {
  const data = await apiFetch(`/floor-plans/${encodeURIComponent(eventId)}`);
  return data.floorPlan;
}

export async function saveFloorPlanPage(eventId, pageId, { scene, name, thumbnailBase64 } = {}) {
  const data = await apiFetch(`/floor-plans/${encodeURIComponent(eventId)}/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ scene, name, thumbnailBase64 }),
  });
  return data.page;
}

export async function addFloorPlanPage(eventId, name) {
  const data = await apiFetch(`/floor-plans/${encodeURIComponent(eventId)}/pages`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return data.page;
}

export async function deleteFloorPlanPage(eventId, pageId) {
  return apiFetch(`/floor-plans/${encodeURIComponent(eventId)}/pages/${pageId}`, { method: 'DELETE' });
}

// Two separate fetches, deliberately different credentials modes — see
// stagePlots.js's fetchStagePlotPageThumbnail for the full reasoning
// (Supabase's signed-URL response can't be fetched with credentials:
// 'include' due to its wildcard CORS header).
export async function fetchFloorPlanPageThumbnail(eventId, pageId) {
  const { url } = await apiFetch(`/floor-plans/${encodeURIComponent(eventId)}/pages/${pageId}/thumbnail`);
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
