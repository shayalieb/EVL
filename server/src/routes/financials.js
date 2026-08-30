import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions, requireRole } from '../lib/membership.js';
import { dollarsToCents } from '../lib/financialLedger.js';
import { invoiceTotal } from './invoices.js';
import { contractorAssignmentCost, financialMonthSequence, inIsoDateRange, proposalSnapshotTotal, receivableAgingBucket } from '../lib/financialReports.js';
import { assertFinancialPeriodOpen } from '../lib/financialPeriods.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

const EXPENSE_CATEGORIES = new Set(['contractor_payment', 'production', 'backline', 'travel', 'processing_fee', 'agency_commission', 'tax', 'reimbursement', 'other_expense']);
const METHODS = new Set(['ach', 'check', 'card', 'cash', 'wire', 'other']);
const REPORT_TABS = new Set(['pnl', 'receivables', 'payables', 'profitability']);

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

router.get('/reports', requireFinancialPermission('viewFinancials'), asyncHandler(async (req, res) => {
  const accountId = req.membership.accountId;
  const groupId = String(req.query.groupId || '').trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const groupFilter = groupId ? { groupId } : {};
  const asOf = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
  if (Number.isNaN(asOf.getTime())) return res.status(400).json({ error: 'Select a valid report date range.' });

  const [transactions, invoices, events, bookings, contractors, clients, accountData, account] = await Promise.all([
    prisma.financialTransaction.findMany({ where: { accountId, ...groupFilter, ...(dateRange(req) ? { occurredAt: dateRange(req) } : {}) }, select: { category: true, amountCents: true, bookingId: true, eventId: true, metadata: true } }),
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

  const pnlIncome = new Map();
  const pnlExpenses = new Map();
  for (const transaction of transactions) {
    const category = transaction.category === 'reversal' ? transaction.metadata?.originalCategory || 'adjustment' : transaction.category;
    const context = transaction.category === 'reversal' ? transaction.metadata?.originalMetadata || {} : transaction.metadata || {};
    const isIncome = category === 'client_payment' || (category === 'payment_adjustment' && !!context.invoiceStatus);
    const map = isIncome ? pnlIncome : pnlExpenses;
    const signedCents = isIncome ? transaction.amountCents : -transaction.amountCents;
    map.set(category, (map.get(category) || 0) + signedCents);
  }
  const income = [...pnlIncome.entries()].filter(([, cents]) => cents !== 0).map(([category, cents]) => ({ category, amount: cents / 100 })).sort((a, b) => b.amount - a.amount);
  const expenses = [...pnlExpenses.entries()].filter(([, cents]) => cents !== 0).map(([category, cents]) => ({ category, amount: cents / 100 })).sort((a, b) => b.amount - a.amount);
  const totalIncome = income.reduce((sum, row) => sum + row.amount, 0);
  const totalExpenses = expenses.reduce((sum, row) => sum + row.amount, 0);

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
  const eventCosts = new Map();
  const incompleteEventCosts = new Set();
  for (const event of events) {
    let contractorCost = 0;
    for (const assignment of event.contractorBookings || []) {
      const status = inquiryStatuses.find((item) => item.id === assignment.inquiryStatusId);
      if (status && (!status.isConfirmed && /not.?avail|declin/i.test(status.label || ''))) continue;
      const contractor = contractorById.get(assignment.contractorId);
      const expectedAmount = contractorAssignmentCost(assignment, contractor);
      if (expectedAmount === null) { incompleteEventCosts.add(event.id); continue; }
      contractorCost += expectedAmount;
      if (assignment.paymentStatus !== 'paid' && inIsoDateRange(event.eventDate, from, to)) {
        const overdueDays = event.eventDate && event.eventDate < asOf.toISOString().slice(0, 10) ? Math.max(0, Math.floor((asOf - new Date(`${event.eventDate}T12:00:00.000Z`)) / 86400000)) : 0;
        payables.push({ eventId: event.id, eventName: event.name || 'Untitled event', eventDate: event.eventDate, contractorId: assignment.contractorId, contractorName: contractor ? `${contractor.firstName} ${contractor.lastName}`.trim() : 'Contractor', expectedAmount, overdueDays, pricingComplete: true });
      }
    }
    const otherCosts = (event.otherExpenses || []).reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    eventCosts.set(event.id, { contractorCost, otherCosts });
  }
  payables.sort((a, b) => b.overdueDays - a.overdueDays || b.expectedAmount - a.expectedAmount);

  const profitability = bookings.filter((booking) => inIsoDateRange(booking.eventDate || eventById.get(booking.convertedEventId)?.eventDate, from, to)).map((booking) => {
    const bookingInvoices = scopedInvoices.filter((invoice) => invoice.bookingId === booking.id);
    const billed = bookingInvoices.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
    const collected = bookingInvoices.reduce((sum, invoice) => sum + (Number(invoice.paidAmount) || 0), 0);
    const event = booking.convertedEventId ? eventById.get(booking.convertedEventId) : null;
    const costs = event ? eventCosts.get(event.id) : null;
    const directLedgerExpenses = Math.max(0, -transactions.filter((tx) => {
      const category = tx.category === 'reversal' ? tx.metadata?.originalCategory : tx.category;
      return category !== 'contractor_payment' && EXPENSE_CATEGORIES.has(category) && (tx.bookingId === booking.id || (event && tx.eventId === event.id));
    }).reduce((sum, tx) => sum + tx.amountCents, 0) / 100);
    const knownCosts = (costs?.contractorCost || 0) + (costs?.otherCosts || 0) + directLedgerExpenses;
    const profit = billed - knownCosts;
    return { bookingId: booking.id, eventId: event?.id || null, name: booking.eventName || event?.name || 'Untitled booking', eventDate: booking.eventDate || event?.eventDate || null, billed, collected, outstanding: Math.max(0, billed - collected), contractorCosts: costs?.contractorCost || 0, otherCosts: (costs?.otherCosts || 0) + directLedgerExpenses, totalCosts: knownCosts, profit, margin: billed > 0 ? (profit / billed) * 100 : null, costingComplete: !event || !incompleteEventCosts.has(event.id) };
  }).filter((row) => row.billed > 0 || row.totalCosts > 0).sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || ''));

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
    profitAndLoss: { basis: 'cash', income, expenses, totalIncome, totalExpenses, netIncome: totalIncome - totalExpenses },
    receivables: { totals: agingTotals, total: Object.values(agingTotals).reduce((sum, amount) => sum + amount, 0), rows: receivables },
    payables: { total: payables.reduce((sum, row) => sum + row.expectedAmount, 0), overdueTotal: payables.filter((row) => row.overdueDays > 0).reduce((sum, row) => sum + row.expectedAmount, 0), rows: payables },
    profitability: { totalBilled: profitability.reduce((sum, row) => sum + row.billed, 0), totalCollected: profitability.reduce((sum, row) => sum + row.collected, 0), totalCosts: profitability.reduce((sum, row) => sum + row.totalCosts, 0), totalProfit: profitability.reduce((sum, row) => sum + row.profit, 0), rows: profitability },
    dataQuality: { issueCount: qualityIssues.reduce((sum, issue) => sum + issue.count, 0), issues: qualityIssues },
  } });
}));

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function transactionIsIncome(transaction) {
  const category = transaction.category === 'reversal' ? transaction.metadata?.originalCategory : transaction.category;
  const context = transaction.category === 'reversal' ? transaction.metadata?.originalMetadata || {} : transaction.metadata || {};
  return category === 'client_payment' || (category === 'payment_adjustment' && !!context.invoiceStatus);
}

router.get('/forecast', requireFinancialPermission('viewFinancials'), asyncHandler(async (req, res) => {
  const accountId = req.membership.accountId;
  const groupId = String(req.query.groupId || '').trim();
  const groupFilter = groupId ? { groupId } : {};
  const now = new Date();
  const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const trendMonths = financialMonthSequence(trendStart, 12);
  const futureStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const futureMonths = financialMonthSequence(futureStart, 6);
  const futureEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 6, 0, 23, 59, 59));

  const [transactions, invoices, bookings, events, contractors, accountData, budgets] = await Promise.all([
    prisma.financialTransaction.findMany({ where: { accountId, ...groupFilter, occurredAt: { gte: trendStart } }, select: { amountCents: true, category: true, occurredAt: true, metadata: true } }),
    prisma.invoice.findMany({ where: { accountId, status: { in: ['sent', 'partial', 'paid'] } } }),
    prisma.booking.findMany({ where: { accountId, deletedAt: null, completedAt: null, ...groupFilter }, select: { id: true, groupId: true, eventName: true, eventDate: true, bookingStatus: true, priority: true, proposal: true, contractSignedDate: true, convertedEventId: true } }),
    prisma.event.findMany({ where: { accountId, deletedAt: null, completedAt: null, ...groupFilter }, select: { id: true, name: true, eventDate: true, contractorBookings: true } }),
    prisma.contractor.findMany({ where: { accountId }, select: { id: true, firstName: true, lastName: true, pricingTiers: true } }),
    prisma.accountData.findUnique({ where: { accountId }, select: { data: true } }),
    prisma.financialBudget.findMany({ where: { accountId, groupKey: groupId || 'account', month: { gte: trendMonths[0].key, lte: futureMonths[futureMonths.length - 1].key } } }),
  ]);
  const bookingIds = new Set(bookings.map((booking) => booking.id));
  const scopedInvoices = groupId ? invoices.filter((invoice) => bookingIds.has(invoice.bookingId)) : invoices;
  const contractorById = new Map(contractors.map((contractor) => [contractor.id, contractor]));
  const statuses = accountData?.data?.bookingStatuses || [];
  const budgetByMonth = new Map(budgets.map((budget) => [budget.month, budget]));

  const trend = trendMonths.map((month) => {
    const rows = transactions.filter((transaction) => monthKey(transaction.occurredAt) === month.key);
    const income = rows.filter(transactionIsIncome).reduce((sum, row) => sum + row.amountCents, 0) / 100;
    const expenses = -rows.filter((row) => !transactionIsIncome(row)).reduce((sum, row) => sum + row.amountCents, 0) / 100;
    const budget = budgetByMonth.get(month.key);
    return { ...month, income, expenses, profit: income - expenses, revenueTarget: (budget?.revenueTargetCents || 0) / 100, expenseBudget: (budget?.expenseBudgetCents || 0) / 100 };
  });

  const cashFlow = futureMonths.map((month) => ({ ...month, expectedIn: 0, expectedOut: 0, net: 0 }));
  const cashByMonth = new Map(cashFlow.map((row) => [row.key, row]));
  for (const invoice of scopedInvoices) {
    const balance = Math.max(0, invoiceTotal(invoice) - (Number(invoice.paidAmount) || 0));
    if (balance <= 0) continue;
    if (invoice.dueDate && invoice.dueDate > futureEnd) continue;
    const due = invoice.dueDate && invoice.dueDate >= futureStart ? invoice.dueDate : futureStart;
    const target = cashByMonth.get(monthKey(due)) || cashFlow[0];
    target.expectedIn += balance;
  }
  const obligations = [];
  for (const event of events) {
    for (const assignment of event.contractorBookings || []) {
      if (assignment.paymentStatus === 'paid') continue;
      const contractor = contractorById.get(assignment.contractorId);
      const amount = contractorAssignmentCost(assignment, contractor);
      if (!(amount > 0)) continue;
      const eventDate = event.eventDate ? new Date(`${event.eventDate}T12:00:00.000Z`) : futureStart;
      const target = cashByMonth.get(monthKey(eventDate)) || (eventDate < futureStart ? cashFlow[0] : null);
      if (target) target.expectedOut += amount;
      obligations.push({ eventId: event.id, eventName: event.name || 'Untitled event', eventDate: event.eventDate, contractorName: contractor ? `${contractor.firstName} ${contractor.lastName}`.trim() : 'Contractor', amount });
    }
  }
  for (const row of cashFlow) row.net = row.expectedIn - row.expectedOut;

  const pipeline = bookings.map((booking) => {
    const statusLabel = statuses.find((status) => status.id === booking.bookingStatus)?.label || booking.bookingStatus || '';
    if (/lost|cancel|declin/i.test(statusLabel)) return null;
    if (booking.convertedEventId) return null;
    const value = proposalSnapshotTotal(booking.proposal);
    if (!(value > 0)) return null;
    let probability = 0.15;
    let stage = 'Inquiry';
    if (booking.contractSignedDate) { probability = 0.9; stage = 'Contract signed'; }
    else if (booking.proposal?.sentAt) { probability = 0.6; stage = 'Proposal sent'; }
    else if (booking.proposal) { probability = 0.35; stage = 'Proposal drafted'; }
    if (booking.priority === 'hot' && probability < 0.9) probability = Math.min(0.85, probability + 0.1);
    return { bookingId: booking.id, name: booking.eventName || 'Untitled booking', eventDate: booking.eventDate, stage, value, probability, weightedValue: value * probability };
  }).filter(Boolean).sort((a, b) => b.weightedValue - a.weightedValue);

  const overdue = scopedInvoices.map((invoice) => ({ invoice, balance: Math.max(0, invoiceTotal(invoice) - (Number(invoice.paidAmount) || 0)) })).filter(({ invoice, balance }) => balance > 0 && invoice.dueDate && invoice.dueDate < now);
  const alerts = [];
  const seriouslyOverdue = overdue.filter(({ invoice }) => (now - invoice.dueDate) / 86400000 >= 30);
  if (seriouslyOverdue.length) alerts.push({ id: 'overdue', severity: 'high', title: `${seriouslyOverdue.length} invoice${seriouslyOverdue.length === 1 ? '' : 's'} more than 30 days overdue`, detail: `${seriouslyOverdue.reduce((sum, row) => sum + row.balance, 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} needs collection follow-up.`, path: '/financials' });
  const negativeMonths = cashFlow.filter((row) => row.net < 0);
  if (negativeMonths.length) alerts.push({ id: 'cash-flow', severity: 'warning', title: `Projected cash shortfall in ${negativeMonths.length} upcoming month${negativeMonths.length === 1 ? '' : 's'}`, detail: 'Expected contractor payments exceed currently scheduled client collections.', path: '/financials' });
  const recentAverage = trend.slice(-3).reduce((sum, row) => sum + row.profit, 0) / 3;
  if (recentAverage < 0) alerts.push({ id: 'margin', severity: 'warning', title: 'Three-month cash profit is negative', detail: 'Review pricing, contractor costs, and uncollected invoices.', path: '/financials' });

  res.json({ forecast: { trend, cashFlow, pipeline: { total: pipeline.reduce((sum, row) => sum + row.value, 0), weightedTotal: pipeline.reduce((sum, row) => sum + row.weightedValue, 0), rows: pipeline.slice(0, 12) }, obligations: obligations.sort((a, b) => (a.eventDate || '').localeCompare(b.eventDate || '')).slice(0, 12), alerts } });
}));

router.put('/budgets/:month', requireFinancialPermission('manageFinancialBudgets'), asyncHandler(async (req, res) => {
  const month = String(req.params.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'Select a valid budget month.' });
  const groupId = String(req.body?.groupId || '').trim();
  if (groupId && !await prisma.agencyGroup.findFirst({ where: { id: groupId, accountId: req.membership.accountId } })) return res.status(400).json({ error: 'Invalid managed group.' });
  const revenueTargetCents = dollarsToCents(req.body?.revenueTarget);
  const expenseBudgetCents = dollarsToCents(req.body?.expenseBudget);
  if (revenueTargetCents < 0 || expenseBudgetCents < 0) return res.status(400).json({ error: 'Budget amounts cannot be negative.' });
  const budget = await prisma.financialBudget.upsert({ where: { accountId_groupKey_month: { accountId: req.membership.accountId, groupKey: groupId || 'account', month } }, create: { accountId: req.membership.accountId, groupId: groupId || null, groupKey: groupId || 'account', month, revenueTargetCents, expenseBudgetCents }, update: { revenueTargetCents, expenseBudgetCents } });
  res.json({ budget: { ...budget, revenueTarget: budget.revenueTargetCents / 100, expenseBudget: budget.expenseBudgetCents / 100 } });
}));

router.get('/periods', requireFinancialPermission('viewFinancials'), asyncHandler(async (req, res) => {
  const groupId = String(req.query.groupId || '').trim();
  const periods = await prisma.financialPeriod.findMany({
    where: { accountId: req.membership.accountId, groupKey: groupId || 'account' },
    include: { closedBy: { select: { firstName: true, lastName: true } }, activities: { include: { actor: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 10 } },
    orderBy: { month: 'desc' },
    take: 36,
  });
  res.json({ periods });
}));

router.post('/periods/:month/close', requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const month = String(req.params.month || '');
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month >= currentMonth) return res.status(400).json({ error: 'Only a completed month can be closed.' });
  const groupId = String(req.body?.groupId || '').trim();
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Enter a closing note.' });
  if (groupId && !await prisma.agencyGroup.findFirst({ where: { id: groupId, accountId: req.membership.accountId } })) return res.status(400).json({ error: 'Invalid managed group.' });
  const existing = await prisma.financialPeriod.findUnique({ where: { accountId_groupKey_month: { accountId: req.membership.accountId, groupKey: groupId || 'account', month } } });
  if (existing?.status === 'closed') return res.status(409).json({ error: 'This accounting period is already closed.' });
  const period = await prisma.$transaction(async (tx) => {
    const saved = await tx.financialPeriod.upsert({ where: { accountId_groupKey_month: { accountId: req.membership.accountId, groupKey: groupId || 'account', month } }, create: { accountId: req.membership.accountId, groupId: groupId || null, groupKey: groupId || 'account', month, status: 'closed', closedById: req.session.userId }, update: { status: 'closed', closedAt: new Date(), closedById: req.session.userId } });
    await tx.financialPeriodActivity.create({ data: { accountId: req.membership.accountId, periodId: saved.id, actorId: req.session.userId, action: 'closed', reason } });
    return saved;
  });
  res.json({ period });
}));

router.post('/periods/:month/reopen', requireRole('owner'), asyncHandler(async (req, res) => {
  const month = String(req.params.month || '');
  const groupId = String(req.body?.groupId || '').trim();
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'A reopening reason is required.' });
  const existing = await prisma.financialPeriod.findUnique({ where: { accountId_groupKey_month: { accountId: req.membership.accountId, groupKey: groupId || 'account', month } } });
  if (!existing || existing.status !== 'closed') return res.status(404).json({ error: 'Closed accounting period not found.' });
  const period = await prisma.$transaction(async (tx) => {
    const saved = await tx.financialPeriod.update({ where: { id: existing.id }, data: { status: 'open' } });
    await tx.financialPeriodActivity.create({ data: { accountId: req.membership.accountId, periodId: saved.id, actorId: req.session.userId, action: 'reopened', reason } });
    return saved;
  });
  res.json({ period });
}));

router.get('/saved-views', requireFinancialPermission('viewFinancials'), asyncHandler(async (req, res) => {
  const views = await prisma.savedFinancialReport.findMany({ where: { accountId: req.membership.accountId, userId: req.session.userId }, orderBy: { updatedAt: 'desc' } });
  res.json({ views });
}));

router.post('/saved-views', requireFinancialPermission('viewFinancials'), asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const reportTab = String(req.body?.reportTab || 'pnl');
  const filters = req.body?.filters && typeof req.body.filters === 'object' ? req.body.filters : {};
  if (!name || name.length > 80) return res.status(400).json({ error: 'Enter a view name up to 80 characters.' });
  if (!REPORT_TABS.has(reportTab)) return res.status(400).json({ error: 'Select a valid report.' });
  const safeFilters = { from: String(filters.from || '').slice(0, 10), to: String(filters.to || '').slice(0, 10), groupId: String(filters.groupId || '').slice(0, 100) };
  if (safeFilters.groupId && !await prisma.agencyGroup.findFirst({ where: { id: safeFilters.groupId, accountId: req.membership.accountId } })) return res.status(400).json({ error: 'Invalid managed group.' });
  const view = await prisma.savedFinancialReport.upsert({ where: { userId_name: { userId: req.session.userId, name } }, create: { accountId: req.membership.accountId, userId: req.session.userId, name, reportTab, filters: safeFilters }, update: { reportTab, filters: safeFilters } });
  res.status(201).json({ view });
}));

router.delete('/saved-views/:id', requireFinancialPermission('viewFinancials'), asyncHandler(async (req, res) => {
  const existing = await prisma.savedFinancialReport.findFirst({ where: { id: req.params.id, accountId: req.membership.accountId, userId: req.session.userId } });
  if (!existing) return res.status(404).json({ error: 'Saved view not found.' });
  await prisma.savedFinancialReport.delete({ where: { id: existing.id } });
  res.json({ ok: true });
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
  await assertFinancialPeriodOpen({ accountId: req.membership.accountId, groupId: groupId || null, occurredAt: transactionDate });
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
