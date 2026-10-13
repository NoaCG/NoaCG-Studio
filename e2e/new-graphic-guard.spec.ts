// covers: src/store/saveActions.ts, src/components/NewGraphicButton.tsx, src/components/save/SaveDialogs.tsx
// covers: src/components/wizard/{CreationWizard,steps/FinishStep}.tsx
// covers: src/app/router.ts, src/components/editorFoundation/EditorFoundation.tsx
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
// save, both still ask before leaving the editor and Cancel keeps the work.

import { test, expect, type Page } from '@playwright/test';
import { pickDesign } from './_browse';
import { addToProductionFromFinish } from './_create';
import { settleDurableWrites } from './_durable';
import { open, draw, source, ready, inspection } from './_layerProperty';

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
  // A never-saved graphic, once edited: ask BEFORE Home and keep the editor on Cancel.
  await editFromFinish(page);
  await editWorkingGraphic(page);
  await page.getByTestId('open-home').click();
  const guard = page.getByTestId('confirm-switch');
  await expect(guard).toBeVisible();
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await expect(page.getByTestId('home-page')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/editor-foundation$/);
  await guard.getByTestId('switch-cancel').click();
  await expect(guard).toBeHidden();
  await expect(page.getByTestId('creation-wizard')).toBeHidden();
  expect(await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.css)).toContain('/* an edit */');
  // Discard is the way through, and it lands in the wizard.
  await page.getByTestId('open-home').click();
  await guard.getByTestId('switch-discard').click();
  await pressNewFromHome(page);
  await expect(guard).toHaveCount(0);
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

test('leave-editor naming cancellation keeps edits; Save first keeps one exact library copy', async ({ page }) => {
  await open(page); await draw(page, .3);
  const edited = await source(page), history = (await inspection(page)).history;
  await page.getByTestId('open-home').click();
  await page.getByTestId('switch-save').click();
  await page.evaluate(() => { window.location.hash = '#/home/graphics'; });
  await expect(page).toHaveURL(/#\/editor-foundation$/);
  await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  await expect(page.getByTestId('save-dialog')).toBeVisible();
  await page.getByTestId('save-dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await expect(page.getByTestId('home-page')).toHaveCount(0);
  expect(await source(page)).toEqual(edited);
  expect((await inspection(page)).history).toEqual(history);
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
  await page.getByTestId('save-name').fill('Kept experiment');
  // Two synchronous submit events exercise the in-flight guard, not Playwright's disabled wait.
  await page.getByTestId('save-confirm').evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByTestId('home-page')).toBeVisible();
  const saved = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts'); return loadGraphics();
  });
  expect(saved).toHaveLength(1); expect(saved[0].name).toBe('Kept experiment');
  await page.getByTestId('home-nav-graphics').click();
  await page.locator('.lib-row', { hasText: 'Kept experiment' }).getByTestId('open-graphic').click();
  await page.getByTestId('control-open-editor').click(); await ready(page);
  expect(await source(page)).toEqual(saved[0].template);
  await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  // A production owns its copy. Saving later authoring work must not update that revision.
  const production = await page.evaluate(async () => {
    const { createShowNamed, addGraphicToShow, loadShows } = await import('/src/model/shows.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const s = useTemplateStore.getState(), show = createShowNamed('Pinned production');
    addGraphicToShow(show.id, s.template, { graphicId: s.saved.graphicId });
    return loadShows();
  });
  await draw(page, .55);
  await page.getByTestId('save-menu').click(); await page.getByRole('menuitem', { name: 'Open saved graphics…', exact: true }).click();
  await expect(page.getByTestId('editor-foundation')).toBeVisible(); await expect(page.getByTestId('home-page')).toHaveCount(0);
  await page.getByTestId('switch-save').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  const updated = await page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics());
  expect(updated).toHaveLength(1); expect(updated[0].id).toBe(saved[0].id);
  expect(updated[0].template).toEqual(await source(page)); expect(updated[0].template).not.toEqual(saved[0].template);
  expect(await page.evaluate(async () => (await import('/src/model/shows.ts')).loadShows())).toEqual(production);
});

test('discard restores the saved copy and never retains a discarded experiment across reload', async ({ page }) => {
  await open(page); await draw(page, .3);
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Original'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  const saved = await page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics());
  await draw(page, .55); await page.getByTestId('open-home').click();
  await page.getByTestId('switch-discard').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  expect(await page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics())).toEqual(saved);
  expect(await source(page)).toEqual(saved[0].template);
  await settleDurableWrites(page); await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible();
  expect(await source(page)).toEqual(saved[0].template);
  await pressNewFromHome(page); await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  await page.locator('[data-entry="template"]').click(); await pickDesign(page, 'Hairline');
  await page.getByTestId('wz-skip-to-finish').click(); await page.getByTestId('wz-finish-edit-artwork').click(); await ready(page);
  await draw(page, .3); const experiment = await source(page);
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-discard').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  await settleDurableWrites(page); await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible();
  expect(await source(page)).not.toEqual(experiment);
  expect(await page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics())).toEqual(saved);
  // Open a different, already saved graphic after discarding the catalog experiment.
  await page.getByTestId('home-nav-graphics').click();
  await page.locator('.lib-row', { hasText: 'Original' }).getByTestId('open-graphic').click();
  await page.getByTestId('control-open-editor').click(); await ready(page);
  expect(await source(page)).toEqual(saved[0].template);
  await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  await page.getByTestId('open-home').click(); await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  await pressNewFromHome(page); await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
});

test('browser Back asks before changing surfaces, with Cancel preserving history', async ({ page }) => {
  await open(page); await draw(page, .3); const edited = await source(page);
  const cdp = await page.context().newCDPSession(page);
  const history = await cdp.send('Page.getNavigationHistory');
  const editorIndex = history.currentIndex - 1;
  // A full preview rebuild adds a child-frame history entry. Prove that setup,
  // then exercise both Back steps; the first does not leave the app surface.
  expect(editorIndex).toBeGreaterThan(0);
  const editorUrl = history.entries[history.currentIndex].url;
  expect(history.entries[editorIndex].url).toBe(editorUrl);
  const previousUrl = history.entries[editorIndex - 1].url;
  expect(previousUrl).toMatch(/#\/new\/step\/template-file$/);
  const originalState = await page.evaluate(() => window.history.state);
  const originalHistory = (await inspection(page)).history;
  await page.evaluate(() => { window.history.back(); });
  await expect.poll(async () => (await cdp.send('Page.getNavigationHistory')).currentIndex).toBe(editorIndex);
  await expect(page).toHaveURL(editorUrl); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await expect(page.getByTestId('creation-wizard')).toHaveCount(0); await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  expect(await page.evaluate(() => window.history.state)).toEqual(originalState);
  expect(await source(page)).toEqual(edited); expect((await inspection(page)).history).toEqual(originalHistory);

  await page.evaluate(() => { window.history.back(); }); await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await expect(page.getByTestId('editor-foundation')).toBeVisible(); await expect(page).toHaveURL(editorUrl);
  await expect(page.getByTestId('creation-wizard')).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  expect(await source(page)).toEqual(edited);
  expect((await cdp.send('Page.getNavigationHistory')).currentIndex).toBe(editorIndex);
  await page.evaluate(() => { window.history.back(); }); await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await page.getByTestId('switch-cancel').click();
  expect(await source(page)).toEqual(edited); await expect(page).toHaveURL(editorUrl);

  // Approval replays the actual prior top-level route once, with no delayed guard.
  await page.evaluate(() => { window.history.back(); }); await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await page.getByTestId('switch-discard').click(); await expect(page.getByTestId('creation-wizard')).toBeVisible();
  // The existing wizard resumes the finished walk at Finish, then canonicalizes its URL.
  await expect(page).toHaveURL(/#\/new\/step\/finish$/);
  await expect(page.getByTestId('wz-resume-confirm')).toBeVisible();
  await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  expect(await source(page)).not.toEqual(edited);
  await settleDurableWrites(page);

});

test('direct hash navigation asks before Home and discards without a repeated question', async ({ page }) => {
  await open(page); await draw(page, .3);
  await page.evaluate(() => { window.location.hash = '#/home/graphics'; });
  await expect(page.getByTestId('confirm-switch')).toBeVisible(); await expect(page.getByTestId('home-page')).toHaveCount(0);
  await expect(page.getByTestId('editor-foundation')).toBeVisible(); await expect(page).toHaveURL(/#\/editor-foundation$/);
  await page.getByTestId('switch-discard').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page).toHaveURL(/#\/home\/graphics$/); await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
});

test('a refused save stays in the editor with its draft and can be retried', async ({ page }) => {
  await open(page); await draw(page, .3); await settleDurableWrites(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if (key === 'spx-gfx-graphics') {
        IDBObjectStore.prototype.put = put;
        throw new DOMException('Injected quota refusal', 'QuotaExceededError');
      }
      return put.call(this, value, key);
    };
  });
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
  await page.getByTestId('save-name').fill('Retry keeps work'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog').locator('.status-bad')).toBeVisible();
  await expect(page.getByTestId('editor-foundation')).toBeVisible(); await expect(page.getByTestId('home-page')).toHaveCount(0);
  expect(await page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics())).toHaveLength(0);
  await page.getByTestId('save-confirm').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  expect(await page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics())).toHaveLength(1);
});
