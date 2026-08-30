import { prisma } from './prisma.js';

export function financialMonth(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 7);
}

export async function closedFinancialPeriod({ db = prisma, accountId, groupId, occurredAt }) {
  const month = financialMonth(occurredAt);
  if (!month) return null;
  return db.financialPeriod.findFirst({ where: { accountId, month, status: 'closed', groupKey: { in: ['account', groupId || 'account'] } } });
}

export async function assertFinancialPeriodOpen(args) {
  const closed = await closedFinancialPeriod(args);
  if (!closed) return;
  const error = new Error(`${closed.month} is closed for accounting. Reopen the period before posting or changing financial activity.`);
  error.status = 409;
  error.code = 'FINANCIAL_PERIOD_CLOSED';
  throw error;
}

