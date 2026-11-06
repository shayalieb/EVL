import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDaysToISO, addMonthsISO, anniversaryKey, anniversaryWindow, boundedInt, parseAnniversaryKey, parseRebookKey, rebookKey, yearsBetween,
} from '../src/lib/clientReminderRules.js';
import { clientFlags, summarizeClientPayments } from '../src/lib/clientOverview.js';

test('month arithmetic clamps the day and crosses years', () => {
  assert.equal(addMonthsISO('2026-03-31', -1), '2026-02-28');
  assert.equal(addMonthsISO('2024-03-31', -1), '2024-02-29');
  assert.equal(addMonthsISO('2026-01-15', -11), '2025-02-15');
  assert.equal(addMonthsISO('2026-11-06', -36), '2023-11-06');
  assert.equal(addDaysToISO('2026-12-30', 3), '2027-01-02');
});

test('keys round-trip and reject foreign keys', () => {
  assert.equal(parseRebookKey(rebookKey('2025-06-01')), '2025-06-01');
  assert.equal(parseRebookKey('invoice-overdue'), null);
  assert.deepEqual(parseAnniversaryKey(anniversaryKey('evt_1', 2026)), { eventId: 'evt_1', year: 2026 });
  assert.deepEqual(parseAnniversaryKey(anniversaryKey('a:b', 2026)), { eventId: 'a:b', year: 2026 });
  assert.equal(parseAnniversaryKey('client-rebook:2025-06-01'), null);
});

test('anniversary window lists month-day suffixes across a year end', () => {
  const w = anniversaryWindow('2026-12-29', 4);
  assert.deepEqual(w.map((d) => d.suffix), ['-12-29', '-12-30', '-12-31', '-01-01', '-01-02']);
  assert.equal(w[3].date, '2027-01-01');
  assert.equal(yearsBetween('2025-01-01', w[3].date), 2);
});

test('boundedInt falls back for out-of-range or non-integer input', () => {
  assert.equal(boundedInt(11, 5, 1, 36), 11);
  assert.equal(boundedInt(0, 5, 1, 36), 5);
  assert.equal(boundedInt('9', 5, 1, 36), 5);
  assert.equal(boundedInt(40, 5, 1, 36), 5);
});

const line = (amount) => ({ snapshot: { lineItems: [{ type: 'package', amount }] } });

test('payment summary averages booking value and days to pay, ignoring drafts and voids', () => {
  const day = 86_400_000;
  const base = Date.parse('2026-01-01T00:00:00Z');
  const p = summarizeClientPayments([
    { ...line(1000), status: 'paid', bookingId: 'b1', sentAt: new Date(base), paidAt: new Date(base + 10 * day) },
    { ...line(500), status: 'paid', bookingId: 'b1', sentAt: new Date(base), paidAt: new Date(base + 20 * day) },
    { ...line(3000), status: 'sent', bookingId: 'b2', sentAt: new Date(base), paidAt: null },
    { ...line(9999), status: 'draft', bookingId: 'b3' },
    { ...line(9999), status: 'void', bookingId: 'b4' },
  ]);
  assert.equal(p.avgBookingValue, 2250); // (1500 + 3000) / 2 bookings
  assert.equal(p.avgDaysToPay, 15);
  assert.equal(p.paidInvoiceCount, 2);
  assert.deepEqual(summarizeClientPayments([]), { avgBookingValue: null, avgDaysToPay: null, paidInvoiceCount: 0 });
});

test('flags: overdue, slow payer, stale unsigned contract, and silence only while work is open', () => {
  const now = Date.parse('2026-06-01T00:00:00Z');
  const day = 86_400_000;
  const flags = clientFlags({
    money: { overdue: 250 }, payments: { paidInvoiceCount: 3, avgDaysToPay: 21 }, openWork: true,
    lastContactAt: new Date(now - 60 * day), createdAt: new Date(now - 200 * day),
    contracts: [{ status: 'sent', sentAt: new Date(now - 5 * day), displayNumber: 100123 }], now,
  });
  assert.deepEqual(flags.map((f) => f.key), ['overdue_balance', 'slow_payer', 'unsigned_contract', 'silent']);
  assert.deepEqual(clientFlags({ money: { overdue: 0 }, payments: { paidInvoiceCount: 1, avgDaysToPay: 30 }, openWork: false, lastContactAt: null, createdAt: new Date(now - 400 * day), contracts: [{ status: 'fully_signed', sentAt: new Date(now - 90 * day) }], now }), []);
  assert.equal(clientFlags({ openWork: true, lastContactAt: null, createdAt: new Date(now - 10 * day), now }).length, 0, 'a new client is not silent');
});
