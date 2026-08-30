import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { dollarsToCents } from '../lib/financialLedger.js';
import { invoiceTotal } from './invoices.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

const EXPENSE_CATEGORIES = new Set(['contractor_payment', 'production', 'backline', 'travel', 'processing_fee', 'agency_commission', 'tax', 'reimbursement', 'other_expense']);
const METHODS = new Set(['ach', 'check', 'card', 'cash', 'wire', 'other']);

function serialize(tx) {
  return { ...tx, amount: tx.amountCents / 100, reversed: !!tx.reversedBy, reversedBy: undefined };
}

function dateRange(req) {
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : null;
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : null;
  return from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
}

router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 30));
  const where = {
    accountId: req.membership.accountId,
    ...(req.query.groupId ? { groupId: req.query.groupId } : {}),
    ...(req.query.bookingId ? { bookingId: req.query.bookingId } : {}),
    ...(req.query.category ? { category: req.query.category } : {}),
    ...(dateRange(req) ? { occurredAt: dateRange(req) } : {}),
  };
  const [transactions, total] = await Promise.all([
    prisma.financialTransaction.findMany({ where, include: { group: { select: { name: true } }, createdBy: { select: { firstName: true, lastName: true } }, reversedBy: { select: { id: true } } }, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.financialTransaction.count({ where }),
  ]);
  res.json({ transactions: transactions.map(serialize), total, page, pageSize });
}));

router.get('/summary', asyncHandler(async (req, res) => {
  const accountId = req.membership.accountId;
  const occurredAt = dateRange(req);
  const groupFilter = req.query.groupId ? { groupId: req.query.groupId } : {};
  const [transactions, invoices, events, bookings, contractors] = await Promise.all([
    prisma.financialTransaction.findMany({ where: { accountId, ...groupFilter, ...(occurredAt ? { occurredAt } : {}) }, select: { amountCents: true, category: true } }),
    prisma.invoice.findMany({ where: { accountId, status: { in: ['sent', 'partial', 'paid'] } } }),
    prisma.event.findMany({ where: { accountId, deletedAt: null, ...groupFilter }, select: { id: true, name: true, eventDate: true, contractorBookings: true, otherExpenses: true } }),
    prisma.booking.findMany({ where: { accountId, deletedAt: null, ...groupFilter }, select: { id: true, eventName: true, convertedEventId: true } }),
    prisma.contractor.findMany({ where: { accountId }, select: { id: true, firstName: true, lastName: true, pricingTiers: true } }),
  ]);
  const scopedBookingIds = new Set(bookings.map((booking) => booking.id));
  const scopedInvoices = req.query.groupId ? invoices.filter((invoice) => scopedBookingIds.has(invoice.bookingId)) : invoices;
  const inflowCents = transactions.reduce((sum, tx) => sum + Math.max(0, tx.amountCents), 0);
  const outflowCents = Math.abs(transactions.reduce((sum, tx) => sum + Math.min(0, tx.amountCents), 0));
  const receivableCents = scopedInvoices.reduce((sum, invoice) => sum + Math.max(0, dollarsToCents(invoiceTotal(invoice)) - dollarsToCents(invoice.paidAmount)), 0);
  const contractorById = new Map(contractors.map((c) => [c.id, c]));
  const contractorCostRows = [];
  const payableRows = [];
  for (const event of events) {
    for (const booking of event.contractorBookings || []) {
      const contractor = contractorById.get(booking.contractorId);
      const tier = (contractor?.pricingTiers || []).find((item) => item.id === booking.pricingTierId) || contractor?.pricingTiers?.[0];
      const amount = Number(tier?.price) || 0;
      if (amount > 0) {
        const row = { eventId: event.id, eventName: event.name, eventDate: event.eventDate, contractorId: booking.contractorId, contractorName: contractor ? `${contractor.firstName} ${contractor.lastName}`.trim() : 'Contractor', amount };
        contractorCostRows.push(row);
        if (booking.paymentStatus !== 'paid') payableRows.push(row);
      }
    }
  }
  const bookingByEvent = new Map(bookings.filter((b) => b.convertedEventId).map((b) => [b.convertedEventId, b]));
  const profitability = bookings.map((booking) => {
    const billed = scopedInvoices.filter((invoice) => invoice.bookingId === booking.id).reduce((sum, invoice) => sum + (invoice.status === 'void' ? 0 : invoiceTotal(invoice)), 0);
    const event = events.find((item) => bookingByEvent.get(item.id)?.id === booking.id);
    const estimatedCosts = (event?.otherExpenses || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0) + contractorCostRows.filter((row) => row.eventId === event?.id).reduce((sum, row) => sum + row.amount, 0);
    return billed > 0 ? { bookingId: booking.id, name: booking.eventName || event?.name || 'Untitled booking', billed, estimatedCosts, estimatedProfit: billed - estimatedCosts, margin: ((billed - estimatedCosts) / billed) * 100 } : null;
  }).filter(Boolean).sort((a, b) => b.billed - a.billed).slice(0, 10);
  res.json({ summary: { inflow: inflowCents / 100, outflow: outflowCents / 100, netCash: (inflowCents - outflowCents) / 100, accountsReceivable: receivableCents / 100, accountsPayable: payableRows.reduce((sum, row) => sum + row.amount, 0), payableCount: payableRows.length, payables: payableRows.slice(0, 10), profitability } });
}));

router.post('/expenses', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) return res.status(403).json({ error: 'Not authorized.' });
  const { amount, category, description, occurredAt, groupId, bookingId, eventId, contractorId, paymentMethod, reference, memo } = req.body || {};
  const amountCents = dollarsToCents(amount);
  if (!(amountCents > 0)) return res.status(400).json({ error: 'Amount must be greater than $0.' });
  if (!EXPENSE_CATEGORIES.has(category)) return res.status(400).json({ error: 'Select a valid expense category.' });
  if (!description?.trim()) return res.status(400).json({ error: 'Description is required.' });
  if (paymentMethod && !METHODS.has(paymentMethod)) return res.status(400).json({ error: 'Select a valid payment method.' });
  if (groupId && !await prisma.agencyGroup.findFirst({ where: { id: groupId, accountId: req.membership.accountId } })) return res.status(400).json({ error: 'Invalid managed group.' });
  const transactionDate = occurredAt ? new Date(`${occurredAt}T12:00:00.000Z`) : new Date();
  if (Number.isNaN(transactionDate.getTime())) return res.status(400).json({ error: 'Select a valid payment date.' });
  const transaction = await prisma.financialTransaction.create({ data: { accountId: req.membership.accountId, groupId: groupId || null, bookingId: bookingId || null, eventId: eventId || null, contractorId: contractorId || null, category, amountCents: -amountCents, description: description.trim(), occurredAt: transactionDate, sourceType: 'manual_expense', sourceId: randomUUID(), paymentMethod: paymentMethod || null, reference: reference || null, memo: memo || null, createdById: req.session.userId } });
  res.status(201).json({ transaction: serialize({ ...transaction, reversedBy: null }) });
}));

router.post('/:id/reverse', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) return res.status(403).json({ error: 'Not authorized.' });
  const original = await prisma.financialTransaction.findFirst({ where: { id: req.params.id, accountId: req.membership.accountId }, include: { reversedBy: true } });
  if (!original) return res.status(404).json({ error: 'Transaction not found.' });
  if (original.reversalOfId || original.reversedBy) return res.status(400).json({ error: 'This transaction is already a correction or has already been reversed.' });
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'A correction reason is required.' });
  const transaction = await prisma.financialTransaction.create({ data: { accountId: original.accountId, groupId: original.groupId, bookingId: original.bookingId, eventId: original.eventId, invoiceId: original.invoiceId, contractorId: original.contractorId, clientId: original.clientId, category: 'reversal', amountCents: -original.amountCents, currency: original.currency, description: `Reversal · ${original.description}`, occurredAt: new Date(), sourceType: 'reversal', sourceId: original.id, memo: reason, metadata: { originalCategory: original.category }, reversalOfId: original.id, createdById: req.session.userId } });
  res.status(201).json({ transaction: serialize({ ...transaction, reversedBy: null }) });
}));

export default router;
