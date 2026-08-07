// Contractor/Client/Booking/Event all require the caller to supply `id`
// (see each model's schema comment) rather than letting Prisma mint one, so
// that blob migration preserves the original id instead of orphaning every
// opaque-string reference pointing at it elsewhere. A client-generated id
// makes create newly retriable — the response can be lost even though the
// row was written — so a retry's duplicate `id` must succeed idempotently
// (returning the already-created row) rather than surfacing a unique-
// constraint error, as long as the existing row belongs to the same account.
export async function createWithPreservedId(delegate, data, accountId) {
  try {
    return await delegate.create({ data });
  } catch (err) {
    if (err.code === 'P2002') {
      const existing = await delegate.findUnique({ where: { id: data.id } });
      if (existing?.accountId === accountId) return existing;
    }
    throw err;
  }
}
