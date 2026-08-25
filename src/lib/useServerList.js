import { useEffect, useState } from 'react';

export function useServerList(load, dependencies) {
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pageSize: 25, pageCount: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      load()
        .then((next) => { if (!cancelled) setResult(next); })
        .catch((err) => { if (!cancelled) setError(err.message || 'Unable to load records.'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
    // The caller supplies a stable dependency list just like useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, revision]);

  return { ...result, loading, error, refresh: () => setRevision((value) => value + 1) };
}
