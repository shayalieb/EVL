import test from 'node:test';
import assert from 'node:assert/strict';
import { createImportToken, parseClientsCsv, parseGoogleCalendarIcs, parsePandaDocDocumentsCsv, sourceDigest, stableImportId, stableSourceRecordId, verifyImportToken } from '../src/lib/dataImport.js';

test('client CSV parser handles quoted commas and rejects unsafe rows', () => {
  const result = parseClientsCsv('Name,Email,Phone,Notes\n"Ada Lovelace",ada@example.com,555-111-2222,"VIP, returning"\nPrince,,,' );
  assert.equal(result.clients[0].firstName, 'Ada');
  assert.equal(result.clients[0].lastName, 'Lovelace');
  assert.equal(result.clients[0].notes, 'VIP, returning');
  assert.equal(result.clients[0].valid, true);
  assert.equal(result.clients[1].valid, false);
  assert.equal(result.errors[0].rowNumber, 3);
});

test('client CSV parser automatically accepts PandaDoc semicolon exports and underscored headers', () => {
  const result = parseClientsCsv('first_name;last_name;email;phone;street_address;postal_code\nAda;Lovelace;ADA@Example.com;+1 555 111 2222;12 Computing Ln;12345');
  assert.equal(result.delimiter, ';');
  assert.equal(result.clients[0].firstName, 'Ada');
  assert.equal(result.clients[0].email, 'ada@example.com');
  assert.equal(result.clients[0].address1, '12 Computing Ln');
  assert.equal(result.clients[0].zip, '12345');
});

test('PandaDoc report parser preserves every document as a separate migration record', () => {
  const result = parsePandaDocDocumentsCsv('Document ID,Document name,Document recipient,Document status,Creation date,Completed date,Total,Total currency,Document link\ndoc-1,Wedding proposal,ada@example.com,completed,2026-01-01,2026-01-03,2500,USD,https://app.pandadoc.com/a/doc-1\ndoc-2,Wedding contract,ada@example.com,sent,2026-01-04,,,USD,https://app.pandadoc.com/a/doc-2');
  assert.equal(result.documents.length, 2);
  assert.equal(result.documents[0].sourceDocumentId, 'doc-1');
  assert.equal(result.documents[0].terminal, true);
  assert.equal(result.documents[1].terminal, false);
  assert.deepEqual(result.documents[0].recipientEmails, ['ada@example.com']);
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
  assert.equal(stableSourceRecordId('account-1', 'pandadoc', 'doc-1'), stableSourceRecordId('account-1', 'pandadoc', 'doc-1'));
  assert.notEqual(stableSourceRecordId('account-1', 'pandadoc', 'doc-1'), stableSourceRecordId('account-1', 'pandadoc', 'doc-2'));
});
