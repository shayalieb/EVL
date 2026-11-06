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

  // Tags and stage
  await page.getByTestId('client-tag-input').fill('Wedding');
  await page.getByTestId('client-tag-input').press('Enter');
  await expect(page.getByTestId('client-tag')).toContainText('wedding');
  await page.getByTestId('client-stage-select').selectOption('vip');
  await expect(page.getByTestId('client-stage-select')).toHaveValue('vip');

  // Contacts around the client
  await page.getByTestId('client-add-contact-button').click();
  await page.getByTestId('client-contact-name').fill('Pat Planner');
  await page.getByTestId('client-contact-role').selectOption('planner');
  await page.getByTestId('client-contact-email').fill('pat@example.test');
  await page.getByTestId('client-contact-save').click();
  await expect(page.getByTestId('client-contact-item')).toContainText('Pat Planner');
  await expect(page.getByTestId('client-contact-item')).toContainText('Planner');

  // Company: created by typing a name, then listed on its own page
  await page.getByTestId('client-company-input').fill('Acme Events');
  await page.getByTestId('client-company-input').press('Enter');
  await expect(page.getByTestId('client-company-link')).toHaveText('Acme Events');

  // Insights tiles render (no invoices yet, so no averages)
  await expect(page.getByTestId('client-insights')).toBeVisible();
  await expect(page.getByTestId('client-insight-days-to-pay')).toHaveText('—');

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
  // Stage badge shows, and the tag + stage filters and saved views work.
  await expect(page.getByTestId('client-row-stage')).toHaveText('VIP');
  await page.getByTestId('clients-search-input').fill('');
  await page.getByTestId('clients-tag-filter').selectOption('wedding');
  await expect(page.getByTestId('client-row')).toHaveCount(1);
  await page.getByTestId('clients-stage-filter').selectOption('lead');
  await expect(page.getByText('No clients match your search.')).toBeVisible();
  await page.getByTestId('clients-stage-filter').selectOption('vip');
  await expect(page.getByTestId('client-row')).toHaveCount(1);

  await page.getByTestId('clients-save-view-button').click();
  await page.getByTestId('clients-view-name-input').fill('Wedding VIPs');
  await page.getByTestId('clients-view-save-confirm').click();
  await page.getByTestId('clients-clear-filters-button').click();
  await expect(page.getByTestId('client-row').nth(1)).toBeVisible();
  await page.getByTestId('clients-views-select').selectOption({ label: 'Wedding VIPs' });
  await expect(page.getByTestId('client-row')).toHaveCount(1);
  await expect(page.getByTestId('clients-tag-filter')).toHaveValue('wedding');

  // Company shows on the row and finds the client by search; searching a contact's name does too.
  await page.getByTestId('clients-clear-filters-button').click();
  await expect(page.getByTestId('client-row-company')).toHaveText('Acme Events');
  await page.getByTestId('clients-search-input').fill('Pat Planner');
  await expect(page.getByTestId('client-row')).toHaveCount(1);
  await page.getByTestId('client-row-company').click();
  await expect(page.getByTestId('client-company-name')).toHaveText('Acme Events');
  await expect(page.getByTestId('client-company-member')).toHaveCount(1);
  await expect(page.getByTestId('client-company-stat-people')).toHaveText('1');
  await page.getByTestId('client-company-edit').click();
  await page.getByTestId('client-company-name-input').fill('Acme Events Group');
  await page.getByTestId('client-company-save').click();
  await expect(page.getByTestId('client-company-name')).toHaveText('Acme Events Group');
  await page.goto('/clients');
  await page.getByTestId('clients-search-input').fill('Detail Tester');
  await page.getByRole('link', { name: 'Detail Tester' }).click();
  await page.getByRole('button', { name: 'Remove company' }).click();
  await expect(page.getByTestId('client-company-input')).toBeVisible();
  await page.goto('/clients');
  await page.getByTestId('clients-search-input').fill('Detail Tester');
  await expect(page.getByTestId('client-row-company')).toHaveCount(0);
  await page.getByTestId('clients-search-input').fill('');
  await page.getByTestId('clients-tag-filter').selectOption('wedding');
  await page.getByTestId('clients-stage-filter').selectOption('vip');

  // A ready-made view applies its filters.
  await page.getByTestId('clients-views-select').selectOption({ label: 'Leads' });
  await expect(page.getByTestId('clients-stage-filter')).toHaveValue('lead');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
