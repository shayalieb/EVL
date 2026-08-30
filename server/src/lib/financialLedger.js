import { randomUUID } from 'node:crypto';
import { prisma } from './prisma.js';

export function dollarsToCents(value) {
  return Math.round((Number(value) || 0) * 100);
}

export async function recordInvoicePayment({ db = prisma, invoice, previousPaidAmount = 0, newPaidAmount, sourceType = 'invoice_payment', sourceId, actorUserId = null, occurredAt, paymentMethod, reference, memo, metadata = {} }) {
  const deltaCents = dollarsToCents(newPaidAmount) - dollarsToCents(previousPaidAmount);
  if (deltaCents === 0) return null;
  const booking = await db.booking.findFirst({ where: { id: invoice.bookingId, accountId: invoice.accountId }, select: { groupId: true, clientId: true } });
  return db.financialTransaction.create({
    data: {
      accountId: invoice.accountId,
      groupId: booking?.groupId || null,
      bookingId: invoice.bookingId,
      invoiceId: invoice.id,
      clientId: booking?.clientId || null,
      category: deltaCents > 0 ? 'client_payment' : 'payment_adjustment',
      amountCents: deltaCents,
      description: `${deltaCents > 0 ? 'Payment received' : 'Payment correction'} · Invoice #${invoice.number ?? invoice.id}`,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      sourceType,
      sourceId: sourceId || randomUUID(),
      paymentMethod: paymentMethod || null,
      reference: reference || null,
      memo: memo || null,
      metadata: { invoiceStatus: invoice.status, previousPaidAmount, newPaidAmount, ...metadata },
      createdById: actorUserId,
    },
  });
}
