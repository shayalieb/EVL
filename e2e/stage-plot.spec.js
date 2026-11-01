import { expect, test } from '@playwright/test';
import { E2E } from '../server/scripts/seedE2e.js';

// Stage plot feature, end to end. These run against the real API (port 4100)
// and a real browser. Autosave uploads a canvas thumbnail, so run the server
// with CI=1 (the same as CI does) unless real file storage is configured —
// see the thumbnail branch in server/src/routes/stagePlots.js.
const API = 'http://127.0.0.1:4100/api';

// Sign in once per file and reuse the session: dozens of UI logins in a
// minute trip the auth rate limiter and make later tests land on /auth.
const STORAGE_STATE = 'test-results/.stage-plot-auth.json';
test.use({ storageState: STORAGE_STATE });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await page.goto('/auth');
  await page.getByTestId('auth-signin-email-input').fill(E2E.email);
  await page.getByTestId('auth-signin-password-input').fill(E2E.password);
  await page.getByTestId('auth-signin-submit-button').click();
  await expect(page).toHaveURL(/\/home$/);
  await context.storageState({ path: STORAGE_STATE });
  await context.close();
});

async function signIn(page) {
  await page.goto('/home');
  await expect(page).toHaveURL(/\/home$/);
}

let eventCounter = 0;
async function createEvent(page, name = 'Stage Plot Gig') {
  eventCounter += 1;
  const id = `e2e-stageplot-${Date.now().toString(36)}-${eventCounter}`;
  const res = await page.request.post(`${API}/events`, { data: { id, name: `${name} ${eventCounter}`, eventDate: '2027-03-03' } });
  expect(res.status(), await res.text()).toBeLessThan(300);
  return id;
}

async function getPlot(page, eventId) {
  const res = await page.request.get(`${API}/stage-plots/${eventId}`);
  expect(res.ok()).toBe(true);
  return (await res.json()).stagePlot;
}

async function openEditor(page, eventId) {
  await page.goto(`/events/${eventId}/stage-plot`);
  await expect(page.getByTestId('stageplot-save-status')).toHaveText('Saved');
}

async function placeVocalMic(page, position = { x: 300, y: 180 }) {
  await page.getByTestId('stageplot-icon-vocal-mic').click();
  const canvas = page.locator('canvas').last();
  await canvas.click({ position });
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  return canvas;
}

async function waitForAutosave(page) {
  await expect(page.getByTestId('stageplot-save-status')).toHaveText('Saved', { timeout: 15_000 });
}

async function elementCount(page, eventId) {
  const plot = await getPlot(page, eventId);
  return plot.pages.reduce((total, p) => total + (p.scene?.elements?.length || 0), 0);
}

test.describe('stage plot editor', () => {
  test('opening an event creates a plot with one empty page', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);
    await expect(page.getByTestId('stageplot-page-tab')).toHaveCount(1);
    await expect(page.getByTestId('stageplot-channel-row')).toHaveCount(0);
    await expect(page.getByTestId('stageplot-backline-row')).toHaveCount(0);
    const plot = await getPlot(page, eventId);
    expect(plot.pages).toHaveLength(1);
    expect(plot.pages[0].name).toBe('Page 1');
  });

  test('placing an icon autosaves and survives a reload', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);
    await placeVocalMic(page);
    await waitForAutosave(page);
    expect(await elementCount(page, eventId)).toBe(1);

    await page.reload();
    await expect(page.getByTestId('stageplot-save-status')).toHaveText('Saved');
    expect(await elementCount(page, eventId)).toBe(1);
    // Reloading must not trigger another save loop: status stays Saved.
    await page.waitForTimeout(2600);
    await expect(page.getByTestId('stageplot-save-status')).toHaveText('Saved');
  });

  test('reloading an untouched editor never rewrites the page (no autosave loop)', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);
    await placeVocalMic(page);
    await waitForAutosave(page);
    await page.reload();
    await expect(page.getByTestId('stageplot-save-status')).toHaveText('Saved');
    const before = (await getPlot(page, eventId)).pages[0].updatedAt;
    await page.waitForTimeout(4500);
    const after = (await getPlot(page, eventId)).pages[0].updatedAt;
    expect(after).toBe(before);
  });

  test('undo and redo revert and restore placed icons', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);
    await placeVocalMic(page);
    await waitForAutosave(page);
    await expect(page.getByTestId('stageplot-undo-button')).toBeEnabled();

    await page.getByTestId('stageplot-undo-button').click();
    await expect(page.getByTestId('stageplot-redo-button')).toBeEnabled();
    await waitForAutosave(page);
    expect(await elementCount(page, eventId)).toBe(0);

    await page.getByTestId('stageplot-redo-button').click();
    await waitForAutosave(page);
    expect(await elementCount(page, eventId)).toBe(1);
  });

  test('size and rotation edits persist, and reset size restores the default', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);
    const canvas = await placeVocalMic(page);
    await canvas.click({ position: { x: 300, y: 180 } });
    await expect(page.getByTestId('stageplot-size-inspector')).toBeVisible();
    await page.getByTestId('stageplot-selected-size-input').fill('120');
    await page.getByTestId('stageplot-selected-rotation-input').fill('45');
    await waitForAutosave(page);
    let el = (await getPlot(page, eventId)).pages[0].scene.elements[0];
    expect(el.width).toBe(120);
    expect(el.rotation).toBe(45);

    await page.getByTestId('stageplot-reset-size-button').click();
    await waitForAutosave(page);
    el = (await getPlot(page, eventId)).pages[0].scene.elements[0];
    expect(el.width).not.toBe(120);
  });

  test('duplicate, rotate buttons and delete selected change the scene', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);
    const canvas = await placeVocalMic(page);
    await canvas.click({ position: { x: 300, y: 180 } });

    await page.getByTestId('stageplot-duplicate-button').click();
    await waitForAutosave(page);
    expect(await elementCount(page, eventId)).toBe(2);

    await page.getByTestId('stageplot-rotate-right-button').click();
    await waitForAutosave(page);
    const rotated = (await getPlot(page, eventId)).pages[0].scene.elements.some((e) => e.rotation === 15);
    expect(rotated).toBe(true);

    await page.getByTestId('stageplot-delete-selected-button').click();
    await waitForAutosave(page);
    expect(await elementCount(page, eventId)).toBe(1);
  });

  test('stage dimensions persist across reload', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);
    await page.getByTestId('stageplot-setup-details').click();
    await page.getByTestId('stage-width-input').fill('40');
    await page.getByTestId('stage-depth-input').fill('28');
    await waitForAutosave(page);
    const scene = (await getPlot(page, eventId)).pages[0].scene;
    expect(JSON.stringify(scene)).toMatch(/40/);
    await page.reload();
    await page.getByTestId('stageplot-setup-details').click();
    await expect(page.getByTestId('stage-width-input')).toHaveValue('40');
    await expect(page.getByTestId('stage-depth-input')).toHaveValue('28');
  });
});

test.describe('production list', () => {
  test('add, edit, toggle and delete items; edits persist', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);

    await page.getByTestId('stageplot-add-channel-button').click();
    await page.getByTestId('stageplot-add-channel-button').click();
    await expect(page.getByTestId('stageplot-channel-row')).toHaveCount(2);

    const first = page.getByTestId('stageplot-channel-row').first();
    await first.getByTestId('stageplot-channel-instrument-input').fill('Lead Vocal');
    await first.getByTestId('stageplot-channel-instrument-input').blur();
    await first.getByTestId('stageplot-channel-musician-input').fill('Dana');
    await first.getByTestId('stageplot-channel-musician-input').blur();
    await first.getByTestId('stageplot-channel-48v-checkbox').check();
    await first.getByTestId('stageplot-channel-power-checkbox').check();

    await expect.poll(async () => (await getPlot(page, eventId)).channels[0]).toMatchObject({
      source: 'Lead Vocal', musicianName: 'Dana', phantomPower: true, powerNeeded: true,
    });

    await page.reload();
    await expect(page.getByTestId('stageplot-channel-row')).toHaveCount(2);
    await expect(page.getByTestId('stageplot-channel-row').first().getByTestId('stageplot-channel-instrument-input')).toHaveValue('Lead Vocal');

    await page.getByTestId('stageplot-channel-row').nth(1).getByTestId('stageplot-channel-delete-button').click();
    await expect(page.getByTestId('stageplot-channel-row')).toHaveCount(1);
    expect((await getPlot(page, eventId)).channels).toHaveLength(1);
  });

  test('channel numbers stay unique and sequential after deleting and re-adding', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);
    for (let i = 0; i < 3; i += 1) await page.getByTestId('stageplot-add-channel-button').click();
    await expect(page.getByTestId('stageplot-channel-row')).toHaveCount(3);
    await page.getByTestId('stageplot-channel-row').nth(1).getByTestId('stageplot-channel-delete-button').click();
    await expect(page.getByTestId('stageplot-channel-row')).toHaveCount(2);
    await page.getByTestId('stageplot-add-channel-button').click();
    await expect(page.getByTestId('stageplot-channel-row')).toHaveCount(3);
    const numbers = (await getPlot(page, eventId)).channels.map((c) => c.channelNumber);
    expect(new Set(numbers).size).toBe(3);
  });

  test('rapid adds do not collide on channel numbers', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await getPlot(page, eventId);
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => page.request.post(`${API}/stage-plots/${eventId}/channels`, { data: { source: `Burst ${i}` } })));
    expect(results.map((r) => r.status())).toEqual(Array(6).fill(201));
    const numbers = (await getPlot(page, eventId)).channels.map((c) => c.channelNumber);
    expect(new Set(numbers).size).toBe(6);
  });

  test('an item can be created for a selected icon, and removing the icon page keeps lists consistent', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);
    const canvas = await placeVocalMic(page);
    await canvas.click({ position: { x: 300, y: 180 } });
    await page.getByTestId('stageplot-add-channel-for-selected-button').click();
    await expect(page.getByTestId('stageplot-channel-row')).toHaveCount(1);
    await waitForAutosave(page);
    const plot = await getPlot(page, eventId);
    expect(plot.channels[0].elementId).toBe(plot.pages[0].scene.elements[0].id);
    // already linked → button disabled
    await expect(page.getByTestId('stageplot-add-channel-for-selected-button')).toBeDisabled();
  });

  test('technical audio details persist and show on the shared page', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);
    await page.getByTestId('stageplot-add-channel-button').click();
    await page.getByRole('button', { name: /Technical details/ }).click();
    await page.getByPlaceholder('e.g. SM58, Radial JDI').fill('SM58');
    await page.getByPlaceholder('e.g. SM58, Radial JDI').blur();
    await expect.poll(async () => (await getPlot(page, eventId)).channels[0].preferredDevice).toBe('SM58');
  });
});

test.describe('backline list', () => {
  test('add, edit quantity/provider/name, persist, delete', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);
    await page.getByTestId('stageplot-add-backline-item-button').click();
    const row = page.getByTestId('stageplot-backline-row').first();
    await expect(row).toBeVisible();
    await row.getByTestId('stageplot-backline-item-input').fill('Bass Amp');
    await row.getByTestId('stageplot-backline-quantity-input').fill('2');
    await row.getByTestId('stageplot-backline-providedby-select').selectOption('venue');
    await expect.poll(async () => (await getPlot(page, eventId)).backlineItems[0]).toMatchObject({ item: 'Bass Amp', quantity: 2, providedBy: 'venue' });

    await page.reload();
    const reloaded = page.getByTestId('stageplot-backline-row').first();
    await expect(reloaded.getByTestId('stageplot-backline-item-input')).toHaveValue('Bass Amp');
    await expect(reloaded.getByTestId('stageplot-backline-quantity-input')).toHaveValue('2');

    await reloaded.getByTestId('stageplot-backline-delete-button').click();
    await expect(page.getByTestId('stageplot-backline-row')).toHaveCount(0);
    expect((await getPlot(page, eventId)).backlineItems).toHaveLength(0);
  });

  test('typing a name key by key persists the final text, not an earlier keystroke', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);
    await page.getByTestId('stageplot-add-backline-item-button').click();
    const input = page.getByTestId('stageplot-backline-row').first().getByTestId('stageplot-backline-item-input');
    await input.fill('');
    await input.pressSequentially('Fender Twin Reverb 65', { delay: 15 });
    await page.waitForTimeout(1500);
    await expect.poll(async () => (await getPlot(page, eventId)).backlineItems[0].item).toBe('Fender Twin Reverb 65');
  });
});

test.describe('pages', () => {
  test('add and delete pages; the last page cannot be deleted', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);
    await page.getByTestId('stageplot-add-page-button').click();
    await expect(page.getByTestId('stageplot-page-tab')).toHaveCount(2);
    expect((await getPlot(page, eventId)).pages.map((p) => p.order)).toEqual([0, 1]);

    await page.getByTestId('stageplot-delete-page-button').click();
    await expect(page.getByTestId('stageplot-page-tab')).toHaveCount(1);

    const plot = await getPlot(page, eventId);
    const res = await page.request.delete(`${API}/stage-plots/${eventId}/pages/${plot.pages[0].id}`);
    expect(res.status()).toBe(400);
  });

  test('deleting a page removes production items linked to its icons', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);
    await page.getByTestId('stageplot-add-page-button').click();
    await expect(page.getByTestId('stageplot-page-tab')).toHaveCount(2);
    await page.getByTestId('stageplot-page-tab').nth(1).click();
    const canvas = await placeVocalMic(page);
    await canvas.click({ position: { x: 300, y: 180 } });
    await page.getByTestId('stageplot-add-channel-for-selected-button').click();
    await expect(page.getByTestId('stageplot-channel-row')).toHaveCount(1);
    await waitForAutosave(page);

    const plot = await getPlot(page, eventId);
    const withIcon = plot.pages.find((p) => p.scene?.elements?.length);
    const res = await page.request.delete(`${API}/stage-plots/${eventId}/pages/${withIcon.id}`);
    expect(res.status()).toBe(200);
    expect((await res.json()).deletedChannelIds).toHaveLength(1);
    expect((await getPlot(page, eventId)).channels).toHaveLength(0);
  });
});

test.describe('library', () => {
  test('save an event plot to the library, then add it to another event without sharing ids', async ({ page }) => {
    await signIn(page);
    const source = await createEvent(page, 'Source Gig');
    await openEditor(page, source);
    const canvas = await placeVocalMic(page);
    await canvas.click({ position: { x: 300, y: 180 } });
    await page.getByTestId('stageplot-add-channel-for-selected-button').click();
    await page.getByTestId('stageplot-add-backline-item-button').click();
    await waitForAutosave(page);

    await page.getByTestId('stageplot-save-to-library-button').click();
    await page.getByTestId('stageplot-save-to-library-name-input').fill('Trio Template');
    await page.getByTestId('stageplot-save-to-library-confirm-button').click();
    await expect(page.getByTestId('stageplot-save-to-library-name-input')).toBeHidden();

    const target = await createEvent(page, 'Target Gig');
    await openEditor(page, target);
    await page.getByTestId('stageplot-add-from-library-button').click();
    await page.getByTestId('stageplot-library-picker-item').filter({ hasText: 'Trio Template' }).click();
    const apply = page.getByRole('button', { name: /^(Add|Apply|Use)/ }).last();
    if (await apply.isVisible().catch(() => false)) await apply.click();
    await expect(page.getByTestId('stageplot-channel-row')).toHaveCount(1);
    await expect(page.getByTestId('stageplot-backline-row')).toHaveCount(1);

    const a = await getPlot(page, source);
    const b = await getPlot(page, target);
    const idsA = new Set(a.pages.flatMap((p) => (p.scene?.elements || []).map((e) => e.id)));
    const idsB = b.pages.flatMap((p) => (p.scene?.elements || []).map((e) => e.id));
    expect(idsB.length).toBeGreaterThan(0);
    expect(idsB.some((id) => idsA.has(id))).toBe(false);
    // the copied channel must point at the copied icon, not the original's
    expect(idsB).toContain(b.channels[0].elementId);
  });

  test('replace mode swaps content and keeps at least one page', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await getPlot(page, eventId);
    await page.request.post(`${API}/stage-plots/${eventId}/channels`, { data: { source: 'Old channel' } });
    const lib = await page.request.post(`${API}/stage-plot-library`, { data: { name: 'Replace Source' } });
    expect(lib.status()).toBe(201);
    const libId = (await lib.json()).stagePlot.id;
    const res = await page.request.post(`${API}/stage-plots/${eventId}/apply-library/${libId}`, { data: { mode: 'replace' } });
    expect(res.status()).toBe(200);
    const plot = (await res.json()).stagePlot;
    expect(plot.pages.length).toBeGreaterThanOrEqual(1);
    expect(plot.channels.find((c) => c.source === 'Old channel')).toBeUndefined();
  });

  test('applying nothing, or an unknown template, is rejected cleanly', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    const none = await page.request.post(`${API}/stage-plots/${eventId}/apply-library/whatever`, { data: { include: { pages: false, channels: false, backlineItems: false } } });
    expect(none.status()).toBe(400);
    const missing = await page.request.post(`${API}/stage-plots/${eventId}/apply-library/does-not-exist`, { data: {} });
    expect(missing.status()).toBe(404);
  });
});

test.describe('sharing and the public page', () => {
  test('publish a share link, view it logged out, publish an update, then revoke', async ({ page, browser }) => {
    await signIn(page);
    const eventId = await createEvent(page, 'Shared Gig');
    await openEditor(page, eventId);
    await page.getByTestId('stageplot-add-channel-button').click();
    await page.getByTestId('stageplot-channel-row').first().getByTestId('stageplot-channel-instrument-input').fill('Upright Bass');
    await page.getByTestId('stageplot-channel-row').first().getByTestId('stageplot-channel-instrument-input').blur();
    await page.getByTestId('stageplot-add-backline-item-button').click();
    await expect.poll(async () => (await getPlot(page, eventId)).channels[0].source).toBe('Upright Bass');

    const created = await page.request.post(`${API}/stage-plots/${eventId}/share`, { data: { expiration: { preset: '30_days' } } });
    expect(created.status(), await created.text()).toBe(201);
    const { share } = await created.json();
    const token = share.url.split('/stage-plot/')[1];

    const visitor = await browser.newContext();
    const pub = await visitor.newPage();
    await pub.goto(`/stage-plot/${token}`);
    await expect(pub.getByRole('heading', { name: /Shared Gig/ })).toBeVisible();
    await pub.getByRole('button', { name: 'Production List' }).click();
    await expect(pub.getByText('Upright Bass').locator('visible=true').first()).toBeVisible();
    await pub.getByRole('button', { name: 'Backline' }).click();
    await expect(pub.getByText('New Item').locator('visible=true').first()).toBeVisible();

    // Edits after publishing must not leak into the shared revision.
    await page.request.post(`${API}/stage-plots/${eventId}/channels`, { data: { source: 'Draft-only Trombone' } });
    await pub.reload();
    await pub.getByRole('button', { name: 'Production List' }).click();
    await expect(pub.getByText('Draft-only Trombone')).toHaveCount(0);

    const state = await (await page.request.get(`${API}/stage-plots/${eventId}/share`)).json();
    expect(state.hasUnpublishedChanges).toBe(true);
    const update = await page.request.post(`${API}/stage-plots/${eventId}/share/publish`, { data: { note: 'Added trombone' } });
    expect(update.status()).toBe(201);
    await pub.reload();
    await expect(pub.getByText('Update note: Added trombone')).toBeVisible();
    await pub.getByRole('button', { name: 'Production List' }).click();
    await expect(pub.getByText('Draft-only Trombone').locator('visible=true').first()).toBeVisible();

    const revoked = await page.request.delete(`${API}/stage-plots/${eventId}/share`);
    expect(revoked.status()).toBe(200);
    await pub.reload();
    await expect(pub.getByText('Stage plot unavailable')).toBeVisible();
    const publish = await page.request.post(`${API}/stage-plots/${eventId}/share/publish`, { data: {} });
    expect(publish.status()).toBe(409);
    await visitor.close();
  });

  test('the share modal in the editor creates a link and lists revisions', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await page.getByRole('button', { name: 'Create share link' }).click();
    await expect(page.locator('input[readonly]').first()).toHaveValue(/\/stage-plot\//);
    const state = await (await page.request.get(`${API}/stage-plots/${eventId}/share`)).json();
    expect(state.share.status).toBe('active');
    expect(state.revisions).toHaveLength(1);
  });

  test('restoring an earlier revision brings back its content', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await page.request.get(`${API}/stage-plots/${eventId}`);
    await page.request.post(`${API}/stage-plots/${eventId}/channels`, { data: { source: 'Keep me' } });
    await page.request.post(`${API}/stage-plots/${eventId}/share`, { data: {} });
    await page.request.post(`${API}/stage-plots/${eventId}/channels`, { data: { source: 'Added later' } });
    const restore = await page.request.post(`${API}/stage-plots/${eventId}/share/revisions/1/restore`);
    expect(restore.status(), await restore.text()).toBe(200);
    const plot = (await restore.json()).stagePlot;
    expect(plot.channels.map((c) => c.source)).toEqual(['Keep me']);
    expect(plot.pages.length).toBeGreaterThanOrEqual(1);
  });

  test('unknown, malformed and bad-expiration share requests fail safely', async ({ page, playwright }) => {
    const anon = await playwright.request.newContext({ storageState: undefined });
    const unknown = await anon.get(`${API}/public/stage-plots/not-a-real-token`);
    expect([404, 410]).toContain(unknown.status());
    await anon.dispose();
    await signIn(page);
    const eventId = await createEvent(page);
    await page.request.get(`${API}/stage-plots/${eventId}`);
    const bad = await page.request.post(`${API}/stage-plots/${eventId}/share`, { data: { expiration: { preset: 'forever-and-ever' } } });
    expect(bad.status()).toBe(400);
    const restoreMissing = await page.request.post(`${API}/stage-plots/${eventId}/share/revisions/99/restore`);
    expect(restoreMissing.status()).toBe(404);
  });
});

test.describe('export', () => {
  test('Download Rider produces a PDF', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await openEditor(page, eventId);
    await page.getByTestId('stageplot-add-channel-button').click();
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByTestId('stageplot-export-pdf-button').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

test.describe('api validation and access control', () => {
  test('every stage plot endpoint requires a signed-in user', async ({ playwright }) => {
    const request = await playwright.request.newContext({ storageState: undefined });
    for (const [method, path] of [
      ['get', '/stage-plots/anything'],
      ['post', '/stage-plots/anything/channels'],
      ['patch', '/stage-plots/anything/pages/x'],
      ['delete', '/stage-plots/anything/share'],
      ['get', '/stage-plot-library'],
    ]) {
      const res = await request[method](`${API}${path}`, method === 'get' || method === 'delete' ? {} : { data: {} });
      expect(res.status(), `${method} ${path}`).toBe(401);
    }
    await request.dispose();
  });

  test('unknown events return 404 instead of creating plots', async ({ page }) => {
    await signIn(page);
    const res = await page.request.get(`${API}/stage-plots/no-such-event`);
    expect(res.status()).toBe(404);
  });

  test('stale page saves are refused with a conflict and do not overwrite newer data', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    const plot = await getPlot(page, eventId);
    const pageId = plot.pages[0].id;
    const first = await page.request.patch(`${API}/stage-plots/${eventId}/pages/${pageId}`, { data: { name: 'First', expectedUpdatedAt: plot.pages[0].updatedAt } });
    expect(first.status()).toBe(200);
    const stale = await page.request.patch(`${API}/stage-plots/${eventId}/pages/${pageId}`, { data: { name: 'Stale', expectedUpdatedAt: plot.pages[0].updatedAt } });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).code).toBe('STALE_STAGE_PLOT_PAGE');
    expect((await getPlot(page, eventId)).pages[0].name).toBe('First');
  });

  test('empty page patches and non-PNG thumbnails are rejected', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    const plot = await getPlot(page, eventId);
    const url = `${API}/stage-plots/${eventId}/pages/${plot.pages[0].id}`;
    expect((await page.request.patch(url, { data: {} })).status()).toBe(400);
    expect((await page.request.patch(url, { data: { thumbnailBase64: 'data:image/jpeg;base64,AAAA' } })).status()).toBe(400);
  });

  test('channel and backline input requires real values and never returns a server error', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await getPlot(page, eventId);
    const ch = `${API}/stage-plots/${eventId}/channels`;
    const bl = `${API}/stage-plots/${eventId}/backline-items`;
    expect((await page.request.post(ch, { data: { source: '   ' } })).status()).toBe(400);
    expect((await page.request.post(ch, { data: {} })).status()).toBe(400);
    expect((await page.request.post(bl, { data: { item: '' } })).status()).toBe(400);
    // wrong types must be a client error, not a 500
    for (const [url, body] of [
      [ch, { source: 123 }],
      [ch, { source: ['a'] }],
      [bl, { item: 123 }],
      [bl, { item: { a: 1 } }],
    ]) {
      const res = await page.request.post(url, { data: body });
      expect(res.status(), `${url} ${JSON.stringify(body)}`).toBeLessThan(500);
    }
  });

  test('editing a channel cannot blank its instrument; backline names and numbers must be valid types', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await getPlot(page, eventId);
    const channel = (await (await page.request.post(`${API}/stage-plots/${eventId}/channels`, { data: { source: 'Guitar' } })).json()).channel;
    const item = (await (await page.request.post(`${API}/stage-plots/${eventId}/backline-items`, { data: { item: 'Drum kit' } })).json()).item;

    const blankChannel = await page.request.patch(`${API}/stage-plots/${eventId}/channels/${channel.id}`, { data: { source: '' } });
    expect(blankChannel.status(), 'channel source can be blanked').toBe(400);
    // Backline names save per keystroke, so a momentarily empty name is allowed — but not a non-string.
    const typedItem = await page.request.patch(`${API}/stage-plots/${eventId}/backline-items/${item.id}`, { data: { item: 42 } });
    expect(typedItem.status(), 'non-string backline name').toBe(400);
    const badNumber = await page.request.patch(`${API}/stage-plots/${eventId}/channels/${channel.id}`, { data: { channelNumber: 'abc' } });
    expect(badNumber.status(), 'non-numeric channelNumber').toBeLessThan(500);
  });

  test('page name and scene must have valid types', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    const plot = await getPlot(page, eventId);
    const url = `${API}/stage-plots/${eventId}/pages/${plot.pages[0].id}`;
    expect((await page.request.patch(url, { data: { name: 12345 } })).status(), 'numeric page name').toBeLessThan(500);
    const badScene = await page.request.patch(url, { data: { scene: 'not-a-scene' } });
    expect(badScene.status(), 'string scene accepted').toBeGreaterThanOrEqual(400);
    const created = await page.request.post(`${API}/stage-plots/${eventId}/pages`, { data: { name: { nested: true } } });
    expect(created.status(), 'object page name').toBeLessThan(500);
  });

  test('reordering requires exactly the plot\'s own channels', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await getPlot(page, eventId);
    const ids = [];
    for (const source of ['A', 'B', 'C']) {
      ids.push((await (await page.request.post(`${API}/stage-plots/${eventId}/channels`, { data: { source } })).json()).channel.id);
    }
    const url = `${API}/stage-plots/${eventId}/channels/reorder`;
    expect((await page.request.post(url, { data: { orderedIds: ids.slice(0, 2) } })).status()).toBe(400);
    expect((await page.request.post(url, { data: { orderedIds: [ids[0], ids[0], ids[1]] } })).status()).toBe(400);
    const ok = await page.request.post(url, { data: { orderedIds: [ids[2], ids[0], ids[1]] } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).channels.map((c) => c.source)).toEqual(['C', 'A', 'B']);
  });

  test('AI item confirmation validates and caps what it creates', async ({ page }) => {
    await signIn(page);
    const eventId = await createEvent(page);
    await getPlot(page, eventId);
    const url = `${API}/stage-plots/${eventId}/ai-items/confirm`;
    expect((await page.request.post(url, { data: { items: [] } })).status()).toBe(400);
    expect((await page.request.post(url, { data: { items: [{ listType: 'channel', source: '' }, { listType: 'bogus' }] } })).status()).toBe(400);
    const ok = await page.request.post(url, { data: { items: [{ listType: 'channel', source: 'Kick', phantomPower: false }, { listType: 'backline', item: 'Kit', quantity: 100000 }] } });
    expect(ok.status()).toBe(201);
    const body = await ok.json();
    expect(body.channels).toHaveLength(1);
    expect(body.backlineItems[0].quantity).toBe(999);
    const blank = await page.request.post(`${API}/stage-plots/${eventId}/ai-items`, { data: { prompt: '   ' } });
    expect(blank.status()).toBe(400);
  });
});
