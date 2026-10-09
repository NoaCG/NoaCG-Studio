// covers: src/components/NewGraphicButton.tsx, src/store/saveActions.ts, src/components/save/SaveDialogs.tsx
// covers: src/components/wizard/CreationWizard.tsx, src/components/home/HomePage.tsx
// covers: src/components/home/CueRundown.tsx
//
// + NEW GRAPHIC FROM HOME OVER A WIZARD WALK LEFT MID-WAY. The wizard's Home door closes it with
// the draft still in memory, and + New graphic used to open it FRESH, wiping that draft without
// a word. The guard that asks before replacing the working document (e2e/new-graphic-guard.spec.ts)
// now covers the walk too, under the same rule: it asks only when something the user did would be
// lost, and its safe answer takes them back into the walk where they left it. The production
// page's doors (the bar's and the rundown's New graphic) go through the same guard.

import { test, expect, type Page } from '@playwright/test';
import { pickDesign } from './_browse';

/** Into the wizard from Home, onto the template walk's Browse step. */
async function toBrowse(page: Page) {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-door="new-graphic"]').click();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await expect(page.locator('.wz-browse-search')).toBeVisible();
}

/** The wizard's own Home door, then Home's + New graphic. */
async function leaveThenPressNew(page: Page) {
  await page.getByTestId('wz-home').click();
  await expect(page.getByTestId('creation-wizard')).toBeHidden();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await page.locator('[data-door="new-graphic"]').click();
}

test('a walk with work in it: + New graphic asks, Continue returns to it, Discard starts fresh', async ({ page }) => {
  await toBrowse(page);
  await pickDesign(page, 'Hairline');
  const doc = page.locator('.wz-title-doc');
  await expect(doc).toContainText('Hairline');
  const where = (await page.getByTestId('wz-stepcount').textContent())!;

  await leaveThenPressNew(page);
  const guard = page.getByTestId('confirm-switch');
  await expect(guard).toBeVisible();
  await expect(page.getByTestId('creation-wizard')).toBeHidden();

  // Cancel stays on Home and keeps the walk: the next press asks again.
  await guard.getByTestId('switch-cancel').click();
  await expect(guard).toBeHidden();
  await page.locator('[data-door="new-graphic"]').click();
  await expect(guard).toBeVisible();

  // Continue: back on the step the walk was left on, the chosen design still in it.
  await guard.getByTestId('switch-resume').click();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.getByTestId('wz-stepcount')).toHaveText(where);
  await expect(doc).toContainText('Hairline');

  // Discard: the wizard opens fresh on its front page, and asks nothing the time after.
  await leaveThenPressNew(page);
  await guard.getByTestId('switch-discard').click();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
  await expect(page.getByTestId('wz-stepcount')).toHaveCount(0);
  await expect(doc).toHaveCount(0);
});

test('nothing to lose: a walk left before choosing anything opens fresh without asking', async ({ page }) => {
  await toBrowse(page);
  await leaveThenPressNew(page);
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
});

test('a walk left by browser Back is held too, and Continue returns to the furthest step', async ({ page }) => {
  await toBrowse(page);
  await pickDesign(page, 'Hairline');
  const where = (await page.getByTestId('wz-stepcount').textContent())!;
  // Back steps down through the walk's own history entries to the front page, then out to Home.
  while (/#\/new/.test(page.url())) await page.goBack();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('creation-wizard')).toBeHidden();
  await page.locator('[data-door="new-graphic"]').click();
  const guard = page.getByTestId('confirm-switch');
  await expect(guard).toBeVisible();
  await guard.getByTestId('switch-resume').click();
  await expect(page.getByTestId('wz-stepcount')).toHaveText(where);
  await expect(page.locator('.wz-title-doc')).toContainText('Hairline');
});

test('the production page asks too: its rundown door, Continue at the furthest step, Discard starts fresh', async ({ page }) => {
  // A fresh profile boots onto the wizard, and New production lands on an empty production page.
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-entry="new-production"]').click();
  const production = page.getByTestId('production-page');
  await expect(production).toBeVisible();

  // Into the wizard through the rundown's own New graphic, with a design chosen in it.
  const rundownDoor = page.getByTestId('production-new-graphic');
  await rundownDoor.click();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, 'Hairline');
  const doc = page.locator('.wz-title-doc');
  await expect(doc).toContainText('Hairline');
  const where = (await page.getByTestId('wz-stepcount').textContent())!;

  /** Browser Back out of the walk, onto the production page it was opened from. */
  const backToProduction = async () => {
    while (/#\/new/.test(page.url())) await page.goBack();
    await expect(production).toBeVisible();
    await expect(page.getByTestId('creation-wizard')).toBeHidden();
  };

  await backToProduction();
  await rundownDoor.click();
  const guard = page.getByTestId('confirm-switch');
  await expect(guard).toBeVisible();
  await expect(page.getByTestId('creation-wizard')).toBeHidden();

  // Cancel stays on the production page and keeps the walk: the bar's door asks about it too.
  await guard.getByTestId('switch-cancel').click();
  await expect(guard).toBeHidden();
  await expect(production).toBeVisible();
  await page.locator('[data-door="new-graphic"]').click();
  await expect(guard).toBeVisible();

  // Continue: back on the furthest step the walk reached, the chosen design still in it.
  await guard.getByTestId('switch-resume').click();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.getByTestId('wz-stepcount')).toHaveText(where);
  await expect(doc).toContainText('Hairline');

  // Discard: the wizard opens fresh on its front page.
  await backToProduction();
  await rundownDoor.click();
  await guard.getByTestId('switch-discard').click();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
  await expect(page.getByTestId('wz-stepcount')).toHaveCount(0);
  await expect(doc).toHaveCount(0);
});
