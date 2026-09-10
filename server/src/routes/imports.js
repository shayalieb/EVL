import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { createImportToken, parseClientsCsv, parseGoogleCalendarIcs, parsePandaDocDocumentsCsv, sourceDigest, stableImportId, stableSourceRecordId, verifyImportToken } from '../lib/dataImport.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

function requireImportPermissions(req, res) {
  const permissions = effectivePermissions(req.membership);
  if (!permissions.manageClients || !permissions.manageBookings) {
    res.status(403).json({ error: 'Client and booking management permissions are required to import data.' });
    return false;
  }
  return true;
}

function sourcesFrom(body) {
  const sourceType = ['google_calendar', 'pandadoc', 'csv', 'other'].includes(body?.sourceType) ? body.sourceType : 'other';
  return {
    sourceType, migrationName: String(body?.migrationName || '').trim().slice(0, 160),
    clientsCsv: String(body?.clientsCsv || ''), calendarIcs: String(body?.calendarIcs || ''),
    pandaDocCsv: String(body?.pandaDocCsv || ''),
  };
}

async function buildPreview(accountId, sources) {
  const parsedClients = parseClientsCsv(sources.clientsCsv);
  const parsedCalendar = parseGoogleCalendarIcs(sources.calendarIcs);
  const parsedPandaDoc = parsePandaDocDocumentsCsv(sources.pandaDocCsv);
  const validClients = parsedClients.clients.filter((client) => client.valid);
  const emails = [...new Set([...validClients.map((client) => client.email), ...parsedCalendar.events.flatMap((event) => event.attendeeEmails), ...parsedPandaDoc.documents.flatMap((document) => document.recipientEmails)].filter(Boolean))];
  const phones = [...new Set(validClients.map((client) => client.phoneNormalized).filter(Boolean))];
  const matchConditions = [...(emails.length ? [{ emailNormalized: { in: emails } }] : []), ...(phones.length ? [{ phoneNormalized: { in: phones } }] : [])];
  const [existing, accountData] = await Promise.all([
    matchConditions.length ? prisma.client.findMany({
      where: { accountId, OR: matchConditions },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, emailNormalized: true, phoneNormalized: true },
    }) : Promise.resolve([]),
    prisma.accountData.findUnique({ where: { accountId }, select: { data: true } }),
  ]);
  const byEmail = new Map(); const byPhone = new Map();
  for (const client of existing) {
    if (client.emailNormalized) byEmail.set(client.emailNormalized, [...(byEmail.get(client.emailNormalized) || []), client]);
    if (client.phoneNormalized) byPhone.set(client.phoneNormalized, [...(byPhone.get(client.phoneNormalized) || []), client]);
  }
  const sourceEmails = new Map(); const sourcePhones = new Map();
  const clients = validClients.map((client) => {
    const candidates = [...new Map([...(byEmail.get(client.email) || []), ...(byPhone.get(client.phoneNormalized) || [])].map((item) => [item.id, item])).values()];
    const earlier = sourceEmails.get(client.email) || sourcePhones.get(client.phoneNormalized) || null;
    const canonicalRowId = earlier || client.rowId;
    if (client.email) sourceEmails.set(client.email, canonicalRowId);
    if (client.phoneNormalized) sourcePhones.set(client.phoneNormalized, canonicalRowId);
    let recommendation = 'create';
    if (candidates.length === 1) recommendation = 'link';
    if (candidates.length > 1) recommendation = 'review';
    if (earlier) recommendation = 'same_source_client';
    return { ...client, candidates, recommendation, linkedRowId: earlier || null };
  });
  const importedEmailRows = new Map(clients.filter((client) => client.email).map((client) => [client.email, client.linkedRowId || client.rowId]));
  const existingEmailMatches = new Map(existing.filter((client) => client.emailNormalized).map((client) => [client.emailNormalized, client.id]));
  const today = new Date().toISOString().slice(0, 10);
  const sourceBookings = [
    ...parsedCalendar.events.filter((event) => event.valid).map((event) => ({ ...event, source: 'Google Calendar', sourceType: 'google_calendar', sourceRecordId: event.sourceUid ? `${event.sourceUid}:${event.eventDate}:${event.startTime || 'all-day'}` : null, matchEmails: event.attendeeEmails, terminal: false })),
    ...parsedPandaDoc.documents.filter((document) => document.valid).map((document) => ({ ...document, source: 'PandaDoc', sourceType: 'pandadoc', sourceRecordId: document.sourceDocumentId || document.link, matchEmails: document.recipientEmails, allDay: true, startTime: null, endTime: null, location: null, description: null, timezone: null })),
  ];
  const bookings = sourceBookings.map((event) => {
    const importedMatches = [...new Set(event.matchEmails.map((email) => importedEmailRows.get(email)).filter(Boolean))];
    const existingMatches = [...new Set(event.matchEmails.map((email) => existingEmailMatches.get(email)).filter(Boolean))];
    const clientMatch = importedMatches.length === 1
      ? { type: 'imported', id: importedMatches[0] }
      : existingMatches.length === 1
        ? { type: 'existing', id: existingMatches[0] }
        : null;
    return { ...event, historical: event.terminal || event.eventDate < today, clientMatch, clientMatchAmbiguous: !clientMatch && importedMatches.length + existingMatches.length > 1 };
  });
  return {
    clients, bookings, sourceType: sources.sourceType, migrationName: sources.migrationName,
    detected: { clientsDelimiter: parsedClients.delimiter || null, pandaDocDelimiter: parsedPandaDoc.delimiter || null },
    defaultBookingStatus: accountData?.data?.bookingStatuses?.[0]?.id || null,
    errors: { clients: parsedClients.errors, calendar: parsedCalendar.errors, pandaDoc: parsedPandaDoc.errors },
    summary: {
      clientRows: clients.length, clientsToCreate: clients.filter((item) => item.recommendation === 'create').length,
      clientsMatched: clients.filter((item) => item.recommendation === 'link').length,
      clientsNeedReview: clients.filter((item) => item.recommendation === 'review').length,
      bookingsToCreate: bookings.length, recurringBookings: bookings.filter((item) => item.recurring).length,
      historicalBookings: bookings.filter((item) => item.historical).length,
      pandaDocDocuments: bookings.filter((item) => item.sourceType === 'pandadoc').length,
      bookingsWithoutSourceId: bookings.filter((item) => !item.sourceRecordId).length,
      skippedInvalidRows: parsedClients.errors.length + parsedCalendar.errors.length + parsedPandaDoc.errors.length,
    },
  };
}

router.post('/preview', asyncHandler(async (req, res) => {
  if (!requireImportPermissions(req, res)) return;
  const sources = sourcesFrom(req.body);
  if (!sources.clientsCsv.trim() && !sources.calendarIcs.trim() && !sources.pandaDocCsv.trim()) return res.status(400).json({ error: 'Choose at least one client, calendar, or PandaDoc report file.' });
  const preview = await buildPreview(req.membership.accountId, sources);
  res.json({ preview, token: createImportToken(req.membership.accountId, sourceDigest(sources)) });
}));

router.post('/commit', asyncHandler(async (req, res) => {
  if (!requireImportPermissions(req, res)) return;
  const sources = sourcesFrom(req.body);
  const verified = verifyImportToken(req.body?.token, req.membership.accountId, sourceDigest(sources));
  if (!verified) return res.status(400).json({ error: 'This import preview expired or the source files changed. Preview the files again.' });
  const preview = await buildPreview(req.membership.accountId, sources);
  const decisions = req.body?.clientDecisions && typeof req.body.clientDecisions === 'object' ? req.body.clientDecisions : {};
  const result = await prisma.$transaction(async (tx) => {
    const clientIds = new Map();
    const clientsToCreate = [];
    let clientsLinked = 0; let clientsSkipped = 0;
    for (const client of preview.clients) {
      if (client.linkedRowId) { clientIds.set(client.rowId, clientIds.get(client.linkedRowId) || null); continue; }
      const decision = decisions[client.rowId] || (client.recommendation === 'link' ? `existing:${client.candidates[0].id}` : client.recommendation === 'create' ? 'create' : 'skip');
      if (decision.startsWith('existing:')) {
        const candidateId = decision.slice('existing:'.length);
        if (!client.candidates.some((candidate) => candidate.id === candidateId)) throw Object.assign(new Error(`Invalid client match for CSV row ${client.rowNumber}.`), { status: 400 });
        clientIds.set(client.rowId, candidateId); clientsLinked += 1; continue;
      }
      if (decision !== 'create') { clientIds.set(client.rowId, null); clientsSkipped += 1; continue; }
      const id = stableImportId(verified.id, 'client', client.rowId);
      clientsToCreate.push({
        id, accountId: req.membership.accountId, firstName: client.firstName, lastName: client.lastName,
        email: client.email, phone: client.phone, emailNormalized: client.email,
        phoneNormalized: client.phoneNormalized, nameNormalized: `${client.firstName} ${client.lastName}`.toLowerCase(),
        address1: client.address1, address2: client.address2, city: client.city, state: client.state, zip: client.zip, notes: client.notes,
      });
      clientIds.set(client.rowId, id);
    }
    for (const client of preview.clients.filter((item) => item.linkedRowId)) clientIds.set(client.rowId, clientIds.get(client.linkedRowId) || null);
    const clientInsert = clientsToCreate.length ? await tx.client.createMany({ data: clientsToCreate, skipDuplicates: true }) : { count: 0 };
    const bookingsToCreate = [];
    for (const booking of preview.bookings) {
      let clientId = null;
      if (booking.clientMatch?.type === 'existing') clientId = booking.clientMatch.id;
      if (booking.clientMatch?.type === 'imported') clientId = clientIds.get(booking.clientMatch.id) || null;
      const id = booking.sourceRecordId
        ? stableSourceRecordId(req.membership.accountId, booking.sourceType, booking.sourceRecordId)
        : stableImportId(verified.id, 'booking', booking.rowId);
      const schedule = booking.allDay ? [] : [{ id: stableImportId(verified.id, 'schedule', booking.rowId), time: booking.startTime, name: booking.eventName, details: booking.endTime ? `Ends at ${booking.endTime}` : '' }];
      const sourceDetails = booking.sourceType === 'pandadoc' ? [
        `PandaDoc status: ${booking.status}`,
        booking.sourceDocumentId ? `PandaDoc document ID: ${booking.sourceDocumentId}` : null,
        booking.template ? `Template: ${booking.template}` : null,
        booking.total ? `Document total: ${booking.total}${booking.currency ? ` ${booking.currency}` : ''}` : null,
        booking.link ? `Original PandaDoc link: ${booking.link}` : null,
      ] : [
        booking.location ? `Imported location: ${booking.location}` : null,
        booking.timezone ? `Source timezone: ${booking.timezone}` : null,
      ];
      const notes = [`Imported from ${booking.source}.`, ...sourceDetails, booking.description].filter(Boolean).join('\n\n') || null;
      bookingsToCreate.push({
        id, accountId: req.membership.accountId, eventName: booking.eventName, eventDate: booking.eventDate,
        clientId, bookingStatus: preview.defaultBookingStatus, completedAt: booking.historical ? new Date() : null,
        notes, venue: booking.location ? { name: booking.location } : {},
        schedule, activityLog: [{ id: stableImportId(verified.id, 'activity', booking.rowId), at: new Date().toISOString(), type: 'imported', note: `Imported from ${booking.source}.` }], history: [],
      });
    }
    const existingBookingIds = bookingsToCreate.length ? new Set((await tx.booking.findMany({ where: { id: { in: bookingsToCreate.map((booking) => booking.id) } }, select: { id: true } })).map((booking) => booking.id)) : new Set();
    const newHistoricalBookings = bookingsToCreate.filter((booking) => booking.completedAt && !existingBookingIds.has(booking.id)).length;
    const bookingInsert = bookingsToCreate.length ? await tx.booking.createMany({ data: bookingsToCreate, skipDuplicates: true }) : { count: 0 };
    const completedAt = new Date();
    await tx.accountActivity.create({ data: { accountId: req.membership.accountId, actorUserId: req.session.userId, type: 'data_import_completed', summary: `Imported ${clientInsert.count} clients and ${bookingInsert.count} separate bookings`, metadata: { importId: verified.id, migrationName: sources.migrationName || null, sourceType: sources.sourceType, clientsCreated: clientInsert.count, clientsLinked, clientsSkipped, bookingsCreated: bookingInsert.count, historicalBookings: newHistoricalBookings } } });
    return { migrationId: verified.id, migrationName: sources.migrationName || null, sourceType: sources.sourceType, completedAt, clientsCreated: clientInsert.count, clientsLinked, clientsSkipped, bookingsCreated: bookingInsert.count, historicalBookings: newHistoricalBookings, skippedRows: preview.summary.skippedInvalidRows };
  });
  res.json({ result });
}));

export default router;
