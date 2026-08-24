import { apiFetch } from '../context/AuthContext';

// Compatibility bridge for screens that still calculate over a complete
// account collection. The API is genuinely page-based; callers can migrate
// to incremental rendering later without another server contract change.
export async function fetchAllPages(path, collectionKey) {
  const records = [];
  let cursor = null;
  do {
    const query = new URLSearchParams({ limit: '500' });
    if (cursor) query.set('cursor', cursor);
    const data = await apiFetch(`${path}?${query}`);
    records.push(...data[collectionKey]);
    cursor = data.nextCursor || null;
  } while (cursor);
  return records;
}
