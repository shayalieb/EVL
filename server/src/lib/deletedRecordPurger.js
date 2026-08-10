import { prisma } from './prisma.js';

// Events/bookings are soft-deleted (deletedAt set, see DataContext's
// deleteEvent/deleteBooking) so they stay recoverable and keep an audit
// trail for a while — but a soft-deleted row lingering forever isn't what
// "delete" means to the user. This sweep permanently purges anything
// that's been soft-deleted for RETENTION_DAYS, same background-polling
// shape as reminderScheduler.js. A 30-day retention window doesn't need
// tight polling, hence the much longer interval than that scheduler's 60s.
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;

function cutoffDate() {
  return new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

// eventId/bookingId on these tables are opaque strings, not real Prisma
// relations (see schema.prisma's "same non-FK pattern as EventDocument.eventId"
// comments) — nothing cascades automatically, so each has to be cleaned up
// by hand. StagePlot/FloorPlan are the exception: their own child tables
// (StagePlotPage/Channel, FloorPlanPage) DO have real onDelete: Cascade FKs
// back to them, so deleting the StagePlot/FloorPlan row is enough there.
async function purgeEvent({ id: eventId }) {
  await prisma.$transaction([
    prisma.emailThread.deleteMany({ where: { eventId } }),
    prisma.eventDocument.deleteMany({ where: { eventId } }),
    prisma.stagePlot.deleteMany({ where: { eventId } }),
    prisma.floorPlan.deleteMany({ where: { eventId } }),
    prisma.guest.deleteMany({ where: { eventId } }),
    prisma.eventRsvpLink.deleteMany({ where: { eventId } }),
    // A converted booking points at this event via convertedEventId — null
    // it out rather than leave a dead link (BookingFormPage/BookingsPage
    // render a "View Event" button off this field).
    prisma.booking.updateMany({ where: { convertedEventId: eventId }, data: { convertedEventId: null } }),
    prisma.event.delete({ where: { id: eventId } }),
  ]);
}

async function purgeBooking({ id: bookingId }) {
  await prisma.$transaction([
    prisma.bookingDocument.deleteMany({ where: { bookingId } }),
    prisma.contract.deleteMany({ where: { bookingId } }),
    prisma.inquiryLink.deleteMany({ where: { bookingId } }),
    prisma.invoice.deleteMany({ where: { bookingId } }),
    prisma.booking.delete({ where: { id: bookingId } }),
  ]);
}

let running = false;

// Exported for the same on-demand-testing reason as reminderScheduler.js's tick.
export async function tick() {
  if (running) return;
  running = true;
  try {
    const before = cutoffDate();
    const [events, bookings] = await Promise.all([
      prisma.event.findMany({ where: { deletedAt: { not: null, lt: before } }, select: { id: true } }),
      prisma.booking.findMany({ where: { deletedAt: { not: null, lt: before } }, select: { id: true } }),
    ]);

    for (const event of events) {
      try {
        await purgeEvent(event);
      } catch (err) {
        console.error(`Failed to purge event ${event.id}:`, err);
      }
    }
    for (const booking of bookings) {
      try {
        await purgeBooking(booking);
      } catch (err) {
        console.error(`Failed to purge booking ${booking.id}:`, err);
      }
    }
  } catch (err) {
    console.error('Deleted-record purge tick failed:', err);
  } finally {
    running = false;
  }
}

export function startDeletedRecordPurger() {
  setInterval(tick, POLL_INTERVAL_MS);
}
