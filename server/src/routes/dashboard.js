import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { invoiceTotal } from './invoices.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

const AT_RISK_WINDOW_DAYS = 14;

function statusBucket(status) {
  if (!status) return 'tentative';
  if (['confirmed', 'tentative', 'unavailable'].includes(status.bucket)) return status.bucket;
  if (status.isConfirmed) return 'confirmed';
  return /not.?avail|declin/i.test(status.label || '') ? 'unavailable' : 'tentative';
}

function pricingTier(contractor, tierId) {
  const tiers = contractor?.pricingTiers?.length
    ? contractor.pricingTiers
    : contractor?.price !== undefined
      ? [{ id: 'legacy', price: Number(contractor.price) || 0 }]
      : [];
  return tiers.find((tier) => tier.id === tierId) || tiers[0] || null;
}

function durationHours(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  return minutes / 60;
}

function bookingCost(booking, contractor) {
  const tier = pricingTier(contractor, booking.pricingTierId);
  if (!tier) return 0;
  let overtimeHours = 0;
  if (Number(tier.includedHours) > 0 && Number(tier.overtimeRate) > 0) {
    if (booking.overtimeHoursOverride !== null && booking.overtimeHoursOverride !== undefined && booking.overtimeHoursOverride !== '') {
      overtimeHours = Math.max(0, Number(booking.overtimeHoursOverride) || 0);
    } else {
      const actual = durationHours(booking.startTime, booking.endTime);
      overtimeHours = actual === null ? 0 : Math.max(0, actual - Number(tier.includedHours));
    }
  }
  return (Number(tier.price) || 0) + overtimeHours * (Number(tier.overtimeRate) || 0);
}

function eventSummary(event, inquiryStatuses) {
  const bookings = event.contractorBookings || [];
  if (!bookings.length) return { vendorStatus: 'none', activeBookings: [] };
  const activeBookings = bookings.filter((booking) => statusBucket(inquiryStatuses.find((item) => item.id === booking.inquiryStatusId)) !== 'unavailable');
  const pending = bookings.some((booking) => !inquiryStatuses.find((item) => item.id === booking.inquiryStatusId)?.isConfirmed);
  return { vendorStatus: pending ? 'pending' : 'confirmed', activeBookings };
}

router.get('/', asyncHandler(async (req, res) => {
  const accountId = req.membership.accountId;
  const groupId = String(req.query.groupId || '').trim();
  if (groupId && !await prisma.agencyGroup.findFirst({ where: { id: groupId, accountId, active: true }, select: { id: true } })) {
    return res.status(400).json({ error: 'Invalid managed group.' });
  }
  const groupFilter = groupId ? { groupId } : {};
  const [events, bookings, clients, contractors, invoices, accountData] = await Promise.all([
    prisma.event.findMany({
      where: { accountId, deletedAt: null, ...groupFilter },
      select: { id: true, name: true, eventDate: true, eventStatus: true, clientId: true, completedAt: true, noOutsideContractorsNeeded: true, contractorBookings: true },
    }),
    prisma.booking.findMany({ where: { accountId, deletedAt: null, ...groupFilter }, select: { id: true, convertedEventId: true } }),
    prisma.client.findMany({ where: { accountId }, select: { id: true, firstName: true, lastName: true } }),
    prisma.contractor.findMany({ where: { accountId }, select: { id: true, firstName: true, lastName: true, contractorType1: true, pricingTiers: true } }),
    prisma.invoice.findMany({ where: { accountId }, select: { id: true, bookingId: true, number: true, snapshot: true, dueDate: true, status: true, recipientName: true, paidAmount: true } }),
    prisma.accountData.findUnique({ where: { accountId }, select: { data: true } }),
  ]);
  const scopedBookingIds = new Set(bookings.map((booking) => booking.id));
  const scopedInvoices = groupId ? invoices.filter((invoice) => scopedBookingIds.has(invoice.bookingId)) : invoices;
  const eventStatuses = accountData?.data?.eventStatuses || [];
  const inquiryStatuses = accountData?.data?.inquiryStatuses || [];
  const contractorById = new Map(contractors.map((item) => [item.id, item]));
  const eventStatusById = new Map(eventStatuses.map((item) => [item.id, item]));
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + AT_RISK_WINDOW_DAYS);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  const enriched = events.map((event) => {
    const summary = eventSummary(event, inquiryStatuses);
    const missingRate = summary.activeBookings.some((booking) => !pricingTier(contractorById.get(booking.contractorId), booking.pricingTierId));
    const costingComplete = (summary.activeBookings.length === 0 && event.noOutsideContractorsNeeded) || (summary.activeBookings.length > 0 && !missingRate);
    const costingReason = summary.activeBookings.length === 0
      ? (event.noOutsideContractorsNeeded ? 'No outside contractors needed' : 'No contractor plan')
      : (missingRate ? 'Contractor rate missing' : 'Contractor costs entered');
    const cost = summary.activeBookings.reduce((sum, booking) => sum + bookingCost(booking, contractorById.get(booking.contractorId)), 0);
    return { ...event, ...summary, costingComplete, costingReason, cost };
  });
  const upcoming = enriched
    .filter((event) => event.eventDate >= today && !event.completedAt && (eventStatusById.get(event.eventStatus)?.label || '').toLowerCase() !== 'cancelled')
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const bookingCounts = new Map();
  for (const event of events) {
    for (const booking of event.contractorBookings || []) bookingCounts.set(booking.contractorId, (bookingCounts.get(booking.contractorId) || 0) + 1);
  }
  const topContractors = [...bookingCounts]
    .map(([id, count]) => ({ contractor: contractorById.get(id), count }))
    .filter((item) => item.contractor)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const clientPending = new Map();
  for (const event of events) {
    if (!event.clientId) continue;
    const label = (eventStatusById.get(event.eventStatus)?.label || '').toLowerCase();
    if (!['cancelled', 'declined', 'confirmed', 'completed'].includes(label)) clientPending.set(event.clientId, (clientPending.get(event.clientId) || 0) + 1);
  }
  const followUpClients = clients
    .map((client) => ({ client, counts: { pending: clientPending.get(client.id) || 0 } }))
    .filter((item) => item.counts.pending > 0)
    .sort((a, b) => b.counts.pending - a.counts.pending)
    .slice(0, 5);

  const overdueInvoices = scopedInvoices
    .filter((invoice) => ['sent', 'partial'].includes(invoice.status) && invoice.dueDate && invoice.dueDate.slice(0, 10) < today)
    .map((invoice) => ({ ...invoice, total: invoiceTotal(invoice), paidAmount: invoice.paidAmount ?? 0 }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  const bookingByEvent = new Map(bookings.filter((item) => item.convertedEventId).map((item) => [item.convertedEventId, item]));
  const revenueByBooking = new Map();
  for (const invoice of scopedInvoices) {
    if (['void', 'draft'].includes(invoice.status)) continue;
    revenueByBooking.set(invoice.bookingId, (revenueByBooking.get(invoice.bookingId) || 0) + invoiceTotal(invoice));
  }
  const financialGigs = [];
  const incomplete = [];
  let totalRevenue = 0;
  let totalCosts = 0;
  for (const event of enriched) {
    const booking = bookingByEvent.get(event.id);
    if (!booking) continue;
    const revenue = revenueByBooking.get(booking.id) || 0;
    if (revenue <= 0) continue;
    if (!event.costingComplete) {
      incomplete.push({ id: event.id, name: event.name, reason: event.costingReason });
      continue;
    }
    financialGigs.push({ id: event.id, name: event.name, margin: ((revenue - event.cost) / revenue) * 100 });
    totalRevenue += revenue;
    totalCosts += event.cost;
  }
  financialGigs.sort((a, b) => b.margin - a.margin);

  res.json({ dashboard: {
    isFreshAccount: bookings.length === 0 && events.length === 0 && clients.length === 0,
    counts: { events: events.length, clients: clients.length, contractors: contractors.length },
    stats: {
      upcomingCount: upcoming.length,
      pipelineValue: upcoming.filter((event) => event.costingComplete).reduce((sum, event) => sum + event.cost, 0),
      needsConfirmation: upcoming.filter((event) => event.vendorStatus === 'pending').length,
      upcomingList: upcoming.slice(0, 5).map(({ id, name, eventDate, eventStatus, vendorStatus }) => ({ id, name, eventDate, eventStatus, vendorStatus })),
      atRiskEvents: upcoming.filter((event) => event.eventDate <= cutoffISO && event.vendorStatus === 'pending').slice(0, 5).map(({ id, name, eventDate }) => ({ id, name, eventDate })),
      topContractors,
      followUpClients,
    },
    overdueInvoices,
    financials: {
      totalRevenue,
      totalCosts,
      avgMargin: totalRevenue > 0 ? ((totalRevenue - totalCosts) / totalRevenue) * 100 : null,
      count: financialGigs.length,
      incomplete,
      bestGig: financialGigs[0] || null,
      worstGig: financialGigs.length > 1 ? financialGigs[financialGigs.length - 1] : null,
    },
  } });
}));

export default router;
