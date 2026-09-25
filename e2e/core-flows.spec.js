import { expect, test } from '@playwright/test';
import { E2E } from '../server/scripts/seedE2e.js';

async function signIn(page) {
  await page.goto('/auth');
  await page.getByTestId('auth-signin-email-input').fill(E2E.email);
  await page.getByTestId('auth-signin-password-input').fill(E2E.password);
  await page.getByTestId('auth-signin-submit-button').click();
  await expect(page).toHaveURL(/\/home$/);
}

async function expectNoPageOverflow(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

test('owner signs in and reaches the authenticated application', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
});

test('owner creates and then edits a booking', async ({ page }) => {
  await signIn(page);
  await page.goto('/bookings/new');
  await page.getByTestId('booking-form-event-name-input').fill('Browser Booking');
  await page.getByTestId('booking-form-event-date-input').fill('2026-10-10');
  await page.getByTestId('booking-form-submit-button').click();
  await expect(page).toHaveURL(/\/bookings\/[^/]+$/);
  await expect(page.getByTestId('booking-form-event-name-input')).toHaveValue('Browser Booking');

  await page.getByTestId('booking-form-event-name-input').fill('Browser Booking Updated');
  await page.getByTestId('booking-form-submit-button').click();
  await expect(page.getByTestId('booking-form-event-name-input')).toHaveValue('Browser Booking Updated');
});

test('owner creates and then edits an event', async ({ page }) => {
  await signIn(page);
  await page.goto('/events/new');
  await page.getByTestId('event-form-name-input').fill('Browser Event');
  await page.getByTestId('event-form-event-date-input').fill('2026-11-11');
  await page.getByTestId('event-form-submit-button').click();
  await expect(page).toHaveURL(/\/events\/[^/]+$/);

  await page.getByTestId('event-form-name-input').fill('Browser Event Updated');
  await page.getByTestId('event-form-submit-button').click();
  await expect(page.getByTestId('event-form-name-input')).toHaveValue('Browser Event Updated');
});

test('stage plot library clearly separates reusable templates from gig copies', async ({ page }) => {
  await signIn(page);
  await page.goto('/stage-plot-library');
  await expect(page.getByRole('heading', { name: 'Stage Plot Library' })).toBeVisible();
  await page.getByTestId('stageplot-library-add-button').click();
  await page.getByTestId('stageplot-library-add-name-input').fill('Browser Stage Template');
  await page.getByTestId('stageplot-library-add-confirm-button').click();
  await expect(page.getByText('Reusable template', { exact: true })).toBeVisible();
  await expect(page.getByText(/Changes here affect future copies only/)).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByTestId('stageplot-setup-details').click();
  await page.getByTestId('stage-width-input').fill('36');
  await page.getByTestId('stage-depth-input').fill('24');
  await page.getByTestId('stageplot-fit-stage-button').click();
  await page.getByTestId('stageplot-icon-vocal-mic').click();
  const canvas = page.locator('canvas').last();
  await canvas.click({ position: { x: 300, y: 180 } });
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await canvas.click({ position: { x: 300, y: 180 } });
  await expect(page.getByTestId('stageplot-size-inspector')).toBeVisible();
  await page.getByTestId('stageplot-selected-size-input').fill('96');
  await expect(page.getByTestId('stageplot-selected-size-input')).toHaveValue('96');
  await page.getByTestId('stageplot-selected-rotation-input').fill('30');
  await expect(page.getByTestId('stageplot-selected-rotation-input')).toHaveValue('30');
  await page.waitForTimeout(2200);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
});

test('proposal recipient reviews and accepts a proposal', async ({ page }) => {
  await page.goto(`/proposal/${E2E.proposalToken}`);
  await expect(page.getByTestId('proposal-respond-accept-button')).toBeVisible();
  await page.getByTestId('proposal-respond-accept-button').click();
  await page.getByTestId('proposal-respond-note-textarea').fill('Looks good');
  await page.getByTestId('proposal-respond-confirm-button').click();
  await expect(page.getByTestId('proposal-respond-accepted-banner')).toBeVisible();
});

test('contract and invoice recipients can open protected documents', async ({ page }) => {
  await page.goto(`/sign/${E2E.contractToken}`);
  await expect(page.getByTestId('contract-sign-email-input')).toBeVisible();
  await page.getByTestId('contract-sign-email-input').fill('client@e2e.test');
  await page.getByTestId('contract-sign-verify-submit-button').click();
  await expect(page.getByText('These are the E2E contract terms.')).toBeVisible();
  await expect(page.getByTestId('contract-sign-submit-button')).toBeVisible();

  await page.goto(`/invoice/${E2E.invoiceToken}`);
  if (await page.getByTestId('invoice-pay-email-input').isVisible()) {
    await page.getByTestId('invoice-pay-email-input').fill('client@e2e.test');
    await page.getByTestId('invoice-pay-verify-submit-button').click();
  }
  await expect(page.getByText('Service').first()).toBeVisible();
  await expect(page.getByTestId('invoice-pay-download-pdf-button')).toBeVisible();
});

test('invoice starts with signed contract services and explains the deposit', async ({ page }) => {
  await signIn(page);
  await page.goto(`/bookings/${E2E.signedBookingId}?tab=invoices`);
  await expect(page.getByTestId('booking-form-offering-name-input').first()).toHaveValue('Legacy performance');
  await expect(page.getByTestId('booking-form-offering-name-input').nth(1)).toHaveValue('Lighting package');
  await expect(page.getByTestId('booking-form-offering-name-input')).toHaveCount(2);
  await expect(page.getByText('Contract total $700.00')).toBeVisible();
  await page.getByRole('button', { name: 'Deposit', exact: true }).click();
  await expect(page.getByTestId('booking-form-invoice-due-date-input')).toHaveValue('2026-11-01');
  await expect(page.getByTestId('booking-form-invoice-memo-textarea')).toHaveValue(/part of the \$700.00 contract total/);
  await page.getByTestId('booking-form-invoice-preview-button').click();
  await expect(page.getByText('Contract Hall')).toBeVisible();
  await expect(page.getByText('Deposit toward event services')).toBeVisible();
});

test('edited package add-ons remain in the contract without changing its total', async ({ page }) => {
  await signIn(page);
  await page.goto(`/bookings/${E2E.acceptedPackageBookingId}?tab=contract`);
  await expect(page.getByTestId('booking-form-offering-name-input')).toHaveValue('Stage flowers');
  await page.getByTestId('booking-form-offering-row').getByLabel('QTY').fill('3');
  await expect(page.getByTestId('booking-form-contract-pricing-toggle')).toContainText('$500.00');
  await page.getByTestId('booking-form-contract-send-button').click();
  await expect(page.getByTestId('booking-form-contract-what-was-sent-toggle')).toBeVisible();
  await page.getByTestId('booking-form-contract-what-was-sent-toggle').click();
  await expect(page.getByText('Optional add-ons for later selection (not billed in this contract):')).toBeVisible();
  await expect(page.getByText(/QTY 3.*Extra table flowers/)).toBeVisible();
  await expect(page.getByText('Grand Total').last()).toBeVisible();
  await expect(page.getByText('$500.00').last()).toBeVisible();
});

test('client enters the portal through a single-use magic link', async ({ page }) => {
  await page.goto(`/portal/verify?token=${E2E.portalToken}`);
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByText('Hi, Casey')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your Events' })).toBeVisible();
});

test('primary signed-in workflows remain usable at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  const menuButton = page.getByRole('button', { name: 'Toggle navigation' });
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('link', { name: 'Bookings' }).click();
  await expect(page).toHaveURL(/\/bookings$/);
  await expectNoPageOverflow(page);

  for (const path of ['/events', '/clients', '/contractors', '/reminders', '/help', '/settings']) {
    await page.goto(path);
    await expectNoPageOverflow(page);
  }
});

test('keyboard users can skip navigation and contain focus inside a modal', async ({ page }) => {
  await signIn(page);
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  // Browser runners disagree about the initial tab stop after an
  // authenticated navigation. Focus the control deterministically, then
  // verify the actual keyboard contract: it is focusable and Enter moves
  // focus to the main landmark.
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  await page.goto('/reminders');
  await page.getByTestId('reminders-add-button').click();
  const dialog = page.getByRole('dialog', { name: 'Add Reminder' });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('reminders-add-button')).toBeFocused();
});

test('shared inbox reads, links, replies with attachments, and archives a conversation', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: /Inbox/ }).click();
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  await expect(page.getByText('hello@mail.e2e.test')).toBeVisible();
  await page.getByRole('button', { name: /client@e2e.test.*Details for our wedding/ }).click();
  await expect(page.getByText('Can we confirm the arrival time?')).toBeVisible();
  await expect(page.getByRole('button', { name: /venue-notes.txt/ })).toBeVisible();
  await expect(page.getByLabel('Linked client')).toHaveValue('e2e-client');
  await expect(page.getByLabel('Linked booking').locator('option', { hasText: 'Casey Wedding' })).toBeAttached();
  await page.getByLabel('Linked booking').selectOption(E2E.signedBookingId);
  await expect(page.getByRole('link', { name: 'Open booking' })).toHaveAttribute('href', `/bookings/${E2E.signedBookingId}`);
  await page.route('**/api/inbox/e2e-inbox-thread/reply', async (route) => {
    expect(route.request().headers()['x-csrf-token']).toBeTruthy();
    expect(route.request().postData()).toContain('We will arrive at 5 PM.');
    expect(route.request().postData()).toContain('schedule.txt');
    await route.fulfill({ json: { ok: true, replyTrackingActive: true } });
  });
  await page.getByLabel('Reply message').fill('We will arrive at 5 PM.');
  await page.locator('input[type=file]').setInputFiles({ name: 'schedule.txt', mimeType: 'text/plain', buffer: Buffer.from('Schedule') });
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(page.getByLabel('Reply message')).toHaveValue('');
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Archived', exact: true }).click();
  await expect(page.getByRole('button', { name: /client@e2e.test.*Details for our wedding/ })).toBeVisible();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByRole('button', { name: /client@e2e.test.*Details for our wedding/ })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: '/tmp/evl-inbox-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoPageOverflow(page);
  await page.screenshot({ path: '/tmp/evl-inbox-mobile.png', fullPage: true });
});

test('security: hostile inbox HTML cannot execute scripts or load tracking images', async ({ page }) => {
  await signIn(page);
  const externalRequests = [];
  page.on('request', (request) => { if (request.url().includes('attacker.invalid')) externalRequests.push(request.url()); });
  await page.route('**/api/inbox/e2e-inbox-thread', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.thread.messages[0].body = '<p>Security test message</p><script>window.__inboxXss = true</script><img src="https://attacker.invalid/pixel" onerror="window.__inboxXss = true"><svg onload="window.__inboxXss = true"></svg><a href="javascript:window.__inboxXss=true">Unsafe link</a><iframe src="https://attacker.invalid/frame"></iframe>';
    await route.fulfill({ response, json: data });
  });
  await page.goto('/inbox');
  await page.getByRole('button', { name: /client@e2e.test.*Details for our wedding/ }).click();
  await expect(page.getByText('Security test message')).toBeVisible();
  await expect(page.getByText('Unsafe link')).not.toHaveAttribute('href');
  expect(await page.evaluate(() => window.__inboxXss)).toBeUndefined();
  expect(externalRequests).toEqual([]);
  await expect(page.locator('iframe, img[src*="attacker.invalid"], [onload], [onerror]')).toHaveCount(0);
});
