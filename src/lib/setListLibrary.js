import { apiFetch } from '../context/AuthContext';
import { queryList } from './listQuery';

export function querySetListLibrary(params) {
  return queryList('/set-list-library', 'setListLibrary', params);
}

export async function getAllSetListLibraryItems() {
  const items = [];
  let cursor = '';
  do {
    const query = new URLSearchParams({ limit: '500' });
    if (cursor) query.set('cursor', cursor);
    const data = await apiFetch(`/set-list-library?${query}`);
    items.push(...(data.setListLibrary || []));
    cursor = data.nextCursor || '';
  } while (cursor);
  return items;
}

export async function createSetListLibraryItem(item) {
  const data = await apiFetch('/set-list-library', { method: 'POST', body: JSON.stringify(item) });
  return data.setList;
}

export async function updateSetListLibraryItemApi(id, patch) {
  const data = await apiFetch(`/set-list-library/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.setList;
}

export async function deleteSetListLibraryItemApi(id) {
  return apiFetch(`/set-list-library/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function syncSetListLibrary(setListLibrary) {
  return apiFetch('/set-list-library/sync', { method: 'POST', body: JSON.stringify({ setListLibrary }) });
}
