import { apiFetch } from '../context/AuthContext';

export async function queryList(path, collectionKey, params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== null && value !== undefined) query.set(key, String(value));
  }
  const data = await apiFetch(`${path}?${query}`);
  return data[collectionKey];
}
