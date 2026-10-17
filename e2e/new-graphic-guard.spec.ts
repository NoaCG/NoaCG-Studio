// covers: src/store/saveActions.ts, src/components/NewGraphicButton.tsx, src/components/save/SaveDialogs.tsx
// covers: src/components/wizard/{CreationWizard,steps/FinishStep}.tsx, src/components/wizard/shell/{walkState,useWalkLifecycle}.ts
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
import { writeFileSync } from 'node:fs';
import { pickDesign } from './_browse';
import { addToProductionFromFinish } from './_create';
import { settleDurableWrites } from './_durable';
import { open, draw, source, ready, inspection, selected, undo, redo } from './_layerProperty';

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

for (const linked of [true, false]) {
  test(`a refused discard preserves the entire ${linked ? 'linked' : 'unsaved'} session, including Redo`, async ({ page }) => {
    await open(page); await draw(page, .24);
    if (linked) {
      await page.getByTestId('save-graphic').click();
      await page.getByTestId('save-name').fill('Discard boundary');
      await page.getByTestId('save-confirm').click();
      await expect(page.getByTestId('save-status')).toHaveText('Saved');
    }
    const saved = await page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics());
    await draw(page, .5); await draw(page, .7); await undo(page);
    await settleDurableWrites(page);
    const edited = await source(page), before = await inspection(page), selection = await selected(page);
    expect(before.history.undo).toBeGreaterThan(0); expect(before.history.redo).toBe(1);
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, key) {
        if (key === 'spx-gfx-project') {
          IDBObjectStore.prototype.put = put;
          throw new DOMException('Injected discard refusal', 'QuotaExceededError');
        }
        return put.call(this, value, key);
      };
    });
    await page.getByTestId('open-home').click(); await page.getByTestId('switch-discard').click();
    await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toBeVisible();
    await expect(page.getByTestId('home-page')).toHaveCount(0);
    await expect(page.getByTestId('editor-foundation')).toBeVisible();
    expect(await source(page)).toEqual(edited);
    const after = await inspection(page);
    expect(after.expected).toEqual(before.expected); expect(after.view).toEqual(before.view);
    expect(after.history).toEqual(before.history); expect(await selected(page)).toEqual(selection);
    await page.keyboard.press('Escape'); await redo(page); await undo(page);
    expect(await source(page)).toEqual(edited);
    await page.getByTestId('open-home').click(); await page.getByTestId('switch-discard').click();
    await expect(page.getByTestId('home-page')).toBeVisible();
    expect(await page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics())).toEqual(saved);
    expect(await source(page)).not.toEqual(edited);
    if (linked) expect(await source(page)).toEqual(saved[0].template);
    expect(await page.evaluate(async () => {
      const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
      return { history: s.history, future: s.future, selection: s.selectedParts, dirty: s.saved.dirty };
    })).toEqual({ history: [], future: [], selection: [], dirty: false });
    const discarded = await source(page);
    await settleDurableWrites(page); await page.reload();
    await expect(page.getByTestId('home-page')).toBeVisible(); expect(await source(page)).toEqual(discarded);
    await pressNewFromHome(page); await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  });
}

test('discard keeps source and history live until the working-slot write is confirmed', async ({ page }) => {
  await open(page); await draw(page, .3); await settleDurableWrites(page);
  const edited = await source(page), before = await inspection(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if (key === 'spx-gfx-project') {
        IDBObjectStore.prototype.put = put;
        const tx = this.transaction;
        Object.defineProperty(tx, 'oncomplete', { set(handler: (event: Event) => void) {
          tx.addEventListener('complete', event => {
            Object.assign(window, { releaseDiscard: () => handler.call(tx, event) });
          }, { once: true });
        } });
      }
      return put.call(this, value, key);
    };
  });
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-discard').click();
  await expect.poll(() => page.evaluate(() => 'releaseDiscard' in window)).toBe(true);
  await expect(page.getByTestId('switch-discard')).toBeDisabled();
  await expect(page.getByTestId('home-page')).toHaveCount(0);
  expect(await source(page)).toEqual(edited);
  const pending = await inspection(page);
  expect(pending.expected).toEqual(before.expected); expect(pending.history).toEqual(before.history);
  await page.evaluate(() => (window as unknown as { releaseDiscard: () => void }).releaseDiscard());
  await expect(page.getByTestId('home-page')).toBeVisible();
  expect(await source(page)).not.toEqual(edited);
});

test('a refused pending autosave cannot make Discard replace the live document', async ({ page }) => {
  await open(page); await draw(page, .3); await settleDurableWrites(page);
  await page.getByTestId('open-home').click();
  const result = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { activeEditorSession } = await import('/src/components/editorFoundation/documentAdapter.ts');
    const { discardCurrentGraphic } = await import('/src/store/saveActions.ts');
    const s = useTemplateStore.getState();
    s.applyTemplate({ ...s.template, css: s.template.css + '\n/* pending edit */' });
    const session = activeEditorSession(), before = session.commandState(), edited = useTemplateStore.getState().template;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if (key === 'spx-gfx-project') {
        IDBObjectStore.prototype.put = put;
        throw new DOMException('Pending autosave refused', 'QuotaExceededError');
      }
      return put.call(this, value, key);
    };
    const error = await discardCurrentGraphic();
    return { error, before, after: activeEditorSession().commandState(), sameSource: edited === useTemplateStore.getState().template };
  });
  expect(result.error).toBeTruthy(); expect(result.sameSource).toBe(true); expect(result.after).toEqual(result.before);
  await expect(page.getByTestId('home-page')).toHaveCount(0); await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await page.getByTestId('switch-discard').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  await settleDurableWrites(page); const discarded = await source(page);
  await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible(); expect(await source(page)).toEqual(discarded);
});

// A NEWER EDIT ACCEPTED WHILE DISCARD WAITS (#1147). Discard first drains a pending autosave,
// then writes its replacement, and either wait gives the editor a turn to accept another edit.
// The context it compares against is the one the user chose to discard, taken at the click, so
// an edit in EITHER wait refuses the discard instead of being erased. The helpers and the next
// two tests are the independent checker's probe (39a900183) carried with their assertions
// unchanged; each holds the completion notice of real IndexedDB working-slot puts.
type HeldWrites = { secondCheck: { writes: { template: unknown; dirty: boolean }[]; releases: (() => void)[] } };
async function holdWrites(page: Page, count: number) {
  await page.evaluate(count => {
    const original = IDBObjectStore.prototype.put;
    const probe = { writes: [] as unknown[], releases: [] as (() => void)[] };
    Object.assign(window, { secondCheck: probe });
    IDBObjectStore.prototype.put = function(value, key) {
      if (key === 'spx-gfx-project') {
        const index = probe.writes.length;
        probe.writes.push(JSON.parse(value as string));
        if (probe.writes.length === count) IDBObjectStore.prototype.put = original;
        const tx = this.transaction;
        Object.defineProperty(tx, 'oncomplete', { set(handler: (event: Event) => void) {
          tx.addEventListener('complete', event => { probe.releases[index] = () => handler.call(tx, event); }, { once: true });
        } });
      }
      return original.call(this, value, key);
    };
  }, count);
}
const probe = (page: Page) => page.evaluate(() => ({ writes: (window as unknown as HeldWrites).secondCheck.writes, released: (window as unknown as HeldWrites).secondCheck.releases.map(Boolean) }));
const release = (page: Page, index: number) => page.evaluate(index => { (window as unknown as HeldWrites).secondCheck.releases[index](); }, index);
async function commandEdit(page: Page, clickDiscard = false) {
  return page.evaluate(async clickDiscard => {
    const { activeEditorCommands } = await import('/src/components/editorFoundation/commandAdapter.ts');
    const c = activeEditorCommands(), inspected = c.inspect();
    if (!inspected.ok) throw Error(inspected.refusal.message);
    const result = c.apply({ expected: inspected.expected, transactionId: crypto.randomUUID(), commands: [{ id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 800, y: 100, width: 100, height: 100 } } }] });
    if (!result.ok) throw Error(result.refusal.message);
    if (clickDiscard) (document.querySelector('[data-testid=switch-discard]') as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r));
    return result;
  }, clickDiscard);
}

test('second checker newer edit rejects a delayed discard and preserves its session and durable draft', async ({page}) => {
  await open(page); await draw(page,.2); await settleDurableWrites(page);
  await holdWrites(page,1); await page.getByTestId('open-home').click(); await page.getByTestId('switch-discard').click();
  await expect.poll(async () => (await probe(page)).released).toEqual([true]);
  const old = await source(page); await commandEdit(page); await ready(page);
  const newer = await source(page), before = await inspection(page), selection = await selected(page); expect(newer).not.toEqual(old);
  await release(page,0); await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toContainText('changed while discarding');
  await expect(page.getByTestId('home-page')).toHaveCount(0); expect(await source(page)).toEqual(newer);
  const after = await inspection(page); expect(after.expected).toEqual(before.expected); expect(after.history).toEqual(before.history); expect(after.view).toEqual(before.view); expect(await selected(page)).toEqual(selection);
  await page.keyboard.press('Escape'); await undo(page); expect(await source(page)).toEqual(old); await redo(page); expect(await source(page)).toEqual(newer);
  await settleDurableWrites(page); await page.reload(); await ready(page); expect(await source(page)).toEqual(newer);
  await page.getByTestId('open-home').click(); await expect(page.getByTestId('confirm-switch')).toBeVisible(); await page.getByTestId('switch-discard').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  writeFileSync(test.info().outputPath('stale-discard.json'),JSON.stringify({newerEditRetained:true,exactContextRetained:true,undoRedoRecovered:true,newerDraftReloaded:true,retryDiscarded:true}));
});

test('second checker newer edit during autosave confirmation refuses the already requested discard', async ({page}) => {
  await open(page); await draw(page,.2); await settleDurableWrites(page);
  await page.getByTestId('open-home').click(); await holdWrites(page,2);
  await commandEdit(page,true);
  await expect.poll(async () => (await probe(page)).released).toEqual([true]);
  const requested = await source(page);
  const result = await page.evaluate(async () => {
    const { activeEditorCommands } = await import('/src/components/editorFoundation/commandAdapter.ts');
    const c = activeEditorCommands(), i = c.inspect(); if (!i.ok) throw Error(i.refusal.message);
    const result = c.apply({ expected:i.expected, transactionId:crypto.randomUUID(), commands:[{id:'layer.create',args:{geometry:{shape:'rectangle',x:1100,y:300,width:100,height:100}}}] });
    if (!result.ok) throw Error(result.refusal.message);
    const before = c.inspect();
    (window as unknown as HeldWrites).secondCheck.releases[0]();
    await new Promise(r => setTimeout(r));
    return before;
  });
  const newer = await source(page); expect(newer).not.toEqual(requested);
  await expect.poll(async () => (await probe(page)).released).toEqual([true,true]);
  const writes = (await probe(page)).writes;
  expect(writes[0].template).toEqual(requested); expect(writes[1].dirty).toBe(false);
  expect(await source(page)).toEqual(newer); await expect(page.getByTestId('home-page')).toHaveCount(0);
  await release(page,1);
  const snapshot = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    await new Promise(r => setTimeout(r));
    return {source:useTemplateStore.getState().template,home:!!document.querySelector('[data-testid=home-page]'),error:document.querySelector('[data-testid=confirm-switch] .status-bad')?.textContent};
  });
  writeFileSync(test.info().outputPath('autosave-newer-edit.json'),JSON.stringify({requested,newer,before:result,after:snapshot},null,2));
  await page.screenshot({path:test.info().outputPath('autosave-newer-edit.png')});
  expect(snapshot.home,'a newer edit during pending autosave must keep the editor mounted').toBe(false);
  expect(snapshot.source,'discard may not erase the newer command edit').toEqual(newer);
  await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toContainText('changed while discarding');
  expect((await inspection(page)).history).toEqual(result.history);
});

// One held confirmation per case, and the case proves WHICH write it held, so the autosave
// drain and the replacement write are each shown to keep the newer edit on their own.
for (const wait of ['autosave', 'replacement'] as const) {
  test(`a newer edit during the ${wait} wait refuses Discard and keeps its source, session and history`, async ({ page }) => {
    await open(page); await draw(page, .2); await settleDurableWrites(page);
    if (wait === 'replacement') {
      await page.evaluate(async () => (await import('/src/store/templateStore.ts')).flushPendingProject());
      await settleDurableWrites(page);
    }
    await page.getByTestId('open-home').click(); await holdWrites(page, 1);
    // An edit and the click in one turn leave its autosave pending for Discard to drain.
    if (wait === 'autosave') await commandEdit(page, true);
    else await page.getByTestId('switch-discard').click();
    await expect.poll(async () => (await probe(page)).released).toEqual([true]);
    const requested = await source(page), held = (await probe(page)).writes[0];
    if (wait === 'autosave') { expect(held.template).toEqual(requested); expect(held.dirty).toBe(true); }
    else { expect(held.template).not.toEqual(requested); expect(held.dirty).toBe(false); }
    await commandEdit(page); await ready(page);
    const newer = await source(page), before = await inspection(page), selection = await selected(page);
    expect(newer).not.toEqual(requested);
    await release(page, 0);
    await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toContainText('changed while discarding');
    await expect(page.getByTestId('home-page')).toHaveCount(0);
    expect(await source(page)).toEqual(newer);
    const after = await inspection(page);
    expect(after.expected).toEqual(before.expected); expect(after.history).toEqual(before.history);
    expect(after.view).toEqual(before.view); expect(await selected(page)).toEqual(selection);
    await page.keyboard.press('Escape'); await undo(page); expect(await source(page)).toEqual(requested);
    await redo(page); expect(await source(page)).toEqual(newer);
    await settleDurableWrites(page); await page.reload(); await ready(page);
    expect(await source(page)).toEqual(newer);
  });
}

// The refused discard has already written its replacement, so the refusal may only be shown
// once the newer draft is durable again: a reload straight after it must reopen the newer edit,
// and a refused restoring write is reported as such instead of "your changes are still open".
// The newer edit and the replacement's release share one turn, so its own 800 ms autosave
// cannot be the write this holds.
for (const restore of ['confirmed', 'refused'] as const) {
  test(`a newer edit's restoring write is ${restore} before Discard reports its refusal`, async ({ page }) => {
    await open(page); await draw(page, .2); await settleDurableWrites(page);
    await page.evaluate(async () => (await import('/src/store/templateStore.ts')).flushPendingProject());
    await settleDurableWrites(page);
    await page.getByTestId('open-home').click(); await holdWrites(page, restore === 'confirmed' ? 2 : 1);
    await page.getByTestId('switch-discard').click();
    await expect.poll(async () => (await probe(page)).released).toEqual([true]);
    expect((await probe(page)).writes[0].dirty).toBe(false);
    const requested = await source(page);
    if (restore === 'refused') await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, key) {
        if (key === 'spx-gfx-project') {
          IDBObjectStore.prototype.put = put;
          throw new DOMException('Restoring write refused', 'QuotaExceededError');
        }
        return put.call(this, value, key);
      };
    });
    await page.evaluate(async () => {
      const { activeEditorCommands } = await import('/src/components/editorFoundation/commandAdapter.ts');
      const c = activeEditorCommands(), i = c.inspect(); if (!i.ok) throw Error(i.refusal.message);
      const result = c.apply({ expected: i.expected, transactionId: crypto.randomUUID(), commands: [{ id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 1100, y: 300, width: 100, height: 100 } } }] });
      if (!result.ok) throw Error(result.refusal.message);
      (window as unknown as HeldWrites).secondCheck.releases[0]();
      await new Promise(r => setTimeout(r));
    });
    const newer = await source(page); expect(newer).not.toEqual(requested);
    const refusal = page.getByTestId('confirm-switch').locator('.status-bad');
    if (restore === 'confirmed') {
      await expect.poll(async () => (await probe(page)).released).toEqual([true, true]);
      const restoring = (await probe(page)).writes[1];
      expect(restoring.template).toEqual(newer); expect(restoring.dirty).toBe(true);
      await expect(refusal).toHaveCount(0); await expect(page.getByTestId('switch-discard')).toBeDisabled();
      await release(page, 1);
      await expect(refusal).toContainText('changed while discarding');
      await page.reload(); await ready(page);
      expect(await source(page)).toEqual(newer);
    } else {
      await expect(refusal).toContainText('storage is full');
      await expect(refusal).not.toContainText('changed while discarding');
      await expect(page.getByTestId('home-page')).toHaveCount(0);
      expect(await source(page)).toEqual(newer);
    }
  });
}

// A REFUSED SAVE WHILE AN AUTOSAVE IS STILL IN FLIGHT (#1351). Save waits for every pending
// write, and the working draft's autosave can settle long after the library put was refused. The
// refusal must still be Save's own answer, never an app-level notice taken first, so leaving
// with Save stays in the editor. The autosave's completion is held here so the order is forced.
test('a linked save refused while an autosave write is in flight keeps the editor and its draft', async ({ page }) => {
  await open(page); await draw(page, .23);
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Held autosave');
  await page.getByTestId('save-confirm').click(); await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page);
  const saved = await page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics());
  await holdWrites(page, 1); await commandEdit(page); await ready(page);
  await page.evaluate(async () => (await import('/src/store/templateStore.ts')).flushPendingProject());
  await expect.poll(async () => (await probe(page)).released).toEqual([true]);
  const edited = await source(page), history = (await inspection(page)).history, selection = await selected(page);
  await page.evaluate(() => {
    const seen = { refused: false, changed: false, errors: [] as unknown[] };
    Object.assign(window, { heldSave: seen });
    window.addEventListener('spx-storage-error', e => seen.errors.push((e as CustomEvent).detail));
    window.addEventListener('spx-data-changed', () => { if (seen.refused) seen.changed = true; });
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if (key === 'spx-gfx-graphics') {
        IDBObjectStore.prototype.put = put; seen.refused = true;
        throw new DOMException('Refused beside a held autosave', 'QuotaExceededError');
      }
      return put.call(this, value, key);
    };
  });
  type Seen = { heldSave: { refused: boolean; changed: boolean; errors: unknown[] } };
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
  // The refusal has rolled the mirror back and is waiting for the autosave; give every timer a turn.
  await expect.poll(() => page.evaluate(() => (window as unknown as Seen).heldSave.changed)).toBe(true);
  await page.evaluate(() => new Promise(r => setTimeout(r, 100)));
  await release(page, 0);
  await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toBeVisible();
  await expect(page.getByTestId('home-page')).toHaveCount(0); await expect(page).toHaveURL(/#\/editor-foundation$/);
  expect(await page.evaluate(() => (window as unknown as Seen).heldSave.errors), 'Save claims its own refusal').toEqual([]);
  expect(await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().saved))
    .toMatchObject({ dirty: true, status: 'failed' });
  expect(await page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics())).toEqual(saved);
  expect(await source(page)).toEqual(edited); expect((await inspection(page)).history).toEqual(history); expect(await selected(page)).toEqual(selection);
  await page.keyboard.press('Escape'); await undo(page); await redo(page); expect(await source(page)).toEqual(edited);
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  const kept = await page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics());
  expect(kept).toHaveLength(1); expect(kept[0].id).toBe(saved[0].id); expect(kept[0].template).toEqual(edited);
});
