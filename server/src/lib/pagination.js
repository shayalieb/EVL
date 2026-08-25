const DEFAULT_PAGE_SIZE = 250;
const MAX_PAGE_SIZE = 500;

function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id })).toString('base64url');
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    const createdAt = new Date(parsed.createdAt);
    if (!parsed.id || Number.isNaN(createdAt.getTime())) return undefined;
    return { createdAt, id: String(parsed.id) };
  } catch {
    return undefined;
  }
}

export function paginationFromRequest(req) {
  const requested = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  const cursor = decodeCursor(req.query.cursor);
  if (cursor === undefined) return null;

  return {
    limit,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    cursorWhere: cursor ? {
      OR: [
        { createdAt: { gt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { gt: cursor.id } },
      ],
    } : {},
  };
}

export function paginatedResponse(rows, limit) {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    page,
    nextCursor: hasMore ? encodeCursor(page.at(-1)) : null,
  };
}

const UI_PAGE_SIZE = 25;
const MAX_UI_PAGE_SIZE = 100;

export function listPageFromRequest(req, allowedSorts, defaultSort = 'createdAt') {
  const requestedPage = Number.parseInt(req.query.page, 10);
  const requestedLimit = Number.parseInt(req.query.pageSize, 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
  const pageSize = Number.isFinite(requestedLimit) ? Math.min(Math.max(1, requestedLimit), MAX_UI_PAGE_SIZE) : UI_PAGE_SIZE;
  const sort = allowedSorts.includes(req.query.sort) ? req.query.sort : defaultSort;
  const direction = req.query.direction === 'asc' ? 'asc' : 'desc';
  return { page, pageSize, skip: (page - 1) * pageSize, sort, direction };
}

export function listPageResponse(items, total, pagination) {
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
  };
}
