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
import { chooseType, pickDesign } from './_browse';

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

// ── WHAT A HELD WALK KEEPS, PINNED BEFORE THE WALK'S STATE MOVES ────────────────────────────
// docs/work-specs/wizard-structure/spec.md section 4: Continue keeps everything and returns to
// the furthest step; a fresh open holds nothing until the reader does something.

test('Continue keeps the whole walk: the furthest step, the Browse filters and the answers', async ({ page }) => {
  await toBrowse(page);
  await chooseType(page, 'Lower thirds');
  const type = await page.getByTestId('wz-browse-type').inputValue();
  await pickDesign(page, 'Hairline');
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields
  const firstLine = page.locator('.wz-line-row input').nth(1);
  await firstLine.fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Next →' }).click(); // Style, the furthest step
  const where = (await page.getByTestId('wz-stepcount').textContent())!;
  await page.goBack(); // back on Fields: the furthest step is still Style

  await leaveThenPressNew(page);
  await page.getByTestId('confirm-switch').getByTestId('switch-resume').click();
  await expect(page.getByTestId('wz-stepcount')).toHaveText(where);
  await page.locator('.wz-dot', { hasText: 'Fields' }).click();
  await expect(firstLine).toHaveValue('Ada Lovelace');
  await page.locator('.wz-dot', { hasText: 'Browse' }).click();
  await expect(page.getByTestId('wz-browse-type')).toHaveValue(type);
  await expect(page.locator('.wz-browse-search')).toHaveValue('Hairline');
});

test('a fresh open holds nothing: entering any walk and leaving asks nothing', async ({ page }) => {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  for (const entry of ['template', 'import-graphic', 'ai', 'video']) {
    await page.locator('[data-door="new-graphic"]').click();
    await page.locator(`[data-entry="${entry}"]`).click();
    await expect(page.getByTestId('wz-stepcount'), entry).toBeVisible();
    await page.getByTestId('wz-home').click();
    await expect(page.getByTestId('home-page')).toBeVisible();
    const held = await page.evaluate(async () => {
      const { useSaveUi } = await import('/src/store/saveActions.ts');
      return useSaveUi.getState().heldWalk;
    });
    expect(held, `${entry}: nothing was done, so nothing is held`).toBe(false);
  }
  await page.locator('[data-door="new-graphic"]').click();
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
  await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
});

// ── A DROPPED TEMPLATE FILE ACROSS THE WALK'S LIFETIME ──────────────────────────────────────
// docs/work-specs/wizard-structure/spec.md section 4 (decided in S1c): the file belongs to the
// walk it was dropped on. Continue brings it back; Start fresh and the ✕ let it go.

/** A finished one-field template, as a reader would drop it on the Import graphic card. */
const STUDIO_STRAP = {
  name: 'studio-strap.html',
  mimeType: 'text/html',
  buffer: Buffer.from(
    '<!DOCTYPE html><html><head><script>window.SPXGCTemplateDefinition = { description: "Studio strap", DataFields: [' +
      '{ field: "f0", ftype: "textfield", title: "Name", value: "Alexandra Riva" } ] };' +
      'function update(data) {} function play() {} function stop() {} function next() {}</script></head>' +
      '<body><div id="root"><span id="f0">Alexandra Riva</span></div></body></html>',
    'utf8',
  ),
};

/** From Home into the wizard's Entry. */
async function openFromHome(page: Page) {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-door="new-graphic"]').click();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
}

/** From the wizard's Entry: Import graphic, and the template file dropped on its card. */
async function dropTemplateFile(page: Page) {
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles(STUDIO_STRAP);
  // The card names the file and the operator fields it found.
  await expect(page.getByTestId('import-template-card')).toContainText('studio strap');
}

/** The wizard's own Home door, and whether the walk it left is held (saveActions `heldWalk`). */
async function leaveAndReadHeld(page: Page): Promise<boolean> {
  await page.getByTestId('wz-home').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  return page.evaluate(async () => {
    const { useSaveUi } = await import('/src/store/saveActions.ts');
    return useSaveUi.getState().heldWalk;
  });
}

test('a walk started over holds no dropped file: Start fresh and the ✕ both let it go', async ({ page }) => {
  await openFromHome(page);
  await dropTemplateFile(page);
  // Start fresh over the held walk, then leave the fresh one untouched: nothing is held.
  await leaveThenPressNew(page);
  await page.getByTestId('confirm-switch').getByTestId('switch-discard').click();
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
  expect(await leaveAndReadHeld(page), 'Start fresh').toBe(false);

  // The ✕ rewinds to Entry the same way: the file goes with the walk it was dropped on.
  await page.locator('[data-door="new-graphic"]').click();
  await dropTemplateFile(page);
  await page.locator('.wz-header .gallery-close').click();
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
  expect(await leaveAndReadHeld(page), 'the ✕').toBe(false);
});

test('Continue keeps a dropped template file', async ({ page }) => {
  await openFromHome(page);
  await dropTemplateFile(page);
  const card = page.getByTestId('import-template-card');
  await expect(card).toContainText('operator field: Name');

  await leaveThenPressNew(page);
  await page.getByTestId('confirm-switch').getByTestId('switch-resume').click();
  await expect(card).toContainText('studio strap');
  await expect(card).toContainText('operator field: Name');
});
