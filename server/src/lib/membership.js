import { prisma } from './prisma.js';
import { activeVerticals } from './verticals.js';

export const PERMISSION_KEYS = [
  'manageContractors',
  'manageClients',
  'manageVenues',
  'manageBookings',
  'manageEvents',
  'manageEmailTemplates',
  'manageOfferings',
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
      // approvedAt set immediately — this is a legacy pre-Account user being
      // auto-provisioned, not a cold public self-signup, so it never needed
      // review (see schema.prisma's Account.approvedAt).
      const account = await tx.account.create({ data: { approvedAt: new Date() } });
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

// Statuses that block access once billing exists — mirrored between here
// (client-facing) and attachMembership below (server-enforced). 'past_due'
// deliberately isn't included: Stripe's own Smart Retries give a grace
// period there, same as most SaaS billing.
const BLOCKING_SUBSCRIPTION_STATUSES = ['canceled', 'unpaid', 'incomplete_expired'];

export function isSubscriptionBlocked(account) {
  return !!account.subscriptionStatus && BLOCKING_SUBSCRIPTION_STATUSES.includes(account.subscriptionStatus);
}

export function serializeMembership(membership) {
  if (!membership) {
    return {
      accountId: null, role: null, permissions: emptyPermissions(),
      vertical: null, allVerticalsEnabled: false, activeVerticals: [],
      accountApproved: false,
      subscriptionStatus: null, planTier: null, seatLimit: null, agencyGroupLimit: null, trialEndsAt: null, subscriptionBlocked: false,
    };
  }
  return {
    accountId: membership.accountId,
    role: membership.role,
    permissions: effectivePermissions(membership),
    vertical: membership.account.vertical,
    allVerticalsEnabled: membership.account.allVerticalsEnabled,
    activeVerticals: activeVerticals(membership.account),
    // Drives the client-side pending-approval gate (App.jsx) — checked here
    // rather than only in attachMembership below, since /auth/login and
    // /auth/me don't route through that middleware, and the client needs to
    // know this *before* it starts fetching account data, not after every
    // fetch fails.
    accountApproved: !!membership.account.approvedAt,
    // GigWorks' own subscription (see lib/plans.js) — the frontend gate
    // (App.jsx) and the Plan settings tab both need these.
    subscriptionStatus: membership.account.subscriptionStatus,
    planTier: membership.account.planTier,
    seatLimit: membership.account.seatLimit,
    agencyGroupLimit: membership.account.agencyGroupLimit,
    trialEndsAt: membership.account.trialEndsAt,
    subscriptionBlocked: isSubscriptionBlocked(membership.account),
  };
}

// Express middleware for team.js routes — loads the caller's membership onto req.
export async function attachMembership(req, res, next) {
  const membership = await getMembershipWithAccount(req.session.userId);
  if (!membership) return res.status(403).json({ error: 'No account access.' });
  // A platform admin can disable an account (see admin.js) — this is the
  // one choke point every account-scoped route already runs through, so
  // it's enforced here rather than duplicated per route.
  if (membership.account.disabledAt) {
    return res.status(403).json({ error: 'This account has been disabled.' });
  }
  // Defense in depth — the client already gates on accountApproved (see
  // serializeMembership) and shouldn't ever reach a data route in this
  // state, but this is the real enforcement boundary regardless.
  if (!membership.account.approvedAt) {
    return res.status(403).json({ error: 'This account is pending approval.' });
  }
  // A subscription that lapsed *after* being active — distinct from the
  // approvedAt check above ("never set up billing" vs. "billing lapsed").
  // Null subscriptionStatus never trips this: accounts that predate billing,
  // or that an admin created directly (admin.js sets approvedAt itself,
  // without ever touching Stripe), aren't affected.
  if (isSubscriptionBlocked(membership.account)) {
    return res.status(403).json({ error: 'Your subscription is inactive. Update your billing to regain access.' });
  }
  req.membership = membership;
  next();
}

// Same as attachMembership but without the approvedAt/subscription checks —
// for the subscription routes themselves (routes/subscription.js), which an
// unapproved-because-no-plan-yet or a billing-lapsed account both need to
// reach in order to fix that. Still blocks disabledAt; a platform-disabled
// account has no legitimate reason to touch its own billing either.
export async function attachMembershipForBilling(req, res, next) {
  const membership = await getMembershipWithAccount(req.session.userId);
  if (!membership) return res.status(403).json({ error: 'No account access.' });
  if (membership.account.disabledAt) {
    return res.status(403).json({ error: 'This account has been disabled.' });
  }
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

// For platform-admin routes (server/src/routes/admin.js), which aren't
// scoped to — or dependent on — the caller's own business account.
export async function attachUser(req, res, next) {
  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  req.user = user;
  next();
}

export function requirePlatformAdmin(req, res, next) {
  if (!req.user?.isPlatformAdmin) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  next();
}

// Scoped platform-admin capability check — 'manageAccounts' |
// 'manageAccountStatus' | 'manageSupport' | 'manageAdmins'. Only meaningful
// once requirePlatformAdmin has already run (req.user is set). The owner
// always bypasses this, same as it bypasses everything else.
export function requireAdminPermission(permission) {
  return (req, res, next) => {
    if (req.user?.isPlatformOwner) return next();
    if (req.user?.adminPermissions?.[permission]) return next();
    return res.status(403).json({ error: 'Not authorized.' });
  };
}
