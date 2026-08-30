import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { dollarsToCents } from '../lib/financialLedger.js';
import { invoiceTotal } from './invoices.js';
import { bookingProfitabilitySnapshot, contractorAssignmentCost, inIsoDateRange, receivableAgingBucket } from '../lib/financialReports.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

const EXPENSE_CATEGORIES = new Set(['contractor_payment', 'production', 'backline', 'travel', 'processing_fee', 'agency_commission', 'tax', 'reimbursement', 'other_expense']);
const METHODS = new Set(['ach', 'check', 'card', 'cash', 'wire', 'other']);
const REPORT_TABS = new Set(['receivables', 'payables']);

function hasPermission(req, permission) {
  return !!effectivePermissions(req.membership)[permission];
}

function requireFinancialPermission(permission) {
  return (req, res, next) => hasPermission(req, permission) ? next() : res.status(403).json({ error: 'Not authorized.' });
}

function serialize(tx) {
  return { ...tx, amount: tx.amountCents / 100, reversed: !!tx.reversedBy, reversedBy: undefined };
}

function dateRange(req) {
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : null;
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : null;
  return from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
}

router.get('/', requireFinancialPermission('viewFinancials'), asyncHandler(async (req, res) => {
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

router.get('/summary', requireFinancialPermission('viewFinancials'), asyncHandler(async (req, res) => {
  const accountId = req.membership.accountId;
  const occurredAt = dateRange(req);
  const groupFilter = req.query.groupId ? { groupId: req.query.groupId } : {};
  const [transactions, invoices, events, bookings, contractors, accountData] = await Promise.all([
    prisma.financialTransaction.findMany({ where: { accountId, ...groupFilter, ...(occurredAt ? { occurredAt } : {}) }, select: { amountCents: true, category: true } }),
    prisma.invoice.findMany({ where: { accountId, status: { in: ['sent', 'partial', 'paid'] } } }),
    prisma.event.findMany({ where: { accountId, deletedAt: null, ...groupFilter }, select: { id: true, name: true, eventDate: true, noOutsideContractorsNeeded: true, contractorBookings: true, otherExpenses: true } }),
    prisma.booking.findMany({ where: { accountId, deletedAt: null, ...groupFilter }, select: { id: true, eventName: true, convertedEventId: true } }),
    prisma.contractor.findMany({ where: { accountId }, select: { id: true, firstName: true, lastName: true, pricingTiers: true } }),
    prisma.accountData.findUnique({ where: { accountId }, select: { data: true } }),
  ]);
  const scopedBookingIds = new Set(bookings.map((booking) => booking.id));
  const scopedInvoices = req.query.groupId ? invoices.filter((invoice) => scopedBookingIds.has(invoice.bookingId)) : invoices;
  const inflowCents = transactions.reduce((sum, tx) => sum + Math.max(0, tx.amountCents), 0);
  const outflowCents = Math.abs(transactions.reduce((sum, tx) => sum + Math.min(0, tx.amountCents), 0));
  const receivableCents = scopedInvoices.reduce((sum, invoice) => sum + Math.max(0, dollarsToCents(invoiceTotal(invoice)) - dollarsToCents(invoice.paidAmount)), 0);
  const contractorById = new Map(contractors.map((c) => [c.id, c]));
  const inquiryStatuses = accountData?.data?.inquiryStatuses || [];
  const isUnavailable = (assignment) => {
    const status = inquiryStatuses.find((item) => item.id === assignment.inquiryStatusId);
    return status && (!status.isConfirmed && /not.?avail|declin/i.test(status.label || ''));
  };
  const contractorCostRows = [];
  const payableRows = [];
  // "Expected in the next 30 days" — a single forward-looking number in
  // place of the old multi-month forecast dashboard. Mirrors that
  // dashboard's own leniency: anything already overdue (or with no due
  // date at all) still counts as expected, rather than silently dropping
  // off once its original date has passed.
  const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  let expectedOutCents = 0;
  for (const event of events) {
    for (const booking of event.contractorBookings || []) {
      if (isUnavailable(booking)) continue;
      const contractor = contractorById.get(booking.contractorId);
      const amount = contractorAssignmentCost(booking, contractor);
      if (amount !== null && amount > 0) {
        const row = { eventId: event.id, eventName: event.name, eventDate: event.eventDate, contractorId: booking.contractorId, contractorName: contractor ? `${contractor.firstName} ${contractor.lastName}`.trim() : 'Contractor', amount };
        contractorCostRows.push(row);
        if (booking.paymentStatus !== 'paid') {
          payableRows.push(row);
          if (!event.eventDate || event.eventDate <= in30Days) expectedOutCents += dollarsToCents(amount);
        }
      }
    }
  }
  const expectedInCents = scopedInvoices.reduce((sum, invoice) => {
    const balance = Math.max(0, dollarsToCents(invoiceTotal(invoice)) - dollarsToCents(invoice.paidAmount));
    if (balance <= 0 || (invoice.dueDate && invoice.dueDate.toISOString().slice(0, 10) > in30Days)) return sum;
    return sum + balance;
  }, 0);
  const bookingByEvent = new Map(bookings.filter((b) => b.convertedEventId).map((b) => [b.convertedEventId, b]));
  const profitability = bookings.map((booking) => {
    const billed = scopedInvoices.filter((invoice) => invoice.bookingId === booking.id).reduce((sum, invoice) => sum + (invoice.status === 'void' ? 0 : invoiceTotal(invoice)), 0);
    const event = events.find((item) => bookingByEvent.get(item.id)?.id === booking.id);
    const assignments = (event?.contractorBookings || []).filter((assignment) => !isUnavailable(assignment));
    const snapshot = bookingProfitabilitySnapshot({ billed, event, assignments, contractorById });
    return billed > 0 ? { bookingId: booking.id, eventId: event?.id || null, name: booking.eventName || event?.name || 'Untitled booking', billed, ...snapshot } : null;
  }).filter(Boolean).sort((a, b) => b.billed - a.billed).slice(0, 10);
  res.json({ summary: {
    inflow: inflowCents / 100, outflow: outflowCents / 100, netCash: (inflowCents - outflowCents) / 100,
    accountsReceivable: receivableCents / 100, accountsPayable: payableRows.reduce((sum, row) => sum + row.amount, 0), payableCount: payableRows.length, payables: payableRows.slice(0, 10), profitability,
    next30: { expectedIn: expectedInCents / 100, expectedOut: expectedOutCents / 100, net: (expectedInCents - expectedOutCents) / 100 },
  } });
}));

router.get('/reports', requireFinancialPermission('viewFinancials'), asyncHandler(async (req, res) => {
  const accountId = req.membership.accountId;
  const groupId = String(req.query.groupId || '').trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const groupFilter = groupId ? { groupId } : {};
  const asOf = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
  if (Number.isNaN(asOf.getTime())) return res.status(400).json({ error: 'Select a valid report date range.' });

  const [invoices, events, bookings, contractors, clients, accountData, account] = await Promise.all([
    prisma.invoice.findMany({ where: { accountId, status: { notIn: ['draft', 'void'] } }, orderBy: { dueDate: 'asc' } }),
    prisma.event.findMany({ where: { accountId, deletedAt: null, ...groupFilter }, select: { id: true, groupId: true, name: true, eventDate: true, contractorBookings: true, otherExpenses: true } }),
    prisma.booking.findMany({ where: { accountId, deletedAt: null, ...groupFilter }, select: { id: true, groupId: true, eventName: true, eventDate: true, clientId: true, convertedEventId: true } }),
    prisma.contractor.findMany({ where: { accountId }, select: { id: true, firstName: true, lastName: true, pricingTiers: true } }),
    prisma.client.findMany({ where: { accountId }, select: { id: true, firstName: true, lastName: true } }),
    prisma.accountData.findUnique({ where: { accountId }, select: { data: true } }),
    prisma.account.findUnique({ where: { id: accountId }, select: { planTier: true } }),
  ]);

  const bookingById = new Map(bookings.map((booking) => [booking.id, booking]));
  const eventById = new Map(events.map((event) => [event.id, event]));
  const contractorById = new Map(contractors.map((contractor) => [contractor.id, contractor]));
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const inquiryStatuses = accountData?.data?.inquiryStatuses || [];
  const scopedBookingIds = new Set(bookings.map((booking) => booking.id));
  const scopedInvoices = invoices.filter((invoice) => (!groupId || scopedBookingIds.has(invoice.bookingId)) && (!invoice.sentAt || invoice.sentAt <= asOf));

  const agingTotals = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
  const receivables = scopedInvoices.map((invoice) => {
    const balance = Math.max(0, invoiceTotal(invoice) - (Number(invoice.paidAmount) || 0));
    if (balance <= 0) return null;
    const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
    const bucket = receivableAgingBucket(dueDate, asOf);
    agingTotals[bucket] += balance;
    const booking = bookingById.get(invoice.bookingId);
    const client = booking?.clientId ? clientById.get(booking.clientId) : null;
    const overdueDays = dueDate && dueDate < asOf ? Math.max(0, Math.floor((asOf - dueDate) / 86400000)) : 0;
    return { invoiceId: invoice.id, invoiceNumber: invoice.number, bookingId: invoice.bookingId, bookingName: booking?.eventName || 'Booking', clientName: client ? `${client.firstName} ${client.lastName}`.trim() : invoice.recipientName || 'Client', dueDate: invoice.dueDate, balance, overdueDays, bucket };
  }).filter(Boolean).sort((a, b) => b.overdueDays - a.overdueDays || b.balance - a.balance);

  const payables = [];
  const incompleteEventCosts = new Set();
  for (const event of events) {
    for (const assignment of event.contractorBookings || []) {
      const status = inquiryStatuses.find((item) => item.id === assignment.inquiryStatusId);
      if (status && (!status.isConfirmed && /not.?avail|declin/i.test(status.label || ''))) continue;
      const contractor = contractorById.get(assignment.contractorId);
      const expectedAmount = contractorAssignmentCost(assignment, contractor);
      if (expectedAmount === null) { incompleteEventCosts.add(event.id); continue; }
      if (assignment.paymentStatus !== 'paid' && inIsoDateRange(event.eventDate, from, to)) {
        const overdueDays = event.eventDate && event.eventDate < asOf.toISOString().slice(0, 10) ? Math.max(0, Math.floor((asOf - new Date(`${event.eventDate}T12:00:00.000Z`)) / 86400000)) : 0;
        payables.push({ eventId: event.id, eventName: event.name || 'Untitled event', eventDate: event.eventDate, contractorId: assignment.contractorId, contractorName: contractor ? `${contractor.firstName} ${contractor.lastName}`.trim() : 'Contractor', expectedAmount, overdueDays, pricingComplete: true });
      }
    }
  }
  payables.sort((a, b) => b.overdueDays - a.overdueDays || b.expectedAmount - a.expectedAmount);

  const qualityIssues = [];
  const invoicesWithoutDueDate = scopedInvoices.filter((invoice) => !invoice.dueDate && Math.max(0, invoiceTotal(invoice) - (Number(invoice.paidAmount) || 0)) > 0);
  if (invoicesWithoutDueDate.length) qualityIssues.push({ id: 'invoice-due-date', severity: 'warning', count: invoicesWithoutDueDate.length, title: 'Open invoices missing due dates', detail: 'These balances remain current and cannot be aged accurately.', links: invoicesWithoutDueDate.slice(0, 5).map((invoice) => ({ label: `Invoice #${invoice.number ?? '—'}`, path: `/bookings/${invoice.bookingId}?tab=invoices` })) });
  if (incompleteEventCosts.size) qualityIssues.push({ id: 'contractor-rates', severity: 'warning', count: incompleteEventCosts.size, title: 'Events missing contractor rates', detail: 'Booking profit may be overstated until these rates are entered.', links: [...incompleteEventCosts].slice(0, 5).map((eventId) => ({ label: eventById.get(eventId)?.name || 'Event', path: `/events/${eventId}?tab=financials` })) });
  const undatedEvents = events.filter((event) => !event.eventDate);
  if (undatedEvents.length) qualityIssues.push({ id: 'event-dates', severity: 'info', count: undatedEvents.length, title: 'Events missing dates', detail: 'These events are excluded from date-filtered reports.', links: undatedEvents.slice(0, 5).map((event) => ({ label: event.name || 'Untitled event', path: `/events/${event.id}` })) });
  if (account?.planTier === 'agency') {
    const unassigned = [...bookings.filter((booking) => !booking.groupId).map((booking) => ({ label: booking.eventName || 'Untitled booking', path: `/bookings/${booking.id}` })), ...events.filter((event) => !event.groupId).map((event) => ({ label: event.name || 'Untitled event', path: `/events/${event.id}` }))];
    if (unassigned.length) qualityIssues.push({ id: 'agency-groups', severity: 'info', count: unassigned.length, title: 'Records not assigned to a managed group', detail: 'They appear in agency totals but not in a group-specific report.', links: unassigned.slice(0, 5) });
  }

  res.json({ reports: {
    period: { from: from || null, to: to || null, asOf: asOf.toISOString() },
    receivables: { totals: agingTotals, total: Object.values(agingTotals).reduce((sum, amount) => sum + amount, 0), rows: receivables },
    payables: { total: payables.reduce((sum, row) => sum + row.expectedAmount, 0), overdueTotal: payables.filter((row) => row.overdueDays > 0).reduce((sum, row) => sum + row.expectedAmount, 0), rows: payables },
    dataQuality: { issueCount: qualityIssues.reduce((sum, issue) => sum + issue.count, 0), issues: qualityIssues },
  } });
}));

router.post('/export-events', requireFinancialPermission('exportFinancialReports'), asyncHandler(async (req, res) => {
  const format = String(req.body?.format || '');
  const report = String(req.body?.report || '');
  if (!['csv', 'pdf'].includes(format) || !REPORT_TABS.has(report)) return res.status(400).json({ error: 'Invalid financial export.' });
  const requestedFilters = req.body?.filters && typeof req.body.filters === 'object' ? req.body.filters : {};
  const filters = {
    from: String(requestedFilters.from || '').slice(0, 10),
    to: String(requestedFilters.to || '').slice(0, 10),
    groupId: String(requestedFilters.groupId || '').slice(0, 100),
  };
  await prisma.accountActivity.create({ data: { accountId: req.membership.accountId, actorUserId: req.session.userId, type: 'financial_report_exported', summary: `${report} financial report exported as ${format.toUpperCase()}`, metadata: { report, format, filters } } });
  res.json({ ok: true });
}));

router.post('/expenses', requireFinancialPermission('recordFinancialTransactions'), asyncHandler(async (req, res) => {
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

router.post('/:id/reverse', requireFinancialPermission('recordFinancialTransactions'), asyncHandler(async (req, res) => {
  const original = await prisma.financialTransaction.findFirst({ where: { id: req.params.id, accountId: req.membership.accountId }, include: { reversedBy: true } });
  if (!original) return res.status(404).json({ error: 'Transaction not found.' });
  if (original.reversalOfId || original.reversedBy) return res.status(400).json({ error: 'This transaction is already a correction or has already been reversed.' });
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'A correction reason is required.' });
  const transaction = await prisma.financialTransaction.create({ data: { accountId: original.accountId, groupId: original.groupId, bookingId: original.bookingId, eventId: original.eventId, invoiceId: original.invoiceId, contractorId: original.contractorId, clientId: original.clientId, category: 'reversal', amountCents: -original.amountCents, currency: original.currency, description: `Reversal · ${original.description}`, occurredAt: new Date(), sourceType: 'reversal', sourceId: original.id, memo: reason, metadata: { originalCategory: original.category, originalMetadata: original.metadata }, reversalOfId: original.id, createdById: req.session.userId } });
  res.status(201).json({ transaction: serialize({ ...transaction, reversedBy: null }) });
}));

export default router;
