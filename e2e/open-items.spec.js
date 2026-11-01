import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { E2E } from '../server/scripts/seedE2e.js';
import { prisma } from '../server/src/lib/prisma.js';

// Browser checks for the interface problems found walking a booking from inquiry to the end of an event:
// payment defaults and instructions, the invoice table on a phone, the contract screens, permissions in the
// interface, warnings on the event page, sidebar fit, field labels and phone-friendly sizes.

const require = createRequire(new URL('../server/package.json', import.meta.url));
const bcrypt = require('bcrypt');
const hash = (value) => createHash('sha256').update(value).digest('hex');

const MEMBER = { email: 'open.member@e2e.test', password: 'member-test-password-1' };
let accountId;
let ownerId;

async function signIn(page, email = E2E.email, password = E2E.password) {
  await page.goto('/auth');
  await page.getByTestId('auth-signin-email-input').fill(email);
  await page.getByTestId('auth-signin-password-input').fill(password);
  await page.getByTestId('auth-signin-submit-button').click();
  await expect(page).toHaveURL(/\/home$/);
}

async function createMember(permissions) {
  const user = await prisma.user.create({ data: { firstName: 'Open', lastName: 'Member', email: MEMBER.email, passwordHash: await bcrypt.hash(MEMBER.password, 4) } });
  await prisma.membership.create({ data: { userId: user.id, accountId, role: 'member', permissions } });
  return user;
}

const OFFLINE_SNAPSHOT = (businessInfo, lineItems) => ({ businessInfo, client: { firstName: 'Casey', lastName: 'Client', email: 'client@e2e.test' }, event: { type: 'Wedding', date: '2027-06-01' }, lineItems });
async function createInvoice(token, { businessInfo, lineItems, acceptPayment = false }) {
  return prisma.invoice.create({ data: {
    accountId, bookingId: 'recipient-booking', status: 'sent', sentAt: new Date(), acceptPayment, payTokenHash: hash(token),
    recipientEmail: 'client@e2e.test', recipientName: 'Casey Client', ownerEmail: E2E.email, snapshot: OFFLINE_SNAPSHOT(businessInfo, lineItems),
  } });
}

async function openInvoice(page, token) {
  await page.goto(`/invoice/${token}`);
  if (await page.getByTestId('invoice-pay-email-input').isVisible().catch(() => false)) {
    await page.getByTestId('invoice-pay-email-input').fill('client@e2e.test');
    await page.getByTestId('invoice-pay-verify-submit-button').click();
  }
}

test.beforeAll(async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: E2E.email } });
  ownerId = user.id;
  accountId = (await prisma.membership.findFirstOrThrow({ where: { userId: user.id } })).accountId;
});

test.afterEach(async () => {
  await prisma.invoice.deleteMany({ where: { payTokenHash: { in: ['offline-a', 'offline-b', 'perunit-c', 'plain-d'].map(hash) } } });
  await prisma.reminder.deleteMany({ where: { note: 'Owner private follow-up' } });
  await prisma.event.deleteMany({ where: { id: { in: ['open-null-event', 'open-fin-event'] } } });
  await prisma.contract.deleteMany({ where: { bookingId: 'open-fin-booking' } });
  await prisma.invoice.deleteMany({ where: { bookingId: 'open-fin-booking' } });
  await prisma.proposalResponse.deleteMany({ where: { bookingId: 'open-contract-booking' } });
  await prisma.booking.deleteMany({ where: { id: { in: ['open-fin-booking', 'open-contract-booking'] } } });
  await prisma.membership.deleteMany({ where: { user: { email: MEMBER.email } } });
  await prisma.user.deleteMany({ where: { email: MEMBER.email } });
});

test('an invoice starts document-only, and says why, when Stripe is not connected', async ({ page }) => {
  await signIn(page);
  await page.goto(`/bookings/${E2E.signedBookingId}?tab=invoices`);
  await expect(page.getByTestId('booking-form-invoice-accept-payment-checkbox')).not.toBeChecked();
  await expect(page.getByTestId('booking-form-invoice-stripe-not-connected-note')).toBeVisible();
  await expect(page.getByTestId('booking-form-invoice-no-payment-instructions-warning')).toBeVisible();
});

test('an invoice that is not paid online tells the client how to pay', async ({ page }) => {
  await createInvoice('offline-a', { businessInfo: { name: 'E2E Events', email: E2E.email, paymentInstructions: 'Pay by check to E2E Events, 1 Main St.' }, lineItems: [{ name: 'Service', amount: 500 }] });
  await createInvoice('offline-b', { businessInfo: { name: 'E2E Events', email: E2E.email, phone: '(555) 010-0000' }, lineItems: [{ name: 'Service', amount: 500 }] });

  await openInvoice(page, 'offline-a');
  await expect(page.getByTestId('invoice-offline-payment-instructions')).toContainText('Pay by check to E2E Events, 1 Main St.');
  await expect(page.getByTestId('invoice-pay-now-button')).toHaveCount(0);

  await openInvoice(page, 'offline-b');
  await expect(page.getByTestId('invoice-offline-payment-instructions')).toContainText(`Please contact E2E Events at ${E2E.email} or (555) 010-0000 to arrange payment.`);
});

test('an invoice paid online never shows the offline instructions', async ({ page }) => {
  await createInvoice('offline-a', { acceptPayment: true, businessInfo: { name: 'E2E Events', paymentInstructions: 'Pay by check' }, lineItems: [{ name: 'Service', amount: 500 }] });
  await openInvoice(page, 'offline-a');
  await expect(page.getByText('Service').first()).toBeVisible();
  await expect(page.getByTestId('invoice-offline-payment-instructions')).toHaveCount(0);
});

test('invoice description keeps its width on a phone, and Qty and Rate only appear for per-unit lines', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const longDetails = 'Contract #100007 · Wedding · 2027-06-12. Covers: DJ Package, Additional Hour. Contract total $4,700.00; this deposit is credited toward that total.';
  await createInvoice('plain-d', { businessInfo: { name: 'E2E Events' }, lineItems: [{ name: 'Deposit toward event services', details: longDetails, amount: 500 }] });
  await createInvoice('perunit-c', { businessInfo: { name: 'E2E Events' }, lineItems: [{ name: 'Extra hours', type: 'perUnit', unitCount: 2, ratePerUnit: 200 }] });

  await openInvoice(page, 'plain-d');
  await expect(page.getByText('Deposit toward event services')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Qty' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Rate' })).toHaveCount(0);
  const width = await page.getByRole('cell').filter({ hasText: 'Deposit toward event services' }).evaluate((cell) => cell.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(180);

  await openInvoice(page, 'perunit-c');
  await expect(page.getByRole('columnheader', { name: 'Qty' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Rate' })).toBeVisible();
});

test('public document pages do not log a 401 and the contract gate names the sender', async ({ page }) => {
  const failures = [];
  page.on('response', (response) => { if (response.status() >= 400 && response.url().includes('/api/')) failures.push(`${response.status()} ${response.url()}`); });
  await page.goto(`/sign/${E2E.contractToken}`);
  await expect(page.getByTestId('contract-sign-email-input')).toBeVisible();
  await expect(page.getByTestId('contract-sign-sender-name')).toHaveText('E2E Events');
  // Another test may already have answered the seeded proposal, so only check that the page itself loaded.
  await page.goto(`/proposal/${E2E.proposalToken}`);
  await expect(page.getByText('Proposal for Casey Client')).toBeVisible();
  expect(failures).toEqual([]);
});

test('the contract link expiration sits above the send button', async ({ page }) => {
  await prisma.booking.create({ data: { id: 'open-contract-booking', accountId, clientId: 'e2e-client', eventName: 'Contract Layout', eventType: 'Wedding', eventDate: '2027-07-01', proposal: { hours: '4', lineItems: [], offerings: [], sections: [] } } });
  await prisma.proposalResponse.create({ data: {
    accountId, bookingId: 'open-contract-booking', status: 'accepted', respondedAt: new Date(), sentAt: new Date(), recipientEmail: 'client@e2e.test', ownerEmail: E2E.email,
    snapshot: { businessInfo: { name: 'E2E Events' }, client: { firstName: 'Casey', lastName: 'Client' }, booking: { eventType: 'Wedding' }, proposal: { hours: '4', lineItems: [], offerings: [{ id: 'open-offer', name: 'DJ set', type: 'general', amount: 500 }], sections: [] } },
  } });
  await signIn(page);
  await page.goto('/bookings/open-contract-booking?tab=contract');
  const expiration = page.locator('[data-testid^="booking-form-contract-expiration"]').first();
  await expect(expiration).toBeVisible();
  const send = page.getByTestId('booking-form-contract-send-button');
  const [expirationBox, sendBox] = [await expiration.boundingBox(), await send.boundingBox()];
  expect(expirationBox.y).toBeLessThan(sendBox.y);
});

test('on a phone the Sign button explains what is missing and clicking it points at the consent box', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/sign/${E2E.contractToken}`);
  await page.getByTestId('contract-sign-email-input').fill('client@e2e.test');
  await page.getByTestId('contract-sign-verify-submit-button').click();
  await expect(page.getByTestId('contract-sign-hint')).toContainText('Tick the consent box');
  const button = page.getByTestId('contract-sign-submit-button');
  // Dimmed and announced as unavailable, but still clickable so it can say what is missing.
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  expect(await button.evaluate((element) => element.disabled)).toBe(false);
  // force: Playwright refuses to click aria-disabled controls, but a real person can.
  await button.click({ force: true });
  await expect(page.getByTestId('contract-sign-error-banner')).toBeVisible();
  await page.getByTestId('contract-sign-consent-checkbox').check();
  await expect(page.getByTestId('contract-sign-hint')).not.toContainText('Tick the consent box');
});

test('a member whose view switches are off sees none of those areas', async ({ page }) => {
  await createMember({ manageContractors: false, manageClients: false, manageVenues: false, manageBookings: false, manageEvents: false, manageEmailTemplates: false, manageOfferings: false, manageSettings: false, viewClients: false, viewContractors: false, viewBookings: false, viewEvents: false, viewVenues: false, viewOfferings: false });
  await signIn(page, MEMBER.email, MEMBER.password);
  for (const name of ['Bookings', 'Events', 'Clients', 'Venues', 'Contractors', 'Offerings']) {
    await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('link', { name: 'Reminders' })).toBeVisible();
  await page.goto('/clients');
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/bookings');
  await expect(page).toHaveURL(/\/home$/);
});

test('a member keeps seeing every area until an owner turns a switch off', async ({ page }) => {
  await createMember({ manageBookings: true });
  await signIn(page, MEMBER.email, MEMBER.password);
  for (const name of ['Bookings', 'Events', 'Clients', 'Venues', 'Contractors', 'Offerings']) {
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  }
});

test('a member cannot edit or delete a reminder someone else created', async ({ page }) => {
  await createMember({});
  await prisma.reminder.create({ data: { accountId, createdByUserId: ownerId, note: 'Owner private follow-up', remindAt: new Date(Date.now() + 86_400_000) } });
  await signIn(page, MEMBER.email, MEMBER.password);
  await page.goto('/reminders');
  const row = page.getByTestId('reminder-row').filter({ hasText: 'Owner private follow-up' });
  await expect(row).toBeVisible();
  await expect(row.getByTestId('reminder-row-edit-button')).toHaveCount(0);
  await expect(row.getByTestId('reminder-row-delete-button')).toHaveCount(0);
  await expect(row.getByTestId('reminder-row-complete-button')).toHaveCount(0);

  await page.context().clearCookies();
  await signIn(page);
  await page.goto('/reminders');
  const ownerRow = page.getByTestId('reminder-row').filter({ hasText: 'Owner private follow-up' });
  await expect(ownerRow.getByTestId('reminder-row-edit-button')).toBeVisible();
  await expect(ownerRow.getByTestId('reminder-row-delete-button')).toBeVisible();
});

test('the event page opens a saved event with empty fields without React warnings', async ({ page }) => {
  await prisma.event.create({ data: { id: 'open-null-event', accountId, name: 'Null Fields Event', eventDate: '2027-02-02' } });
  const warnings = [];
  page.on('console', (message) => { if (/should not be null|uncontrolled/i.test(message.text())) warnings.push(message.text().slice(0, 160)); });
  await signIn(page);
  await page.goto('/events/open-null-event');
  await expect(page.getByTestId('event-form-name-input')).toHaveValue('Null Fields Event');
  await page.getByTestId('event-form-tab-contractors').click();
  await page.getByTestId('event-form-tab-details').click();
  expect(warnings).toEqual([]);
});

test('on a laptop screen the header stays put and the whole sidebar can be reached', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await signIn(page);
  // The page itself no longer scrolls; the sidebar and the content scroll on their own.
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  const nav = page.locator('#primary-navigation');
  await nav.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const settings = page.locator('#primary-navigation a[href="/settings"]');
  await expect(settings).toBeVisible();
  const bottom = await settings.evaluate((link) => link.getBoundingClientRect().bottom);
  expect(bottom).toBeLessThanOrEqual(768);
  await expect(page.getByTestId('assistant-open-button')).toBeInViewport();
});

test('every visible form field on the booking form has a name a screen reader can announce', async ({ page }) => {
  await signIn(page);
  await page.goto('/bookings/new');
  await expect(page.getByTestId('booking-form-event-name-input')).toBeVisible();
  const unnamed = await page.locator('main input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), main select, main textarea').evaluateAll((fields) => fields
    .filter((field) => field.offsetParent !== null)
    .filter((field) => !(field.labels && field.labels.length) && !field.getAttribute('aria-label') && !field.getAttribute('aria-labelledby'))
    .map((field) => field.dataset.testid || field.name || field.placeholder || field.tagName));
  expect(unnamed).toEqual([]);
  await page.goto('/bookings');
  const filters = await page.locator('main select').evaluateAll((fields) => fields.filter((field) => field.offsetParent !== null && !(field.labels && field.labels.length) && !field.getAttribute('aria-label')).length);
  expect(filters).toBe(0);
});

test('on a phone, fields are large enough that iOS does not zoom, and row actions are easy to tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto('/bookings/new');
  await expect(page.getByTestId('booking-form-event-name-input')).toBeVisible();
  const sizes = await page.locator('main input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), main select, main textarea').evaluateAll((fields) => fields.filter((field) => field.offsetParent !== null).map((field) => parseFloat(getComputedStyle(field).fontSize)));
  expect(sizes.length).toBeGreaterThan(5);
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);

  await page.goto('/clients');
  const edit = page.getByTestId('client-row-edit-button').first();
  await expect(edit).toBeVisible();
  const box = await edit.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(36);
  expect(box.height).toBeGreaterThanOrEqual(36);
});

test('event financials show the signed contract value and what has not been invoiced', async ({ page }) => {
  await prisma.event.create({ data: { id: 'open-fin-event', accountId, name: 'Financial Event', eventDate: '2027-03-03' } });
  await prisma.booking.create({ data: { id: 'open-fin-booking', accountId, clientId: 'e2e-client', eventName: 'Financial Event', eventType: 'Wedding', eventDate: '2027-03-03', convertedEventId: 'open-fin-event' } });
  await prisma.contract.create({ data: {
    accountId, bookingId: 'open-fin-booking', status: 'fully_signed', recipientEmail: 'client@e2e.test', ownerEmail: E2E.email,
    snapshot: { businessInfo: { name: 'E2E Events' }, client: { firstName: 'Casey', lastName: 'Client' }, booking: { eventType: 'Wedding' }, lineItems: [], offerings: [{ name: 'DJ set', type: 'general', amount: 1000 }] },
  } });
  await prisma.invoice.create({ data: {
    accountId, bookingId: 'open-fin-booking', status: 'sent', sentAt: new Date(), recipientEmail: 'client@e2e.test', recipientName: 'Casey Client', ownerEmail: E2E.email,
    snapshot: { client: { firstName: 'Casey', lastName: 'Client' }, lineItems: [{ name: 'Deposit', amount: 250 }] },
  } });
  await signIn(page);
  await page.goto('/events/open-fin-event');
  await page.getByTestId('event-form-tab-financials').click();
  await expect(page.getByTestId('event-form-financials-contract-value')).toContainText('Signed contract $1,000.00');
  await expect(page.getByTestId('event-form-financials-contract-value')).toContainText('$750.00 not yet invoiced');
  await expect(page.getByTestId('event-form-financials-uninvoiced-note')).toBeVisible();
  await expect(page.getByTestId('event-form-financials-invoice-row').first()).toContainText(/Invoice #\d+/);
});
