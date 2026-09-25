import { test, expect } from '@playwright/test';
import { E2E } from '../server/scripts/seedE2e.js';

test('multiple custom proposal items and sections survive saving and PDF preview', async ({ page }) => {
  await page.goto('/auth');
  await page.getByTestId('auth-signin-email-input').fill(E2E.email);
  await page.getByTestId('auth-signin-password-input').fill(E2E.password);
  await page.getByTestId('auth-signin-submit-button').click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/bookings/new');
  await page.getByTestId('booking-form-event-name-input').fill('Custom proposal regression');
  await page.getByTestId('booking-form-event-date-input').fill('2027-01-01');
  await page.getByTestId('booking-form-client-combobox-input').fill('Casey');
  await page.getByTestId('booking-form-client-combobox-option').filter({ hasText: 'Casey' }).click();
  await page.getByTestId('booking-form-submit-button').click();
  await expect(page).toHaveURL(/\/bookings\/(?!new$)[^/]+$/);
  const bookingUrl = page.url();
  await page.goto(`${bookingUrl}?tab=proposal`);
  await page.getByTestId('booking-form-push-to-proposal-button').click();
  for (let i = 1; i <= 3; i++) {
    await page.getByTestId('booking-form-offering-add-button').filter({ visible: true }).click();
    await page.getByTestId('offering-picker-modal-quick-item-button').click();
    await page.getByTestId('offering-picker-quick-item-name-input').fill(`Custom service ${i}`);
    await page.getByTestId('offering-picker-quick-item-amount-input').fill('100');
    await page.getByTestId('offering-picker-quick-item-add-button').click();
    await expect(page.getByTestId('booking-form-offering-row').filter({ visible: true })).toHaveCount(i);
  }
  for (let i = 1; i <= 3; i++) {
    await page.getByTestId('booking-form-section-new-title-input').filter({ visible: true }).fill(`Custom section ${i}`);
    await page.getByTestId('booking-form-section-new-text-textarea').filter({ visible: true }).fill(`Terms for section ${i}`);
    await page.getByTestId('booking-form-section-add-button').filter({ visible: true }).click();
  }
  await page.getByTestId('booking-form-proposal-preview-button').click();
  const frame = page.getByTestId('booking-form-proposal-preview-frame');
  await expect(frame).toBeVisible();
  const source = await frame.getAttribute('src');
  const pdf = Buffer.from(source.split(',')[1], 'base64').toString('latin1');
  for (let i = 1; i <= 3; i++) {
    expect(pdf).toContain(`Custom service ${i}`);
    expect(pdf).toContain(`Custom section ${i}`);
    expect(pdf).toContain(`Terms for section ${i}`);
  }
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('booking-form-offering-row').filter({ visible: true })).toHaveCount(3);
  for (let i = 1; i <= 3; i++) await expect(page.getByTestId('booking-form-section-title-input').filter({ visible: true }).nth(i - 1)).toHaveValue(`Custom section ${i}`);
});

test('client proposal displays all custom section values and text', async ({ page }) => {
  await page.route('**/api/proposal-respond/custom-sections-test', async (route) => {
    await route.fulfill({ json: { proposalResponse: { status: 'sent', snapshot: {
      businessInfo: { name: 'Test business' }, booking: {},
      proposal: { sections: [
        { id: 'first', title: 'First section', text: 'First custom text' },
        { id: 'second', title: 'Second section', value: 'Second custom value' },
        { id: 'third', title: 'Third section', value: 'Third custom value', text: 'Third custom text' },
      ] },
    } } } });
  });
  await page.goto('/proposal/custom-sections-test');
  for (const text of ['First custom text', 'Second custom value', 'Third custom value', 'Third custom text']) {
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  }
});
