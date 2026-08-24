import assert from 'node:assert/strict';
import test from 'node:test';
import { paginatedResponse, paginationFromRequest } from '../src/lib/pagination.js';

test('pagination caps page size and returns a stable continuation cursor', () => {
  const req = { query: { limit: '5000' } };
  const pagination = paginationFromRequest(req);
  assert.equal(pagination.limit, 500);

  const rows = Array.from({ length: 501 }, (_, i) => ({
    id: `id-${String(i).padStart(3, '0')}`,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  }));
  const result = paginatedResponse(rows, pagination.limit);

  assert.equal(result.page.length, 500);
  assert.ok(result.nextCursor);

  const next = paginationFromRequest({ query: { cursor: result.nextCursor } });
  assert.deepEqual(next.cursorWhere, {
    OR: [
      { createdAt: { gt: rows[499].createdAt } },
      { createdAt: rows[499].createdAt, id: { gt: rows[499].id } },
    ],
  });
});

test('pagination rejects malformed cursors', () => {
  assert.equal(paginationFromRequest({ query: { cursor: 'not-a-cursor' } }), null);
});
