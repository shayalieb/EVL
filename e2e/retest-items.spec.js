import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { E2E } from '../server/scripts/seedE2e.js';
import { prisma } from '../server/src/lib/prisma.js';

// Four things that were first noted and set aside, then looked at properly: the proposal preview popup, the
// event page's History "tab", the "Send Inquiry Link" card on a booking that came from an inquiry, and the
// Agency groups page.

let accountId;
let original;
const hash = (value) => createHash('sha256').update(value).digest('hex');

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
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  original = { planTier: account.planTier, agencyGroupLimit: account.agencyGroupLimit, vertical: account.vertical };
});

test.afterEach(async () => {
  await prisma.account.update({ where: { id: accountId }, data: original });
  await prisma.agencyGroup.deleteMany({ where: { accountId } });
  await prisma.inquiryLink.deleteMany({ where: { tokenHash: hash('retest-applied') } });
  await prisma.event.deleteMany({ where: { id: 'retest-event' } });
  await prisma.booking.deleteMany({ where: { id: { in: ['retest-applied-booking', 'retest-plain-booking'] } } });
});

async function openProposalPreview(page) {
  await signIn(page);
  await page.goto(`/bookings/${E2E.signedBookingId}?tab=proposal`);
  await page.getByTestId('booking-form-push-to-proposal-button').click({ timeout: 3000 }).catch(() => {});
  await page.getByTestId('booking-form-proposal-preview-button').click();
}

const readPdf = (page, url) => page.evaluate(async (href) => new TextDecoder('latin1').decode(await (await fetch(href)).arrayBuffer()), url);

test('proposal preview: where the browser has no PDF viewer it says so and offers Open and Download, never a blank box', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'pdfViewerEnabled', { value: false }));
  await openProposalPreview(page);
  await expect(page.getByTestId('pdf-preview-unsupported')).toBeVisible();
  await expect(page.getByTestId('booking-form-proposal-preview-frame')).toHaveCount(0);
  const open = page.getByTestId('pdf-preview-open-link');
  await expect(open).toHaveAttribute('href', /^blob:/);
  await expect(page.getByTestId('pdf-preview-download-link')).toHaveAttribute('download', /\.pdf$/);
  const pdf = await readPdf(page, await open.getAttribute('href'));
  expect(pdf.startsWith('%PDF')).toBe(true);
  expect(pdf).toContain('Event Proposal');
});

test('proposal preview: where the browser can show PDFs it shows the document in the popup, with a real title', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'pdfViewerEnabled', { value: true }));
  await openProposalPreview(page);
  const frame = page.getByTestId('booking-form-proposal-preview-frame');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('src', /^blob:/);
  await expect(page.getByTestId('pdf-preview-unsupported')).toHaveCount(0);
  const pdf = await readPdf(page, await frame.getAttribute('src'));
  expect(pdf).toMatch(/\/Title \(Proposal Casey Client\)/);
  // Closing releases the document and reopening builds a fresh one.
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByTestId('booking-form-proposal-preview-button').click();
  await expect(page.getByTestId('booking-form-proposal-preview-frame')).toBeVisible();
});

test('event page: sections are real tabs, and the things that open on top of the page are separate buttons', async ({ page }) => {
  await prisma.account.update({ where: { id: accountId }, data: { vertical: 'band_orchestra' } });
  await prisma.event.create({ data: { id: 'retest-event', accountId, name: 'Retest Event', eventDate: '2027-04-04' } });
  await signIn(page);
  await page.goto('/events/retest-event');

  const tablist = page.getByRole('tablist', { name: 'Event sections' });
  await expect(tablist).toBeVisible();
  await expect(tablist.getByRole('tab')).toHaveText(['Details', 'Contractors', 'Prep', 'Financials']);
  await expect(page.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');

  // The four that open overlays are not tabs: they announce a dialog and say so visually.
  for (const name of ['Stage Plot', 'Set Lists', 'Run of Show', 'History']) {
    const tool = page.getByRole('button', { name: new RegExp(`^${name}`) });
    await expect(tool).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(page.getByRole('tab', { name })).toHaveCount(0);
  }

  // Arrow keys move between tabs and switch the section, like any tab set.
  await page.getByRole('tab', { name: 'Details' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Contractors' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Financials' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');

  // History opens a dialog, leaves the current section alone, and hands focus back when it closes.
  await page.getByRole('tab', { name: 'Contractors' }).click();
  const history = page.getByRole('button', { name: /^History/ });
  await history.click();
  await expect(page.getByRole('dialog', { name: 'Event History' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(history).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Contractors' })).toHaveAttribute('aria-selected', 'true');
});

test('booking and settings pages use the same tab behaviour', async ({ page }) => {
  await signIn(page);
  await page.goto(`/bookings/${E2E.signedBookingId}`);
  await expect(page.getByRole('tablist', { name: 'Booking sections' }).getByRole('tab')).toHaveText(['Booking Info', 'Proposal', 'Contract', 'Invoices']);
  await page.getByRole('tab', { name: 'Contract' }).click();
  await expect(page.getByRole('tab', { name: 'Contract' })).toHaveAttribute('aria-selected', 'true');
  await page.goto('/settings');
  await expect(page.getByRole('tablist', { name: 'Settings sections' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Billing' })).toBeVisible();
});

async function createBookingWithInquiry(applied) {
  await prisma.booking.create({ data: { id: applied ? 'retest-applied-booking' : 'retest-plain-booking', accountId, clientId: 'e2e-client', eventName: applied ? 'From Inquiry' : 'By Phone', eventType: 'Wedding', eventDate: '2027-05-05' } });
  if (applied) {
    await prisma.inquiryLink.create({ data: {
      accountId, tokenHash: hash('retest-applied'), status: 'applied', isReusable: false, ownerEmail: E2E.email,
      response: { firstName: 'Jordan', lastName: 'Rivera', email: 'jordan@example.com' }, submittedAt: new Date('2026-10-15T15:00:00Z'),
      appliedAt: new Date(), appliedBookingId: 'retest-applied-booking', appliedClientId: 'e2e-client',
    } });
  }
}

test('a booking made from an inquiry says so instead of offering to send the client a link', async ({ page }) => {
  await createBookingWithInquiry(true);
  await signIn(page);
  await page.goto('/bookings/retest-applied-booking');
  const card = page.getByTestId('booking-form-created-from-inquiry');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Created from an inquiry');
  await expect(card).toContainText('Jordan Rivera sent these details through your booking link on October 15, 2026');
  await expect(page.getByText('Send the client a secure link to fill in the event details themselves.')).toHaveCount(0);
  // Asking for updated details is still possible.
  await page.getByTestId('booking-form-send-inquiry-link-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('a booking made another way still offers the inquiry link', async ({ page }) => {
  await createBookingWithInquiry(false);
  await signIn(page);
  await page.goto('/bookings/retest-plain-booking');
  await expect(page.getByText('Send the client a secure link to fill in the event details themselves.')).toBeVisible();
  await expect(page.getByTestId('booking-form-created-from-inquiry')).toHaveCount(0);
});

test('agency groups: an account without the Agency plan gets an explanation, not a form that cannot work', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => { if (request.url().includes('/api/agency-groups')) requests.push(request.url()); });
  await signIn(page);
  await page.goto('/agency/groups');
  await expect(page.getByTestId('agency-plan-required')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Managed Groups are part of the Agency plan' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'See plans' })).toHaveAttribute('href', '/settings?tab=plan');
  await expect(page.getByTestId('agency-groups-add-button')).toHaveCount(0);
  await expect(page.getByText('Agency workspace access is required.')).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('agency groups: an Agency account starts with its list, opens the form on demand, and can add, edit and cancel', async ({ page }) => {
  await prisma.account.update({ where: { id: accountId }, data: { planTier: 'agency', agencyGroupLimit: 3 } });
  const toasts = [];
  page.on('response', (response) => { if (response.status() >= 400 && response.url().includes('/api/')) toasts.push(`${response.status()} ${response.url()}`); });
  await signIn(page);
  await page.goto('/agency/groups');

  await expect(page.getByTestId('agency-groups-empty')).toContainText('No managed groups yet');
  await expect(page.getByRole('heading', { name: 'Add managed group' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add your first group' }).click();
  await expect(page.getByRole('heading', { name: 'Add managed group' })).toBeVisible();
  await page.getByTestId('agency-group-cancel-button').click();
  await expect(page.getByRole('heading', { name: 'Add managed group' })).toHaveCount(0);

  await page.getByTestId('agency-groups-add-button').click();
  await page.getByLabel('Group name *').fill('Night Owl Events');
  await page.locator('form').getByRole('button', { name: 'Add group', exact: true }).click();
  await expect(page.getByText('Night Owl Events').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add managed group' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit managed group' })).toBeVisible();
  await expect(page.getByLabel('Group name *')).toHaveValue('Night Owl Events');
  await page.getByTestId('agency-group-cancel-button').click();
  await expect(page.getByRole('heading', { name: 'Edit managed group' })).toHaveCount(0);
  expect(toasts).toEqual([]);

  // A search that matches nothing is not the same message as having no groups at all.
  await page.getByPlaceholder('Search name, email, phone, or notes…').fill('zzz-no-match');
  await expect(page.getByText('No groups match these filters.')).toBeVisible();
  await expect(page.getByTestId('agency-groups-empty')).toHaveCount(0);
});
