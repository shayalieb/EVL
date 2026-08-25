import { useEffect } from 'react';
import { useData } from '../context/DataContext';

// Resolve only the contractor records referenced by the current screen.
// Sorting/deduplicating gives the effect a stable dependency even when the
// caller builds a fresh ids array during render.
export function useContractorHydration(ids) {
  const { loadContractors } = useData();
  const key = [...new Set((ids || []).filter(Boolean))].sort().join(',');

  useEffect(() => {
    if (!key) return;
    loadContractors(key.split(',')).catch(() => {});
  }, [key, loadContractors]);
}
