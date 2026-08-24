import { expect, test } from '@playwright/test';
import { E2E } from '../server/scripts/seedE2e.js';

async function signIn(page) {
  await page.goto('/auth');
  await page.getByTestId('auth-signin-email-input').fill(E2E.email);
  await page.getByTestId('auth-signin-password-input').fill(E2E.password);
  await page.getByTestId('auth-signin-submit-button').click();
  await expect(page).toHaveURL(/\/home$/);
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
  if (await page.getByTestId('contract-sign-email-input').isVisible()) {
    await page.getByTestId('contract-sign-email-input').fill('client@e2e.test');
    await page.getByTestId('contract-sign-verify-submit-button').click();
  }
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

test('client enters the portal through a single-use magic link', async ({ page }) => {
  await page.goto(`/portal/verify?token=${E2E.portalToken}`);
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByText('Hi, Casey')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your Events' })).toBeVisible();
});
