import { expect, test } from '@playwright/test';
import { E2E } from '../server/scripts/seedE2e.js';

test('owner can switch the client reminder rules and change their timing', async ({ page }) => {
  await page.goto('/auth');
  await page.getByTestId('auth-signin-email-input').fill(E2E.email);
  await page.getByTestId('auth-signin-password-input').fill(E2E.password);
  await page.getByTestId('auth-signin-submit-button').click();
  await expect(page).toHaveURL(/\/home$/);

  await page.goto('/settings?tab=reminderRules');
  const months = page.getByTestId('reminder-rules-clientRebookMonths-input');
  await expect(months).toHaveValue('11');
  await expect(page.getByTestId('reminder-rules-clientAnniversaryLeadDays-input')).toHaveValue('7');

  await months.fill('18');
  await page.getByTestId('reminder-rules-clientAnniversaryEnabled-toggle').uncheck();
  await expect(page.getByTestId('reminder-rules-clientAnniversaryLeadDays-input')).toBeDisabled();
  await page.getByTestId('reminder-rules-save-button').click();

  await page.reload();
  await expect(page.getByTestId('reminder-rules-clientRebookMonths-input')).toHaveValue('18');
  await expect(page.getByTestId('reminder-rules-clientAnniversaryEnabled-toggle')).not.toBeChecked();
  await expect(page.getByTestId('reminder-rules-clientRebookEnabled-toggle')).toBeChecked();
});
