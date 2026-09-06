import { test, expect, type Page } from '@playwright/test';
import { armStorageFailure, fillStorage } from './_storage';
import { pickDesign } from './_browse';
import { addToProductionFromFinish } from './_create';

// WHAT HAPPENS WHEN BROWSER STORAGE IS FULL.
//
// The acceptance pass of 2026-08-06 hit this as a total blocker: after an evening of creating
// graphics, "add to production" silently opened the canvas instead. The cause was a swallowed
// error — `saveGraphicAs` returned {ok:false}, the handler returned early, and by then
// `applyDraftProject` had already replaced the route with the editor's, which closes the wizard.
// The user was left standing in the canvas with no production, no saved graphic and nothing
// said.
//
// What is pinned is not the wording — it is that a failed write is always ANNOUNCED, and that
// the announcement says where the work went. The refusal itself is now injected rather than
// provoked (e2e/_storage.ts says why: the documents moved to IndexedDB, whose quota is measured
// in gigabytes and cannot be filled in a test).

/** Walk Entry → Browse → pick a design → Finish, exactly as wizard-finish.spec.ts does. */
async function toFinishStep(page: Page): Promise<void> {
  await armStorageFailure(page);
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, 'Hairline');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.getByTestId('wz-finish-name')).toBeVisible();
}

test('a full quota never parks the user in the canvas silently: add-to-production says so', async ({ page }) => {
  await toFinishStep(page);
  await page.getByTestId('wz-finish-name').fill('Clean Clock');
  await page.getByTestId('wz-finish-production-name').fill('Friday Show');

  // Fill AFTER the wizard has done its own writes, so the failure lands on the create itself —
  // which is exactly the shape of the reported bug (an evening's worth of graphics already
  // saved, the next one refused).
  await fillStorage(page);

  await addToProductionFromFinish(page);

  // THE FIX: the failure is announced, by name, with what the storage layer actually reported.
  const alert = page.getByTestId('storage-alert');
  await expect(alert).toBeVisible();
  await expect(page.getByTestId('storage-alert-action')).toContainText('Clean Clock');
  await expect(page.getByTestId('storage-alert-error')).toContainText(/storage is full/i);
  // And it says where the work is. Since 2026-09-01 that is the WIZARD, still on Finish with the
  // graphic built: the production door no longer routes through the editor on its way to the
  // rundown, so a failure leaves the reader one press from retrying instead of standing in a
  // canvas they never asked for.
  await expect(alert).toContainText(/still open/i);
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  // It also names what is taking up the room — a "storage is full" message with no candidates
  // leaves the user nothing to do.
  await expect(page.getByTestId('storage-alert-total')).toContainText(/MB|KB/);

  // Nothing half-built was left behind: no production was created for a graphic that never saved.
  const shows = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().map((s) => s.name);
  });
  expect(shows).not.toContain('Friday Show');
});

test('a full quota never parks the user in the canvas silently: the export door says so too', async ({ page }) => {
  await toFinishStep(page);
  await page.getByTestId('wz-finish-name').fill('Guest Strap');
  await fillStorage(page);

  await page.getByTestId('wz-finish-export').click();

  // The export door deliberately still opens (the files are the point and they need no storage),
  // but the failed save is no longer invisible behind it.
  await expect(page.getByTestId('storage-alert')).toBeVisible();
  await expect(page.getByTestId('storage-alert-action')).toContainText('Guest Strap');
});

test('a full quota never parks the user in the canvas silently: Home’s + Production says so', async ({ page }) => {
  // Save a graphic the ordinary way first, then fill the quota and try to pool it from Home.
  await armStorageFailure(page);
  await page.goto('/app');
  await page.evaluate(async () => {
    const { createGraphic } = await import('/src/model/library.ts');
    const { createDefaultTemplate } = await import('/src/templates/defaultTemplate.ts');
    createGraphic(createDefaultTemplate(), { name: 'Match Board' });
    window.location.hash = '#/home/graphics';
  });
  const row = page.locator('.lib-row', { hasText: 'Match Board' }).first();
  await expect(row).toBeVisible();

  await fillStorage(page);

  await row.getByTestId('add-to-production').click();
  await page.getByTestId('add-to-new-production-name').fill('Saturday Show');
  await page.getByTestId('add-to-new-production').click();

  // Before this branch the button simply did nothing — the owner's "I can't add anything to
  // even ongoing productions".
  await expect(page.getByTestId('storage-alert')).toBeVisible();
  await expect(page.getByTestId('storage-alert-error')).toContainText(/storage is full/i);

  // The picker CLOSES on a successful pick (home/ProductionPicker), so a refused one must not
  // look the same: it stays standing, still holding the typed name, and shows no ✓. Otherwise
  // the menu snapping shut beside a failure alert says two opposite things at once.
  await page.getByTestId('storage-alert-close').click();
  await expect(page.getByTestId('add-to-production-menu')).toBeVisible();
  await expect(page.getByTestId('add-to-new-production-name')).toHaveValue('Saturday Show');
  await expect(page.getByTestId('production-added')).toHaveCount(0);
});
