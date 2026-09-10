import test from 'node:test';
import assert from 'node:assert/strict';
import { createImportToken, parseClientsCsv, parseGoogleCalendarIcs, sourceDigest, stableImportId, verifyImportToken } from '../src/lib/dataImport.js';

test('client CSV parser handles quoted commas and rejects unsafe rows', () => {
  const result = parseClientsCsv('Name,Email,Phone,Notes\n"Ada Lovelace",ada@example.com,555-111-2222,"VIP, returning"\nPrince,,,' );
  assert.equal(result.clients[0].firstName, 'Ada');
  assert.equal(result.clients[0].lastName, 'Lovelace');
  assert.equal(result.clients[0].notes, 'VIP, returning');
  assert.equal(result.clients[0].valid, true);
  assert.equal(result.clients[1].valid, false);
  assert.equal(result.errors[0].rowNumber, 3);
});

test('calendar parser keeps every VEVENT as a separate booking candidate', () => {
  const result = parseGoogleCalendarIcs(`BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:first\nDTSTART:20261001T180000Z\nDTEND:20261001T220000Z\nSUMMARY:Smith Wedding\nATTENDEE:mailto:client@example.com\nEND:VEVENT\nBEGIN:VEVENT\nUID:second\nDTSTART;VALUE=DATE:20261002\nSUMMARY:Smith Rehearsal\nATTENDEE:mailto:client@example.com\nEND:VEVENT\nEND:VCALENDAR`);
  assert.equal(result.events.length, 2);
  assert.notEqual(result.events[0].rowId, result.events[1].rowId);
  assert.equal(result.events[0].eventDate, '2026-10-01');
  assert.equal(result.events[1].allDay, true);
  assert.deepEqual(result.events[0].attendeeEmails, ['client@example.com']);
});

test('calendar parser skips cancelled and recurring events instead of guessing', () => {
  const result = parseGoogleCalendarIcs(`BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:repeat\nDTSTART:20261001T180000\nSUMMARY:Weekly rehearsal\nRRULE:FREQ=WEEKLY\nEND:VEVENT\nBEGIN:VEVENT\nUID:cancelled\nDTSTART:20261002T180000\nSUMMARY:Cancelled show\nSTATUS:CANCELLED\nEND:VEVENT\nEND:VCALENDAR`);
  assert.equal(result.events.filter((event) => event.valid).length, 0);
  assert.equal(result.errors.length, 2);
});

test('import tokens bind account and exact source while generated record ids remain stable', () => {
  const sources = { clientsCsv: 'Name,Email\nAda Lovelace,ada@example.com', calendarIcs: '' };
  const digest = sourceDigest(sources);
  const token = createImportToken('account-1', digest, 'test-secret');
  const verified = verifyImportToken(token, 'account-1', digest, 'test-secret');
  assert.ok(verified?.id);
  assert.equal(verifyImportToken(token, 'account-2', digest, 'test-secret'), null);
  assert.equal(verifyImportToken(token, 'account-1', sourceDigest({ ...sources, clientsCsv: `${sources.clientsCsv}\nchanged` }), 'test-secret'), null);
  assert.equal(stableImportId(verified.id, 'booking', 'event-1'), stableImportId(verified.id, 'booking', 'event-1'));
  assert.notEqual(stableImportId(verified.id, 'booking', 'event-1'), stableImportId(verified.id, 'booking', 'event-2'));
});
