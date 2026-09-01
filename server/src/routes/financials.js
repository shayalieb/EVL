import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { dollarsToCents } from '../lib/financialLedger.js';
import { invoiceTotal } from './invoices.js';
import { bookingProfitabilitySnapshot, contractorAssignmentCost, contractorPaymentTiming, inIsoDateRange, plausibleIsoDate, receivableAgingBucket } from '../lib/financialReports.js';
import { createSignedUpload, deleteFile, getSignedDownloadUrl, getSignedPreviewUrl, uploadedFileSize } from '../lib/fileStorage.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

const EXPENSE_CATEGORIES = new Set(['contractor_payment', 'production', 'backline', 'travel', 'processing_fee', 'agency_commission', 'tax', 'reimbursement', 'other_expense']);
const METHODS = new Set(['ach', 'check', 'card', 'cash', 'wire', 'other']);
const REPORT_TABS = new Set(['receivables', 'payables']);
const RECEIPT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const RECEIPT_EXTENSIONS = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;
const MAX_RECEIPT_SIZE = 10 * 1024 * 1024;

function hasPermission(req, permission) {
  return !!effectivePermissions(req.membership)[permission];
}

function requireFinancialPermission(permission) {
  return (req, res, next) => hasPermission(req, permission) ? next() : res.status(403).json({ error: 'Not authorized.' });
}

function serialize(tx) {
  return { ...tx, amount: tx.amountCents / 100, reversed: !!tx.reversedBy, reversedBy: undefined };
}

function objectMetadata(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function dateRange(req) {
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : null;
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : null;
  return from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
}

async function enrichTransactions(accountId, transactions) {
  const bookingIds = [...new Set(transactions.map((tx) => tx.bookingId).filter(Boolean))];
  const eventIds = [...new Set(transactions.map((tx) => tx.eventId).filter(Boolean))];
  const contractorIds = [...new Set(transactions.map((tx) => tx.contractorId).filter(Boolean))];
  const invoiceIds = [...new Set(transactions.map((tx) => tx.invoiceId).filter(Boolean))];
  const [bookings, events, contractors, invoices] = await Promise.all([
    prisma.booking.findMany({ where: { accountId, id: { in: bookingIds } }, select: { id: true, eventName: true } }),
    prisma.event.findMany({ where: { accountId, id: { in: eventIds } }, select: { id: true, name: true } }),
    prisma.contractor.findMany({ where: { accountId, id: { in: contractorIds } }, select: { id: true, firstName: true, lastName: true } }),
    prisma.invoice.findMany({ where: { accountId, id: { in: invoiceIds } }, select: { id: true, number: true, bookingId: true } }),
  ]);
  const bookingById = new Map(bookings.map((item) => [item.id, item]));
  const eventById = new Map(events.map((item) => [item.id, item]));
  const contractorById = new Map(contractors.map((item) => [item.id, item]));
  const invoiceById = new Map(invoices.map((item) => [item.id, item]));
  return transactions.map((tx) => {
    const contractor = contractorById.get(tx.contractorId);
    return serialize({ ...tx, relatedBooking: bookingById.get(tx.bookingId) || null, relatedEvent: eventById.get(tx.eventId) || null, relatedContractor: contractor ? { id: contractor.id, name: `${contractor.firstName} ${contractor.lastName}`.trim() } : null, relatedInvoice: invoiceById.get(tx.invoiceId) || null });
  });
}

router.get('/', requireFinancialPermission('viewFinancials'), asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 30));
  const search = String(req.query.search || '').trim().slice(0, 100);
  const direction = String(req.query.direction || '');
  const relatedMatches = search ? await Promise.all([
    prisma.booking.findMany({ where: { accountId: req.membership.accountId, eventName: { contains: search, mode: 'insensitive' } }, select: { id: true }, take: 100 }),
    prisma.event.findMany({ where: { accountId: req.membership.accountId, name: { contains: search, mode: 'insensitive' } }, select: { id: true }, take: 100 }),
    prisma.contractor.findMany({ where: { accountId: req.membership.accountId, OR: [{ firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }] }, select: { id: true }, take: 100 }),
  ]) : [[], [], []];
  const where = {
    accountId: req.membership.accountId,
    ...(req.query.groupId ? { groupId: req.query.groupId } : {}),
    ...(req.query.bookingId ? { bookingId: req.query.bookingId } : {}),
    ...(req.query.category ? { category: req.query.category } : {}),
    ...(direction === 'in' ? { amountCents: { gt: 0 } } : direction === 'out' ? { amountCents: { lt: 0 } } : {}),
    ...(dateRange(req) ? { occurredAt: dateRange(req) } : {}),
    ...(search ? { OR: [
      { description: { contains: search, mode: 'insensitive' } },
      { reference: { contains: search, mode: 'insensitive' } },
      { memo: { contains: search, mode: 'insensitive' } },
      { bookingId: { in: relatedMatches[0].map((item) => item.id) } },
      { eventId: { in: relatedMatches[1].map((item) => item.id) } },
      { contractorId: { in: relatedMatches[2].map((item) => item.id) } },
    ] } : {}),
  };
  const [transactions, total] = await Promise.all([
    prisma.financialTransaction.findMany({ where, include: { group: { select: { name: true } }, createdBy: { select: { firstName: true, lastName: true } }, reversedBy: { select: { id: true } } }, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.financialTransaction.count({ where }),
  ]);
  res.json({ transactions: await enrichTransactions(req.membership.accountId, transactions), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) });
}));

router.get('/summary', requireFinancialPermission('viewFinancials'), asyncHandler(async (req, res) => {
  const accountId = req.membership.accountId;
  const occurredAt = dateRange(req);
  const groupFilter = req.query.groupId ? { groupId: req.query.groupId } : {};
  const [transactions, invoices, events, bookings, contractors, accountData, paymentRequests] = await Promise.all([
    prisma.financialTransaction.findMany({ where: { accountId, ...groupFilter, ...(occurredAt ? { occurredAt } : {}) }, select: { amountCents: true, category: true } }),
    prisma.invoice.findMany({ where: { accountId, status: { in: ['sent', 'partial', 'paid'] } } }),
    prisma.event.findMany({ where: { accountId, deletedAt: null, ...groupFilter }, select: { id: true, name: true, eventDate: true, noOutsideContractorsNeeded: true, contractorBookings: true, otherExpenses: true } }),
    prisma.booking.findMany({ where: { accountId, deletedAt: null, ...groupFilter }, select: { id: true, eventName: true, convertedEventId: true } }),
    prisma.contractor.findMany({ where: { accountId }, select: { id: true, firstName: true, lastName: true, pricingTiers: true } }),
    prisma.accountData.findUnique({ where: { accountId }, select: { data: true } }),
    prisma.contractorPaymentRequest.findMany({ where: { accountId }, select: { id: true, eventId: true, contractorId: true, status: true, amountCents: true, invoiceNumber: true, note: true, submittedAt: true } }),
  ]);
  const scopedBookingIds = new Set(bookings.map((booking) => booking.id));
  const scopedInvoices = req.query.groupId ? invoices.filter((invoice) => scopedBookingIds.has(invoice.bookingId)) : invoices;
  const inflowCents = transactions.reduce((sum, tx) => sum + Math.max(0, tx.amountCents), 0);
  const outflowCents = Math.abs(transactions.reduce((sum, tx) => sum + Math.min(0, tx.amountCents), 0));
  const receivableCents = scopedInvoices.reduce((sum, invoice) => sum + Math.max(0, dollarsToCents(invoiceTotal(invoice)) - dollarsToCents(invoice.paidAmount)), 0);
  const contractorById = new Map(contractors.map((c) => [c.id, c]));
  const bookingByEvent = new Map(bookings.filter((booking) => booking.convertedEventId).map((booking) => [booking.convertedEventId, booking]));
  const inquiryStatuses = accountData?.data?.inquiryStatuses || [];
  const paymentRequestByGig = new Map(paymentRequests.map((request) => [`${request.eventId}:${request.contractorId}`, request]));
  const isUnavailable = (assignment) => {
    const status = inquiryStatuses.find((item) => item.id === assignment.inquiryStatusId);
    return status && (!status.isConfirmed && /not.?avail|declin/i.test(status.label || ''));
  };
  const contractorCostRows = [];
  const payableRows = [];
  const missingRateRows = [];
  // "Expected in the next 30 days" — a single forward-looking number in
  // place of the old multi-month forecast dashboard. Mirrors that
  // dashboard's own leniency: anything already overdue (or with no due
  // date at all) still counts as expected, rather than silently dropping
  // off once its original date has passed.
  const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  let expectedOutCents = 0;
  for (const event of events) {
    const relatedBooking = bookingByEvent.get(event.id);
    for (const booking of event.contractorBookings || []) {
      if (isUnavailable(booking)) continue;
      const contractor = contractorById.get(booking.contractorId);
      const amount = contractorAssignmentCost(booking, contractor);
      if (amount === null && booking.paymentStatus !== 'paid') {
        missingRateRows.push({ assignmentId: booking.id || booking.contractorId, eventId: event.id, eventName: event.name, eventDate: event.eventDate, bookingId: relatedBooking?.id || null, bookingName: relatedBooking?.eventName || null, contractorId: booking.contractorId, contractorName: contractor ? `${contractor.firstName} ${contractor.lastName}`.trim() : 'Contractor' });
      }
      if (amount !== null && amount > 0) {
        const timing = contractorPaymentTiming({ dueDate: booking.paymentDueDate, eventDate: event.eventDate });
        const request = paymentRequestByGig.get(`${event.id}:${booking.contractorId}`);
        const row = { assignmentId: booking.id || booking.contractorId, eventId: event.id, eventName: event.name, eventDate: event.eventDate, bookingId: relatedBooking?.id || null, bookingName: relatedBooking?.eventName || null, paymentDueDate: plausibleIsoDate(booking.paymentDueDate), contractorId: booking.contractorId, contractorName: contractor ? `${contractor.firstName} ${contractor.lastName}`.trim() : 'Contractor', amount, paymentRequest: request ? { id: request.id, status: request.status, amount: request.amountCents / 100, invoiceNumber: request.invoiceNumber, note: request.note, submittedAt: request.submittedAt } : null, ...timing };
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
  const profitability = bookings.map((booking) => {
    const billed = scopedInvoices.filter((invoice) => invoice.bookingId === booking.id).reduce((sum, invoice) => sum + (invoice.status === 'void' ? 0 : invoiceTotal(invoice)), 0);
    const event = events.find((item) => bookingByEvent.get(item.id)?.id === booking.id);
    const assignments = (event?.contractorBookings || []).filter((assignment) => !isUnavailable(assignment));
    const snapshot = bookingProfitabilitySnapshot({ billed, event, assignments, contractorById });
    return billed > 0 ? { bookingId: booking.id, eventId: event?.id || null, name: booking.eventName || event?.name || 'Untitled booking', billed, ...snapshot } : null;
  }).filter(Boolean).sort((a, b) => b.billed - a.billed).slice(0, 10);
  const paymentPriority = { overdue: 0, due: 1, missing: 2, upcoming: 3 };
  payableRows.sort((a, b) => paymentPriority[a.status] - paymentPriority[b.status] || (a.effectiveDueDate || '').localeCompare(b.effectiveDueDate || '') || b.amount - a.amount);
  res.json({ summary: {
    inflow: inflowCents / 100, outflow: outflowCents / 100, netCash: (inflowCents - outflowCents) / 100,
    accountsReceivable: receivableCents / 100, accountsPayable: payableRows.reduce((sum, row) => sum + row.amount, 0), payableCount: payableRows.length, payables: payableRows.slice(0, 10), missingRateCount: missingRateRows.length, missingRates: missingRateRows.slice(0, 10), profitability,
    next30: { expectedIn: expectedInCents / 100, expectedOut: expectedOutCents / 100, net: (expectedInCents - expectedOutCents) / 100 },
  } });
}));

router.patch('/contractor-payments/:eventId/:assignmentId', requireFinancialPermission('recordFinancialTransactions'), asyncHandler(async (req, res) => {
  const event = await prisma.event.findFirst({ where: { id: req.params.eventId, accountId: req.membership.accountId, deletedAt: null } });
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  const assignments = [...(event.contractorBookings || [])];
  const assignmentIndex = assignments.findIndex((item) => item.id === req.params.assignmentId || (!item.id && item.contractorId === req.params.assignmentId));
  if (assignmentIndex < 0) return res.status(404).json({ error: 'Contractor assignment not found.' });
  const existing = assignments[assignmentIndex];
  const paymentDueDate = req.body?.paymentDueDate;
  const markPaid = req.body?.markPaid === true;
  if (!markPaid && paymentDueDate === undefined) return res.status(400).json({ error: 'Select a payment due date or mark the payment paid.' });
  // Requires a plausible 4-digit year, not just any 4 digits — a native
  // <input type="date"> can commit a partial year while someone's still
  // typing (e.g. "0002" instead of "2026"), and a bare \d{4} would happily
  // accept that and later render as "45320 days overdue."
  if (paymentDueDate !== undefined && paymentDueDate !== null && paymentDueDate !== '' && !/^(19|20)\d{2}-\d{2}-\d{2}$/.test(paymentDueDate)) return res.status(400).json({ error: 'Select a valid payment due date.' });
  if (!markPaid) {
    assignments[assignmentIndex] = { ...existing, paymentDueDate: paymentDueDate || null };
    await prisma.event.update({ where: { id: event.id }, data: { contractorBookings: assignments } });
    return res.json({ payment: { eventId: event.id, assignmentId: req.params.assignmentId, paymentDueDate: paymentDueDate || null, ...contractorPaymentTiming({ dueDate: paymentDueDate || null, eventDate: event.eventDate }) } });
  }
  if (existing.paymentStatus === 'paid') return res.status(409).json({ error: 'This contractor payment is already marked paid.' });
  const amount = Number(req.body?.amount);
  const paymentDate = String(req.body?.paymentDate || '');
  const paymentMethod = String(req.body?.paymentMethod || '');
  if (!(amount > 0)) return res.status(400).json({ error: 'Enter an amount greater than $0.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return res.status(400).json({ error: 'Select a valid payment date.' });
  if (!METHODS.has(paymentMethod)) return res.status(400).json({ error: 'Select a valid payment method.' });
  const contractor = await prisma.contractor.findFirst({ where: { id: existing.contractorId, accountId: event.accountId }, select: { firstName: true, lastName: true } });
  const contractorName = contractor ? `${contractor.firstName} ${contractor.lastName}`.trim() : 'Contractor';
  assignments[assignmentIndex] = { ...existing, paymentStatus: 'paid', paidAmount: amount, paidAt: paymentDate, paymentMethod, paymentReference: String(req.body?.paymentReference || '').trim().slice(0, 160) || null, paymentMemo: String(req.body?.paymentMemo || '').trim().slice(0, 1000) || null };
  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: event.id }, data: { contractorBookings: assignments } });
    await tx.financialTransaction.create({ data: { accountId: event.accountId, groupId: event.groupId, eventId: event.id, contractorId: existing.contractorId || null, category: 'contractor_payment', amountCents: -dollarsToCents(amount), description: `Contractor paid · ${contractorName}`, occurredAt: new Date(`${paymentDate}T12:00:00.000Z`), sourceType: 'event_contractor_payment', sourceId: randomUUID(), paymentMethod, reference: String(req.body?.paymentReference || '').trim().slice(0, 160) || null, memo: String(req.body?.paymentMemo || '').trim().slice(0, 1000) || null, metadata: { contractorBookingId: existing.id || req.params.assignmentId, previousPaidAmount: 0, newPaidAmount: amount }, createdById: req.session.userId } });
    await tx.contractorPaymentRequest.updateMany({ where: { accountId: event.accountId, eventId: event.id, contractorId: existing.contractorId }, data: { status: 'paid', paidAt: new Date(`${paymentDate}T12:00:00.000Z`), reviewedAt: new Date() } });
  });
  res.json({ payment: { eventId: event.id, assignmentId: req.params.assignmentId, paymentStatus: 'paid', paidAmount: amount, paidAt: paymentDate, paymentMethod } });
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
        const timing = contractorPaymentTiming({ dueDate: assignment.paymentDueDate, eventDate: event.eventDate, today: asOf.toISOString().slice(0, 10) });
        payables.push({ assignmentId: assignment.id || assignment.contractorId, eventId: event.id, eventName: event.name || 'Untitled event', eventDate: event.eventDate, paymentDueDate: plausibleIsoDate(assignment.paymentDueDate), contractorId: assignment.contractorId, contractorName: contractor ? `${contractor.firstName} ${contractor.lastName}`.trim() : 'Contractor', expectedAmount, pricingComplete: true, ...timing });
      }
    }
  }
  const payablePriority = { overdue: 0, due: 1, missing: 2, upcoming: 3 };
  payables.sort((a, b) => payablePriority[a.status] - payablePriority[b.status] || (a.effectiveDueDate || '').localeCompare(b.effectiveDueDate || '') || b.expectedAmount - a.expectedAmount);

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

router.post('/bookkeeper-export', requireFinancialPermission('exportFinancialReports'), asyncHandler(async (req, res) => {
  const accountId = req.membership.accountId;
  const from = String(req.body?.from || '').trim();
  const to = String(req.body?.to || '').trim();
  const groupId = String(req.body?.groupId || '').trim();
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) || (from && to && from > to)) return res.status(400).json({ error: 'Select a valid export date range.' });
  const group = groupId ? await prisma.agencyGroup.findFirst({ where: { id: groupId, accountId }, select: { id: true, name: true } }) : null;
  if (groupId && !group) return res.status(400).json({ error: 'Invalid managed group.' });
  const where = { accountId, ...(groupId ? { groupId } : {}), ...(from || to ? { occurredAt: { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } } : {}) };
  const total = await prisma.financialTransaction.count({ where });
  if (total > 5000) return res.status(413).json({ error: 'This period has more than 5,000 payments. Choose a shorter date range.' });
  const rawTransactions = await prisma.financialTransaction.findMany({ where, include: { group: { select: { name: true } }, createdBy: { select: { firstName: true, lastName: true } }, reversedBy: { select: { id: true } } }, orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }] });
  const transactions = await enrichTransactions(accountId, rawTransactions);
  const activeExpenses = transactions.filter((tx) => tx.amount < 0 && !tx.reversed && !tx.reversalOfId);
  const activeTransactions = transactions.filter((tx) => !tx.reversed && !tx.reversalOfId);
  const receipts = activeExpenses.filter((tx) => tx.metadata?.receipt);
  const summary = {
    transactionCount: transactions.length,
    moneyReceived: activeTransactions.reduce((sum, tx) => sum + Math.max(0, tx.amount), 0),
    moneyPaidOut: Math.abs(activeTransactions.reduce((sum, tx) => sum + Math.min(0, tx.amount), 0)),
    receiptCount: receipts.length,
    receiptBytes: receipts.reduce((sum, tx) => sum + (Number(tx.metadata.receipt.size) || 0), 0),
    missingReceiptCount: activeExpenses.filter((tx) => !tx.metadata?.receipt).length,
    missingPayeeCount: activeExpenses.filter((tx) => !tx.metadata?.payee).length,
    unlinkedCount: activeExpenses.filter((tx) => !tx.bookingId && !tx.eventId && !tx.contractorId && !tx.invoiceId).length,
  };
  if (req.body?.preview !== true) await prisma.accountActivity.create({ data: { accountId, actorUserId: req.session.userId, type: 'bookkeeper_export_created', summary: 'Bookkeeper package exported', metadata: { from: from || null, to: to || null, groupId: groupId || null, transactionCount: transactions.length, receiptCount: receipts.length } } });
  res.json({ exportData: { period: { from: from || null, to: to || null }, scope: { groupId: groupId || null, groupName: group?.name || null }, summary: { ...summary, net: summary.moneyReceived - summary.moneyPaidOut }, transactions } });
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
  const { amount, category, description, occurredAt, groupId, bookingId, eventId, contractorId, paymentMethod, reference, memo, payee, clientRequestId } = req.body || {};
  const accountId = req.membership.accountId;
  const amountCents = dollarsToCents(amount);
  if (!(amountCents > 0)) return res.status(400).json({ error: 'Amount must be greater than $0.' });
  if (!EXPENSE_CATEGORIES.has(category)) return res.status(400).json({ error: 'Select a valid expense category.' });
  if (!description?.trim()) return res.status(400).json({ error: 'Description is required.' });
  if (paymentMethod && !METHODS.has(paymentMethod)) return res.status(400).json({ error: 'Select a valid payment method.' });
  const relationshipIds = [bookingId, eventId, contractorId].filter(Boolean);
  if (relationshipIds.length > 1) return res.status(400).json({ error: 'Attach the payment to only one record.' });
  const [group, booking, event, contractor] = await Promise.all([
    groupId ? prisma.agencyGroup.findFirst({ where: { id: groupId, accountId }, select: { id: true } }) : null,
    bookingId ? prisma.booking.findFirst({ where: { id: bookingId, accountId }, select: { id: true, groupId: true } }) : null,
    eventId ? prisma.event.findFirst({ where: { id: eventId, accountId }, select: { id: true, groupId: true } }) : null,
    contractorId ? prisma.contractor.findFirst({ where: { id: contractorId, accountId }, select: { id: true } }) : null,
  ]);
  if (groupId && !group) return res.status(400).json({ error: 'Invalid managed group.' });
  if (bookingId && !booking) return res.status(400).json({ error: 'The selected booking is not available.' });
  if (eventId && !event) return res.status(400).json({ error: 'The selected event is not available.' });
  if (contractorId && !contractor) return res.status(400).json({ error: 'The selected contractor is not available.' });
  const linkedGroupId = booking?.groupId || event?.groupId || null;
  if (groupId && linkedGroupId && groupId !== linkedGroupId) return res.status(400).json({ error: 'The selected record belongs to a different managed group.' });
  const resolvedGroupId = groupId || linkedGroupId || null;
  const transactionDate = occurredAt ? new Date(`${occurredAt}T12:00:00.000Z`) : new Date();
  if (Number.isNaN(transactionDate.getTime())) return res.status(400).json({ error: 'Select a valid payment date.' });
  const requestId = typeof clientRequestId === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(clientRequestId) ? clientRequestId : null;
  const sourceId = requestId || randomUUID();
  if (requestId) {
    const existing = await prisma.financialTransaction.findFirst({ where: { accountId, sourceType: 'manual_expense', sourceId: requestId } });
    if (existing) return res.json({ transaction: serialize({ ...existing, reversedBy: null }), duplicate: true });
  }
  try {
    const transaction = await prisma.financialTransaction.create({ data: { accountId, groupId: resolvedGroupId, bookingId: bookingId || null, eventId: eventId || null, contractorId: contractorId || null, category, amountCents: -amountCents, description: description.trim().slice(0, 500), occurredAt: transactionDate, sourceType: 'manual_expense', sourceId, paymentMethod: paymentMethod || null, reference: String(reference || '').trim().slice(0, 200) || null, memo: String(memo || '').trim().slice(0, 1000) || null, metadata: { ...(requestId ? { clientRequestId: requestId } : {}), ...(String(payee || '').trim() ? { payee: String(payee).trim().slice(0, 160) } : {}) }, createdById: req.session.userId } });
    return res.status(201).json({ transaction: serialize({ ...transaction, reversedBy: null }) });
  } catch (error) {
    if (requestId && error?.code === 'P2002') {
      const existing = await prisma.financialTransaction.findFirst({ where: { accountId, sourceType: 'manual_expense', sourceId: requestId } });
      if (existing) return res.json({ transaction: serialize({ ...existing, reversedBy: null }), duplicate: true });
    }
    throw error;
  }
}));

router.post('/:id/receipt-upload-url', requireFinancialPermission('recordFinancialTransactions'), asyncHandler(async (req, res) => {
  const transaction = await prisma.financialTransaction.findFirst({ where: { id: req.params.id, accountId: req.membership.accountId }, select: { amountCents: true, metadata: true } });
  if (!transaction) return res.status(404).json({ error: 'Payment not found.' });
  if (transaction.amountCents >= 0) return res.status(400).json({ error: 'Receipts can only be attached to money paid out.' });
  if (transaction.metadata?.receipt) return res.status(409).json({ error: 'This payment already has a receipt.' });
  const filename = String(req.body?.filename || '').trim();
  const contentType = String(req.body?.contentType || '').toLowerCase();
  const size = Number(req.body?.size);
  if (!filename || !RECEIPT_EXTENSIONS.test(filename) || !RECEIPT_TYPES.has(contentType)) return res.status(400).json({ error: 'Choose a PDF, JPG, PNG, WebP, or HEIC receipt.' });
  if (!Number.isInteger(size) || size <= 0) return res.status(400).json({ error: 'The receipt file is empty or invalid.' });
  if (size > MAX_RECEIPT_SIZE) return res.status(413).json({ error: 'Receipt is too large (10MB max).' });
  res.json(await createSignedUpload({ accountId: req.membership.accountId, contentType }));
}));

router.post('/:id/receipt', requireFinancialPermission('recordFinancialTransactions'), asyncHandler(async (req, res) => {
  const accountId = req.membership.accountId;
  const transaction = await prisma.financialTransaction.findFirst({ where: { id: req.params.id, accountId } });
  if (!transaction) return res.status(404).json({ error: 'Payment not found.' });
  if (transaction.amountCents >= 0) return res.status(400).json({ error: 'Receipts can only be attached to money paid out.' });
  const { storageKey } = req.body || {};
  const filename = String(req.body?.filename || '').trim();
  const contentType = String(req.body?.contentType || '').toLowerCase();
  const size = Number(req.body?.size);
  if (transaction.metadata?.receipt?.storageKey === storageKey) return res.json({ receipt: transaction.metadata.receipt });
  if (transaction.metadata?.receipt) return res.status(409).json({ error: 'This payment already has a receipt.' });
  if (!storageKey?.startsWith(`${accountId}/`) || !filename || !RECEIPT_EXTENSIONS.test(filename) || !RECEIPT_TYPES.has(contentType) || !Number.isInteger(size) || size <= 0) return res.status(400).json({ error: 'Invalid receipt upload.' });
  if (size > MAX_RECEIPT_SIZE) return res.status(413).json({ error: 'Receipt is too large (10MB max).' });
  const actualSize = await uploadedFileSize(storageKey);
  if (actualSize === null) return res.status(409).json({ error: 'Receipt upload has not completed.' });
  if (actualSize !== size || actualSize > MAX_RECEIPT_SIZE) {
    await deleteFile(storageKey);
    return res.status(400).json({ error: 'Uploaded receipt size does not match.' });
  }
  const alreadyAttached = await prisma.financialTransaction.findFirst({ where: { accountId, metadata: { path: ['receipt', 'storageKey'], equals: storageKey } }, select: { id: true } });
  if (alreadyAttached) return res.status(409).json({ error: 'This receipt is already attached to a payment.' });
  const receipt = { storageKey, filename: filename.slice(0, 240), contentType, size, uploadedAt: new Date().toISOString(), uploadedById: req.session.userId };
  await prisma.financialTransaction.update({ where: { id: transaction.id }, data: { metadata: { ...objectMetadata(transaction.metadata), receipt } } });
  res.status(201).json({ receipt });
}));

router.get('/:id/receipt', requireFinancialPermission('viewFinancials'), asyncHandler(async (req, res) => {
  const transaction = await prisma.financialTransaction.findFirst({ where: { id: req.params.id, accountId: req.membership.accountId }, select: { metadata: true } });
  const receipt = transaction?.metadata?.receipt;
  if (!receipt?.storageKey) return res.status(404).json({ error: 'Receipt not found.' });
  const url = req.query.download === '1' ? await getSignedDownloadUrl(receipt.storageKey, receipt.filename) : await getSignedPreviewUrl(receipt.storageKey);
  res.redirect(302, url);
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
