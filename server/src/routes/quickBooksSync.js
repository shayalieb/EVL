import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { queryQuickBooks, validQuickBooksAccess, writeQuickBooks } from '../lib/quickBooks.js';
import { quickBooksSetupReadiness } from '../lib/quickBooksMappings.js';
import { contractorAssignmentCost } from '../lib/financialReports.js';
import { contractorBillEligibility, contractorBillLocalId, paymentSyncEligibility, quickBooksBillPayload, quickBooksCustomerCandidate, quickBooksCustomerPayload, quickBooksInvoicePayload, quickBooksPaymentPayload, quickBooksVendorCandidate, quickBooksVendorPayload } from '../lib/quickBooksSync.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

function requireFinancialPermission(req, res) {
  const permissions = effectivePermissions(req.membership);
  if (!permissions.viewFinancials || !permissions.manageBookings) { res.status(403).json({ error: 'Not authorized.' }); return false; }
  return true;
}

async function connectionContext(accountId) {
  const [connection, groups] = await Promise.all([
    prisma.quickBooksConnection.findUnique({ where: { accountId } }),
    prisma.agencyGroup.findMany({ where: { accountId, active: true }, select: { id: true, name: true } }),
  ]);
  if (!connection || connection.status !== 'active') throw Object.assign(new Error('Connect QuickBooks before synchronizing.'), { status: 409, expose: true });
  if (!quickBooksSetupReadiness(connection, groups).ready) throw Object.assign(new Error('Complete QuickBooks accounting setup before synchronizing.'), { status: 409, expose: true });
  const access = await validQuickBooksAccess(connection);
  if (access.tokenData) await prisma.quickBooksConnection.update({ where: { id: connection.id }, data: access.tokenData });
  return { connection, groups, accessToken: access.accessToken };
}

async function allQuickBooksCustomers(connection, accessToken) {
  const customers = [];
  for (let start = 1; start <= 5000; start += 1000) {
    const response = await queryQuickBooks({ realmId: connection.realmId, accessToken, query: `select * from Customer startposition ${start} maxresults 1000` });
    const page = response.Customer || [];
    customers.push(...page);
    if (page.length < 1000) break;
  }
  return { customers, truncated: customers.length === 5000 };
}

async function allQuickBooksVendors(connection, accessToken) {
  const vendors = [];
  for (let start = 1; start <= 5000; start += 1000) {
    const response = await queryQuickBooks({ realmId: connection.realmId, accessToken, query: `select * from Vendor startposition ${start} maxresults 1000` });
    const page = response.Vendor || [];
    vendors.push(...page);
    if (page.length < 1000) break;
  }
  return { vendors, truncated: vendors.length === 5000 };
}

function logSync(data) { return prisma.quickBooksSyncLog.create({ data }); }

router.get('/preview', asyncHandler(async (req, res) => {
  if (!requireFinancialPermission(req, res)) return;
  const accountId = req.membership.accountId;
  const [connection, invoices] = await Promise.all([
    prisma.quickBooksConnection.findUnique({ where: { accountId } }),
    prisma.invoice.findMany({ where: { accountId }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  if (!connection) return res.status(409).json({ error: 'Connect QuickBooks first.' });
  const bookingIds = [...new Set(invoices.map((invoice) => invoice.bookingId))];
  const [bookings, groups] = await Promise.all([
    prisma.booking.findMany({ where: { accountId, id: { in: bookingIds } }, select: { id: true, clientId: true, eventName: true, groupId: true } }),
    prisma.agencyGroup.findMany({ where: { accountId, active: true }, select: { id: true, name: true } }),
  ]);
  const clientIds = [...new Set(bookings.map((booking) => booking.clientId).filter(Boolean))];
  const [clients, links] = await Promise.all([
    prisma.client.findMany({ where: { accountId, id: { in: clientIds } } }),
    prisma.quickBooksEntityLink.findMany({ where: { accountId, OR: [{ entityType: 'invoice', localId: { in: invoices.map((invoice) => invoice.id) } }, { entityType: 'customer', localId: { in: clientIds } }] } }),
  ]);
  const bookingById = new Map(bookings.map((item) => [item.id, item]));
  const clientById = new Map(clients.map((item) => [item.id, item]));
  const linkByKey = new Map(links.map((item) => [`${item.entityType}:${item.localId}`, item]));
  const readiness = quickBooksSetupReadiness(connection, groups);
  res.json({ ready: readiness.ready, rows: invoices.map((invoice) => {
    const booking = bookingById.get(invoice.bookingId);
    const client = clientById.get(booking?.clientId);
    const customerLink = client ? linkByKey.get(`customer:${client.id}`) : null;
    const invoiceLink = linkByKey.get(`invoice:${invoice.id}`);
    const eligible = ['sent', 'partial', 'paid'].includes(invoice.status);
    const status = invoiceLink?.status === 'synced' ? 'synced' : invoiceLink?.status === 'failed' ? 'failed' : !eligible ? 'not_eligible' : !client ? 'missing_client' : customerLink?.status !== 'synced' ? 'needs_customer' : readiness.ready ? 'ready' : 'setup_required';
    return { id: invoice.id, number: invoice.number, bookingName: booking?.eventName || 'Untitled booking', client: client ? { id: client.id, name: `${client.firstName} ${client.lastName}`.trim(), email: client.email } : null, total: (invoice.snapshot?.lineItems || []).reduce((sum, item) => sum + (item.type === 'perUnit' ? (Number(item.unitCount) || 0) * (Number(item.ratePerUnit) || 0) : Number(item.amount) || 0), 0), invoiceStatus: invoice.status, syncStatus: status, error: invoiceLink?.lastError || null, quickBooksId: invoiceLink?.quickBooksId || null };
  }) });
}));

router.get('/customers/:clientId/matches', asyncHandler(async (req, res) => {
  if (!requireFinancialPermission(req, res)) return;
  const accountId = req.membership.accountId;
  const client = await prisma.client.findFirst({ where: { id: req.params.clientId, accountId } });
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  const { connection, accessToken } = await connectionContext(accountId);
  const { customers, truncated } = await allQuickBooksCustomers(connection, accessToken);
  const candidates = customers.map((customer) => quickBooksCustomerCandidate(client, customer)).filter((candidate) => candidate.score >= 60).sort((a, b) => b.score - a.score).slice(0, 8);
  res.json({ client: { id: client.id, name: `${client.firstName} ${client.lastName}`.trim(), email: client.email, phone: client.phone }, candidates, searchTruncated: truncated });
}));

router.post('/customers/:clientId/link', asyncHandler(async (req, res) => {
  if (!requireFinancialPermission(req, res)) return;
  const accountId = req.membership.accountId;
  const client = await prisma.client.findFirst({ where: { id: req.params.clientId, accountId } });
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  const quickBooksId = String(req.body?.quickBooksId || '');
  if (!/^\d+$/.test(quickBooksId)) return res.status(400).json({ error: 'Choose a valid QuickBooks customer.' });
  const { connection, accessToken } = await connectionContext(accountId);
  const response = await queryQuickBooks({ realmId: connection.realmId, accessToken, query: `select * from Customer where Id = '${quickBooksId}' maxresults 1` });
  const customer = response.Customer?.[0];
  if (!customer) return res.status(404).json({ error: 'QuickBooks customer not found.' });
  const used = await prisma.quickBooksEntityLink.findFirst({ where: { accountId, entityType: 'customer', quickBooksId, NOT: { localId: client.id } } });
  if (used) return res.status(409).json({ error: 'That QuickBooks customer is already matched to another GigWorks client.' });
  const link = await prisma.quickBooksEntityLink.upsert({ where: { accountId_entityType_localId: { accountId, entityType: 'customer', localId: client.id } }, update: { quickBooksId, quickBooksSyncToken: customer.SyncToken || null, displayName: customer.DisplayName || null, status: 'synced', lastError: null, lastSyncedAt: new Date() }, create: { accountId, entityType: 'customer', localId: client.id, quickBooksId, quickBooksSyncToken: customer.SyncToken || null, displayName: customer.DisplayName || null, status: 'synced', lastSyncedAt: new Date() } });
  await logSync({ accountId, entityType: 'customer', localId: client.id, action: 'linked', status: 'success', message: `Linked to ${customer.DisplayName || 'QuickBooks customer'}`, createdById: req.session.userId });
  res.json({ link });
}));

router.post('/customers/:clientId/create', asyncHandler(async (req, res) => {
  if (!requireFinancialPermission(req, res)) return;
  const accountId = req.membership.accountId;
  const client = await prisma.client.findFirst({ where: { id: req.params.clientId, accountId } });
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  const existing = await prisma.quickBooksEntityLink.findUnique({ where: { accountId_entityType_localId: { accountId, entityType: 'customer', localId: client.id } } });
  if (existing?.status === 'synced') return res.json({ link: existing });
  const link = existing || await prisma.quickBooksEntityLink.create({ data: { accountId, entityType: 'customer', localId: client.id, displayName: `${client.firstName} ${client.lastName}`.trim(), status: 'pending' } });
  const { connection, accessToken } = await connectionContext(accountId);
  try {
    const result = await writeQuickBooks({ realmId: connection.realmId, accessToken, entity: 'customer', body: quickBooksCustomerPayload(client), requestId: link.id });
    const customer = result.Customer;
    const updated = await prisma.quickBooksEntityLink.update({ where: { id: link.id }, data: { quickBooksId: String(customer.Id), quickBooksSyncToken: customer.SyncToken || null, displayName: customer.DisplayName || null, status: 'synced', lastError: null, lastSyncedAt: new Date() } });
    await logSync({ accountId, entityType: 'customer', localId: client.id, action: 'created', status: 'success', message: `Created ${customer.DisplayName}`, createdById: req.session.userId });
    res.status(201).json({ link: updated });
  } catch (error) {
    await prisma.quickBooksEntityLink.update({ where: { id: link.id }, data: { status: 'failed', lastError: String(error.message).slice(0, 500) } });
    await logSync({ accountId, entityType: 'customer', localId: client.id, action: 'created', status: 'failed', message: String(error.message).slice(0, 500), createdById: req.session.userId });
    res.status(502).json({ error: 'QuickBooks could not create this customer. Review possible matches and try again.' });
  }
}));

router.get('/vendors/preview', asyncHandler(async (req, res) => {
  if (!requireFinancialPermission(req, res)) return;
  const accountId = req.membership.accountId;
  const [contractors, links] = await Promise.all([
    prisma.contractor.findMany({ where: { accountId }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], take: 500 }),
    prisma.quickBooksEntityLink.findMany({ where: { accountId, entityType: 'vendor' } }),
  ]);
  const linkById = new Map(links.map((link) => [link.localId, link]));
  res.json({ rows: contractors.map((contractor) => {
    const link = linkById.get(contractor.id);
    return { id: contractor.id, name: `${contractor.firstName} ${contractor.lastName}`.trim(), email: contractor.email, phone: contractor.phone, contractorType: contractor.contractorType1, syncStatus: link?.status === 'synced' ? 'synced' : link?.status === 'failed' ? 'failed' : 'needs_vendor', error: link?.lastError || null, quickBooksId: link?.quickBooksId || null };
  }), truncated: contractors.length === 500 });
}));

router.get('/vendors/:contractorId/matches', asyncHandler(async (req, res) => {
  if (!requireFinancialPermission(req, res)) return;
  const accountId = req.membership.accountId;
  const contractor = await prisma.contractor.findFirst({ where: { id: req.params.contractorId, accountId } });
  if (!contractor) return res.status(404).json({ error: 'Contractor not found.' });
  const { connection, accessToken } = await connectionContext(accountId);
  const { vendors, truncated } = await allQuickBooksVendors(connection, accessToken);
  const candidates = vendors.map((vendor) => quickBooksVendorCandidate(contractor, vendor)).filter((candidate) => candidate.score >= 60).sort((a, b) => b.score - a.score).slice(0, 8);
  res.json({ contractor: { id: contractor.id, name: `${contractor.firstName} ${contractor.lastName}`.trim(), email: contractor.email, phone: contractor.phone }, candidates, searchTruncated: truncated });
}));

router.post('/vendors/:contractorId/link', asyncHandler(async (req, res) => {
  if (!requireFinancialPermission(req, res)) return;
  const accountId = req.membership.accountId;
  const contractor = await prisma.contractor.findFirst({ where: { id: req.params.contractorId, accountId } });
  if (!contractor) return res.status(404).json({ error: 'Contractor not found.' });
  const quickBooksId = String(req.body?.quickBooksId || '');
  if (!/^\d+$/.test(quickBooksId)) return res.status(400).json({ error: 'Choose a valid QuickBooks vendor.' });
  const { connection, accessToken } = await connectionContext(accountId);
  const response = await queryQuickBooks({ realmId: connection.realmId, accessToken, query: `select * from Vendor where Id = '${quickBooksId}' maxresults 1` });
  const vendor = response.Vendor?.[0];
  if (!vendor) return res.status(404).json({ error: 'QuickBooks vendor not found.' });
  const used = await prisma.quickBooksEntityLink.findFirst({ where: { accountId, entityType: 'vendor', quickBooksId, NOT: { localId: contractor.id } } });
  if (used) return res.status(409).json({ error: 'That QuickBooks vendor is already matched to another GigWorks contractor.' });
  const link = await prisma.quickBooksEntityLink.upsert({ where: { accountId_entityType_localId: { accountId, entityType: 'vendor', localId: contractor.id } }, update: { quickBooksId, quickBooksSyncToken: vendor.SyncToken || null, displayName: vendor.DisplayName || null, status: 'synced', lastError: null, lastSyncedAt: new Date() }, create: { accountId, entityType: 'vendor', localId: contractor.id, quickBooksId, quickBooksSyncToken: vendor.SyncToken || null, displayName: vendor.DisplayName || null, status: 'synced', lastSyncedAt: new Date() } });
  await logSync({ accountId, entityType: 'vendor', localId: contractor.id, action: 'linked', status: 'success', message: `Linked to ${vendor.DisplayName || 'QuickBooks vendor'}`, createdById: req.session.userId });
  res.json({ link });
}));

router.post('/vendors/:contractorId/create', asyncHandler(async (req, res) => {
  if (!requireFinancialPermission(req, res)) return;
  const accountId = req.membership.accountId;
  const contractor = await prisma.contractor.findFirst({ where: { id: req.params.contractorId, accountId } });
  if (!contractor) return res.status(404).json({ error: 'Contractor not found.' });
  const existing = await prisma.quickBooksEntityLink.findUnique({ where: { accountId_entityType_localId: { accountId, entityType: 'vendor', localId: contractor.id } } });
  if (existing?.status === 'synced') return res.json({ link: existing });
  const link = existing || await prisma.quickBooksEntityLink.create({ data: { accountId, entityType: 'vendor', localId: contractor.id, displayName: `${contractor.firstName} ${contractor.lastName}`.trim(), status: 'pending' } });
  const { connection, accessToken } = await connectionContext(accountId);
  try {
    const result = await writeQuickBooks({ realmId: connection.realmId, accessToken, entity: 'vendor', body: quickBooksVendorPayload(contractor), requestId: link.id });
    const vendor = result.Vendor;
    const updated = await prisma.quickBooksEntityLink.update({ where: { id: link.id }, data: { quickBooksId: String(vendor.Id), quickBooksSyncToken: vendor.SyncToken || null, displayName: vendor.DisplayName || null, status: 'synced', lastError: null, lastSyncedAt: new Date() } });
    await logSync({ accountId, entityType: 'vendor', localId: contractor.id, action: 'created', status: 'success', message: `Created ${vendor.DisplayName}`, createdById: req.session.userId });
    res.status(201).json({ link: updated });
  } catch (error) {
    await prisma.quickBooksEntityLink.update({ where: { id: link.id }, data: { status: 'failed', lastError: String(error.message).slice(0, 500) } });
    await logSync({ accountId, entityType: 'vendor', localId: contractor.id, action: 'created', status: 'failed', message: String(error.message).slice(0, 500), createdById: req.session.userId });
    res.status(502).json({ error: 'QuickBooks could not create this vendor. Review possible matches and try again.' });
  }
}));

async function contractorBillContext(accountId) {
  const [events, contractors, accountData] = await Promise.all([
    prisma.event.findMany({ where: { accountId, deletedAt: null }, select: { id: true, name: true, eventDate: true, createdAt: true, groupId: true, contractorBookings: true }, orderBy: [{ eventDate: 'desc' }, { updatedAt: 'desc' }], take: 250 }),
    prisma.contractor.findMany({ where: { accountId } }),
    prisma.accountData.findUnique({ where: { accountId }, select: { data: true } }),
  ]);
  return { events, contractorById: new Map(contractors.map((item) => [item.id, item])), statusById: new Map((accountData?.data?.inquiryStatuses || []).map((item) => [item.id, item])) };
}

router.get('/bills/preview', asyncHandler(async (req, res) => {
  if (!requireFinancialPermission(req, res)) return;
  const accountId = req.membership.accountId;
  const { events, contractorById, statusById } = await contractorBillContext(accountId);
  const localIds = events.flatMap((event) => (event.contractorBookings || []).map((assignment) => contractorBillLocalId(event.id, assignment)));
  const contractorIds = [...new Set(events.flatMap((event) => (event.contractorBookings || []).map((assignment) => assignment.contractorId).filter(Boolean)))];
  const links = await prisma.quickBooksEntityLink.findMany({ where: { accountId, OR: [{ entityType: 'bill', localId: { in: localIds } }, { entityType: 'vendor', localId: { in: contractorIds } }] } });
  const linkByKey = new Map(links.map((link) => [`${link.entityType}:${link.localId}`, link]));
  const rows = [];
  for (const event of events) for (const assignment of event.contractorBookings || []) {
    const contractor = contractorById.get(assignment.contractorId);
    const amount = contractorAssignmentCost(assignment, contractor);
    const eligibility = contractorBillEligibility({ assignment, inquiryStatus: statusById.get(assignment.inquiryStatusId), amount });
    const localId = contractorBillLocalId(event.id, assignment);
    const vendorLink = linkByKey.get(`vendor:${assignment.contractorId}`);
    const billLink = linkByKey.get(`bill:${localId}`);
    const syncStatus = billLink?.status === 'synced' ? 'synced' : billLink?.status === 'failed' ? 'failed' : !eligibility.eligible ? (amount === null || amount <= 0 ? 'missing_rate' : 'not_confirmed') : vendorLink?.status !== 'synced' ? 'needs_vendor' : 'ready';
    rows.push({ localId, eventId: event.id, assignmentId: assignment.id || assignment.contractorId, eventName: event.name || 'Untitled event', eventDate: event.eventDate, contractorId: assignment.contractorId, contractorName: contractor ? `${contractor.firstName} ${contractor.lastName}`.trim() : 'Unknown contractor', amount, paymentStatus: assignment.paymentStatus || 'not_paid', dueDate: assignment.paymentDueDate || event.eventDate || null, syncStatus, reason: billLink?.lastError || eligibility.reason, quickBooksId: billLink?.quickBooksId || null });
  }
  res.json({ rows, truncated: events.length === 250 });
}));

router.post('/bills/:eventId/:assignmentId/sync', asyncHandler(async (req, res) => {
  if (!requireFinancialPermission(req, res)) return;
  const accountId = req.membership.accountId;
  const [event, accountData] = await Promise.all([
    prisma.event.findFirst({ where: { id: req.params.eventId, accountId, deletedAt: null } }),
    prisma.accountData.findUnique({ where: { accountId }, select: { data: true } }),
  ]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  const assignment = (event.contractorBookings || []).find((item) => (item.id || item.contractorId) === req.params.assignmentId);
  if (!assignment) return res.status(404).json({ error: 'Contractor assignment not found.' });
  const contractor = await prisma.contractor.findFirst({ where: { id: assignment.contractorId, accountId } });
  if (!contractor) return res.status(409).json({ error: 'This assignment needs a contractor.' });
  const inquiryStatus = (accountData?.data?.inquiryStatuses || []).find((item) => item.id === assignment.inquiryStatusId);
  const amount = contractorAssignmentCost(assignment, contractor);
  const eligibility = contractorBillEligibility({ assignment, inquiryStatus, amount });
  if (!eligibility.eligible) return res.status(409).json({ error: eligibility.reason });
  const localId = contractorBillLocalId(event.id, assignment);
  const [vendorLink, existing] = await Promise.all([
    prisma.quickBooksEntityLink.findUnique({ where: { accountId_entityType_localId: { accountId, entityType: 'vendor', localId: contractor.id } } }),
    prisma.quickBooksEntityLink.findUnique({ where: { accountId_entityType_localId: { accountId, entityType: 'bill', localId } } }),
  ]);
  if (vendorLink?.status !== 'synced') return res.status(409).json({ error: 'Match or create the QuickBooks vendor first.' });
  if (existing?.status === 'synced') return res.json({ link: existing });
  const link = existing || await prisma.quickBooksEntityLink.create({ data: { accountId, entityType: 'bill', localId, displayName: `${contractor.firstName} ${contractor.lastName} — ${event.name || 'Gig'}`, status: 'pending' } });
  const { connection, accessToken } = await connectionContext(accountId);
  const mappings = connection.accountingMappings || {};
  const groupId = mappings.groupMappings?.[event.groupId];
  const groupReference = event.groupId && groupId && mappings.agencyTrackingMode !== 'none' ? { type: mappings.agencyTrackingMode, id: groupId } : null;
  const body = quickBooksBillPayload({ event, assignment, contractor, vendorId: vendorLink.quickBooksId, expenseAccountId: mappings.contractorExpenseAccountId, accountsPayableId: mappings.accountsPayableId, amount, groupReference });
  try {
    const result = await writeQuickBooks({ realmId: connection.realmId, accessToken, entity: 'bill', body, requestId: link.id });
    const bill = result.Bill;
    const updated = await prisma.quickBooksEntityLink.update({ where: { id: link.id }, data: { quickBooksId: String(bill.Id), quickBooksSyncToken: bill.SyncToken || null, status: 'synced', lastError: null, lastSyncedAt: new Date() } });
    await Promise.all([logSync({ accountId, entityType: 'bill', localId, action: 'created', status: 'success', message: `QuickBooks bill ${bill.DocNumber || bill.Id}`, createdById: req.session.userId }), prisma.quickBooksConnection.update({ where: { id: connection.id }, data: { lastSuccessfulSyncAt: new Date() } })]);
    res.status(201).json({ link: updated });
  } catch (error) {
    await prisma.quickBooksEntityLink.update({ where: { id: link.id }, data: { status: 'failed', lastError: String(error.message).slice(0, 500) } });
    await logSync({ accountId, entityType: 'bill', localId, action: 'created', status: 'failed', message: String(error.message).slice(0, 500), createdById: req.session.userId });
    res.status(502).json({ error: 'QuickBooks could not create this bill. No duplicate will be created when you retry.' });
  }
}));

router.post('/invoices/:invoiceId/sync', asyncHandler(async (req, res) => {
  if (!requireFinancialPermission(req, res)) return;
  const accountId = req.membership.accountId;
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.invoiceId, accountId } });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  if (!['sent', 'partial', 'paid'].includes(invoice.status)) return res.status(409).json({ error: 'Only issued invoices can be synchronized.' });
  const booking = await prisma.booking.findFirst({ where: { id: invoice.bookingId, accountId }, select: { clientId: true, eventName: true, groupId: true } });
  if (!booking?.clientId) return res.status(409).json({ error: 'This invoice needs a linked booking client.' });
  const customerLink = await prisma.quickBooksEntityLink.findUnique({ where: { accountId_entityType_localId: { accountId, entityType: 'customer', localId: booking.clientId } } });
  if (customerLink?.status !== 'synced') return res.status(409).json({ error: 'Match or create the QuickBooks customer first.' });
  const existing = await prisma.quickBooksEntityLink.findUnique({ where: { accountId_entityType_localId: { accountId, entityType: 'invoice', localId: invoice.id } } });
  if (existing?.status === 'synced') return res.json({ link: existing });
  const link = existing || await prisma.quickBooksEntityLink.create({ data: { accountId, entityType: 'invoice', localId: invoice.id, displayName: `Invoice #${invoice.number || invoice.id}`, status: 'pending' } });
  const { connection, accessToken } = await connectionContext(accountId);
  const mappings = connection.accountingMappings || {};
  const groupId = mappings.groupMappings?.[booking.groupId];
  const groupReference = booking.groupId && groupId && mappings.agencyTrackingMode !== 'none' ? { type: mappings.agencyTrackingMode, id: groupId } : null;
  const body = quickBooksInvoicePayload({ invoice, customerId: customerLink.quickBooksId, serviceItemId: mappings.serviceItemId, booking, groupReference });
  if (!body.Line.length) return res.status(409).json({ error: 'This invoice has no positive line items to synchronize.' });
  try {
    const result = await writeQuickBooks({ realmId: connection.realmId, accessToken, entity: 'invoice', body, requestId: link.id });
    const remote = result.Invoice;
    const updated = await prisma.quickBooksEntityLink.update({ where: { id: link.id }, data: { quickBooksId: String(remote.Id), quickBooksSyncToken: remote.SyncToken || null, status: 'synced', lastError: null, lastSyncedAt: new Date() } });
    await Promise.all([logSync({ accountId, entityType: 'invoice', localId: invoice.id, action: 'created', status: 'success', message: `QuickBooks invoice ${remote.DocNumber || remote.Id}`, createdById: req.session.userId }), prisma.quickBooksConnection.update({ where: { id: connection.id }, data: { lastSuccessfulSyncAt: new Date() } })]);
    res.status(201).json({ link: updated });
  } catch (error) {
    await prisma.quickBooksEntityLink.update({ where: { id: link.id }, data: { status: 'failed', lastError: String(error.message).slice(0, 500) } });
    await logSync({ accountId, entityType: 'invoice', localId: invoice.id, action: 'created', status: 'failed', message: String(error.message).slice(0, 500), createdById: req.session.userId });
    res.status(502).json({ error: 'QuickBooks could not create this invoice. No duplicate will be created when you retry.' });
  }
}));

router.get('/payments/preview', asyncHandler(async (req, res) => {
  if (!requireFinancialPermission(req, res)) return;
  const accountId = req.membership.accountId;
  const transactions = await prisma.financialTransaction.findMany({ where: { accountId, category: { in: ['client_payment', 'payment_adjustment', 'reversal'] }, invoiceId: { not: null } }, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], take: 100 });
  const invoiceIds = [...new Set(transactions.map((item) => item.invoiceId))];
  const [invoices, links] = await Promise.all([
    prisma.invoice.findMany({ where: { accountId, id: { in: invoiceIds } }, select: { id: true, number: true, bookingId: true } }),
    prisma.quickBooksEntityLink.findMany({ where: { accountId, OR: [{ entityType: 'invoice', localId: { in: invoiceIds } }, { entityType: 'payment', localId: { in: transactions.map((item) => item.id) } }] } }),
  ]);
  const bookingIds = [...new Set(invoices.map((item) => item.bookingId))];
  const bookings = await prisma.booking.findMany({ where: { accountId, id: { in: bookingIds } }, select: { id: true, clientId: true, eventName: true } });
  const clientIds = [...new Set(bookings.map((item) => item.clientId).filter(Boolean))];
  const customerLinks = await prisma.quickBooksEntityLink.findMany({ where: { accountId, entityType: 'customer', localId: { in: clientIds }, status: 'synced' } });
  const invoiceById = new Map(invoices.map((item) => [item.id, item]));
  const bookingById = new Map(bookings.map((item) => [item.id, item]));
  const linkByKey = new Map([...links, ...customerLinks].map((item) => [`${item.entityType}:${item.localId}`, item]));
  res.json({ rows: transactions.map((transaction) => {
    const invoice = invoiceById.get(transaction.invoiceId);
    const booking = invoice ? bookingById.get(invoice.bookingId) : null;
    const invoiceLink = invoice ? linkByKey.get(`invoice:${invoice.id}`) : null;
    const customerLink = booking?.clientId ? linkByKey.get(`customer:${booking.clientId}`) : null;
    const paymentLink = linkByKey.get(`payment:${transaction.id}`);
    const eligibility = paymentSyncEligibility(transaction);
    const syncStatus = paymentLink?.status === 'synced' ? 'synced' : paymentLink?.status === 'manually_reconciled' ? 'manually_reconciled' : paymentLink?.status === 'needs_review' ? 'mismatch' : paymentLink?.status === 'failed' ? 'failed' : !eligibility.eligible ? 'manual_review' : invoiceLink?.status !== 'synced' ? 'needs_invoice' : customerLink?.status !== 'synced' ? 'needs_customer' : 'ready';
    return { id: transaction.id, invoiceId: transaction.invoiceId, invoiceNumber: invoice?.number || null, bookingName: booking?.eventName || 'Untitled booking', amount: transaction.amountCents / 100, occurredAt: transaction.occurredAt, category: transaction.category, description: transaction.description, syncStatus, reason: paymentLink?.lastError || eligibility.reason, quickBooksId: paymentLink?.quickBooksId || null };
  }) });
}));

router.post('/payments/:transactionId/sync', asyncHandler(async (req, res) => {
  if (!requireFinancialPermission(req, res)) return;
  const accountId = req.membership.accountId;
  const transaction = await prisma.financialTransaction.findFirst({ where: { id: req.params.transactionId, accountId } });
  if (!transaction) return res.status(404).json({ error: 'Payment not found.' });
  const eligibility = paymentSyncEligibility(transaction);
  if (!eligibility.eligible) return res.status(409).json({ error: eligibility.reason });
  const invoice = await prisma.invoice.findFirst({ where: { id: transaction.invoiceId, accountId }, select: { id: true, bookingId: true } });
  const booking = invoice ? await prisma.booking.findFirst({ where: { id: invoice.bookingId, accountId }, select: { clientId: true } }) : null;
  if (!booking?.clientId) return res.status(409).json({ error: 'The related invoice needs a booking client.' });
  const [invoiceLink, customerLink, existing] = await Promise.all([
    prisma.quickBooksEntityLink.findUnique({ where: { accountId_entityType_localId: { accountId, entityType: 'invoice', localId: invoice.id } } }),
    prisma.quickBooksEntityLink.findUnique({ where: { accountId_entityType_localId: { accountId, entityType: 'customer', localId: booking.clientId } } }),
    prisma.quickBooksEntityLink.findUnique({ where: { accountId_entityType_localId: { accountId, entityType: 'payment', localId: transaction.id } } }),
  ]);
  if (invoiceLink?.status !== 'synced' || customerLink?.status !== 'synced') return res.status(409).json({ error: 'Synchronize the related customer and invoice first.' });
  if (existing?.status === 'synced') return res.json({ link: existing });
  const link = existing || await prisma.quickBooksEntityLink.create({ data: { accountId, entityType: 'payment', localId: transaction.id, displayName: transaction.description, status: 'pending' } });
  const { connection, accessToken } = await connectionContext(accountId);
  try {
    const result = await writeQuickBooks({ realmId: connection.realmId, accessToken, entity: 'payment', body: quickBooksPaymentPayload({ transaction, customerId: customerLink.quickBooksId, quickBooksInvoiceId: invoiceLink.quickBooksId }), requestId: link.id });
    const remote = result.Payment;
    const updated = await prisma.quickBooksEntityLink.update({ where: { id: link.id }, data: { quickBooksId: String(remote.Id), quickBooksSyncToken: remote.SyncToken || null, status: 'synced', lastError: null, lastSyncedAt: new Date() } });
    await Promise.all([logSync({ accountId, entityType: 'payment', localId: transaction.id, action: 'created', status: 'success', message: `QuickBooks payment ${remote.Id}`, createdById: req.session.userId }), prisma.quickBooksConnection.update({ where: { id: connection.id }, data: { lastSuccessfulSyncAt: new Date() } })]);
    res.status(201).json({ link: updated });
  } catch (error) {
    await prisma.quickBooksEntityLink.update({ where: { id: link.id }, data: { status: 'failed', lastError: String(error.message).slice(0, 500) } });
    await logSync({ accountId, entityType: 'payment', localId: transaction.id, action: 'created', status: 'failed', message: String(error.message).slice(0, 500), createdById: req.session.userId });
    res.status(502).json({ error: 'QuickBooks could not create this payment. No duplicate will be created when you retry.' });
  }
}));

router.post('/payments/:transactionId/manual', asyncHandler(async (req, res) => {
  if (!requireFinancialPermission(req, res)) return;
  const accountId = req.membership.accountId;
  const transaction = await prisma.financialTransaction.findFirst({ where: { id: req.params.transactionId, accountId } });
  if (!transaction) return res.status(404).json({ error: 'Payment adjustment not found.' });
  const note = String(req.body?.note || '').trim().slice(0, 500);
  if (!note) return res.status(400).json({ error: 'Add a note describing how this was handled in QuickBooks.' });
  const link = await prisma.quickBooksEntityLink.upsert({ where: { accountId_entityType_localId: { accountId, entityType: 'payment', localId: transaction.id } }, update: { status: 'manually_reconciled', lastError: note, lastSyncedAt: new Date() }, create: { accountId, entityType: 'payment', localId: transaction.id, displayName: transaction.description, status: 'manually_reconciled', lastError: note, lastSyncedAt: new Date() } });
  await logSync({ accountId, entityType: 'payment', localId: transaction.id, action: 'manual_reconciliation', status: 'success', message: note, createdById: req.session.userId });
  res.json({ link });
}));

router.post('/payments/:transactionId/reconcile', asyncHandler(async (req, res) => {
  if (!requireFinancialPermission(req, res)) return;
  const accountId = req.membership.accountId;
  const [transaction, link] = await Promise.all([
    prisma.financialTransaction.findFirst({ where: { id: req.params.transactionId, accountId } }),
    prisma.quickBooksEntityLink.findUnique({ where: { accountId_entityType_localId: { accountId, entityType: 'payment', localId: req.params.transactionId } } }),
  ]);
  if (!transaction || !link?.quickBooksId) return res.status(404).json({ error: 'Synchronized payment not found.' });
  const { connection, accessToken } = await connectionContext(accountId);
  const response = await queryQuickBooks({ realmId: connection.realmId, accessToken, query: `select * from Payment where Id = '${link.quickBooksId}' maxresults 1` });
  const payment = response.Payment?.[0];
  const expected = Math.abs(transaction.amountCents) / 100;
  const matches = !!payment && Math.abs(Number(payment.TotalAmt || 0) - expected) < 0.005;
  const updated = await prisma.quickBooksEntityLink.update({ where: { id: link.id }, data: { status: matches ? 'synced' : 'needs_review', lastError: matches ? null : payment ? `QuickBooks amount is ${Number(payment.TotalAmt || 0).toFixed(2)}; GigWorks expects ${expected.toFixed(2)}.` : 'Payment no longer exists in QuickBooks.', lastSyncedAt: new Date(), ...(payment?.SyncToken ? { quickBooksSyncToken: payment.SyncToken } : {}) } });
  await logSync({ accountId, entityType: 'payment', localId: transaction.id, action: 'reconciled', status: matches ? 'success' : 'needs_review', message: updated.lastError, createdById: req.session.userId });
  res.status(matches ? 200 : 409).json({ link: updated, matches });
}));

export default router;
