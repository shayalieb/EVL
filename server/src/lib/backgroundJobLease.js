import { randomUUID } from 'node:crypto';
import { prisma } from './prisma.js';

const DEFAULT_LEASE_MS = 10 * 60 * 1000;

export async function withBackgroundJobLease(name, job, leaseMs = DEFAULT_LEASE_MS) {
  const ownerId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + leaseMs);

  // One statement handles both a brand-new lease and takeover of an expired
  // lease. A live conflicting lease returns no rows rather than deliberately
  // throwing a unique-constraint error on every competing instance.
  const claimed = await prisma.$queryRaw`
    INSERT INTO "BackgroundJobLease" ("name", "ownerId", "expiresAt", "updatedAt")
    VALUES (${name}, ${ownerId}, ${expiresAt}, ${now})
    ON CONFLICT ("name") DO UPDATE
      SET "ownerId" = EXCLUDED."ownerId",
          "expiresAt" = EXCLUDED."expiresAt",
          "updatedAt" = EXCLUDED."updatedAt"
      WHERE "BackgroundJobLease"."expiresAt" < ${now}
    RETURNING "name"
  `;
  if (claimed.length !== 1) return false;

  try {
    await job();
    return true;
  } finally {
    await prisma.backgroundJobLease.deleteMany({ where: { name, ownerId } });
  }
}
