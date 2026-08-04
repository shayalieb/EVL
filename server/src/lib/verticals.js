// Canonical vertical list — the allowed values for Account.vertical
// (server/prisma/schema.prisma) and the single source every vertical-gated
// route/serializer reads from.
export const VERTICALS = ['band_orchestra', 'party_planning', 'photography'];

// Which verticals' tools/routes an account can actually use — its own
// `vertical` default, plus everything else once a platform admin has
// flipped `allVerticalsEnabled` (see admin.js's account-detail route).
export function activeVerticals(account) {
  if (account?.allVerticalsEnabled) return VERTICALS;
  return account?.vertical ? [account.vertical] : [];
}

// Express middleware, same shape as membership.js's requireRole — the real
// authorization boundary for vertical-specific routes (Stage Plot, Floor
// Plan). Nav/route hiding on the client is UX only; this is what actually
// blocks a disallowed request.
export function requireVertical(vertical) {
  return (req, res, next) => {
    if (!activeVerticals(req.membership.account).includes(vertical)) {
      return res.status(403).json({ error: 'Not available for this account.' });
    }
    next();
  };
}
