// covers: src/store/saveActions.ts, src/components/NewGraphicButton.tsx, src/components/save/SaveDialogs.tsx
// covers: src/components/wizard/{CreationWizard,steps/FinishStep}.tsx
//
// + NEW GRAPHIC FROM HOME, ACROSS THE WHOLE HOME -> WIZARD FLOW: the unsaved-changes dialog
// speaks only when something the user did could be lost.
//
// The false half (owner, 2026-10-07: "creating from Home warns about an unsaved graphic though
// nothing was edited"). Finish's "Edit this graphic" deliberately saves nothing
// (editor-base-edits.spec.ts B01), so the editor opens on a never-saved document - dirty from
// birth, because a whole-project swap marks it so. The guard asked about that flag, so leaving
// the untouched editor for Home and pressing + New graphic raised "has unsaved changes", and
// kept raising it after a reload, since the flag persists. A false warning teaches people to
// click through the one that matters.
//
// The true half: the same document once it IS edited, and a saved graphic edited since its last
// save, both still ask - and the dialog still paints over Home and its Cancel keeps the work.

import { test, expect, type Page } from '@playwright/test';
import { pickDesign } from './_browse';
import { addToProductionFromFinish } from './_create';
import { settleDurableWrites } from './_durable';

/** Walk the wizard to Finish on a catalog design (Entry -> Browse -> pick -> Skip to finish). */
async function toFinish(page: Page) {
  await page.goto('/app#/new');
  await expect(page.getByTestId('creation-wizard')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, 'Hairline');
  await page.getByTestId('wz-skip-to-finish').click();
  await expect(page.getByTestId('wz-finish-name')).toBeVisible();
}

/** Finish -> "Edit this graphic" -> the new editor, settled. */
async function editFromFinish(page: Page) {
  await toFinish(page);
  await page.getByTestId('wz-finish-edit-artwork').click();
  await expect(page.getByTestId('editor-foundation')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
}

/** Home's door, pressed. */
async function pressNewFromHome(page: Page) {
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-door="new-graphic"]').click();
}

/**
 * An edit to the working graphic, made the way every editor edit lands: through
 * `applyTemplate`, the store's one mutation choke point (src/store/AGENTS.md). Driven through
 * the store rather than a canvas gesture so this spec pins the GUARD, not the editor's
 * controls, which another line of work is reshaping.
 */
async function editWorkingGraphic(page: Page) {
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const s = useTemplateStore.getState();
    s.applyTemplate({ ...s.template, css: `${s.template.css}\n/* an edit */\n` });
  });
}

test('an untouched graphic from the Edit door: + New graphic on Home opens the wizard without asking, before and after a reload', async ({ page }) => {
  await editFromFinish(page);
  // The document really is never-saved and flagged dirty - the state that used to trip the guard.
  const link = await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().saved);
  expect(link.graphicId).toBeNull();
  expect(link.dirty).toBe(true);

  await page.getByTestId('open-home').click();
  await pressNewFromHome(page);
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/new$/);

  // The flag persists with the autosave slot, so a returning visit must not ask either.
  await settleDurableWrites(page);
  await page.goto('/app#/home');
  await pressNewFromHome(page);
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
});

test('real changes still ask: an edited never-saved graphic, and a saved graphic edited since its save', async ({ page }) => {
  // A never-saved graphic, once edited: the dialog appears over Home, and Cancel keeps the work.
  await editFromFinish(page);
  await editWorkingGraphic(page);
  await page.getByTestId('open-home').click();
  await pressNewFromHome(page);
  const guard = page.getByTestId('confirm-switch');
  await expect(guard).toBeVisible();
  await guard.getByTestId('switch-cancel').click();
  await expect(guard).toBeHidden();
  await expect(page.getByTestId('creation-wizard')).toBeHidden();
  expect(await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.css)).toContain('/* an edit */');
  // Discard is the way through, and it lands in the wizard.
  await page.locator('[data-door="new-graphic"]').click();
  await guard.getByTestId('switch-discard').click();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  // A SAVED graphic (the production door saves first) edited since that save also asks.
  await page.getByTestId('creation-wizard').locator('[data-entry="template"]').click();
  await pickDesign(page, 'Hairline');
  await page.getByTestId('wz-skip-to-finish').click();
  await addToProductionFromFinish(page);
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  const saved = await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().saved);
  expect(saved.graphicId).not.toBeNull();
  expect(saved.dirty).toBe(false);
  await editWorkingGraphic(page);
  await page.evaluate(async () => {
    const { useRouter } = await import('/src/app/router.ts');
    useRouter.getState().navigate({ view: 'home', section: null });
  });
  await pressNewFromHome(page);
  await expect(guard).toBeVisible();
});
