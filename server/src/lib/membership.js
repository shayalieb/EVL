import { prisma } from './prisma.js';

export const PERMISSION_KEYS = [
  'manageContractors',
  'manageClients',
  'manageBookings',
  'manageEvents',
  'manageEmailTemplates',
  'manageSettings',
];

export function emptyPermissions() {
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false]));
}

export function allPermissions() {
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true]));
}

export function sanitizePermissions(input) {
  const safe = emptyPermissions();
  for (const key of PERMISSION_KEYS) {
    if (input && typeof input[key] === 'boolean') safe[key] = input[key];
  }
  return safe;
}

// Owner/admin always have every permission regardless of what's stored;
// the stored `permissions` JSON only has teeth for role === 'member'.
export function effectivePermissions(membership) {
  if (!membership) return emptyPermissions();
  if (membership.role === 'owner' || membership.role === 'admin') return allPermissions();
  return sanitizePermissions(membership.permissions);
}

// Users created before Accounts/Memberships existed have no Membership row.
// Rather than locking them out, give them an owner Membership on an account
// of their own the first time they're seen — preserves prior behavior
// (every existing user effectively owned their own data already).
export async function getMembershipWithAccount(userId) {
  const existing = await prisma.membership.findUnique({ where: { userId }, include: { account: true } });
  if (existing) return existing;

  try {
    return await prisma.$transaction(async (tx) => {
      const account = await tx.account.create({ data: {} });
      return tx.membership.create({
        data: { userId, accountId: account.id, role: 'owner', permissions: allPermissions() },
        include: { account: true },
      });
    });
  } catch (err) {
    // Concurrent request already created it — just return that one.
    if (err.code === 'P2002') {
      return prisma.membership.findUnique({ where: { userId }, include: { account: true } });
    }
    throw err;
  }
}

export function serializeMembership(membership) {
  if (!membership) return { accountId: null, role: null, permissions: emptyPermissions() };
  return {
    accountId: membership.accountId,
    role: membership.role,
    permissions: effectivePermissions(membership),
  };
}

// Express middleware for team.js routes — loads the caller's membership onto req.
export async function attachMembership(req, res, next) {
  const membership = await getMembershipWithAccount(req.session.userId);
  if (!membership) return res.status(403).json({ error: 'No account access.' });
  req.membership = membership;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.membership.role)) {
      return res.status(403).json({ error: 'Not authorized.' });
    }
    next();
  };
}
