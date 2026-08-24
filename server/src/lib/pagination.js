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
