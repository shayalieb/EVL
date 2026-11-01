import { expect, test } from '@playwright/test';
import { E2E } from '../server/scripts/seedE2e.js';
import { prisma } from '../server/src/lib/prisma.js';

// Regression tests for four problems found walking the app from inquiry to the end of an event:
//  1. Home showed only "Invalid request." once an account had a sent invoice with a due date.
//  2. A proposal whose email failed was still left marked "Sent".
//  3. A booking's private Notes were printed on the proposal and contract the client receives.
//  4. "Mark Paid" on the deposit left the deposit invoice "Sent" and "collected" at $0.

const PRIVATE_NOTE = 'PRIVATE-NOTE-DO-NOT-SHOW-CLIENT';
let accountId;

async function signIn(page) {
  await page.goto('/auth');
  await page.getByTestId('auth-signin-email-input').fill(E2E.email);
  await page.getByTestId('auth-signin-password-input').fill(E2E.password);
  await page.getByTestId('auth-signin-submit-button').click();
  await expect(page).toHaveURL(/\/home$/);
}

test.beforeAll(async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: E2E.email } });
  accountId = (await prisma.membership.findFirstOrThrow({ where: { userId: user.id } })).accountId;
});

test.afterAll(async () => {
  const ids = ['blk-proposal', 'blk-contract', 'blk-deposit'];
  await prisma.invoice.deleteMany({ where: { OR: [{ bookingId: { in: ids } }, { recipientName: 'Overdue Person' }] } });
  await prisma.proposalResponse.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.contract.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.event.deleteMany({ where: { id: 'blk-deposit-event' } });
  await prisma.booking.deleteMany({ where: { id: { in: ids } } });
});

test('Home still loads, and lists the invoice, when a sent invoice has a past due date', async ({ page }) => {
  await prisma.invoice.create({ data: {
    accountId, bookingId: 'recipient-booking', status: 'sent', sentAt: new Date(), dueDate: new Date('2026-01-01T00:00:00Z'),
    recipientEmail: 'client@e2e.test', recipientName: 'Overdue Person', ownerEmail: E2E.email,
    snapshot: { client: { firstName: 'Overdue', lastName: 'Person' }, lineItems: [{ name: 'Service', amount: 500 }] },
  } });
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByText('Invalid request.')).toHaveCount(0);
  await expect(page.getByTestId('home-overdue-invoice-row').filter({ hasText: 'Overdue Person' })).toBeVisible();
  await expect(page.getByTestId('home-overdue-invoice-row').filter({ hasText: 'Overdue Person' })).toContainText(/Due Jan 1/);
});

test('a proposal whose email fails is withdrawn instead of being left marked Sent', async ({ page }) => {
  await prisma.booking.create({ data: { id: 'blk-proposal', accountId, clientId: 'e2e-client', eventName: 'Blocker Proposal', eventType: 'Wedding', eventDate: '2027-03-01' } });
  await signIn(page);
  await page.route('**/api/email/send', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Email sending is not configured yet.' }) }));
  await page.goto('/bookings/blk-proposal?tab=proposal');
  await page.getByTestId('booking-form-push-to-proposal-button').click();
  await page.getByTestId('booking-form-proposal-send-button').click();
  // An empty proposal asks first; nothing has been created yet while the question is open.
  await expect(page.getByText('Send a proposal with no pricing?')).toBeVisible();
  expect(await prisma.proposalResponse.count({ where: { bookingId: 'blk-proposal' } })).toBe(0);
  await page.getByRole('button', { name: 'Send anyway' }).click();

  await expect(page.getByText(/The proposal was not sent/)).toBeVisible();
  await expect(page.getByText('Proposal: Sent')).toHaveCount(0);
  await expect(page.getByTestId('booking-form-proposal-document-row')).toHaveCount(0);
  expect(await prisma.proposalResponse.count({ where: { bookingId: 'blk-proposal' } })).toBe(0);
});

test('a failed proposal send restores the earlier proposal it had replaced', async ({ page }) => {
  await prisma.booking.create({ data: { id: 'blk-proposal', accountId, clientId: 'e2e-client', eventName: 'Blocker Proposal', eventType: 'Wedding', eventDate: '2027-03-01' } });
  const earlier = await prisma.proposalResponse.create({ data: {
    accountId, bookingId: 'blk-proposal', status: 'sent', sentAt: new Date(Date.now() - 86_400_000),
    recipientEmail: 'client@e2e.test', ownerEmail: E2E.email, snapshot: { lineItems: [] },
  } });
  await signIn(page);
  await page.route('**/api/email/send', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Email sending is not configured yet.' }) }));
  await page.goto('/bookings/blk-proposal?tab=proposal');
  await page.getByTestId('booking-form-push-to-proposal-button').click();
  await page.getByTestId('booking-form-proposal-send-button').click();
  await page.getByRole('button', { name: 'Send anyway' }).click();
  await expect(page.getByText(/The proposal was not sent/)).toBeVisible();

  const rows = await prisma.proposalResponse.findMany({ where: { bookingId: 'blk-proposal' } });
  expect(rows.map((row) => row.id)).toEqual([earlier.id]);
  expect(rows[0].status).toBe('sent');
});

test('a booking’s private notes never reach the contract, even from a proposal accepted before the fix', async ({ page }) => {
  await prisma.booking.create({ data: { id: 'blk-contract', accountId, clientId: 'e2e-client', eventName: 'Blocker Contract', eventType: 'Wedding', eventDate: '2027-04-01', notes: PRIVATE_NOTE, proposal: { hours: '4', lineItems: [], offerings: [], sections: [] } } });
  // Shaped like a proposal accepted before this fix: the booking notes are inside its saved snapshot.
  await prisma.proposalResponse.create({ data: {
    accountId, bookingId: 'blk-contract', status: 'accepted', respondedAt: new Date(), sentAt: new Date(),
    recipientEmail: 'client@e2e.test', recipientName: 'Casey Client', ownerEmail: E2E.email,
    snapshot: {
      businessInfo: { name: 'E2E Events', email: E2E.email },
      client: { firstName: 'Casey', lastName: 'Client', email: 'client@e2e.test' },
      booking: { eventType: 'Wedding', eventDate: '2027-04-01', venue: { name: 'Test Hall' }, notes: PRIVATE_NOTE },
      proposal: { hours: '4', lineItems: [], offerings: [{ id: 'blk-offer', name: 'DJ set', type: 'general', amount: 500 }], sections: [] },
    },
  } });
  await signIn(page);
  await page.goto('/bookings/blk-contract?tab=contract');
  await page.getByTestId('booking-form-contract-recipient-email-input').fill('client@e2e.test');
  await page.getByTestId('booking-form-contract-send-button').click();
  await expect(page.getByTestId('booking-form-contract-what-was-sent-toggle')).toBeVisible();

  const contract = await prisma.contract.findFirstOrThrow({ where: { bookingId: 'blk-contract' } });
  expect(JSON.stringify(contract.snapshot)).not.toContain(PRIVATE_NOTE);
  expect(contract.snapshot.booking.eventType).toBe('Wedding');
  expect(contract.snapshot.booking.venue.name).toBe('Test Hall');
});

test('the booking Notes field says it is private', async ({ page }) => {
  await prisma.booking.create({ data: { id: 'blk-contract', accountId, clientId: 'e2e-client', eventName: 'Blocker Contract', eventType: 'Wedding', eventDate: '2027-04-01', notes: PRIVATE_NOTE } });
  await signIn(page);
  await page.goto('/bookings/blk-contract');
  await expect(page.getByText('Private to your team. Never shown on proposals, contracts or invoices.')).toBeVisible();
});

test('marking the deposit paid also records the matching deposit invoice as paid', async ({ page }) => {
  await prisma.booking.create({ data: { id: 'blk-deposit', accountId, clientId: 'e2e-client', eventName: 'Blocker Deposit', eventType: 'Wedding', eventDate: '2027-05-01', depositAmount: 500, depositDueDate: '2027-04-01', convertedEventId: 'blk-deposit-event' } });
  await prisma.event.create({ data: { id: 'blk-deposit-event', accountId, name: 'Blocker Deposit Event', eventDate: '2027-05-01' } });
  const invoice = await prisma.invoice.create({ data: {
    accountId, bookingId: 'blk-deposit', status: 'sent', sentAt: new Date(), dueDate: new Date('2027-04-01T00:00:00Z'),
    recipientEmail: 'client@e2e.test', recipientName: 'Casey Client', ownerEmail: E2E.email,
    snapshot: { client: { firstName: 'Casey', lastName: 'Client' }, lineItems: [{ name: 'Deposit', amount: 500 }] },
  } });
  await signIn(page);
  await page.goto('/events/blk-deposit-event');
  await page.getByTestId('event-form-tab-financials').click();
  await expect(page.getByText('$0.00 collected so far')).toBeVisible();

  await page.getByTestId('event-form-financials-mark-deposit-paid-button').click();
  // Nothing is recorded until the owner confirms, and the dialog says what will change.
  await expect(page.getByText(/marks invoice #\d+ as paid/)).toBeVisible();
  expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe('sent');
  await page.getByTestId('confirm-dialog-confirm-button').click();

  await expect(page.getByText('$500.00 collected so far')).toBeVisible();
  await expect(page.getByTestId('event-form-financials-invoice-row-status')).toHaveText('Paid');
  const saved = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  expect(saved.status).toBe('paid');
  expect(saved.paidAmount).toBe(500);
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: 'blk-deposit' } })).depositPaid).toBe(true);
});

test('with no invoice to match, marking the deposit paid still confirms first', async ({ page }) => {
  await prisma.booking.create({ data: { id: 'blk-deposit', accountId, clientId: 'e2e-client', eventName: 'Blocker Deposit', eventType: 'Wedding', eventDate: '2027-05-01', depositAmount: 500, depositDueDate: '2027-04-01', convertedEventId: 'blk-deposit-event' } });
  await prisma.event.create({ data: { id: 'blk-deposit-event', accountId, name: 'Blocker Deposit Event', eventDate: '2027-05-01' } });
  await signIn(page);
  await page.goto('/events/blk-deposit-event');
  await page.getByTestId('event-form-tab-financials').click();
  await page.getByTestId('event-form-financials-mark-deposit-paid-button').click();
  await expect(page.getByText('No invoice is linked to it.')).toBeVisible();
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: 'blk-deposit' } })).depositPaid).toBe(false);
  await page.getByTestId('confirm-dialog-confirm-button').click();
  await expect(page.getByText('$500.00 deposit — paid')).toBeVisible();
});

test.afterEach(async () => {
  // Each test builds the rows it needs; clear them so the next starts clean.
  const ids = ['blk-proposal', 'blk-contract', 'blk-deposit'];
  await prisma.invoice.deleteMany({ where: { OR: [{ bookingId: { in: ids } }, { recipientName: 'Overdue Person' }] } });
  await prisma.proposalResponse.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.contract.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.event.deleteMany({ where: { id: 'blk-deposit-event' } });
  await prisma.booking.deleteMany({ where: { id: { in: ids } } });
});
