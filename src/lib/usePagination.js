import { useMemo, useState } from 'react';

const DEFAULT_PAGE_SIZE = 25;

// Clamps against the current item count itself (rather than needing an
// effect keyed on every filter/search input) — when a search or filter
// narrows the list, pageCount drops and the displayed page auto-snaps back
// into range instead of showing a blank table.
export function usePagination(items, pageSize = DEFAULT_PAGE_SIZE) {
  const [requestedPage, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );
  return { page, setPage, pageCount, pageItems, pageSize, totalItems: items.length };
}
