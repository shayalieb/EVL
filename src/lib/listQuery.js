import { apiFetch } from '../context/AuthContext';

export async function queryList(path, collectionKey, params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== null && value !== undefined) query.set(key, String(value));
  }
  // The pre-3A server ignores `page` and still reads `limit`. Sending both
  // keeps a newly deployed frontend bounded while an older backend instance
  // is finishing its rollout.
  if (params.pageSize && !query.has('limit')) query.set('limit', String(params.pageSize));
  const data = await apiFetch(`${path}?${query}`);
  const payload = data[collectionKey];

  // Mixed-version rollout compatibility: pre-3A servers return a plain
  // collection plus nextCursor; 3A+ servers return the paged envelope. This
  // adapter prevents a transient frontend error if Railway switches static
  // assets before every backend instance is serving the new contract.
  if (Array.isArray(payload)) {
    const page = Number(params.page) || 1;
    const pageSize = Number(params.pageSize) || payload.length || 25;
    const hasMore = !!data.nextCursor;
    return {
      items: payload,
      total: hasMore ? page * pageSize + 1 : (page - 1) * pageSize + payload.length,
      page,
      pageSize,
      pageCount: hasMore ? page + 1 : page,
      rolloutCompatibility: true,
    };
  }

  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('The list service returned an unsupported response. Please reload and try again.');
  }
  return payload;
}
