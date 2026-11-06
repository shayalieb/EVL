import { expect, test } from '@playwright/test';
import { E2E } from '../server/scripts/seedE2e.js';

async function signIn(page) {
  await page.goto('/auth');
  await page.getByTestId('auth-signin-email-input').fill(E2E.email);
  await page.getByTestId('auth-signin-password-input').fill(E2E.password);
  await page.getByTestId('auth-signin-submit-button').click();
  await expect(page).toHaveURL(/\/home$/);
}

test('client detail page: notes, pinned banner, follow-up, timeline and tabs', async ({ page }) => {
  await signIn(page);
  await page.goto('/clients');
  await page.getByTestId('clients-add-button').click();
  await page.getByTestId('client-modal-firstname-input').fill('Detail');
  await page.getByTestId('client-modal-lastname-input').fill('Tester');
  await page.getByTestId('client-modal-email-input').fill('detail.tester@example.test');
  await page.getByTestId('client-modal-save-button').click();

  await page.getByTestId('clients-search-input').fill('Detail Tester');
  await page.getByRole('link', { name: 'Detail Tester' }).click();
  await expect(page).toHaveURL(/\/clients\/[^/]+$/);
  await expect(page.getByTestId('client-detail-name')).toHaveText('Detail Tester');

  // Pinned note shows as a banner.
  await page.getByTestId('client-note-input').fill('Prefers evening calls');
  await page.getByTestId('client-note-type').selectOption('preference');
  await page.getByLabel('Pin to top').check();
  await page.getByTestId('client-note-add').click();
  await expect(page.getByTestId('client-pinned-note')).toContainText('Prefers evening calls');
  await expect(page.getByTestId('client-note-item')).toHaveCount(1);

  // Follow-up appears in the list.
  await page.getByTestId('client-add-followup-button').click();
  await page.getByTestId('client-followup-note').fill('Send proposal');
  await page.getByTestId('client-followup-save').click();
  await expect(page.getByTestId('client-followup-item')).toContainText('Send proposal');

  // Timeline carries the note; other tabs render.
  await page.getByTestId('client-tab-timeline').click();
  await expect(page.getByTestId('client-timeline-item').first()).toContainText('Prefers evening calls');
  await page.getByTestId('client-tab-work').click();
  await expect(page.getByText('No bookings for this client.')).toBeVisible();
  await page.getByTestId('client-tab-money').click();
  await expect(page.getByText('No invoices yet.')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  // List shows the follow-up and note count.
  await page.goto('/clients');
  await page.getByTestId('clients-search-input').fill('Detail Tester');
  await expect(page.getByTestId('client-row-followup')).toBeVisible();
});
