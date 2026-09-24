import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationSettings, invoiceReminderStart, nextInvoiceReminder } from '../src/lib/notificationRules.js';
import { syncInquiryNotification, syncInvoiceNotifications, notificationDeliveryAllowed } from '../src/lib/notificationAutomation.js';

const settings = notificationSettings();
const invoice = { id: 'invoice', accountId: 'account', bookingId: 'booking', status: 'sent', displayNumber: 42, ownerEmail: 'user@example.com', dueDate: new Date('2026-10-20T00:00:00Z'), sentAt: new Date('2026-09-01T00:00:00Z') };

test('deposit reminders use invoice due date regardless of gig date', () => {
  for (const eventDate of ['2026-10-10', '2026-10-20', '2026-10-30']) {
    assert.equal(invoiceReminderStart(invoice, { depositPaid: true, eventDate }, settings).toISOString(), '2026-10-13T00:00:00.000Z');
  }
  assert.equal(invoiceReminderStart({ ...invoice, paidAmount: 50 }, null, settings).toISOString(), '2026-10-13T00:00:00.000Z');
  assert.equal(invoiceReminderStart({ ...invoice, status: 'partial' }, null, settings).toISOString(), '2026-10-13T00:00:00.000Z');
});
test('open invoices, missing due dates, closed invoices and overrides', () => {
  assert.equal(invoiceReminderStart(invoice, null, settings).toISOString(), '2026-10-17T00:00:00.000Z');
  assert.equal(invoiceReminderStart({ ...invoice, dueDate: null }, null, settings).toISOString(), '2026-09-04T00:00:00.000Z');
  assert.equal(invoiceReminderStart({ ...invoice, dueDate: null, paidAmount: 10 }, null, settings), null);
  for (const status of ['draft', 'paid', 'void']) assert.equal(invoiceReminderStart({ ...invoice, status }, null, settings), null);
  assert.equal(invoiceReminderStart(invoice, { depositPaid: true }, notificationSettings({ invoiceDepositReminderDays: 14 })).toISOString(), '2026-10-06T00:00:00.000Z');
  assert.equal(notificationSettings({ invoiceRepeatDays: 0, inquiryEmailEnabled: 'false' }).invoiceRepeatDays, 7);
});
test('repeat cadence and moved due dates do not send early', () => {
  assert.equal(nextInvoiceReminder(new Date('2026-10-13'), new Date('2026-10-15'), 7).toISOString(), '2026-10-22T00:00:00.000Z');
  assert.equal(nextInvoiceReminder(new Date('2026-11-01'), new Date('2026-10-15'), 7).toISOString(), '2026-11-01T00:00:00.000Z');
});

function fakeDb(saved = {}) {
  const rows = new Map();
  let currentInvoice = invoice;
  let inquiryStatus = 'submitted';
  const db = {
    rows,
    accountData: { findUnique: async () => ({ data: { reminderSettings: saved } }) },
    membership: { findMany: async () => [ { userId: 'owner', role: 'owner', user: { email: 'owner@example.com' } }, { userId: 'creator', role: 'member', user: { email: 'user@example.com' } } ] },
    booking: { findFirst: async () => ({ depositPaid: true }) },
    invoice: { findFirst: async () => currentInvoice },
    inquiryLink: { findFirst: async () => ({ status: inquiryStatus }) },
    reminder: {
      findUnique: async ({ where }) => rows.get(where.accountId_relatedType_relatedId_ruleKey.ruleKey),
      upsert: async ({ where, create, update }) => { const key = where.accountId_relatedType_relatedId_ruleKey.ruleKey; rows.set(key, rows.has(key) ? { ...rows.get(key), ...update } : { id: key, ...create }); },
      updateMany: async ({ where, data }) => { for (const [key, row] of rows) if (row.id === where.id || key === where.ruleKey) rows.set(key, { ...row, ...data }); },
    },
    setInvoice: (value) => { currentInvoice = value; },
    setInquiryStatus: (value) => { inquiryStatus = value; },
  };
  return db;
}
test('inquiry notification is idempotent, targets creator and resolves after review', async () => {
  const db = fakeDb();
  const link = { id: 'link', accountId: 'account', ownerEmail: 'user@example.com', status: 'submitted' };
  await syncInquiryNotification(link, db);
  await syncInquiryNotification(link, db);
  assert.equal(db.rows.size, 1);
  const reminder = db.rows.get('inquiry-awaiting-review');
  assert.equal(reminder.createdByUserId, 'creator');
  db.setInquiryStatus('applied');
  assert.equal(await notificationDeliveryAllowed(reminder, db), false);
  await syncInquiryNotification({ ...link, status: 'applied' }, db);
  assert.ok(db.rows.get('inquiry-awaiting-review').completedAt);
});
test('invoice audiences, retries, cadence and payment recheck', async () => {
  const db = fakeDb({ invoiceReminderRecipient: 'both' });
  const now = new Date('2026-10-14');
  await syncInvoiceNotifications(invoice, db, now);
  await syncInvoiceNotifications(invoice, db, now);
  assert.equal(db.rows.size, 2);
  const owner = db.rows.get('invoice-open-owner');
  assert.equal(owner.remindAt.toISOString(), '2026-10-13T00:00:00.000Z');
  owner.emailSentAt = now;
  await syncInvoiceNotifications(invoice, db, new Date('2026-10-15'));
  assert.equal(db.rows.get('invoice-open-owner').emailSentAt, now);
  assert.equal(db.rows.get('invoice-open-owner').remindAt.toISOString(), '2026-10-21T00:00:00.000Z');
  await syncInvoiceNotifications(invoice, db, new Date('2026-10-21'));
  assert.equal(db.rows.get('invoice-open-owner').emailSentAt, null);
  assert.equal(await notificationDeliveryAllowed(owner, db, now), true);
  db.setInvoice({ ...invoice, status: 'paid' });
  assert.equal(await notificationDeliveryAllowed(owner, db, now), false);
});
test('disabled settings stop queued delivery', async () => {
  const db = fakeDb({ invoiceRemindersEnabled: false, inquiryEmailEnabled: false });
  assert.equal(await notificationDeliveryAllowed({ accountId: 'account', relatedId: 'invoice', ruleKey: 'invoice-open-owner' }, db), false);
  assert.equal(await notificationDeliveryAllowed({ accountId: 'account', relatedId: 'link', ruleKey: 'inquiry-awaiting-review' }, db), false);
});

test('settings changes disable existing invoice jobs and reschedule deposited balances', async () => {
  const saved = { invoiceReminderRecipient: 'both' };
  const db = fakeDb(saved);
  await syncInvoiceNotifications(invoice, db, new Date('2026-10-01'));
  saved.invoiceDepositReminderDays = 14;
  await syncInvoiceNotifications(invoice, db, new Date('2026-10-01'));
  assert.equal(db.rows.get('invoice-open-owner').remindAt.toISOString(), '2026-10-06T00:00:00.000Z');
  saved.invoiceRemindersEnabled = false;
  await syncInvoiceNotifications(invoice, db);
  for (const row of db.rows.values()) {
    assert.equal(row.emailEnabled, false);
    assert.ok(row.completedAt);
  }
});

test('inquiry can keep an in-app reminder without email and falls back to owner', async () => {
  const db = fakeDb({ inquiryEmailEnabled: false });
  await syncInquiryNotification({ id: 'link', accountId: 'account', ownerEmail: 'former@example.com', status: 'submitted' }, db);
  const reminder = db.rows.get('inquiry-awaiting-review');
  assert.equal(reminder.createdByUserId, 'owner');
  assert.equal(reminder.emailEnabled, false);
  assert.equal(reminder.completedAt, null);
});
