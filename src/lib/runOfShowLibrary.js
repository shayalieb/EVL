import { apiFetch } from '../context/AuthContext';
import { queryList } from './listQuery';

export function queryRunOfShowLibrary(params) {
  return queryList('/run-of-show-library', 'runOfShowLibrary', params);
}

export async function getAllRunOfShowLibraryItems() {
  const items = [];
  let cursor = '';
  do {
    const query = new URLSearchParams({ limit: '500' });
    if (cursor) query.set('cursor', cursor);
    const data = await apiFetch(`/run-of-show-library?${query}`);
    items.push(...(data.runOfShowLibrary || []));
    cursor = data.nextCursor || '';
  } while (cursor);
  return items;
}

export async function createRunOfShowLibraryItem(item) {
  const data = await apiFetch('/run-of-show-library', { method: 'POST', body: JSON.stringify(item) });
  return data.runOfShow;
}

export async function updateRunOfShowLibraryItemApi(id, patch) {
  const data = await apiFetch(`/run-of-show-library/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return data.runOfShow;
}

export async function deleteRunOfShowLibraryItemApi(id) {
  return apiFetch(`/run-of-show-library/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
