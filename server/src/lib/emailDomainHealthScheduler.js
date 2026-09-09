import { prisma } from './prisma.js';
import { refreshEmailDomainStatus } from './emailDomains.js';

const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function startEmailDomainHealthScheduler() {
  async function tick() {
    try {
      const domains = await prisma.emailDomain.findMany({ select: { accountId: true }, take: 100 });
      for (const domain of domains) {
        try {
          // Deliberately sequential and bounded to avoid provider bursts.
          // eslint-disable-next-line no-await-in-loop
          await refreshEmailDomainStatus(domain.accountId);
        } catch (error) {
          console.error('Email domain health check failed:', domain.accountId, error.message);
        }
      }
    } catch (error) {
      console.error('Email domain health scheduler failed:', error.message);
    }
  }
  const timer = setInterval(tick, POLL_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
