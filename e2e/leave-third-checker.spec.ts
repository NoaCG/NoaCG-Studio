// covers: none - disposable third independent leave-editor check (P1C3); never land
//
// Adversarial challenges written by the third checker, not copies of the builder's cases:
// newer edits reach the editor through the command HISTORY and TEXT commands and through the
// store's own apply path (not layer.create), while each of Discard's two waits is held by this
// file's own gate. Real pointer and keyboard input is attempted during each wait. Follow-ups:
// a reload straight after the refusal, Redo after the refusal, a successful retry, and ordinary
// Discard of a linked and a never-saved draft checked against the stored bytes.
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { open, draw, source, ready, inspection, selected, undo, redo } from './_layerProperty';
import { settleDurableWrites } from './_durable';

type Gate = { held: { key: string; value: unknown }[]; open: (() => void)[] };

/** Hold the completion event of the next `count` working-slot puts. */
async function gate(page: Page, count: number) {
  await page.evaluate(count => {
    const gate: Gate = { held: [], open: [] };
    (window as unknown as { thirdGate: Gate }).thirdGate = gate;
    const gated = new WeakSet<IDBTransaction>();
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if (key === 'spx-gfx-project' && gate.held.length < count) {
        gate.held.push({ key, value: JSON.parse(String(value)) });
        gated.add(this.transaction);
      }
      return put.call(this, value, key);
    };
    const native = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete')!;
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
      configurable: true,
      get() { return native.get!.call(this); },
      set(handler) {
        if (!gated.has(this) || typeof handler !== 'function') { native.set!.call(this, handler); return; }
        const index = gate.held.length - 1;
        native.set!.call(this, (event: Event) => { gate.open[index] = () => handler.call(this, event); });
      },
    });
  }, count);
}
const gateState = (page: Page) => page.evaluate(() => {
  const g = (window as unknown as { thirdGate: Gate }).thirdGate;
  return { held: g.held.map(h => h.value as { template: unknown; dirty: boolean; graphicId: string | null }), ready: g.open.map(Boolean) };
});
const openGate = (page: Page, index: number) => page.evaluate(i => { (window as unknown as { thirdGate: Gate }).thirdGate.open[i](); }, index);

/** The stored string of a durable key, read straight from IndexedDB. */
const raw = (page: Page, key: string) => page.evaluate(key => new Promise<string | null>((resolve, reject) => {
  const request = indexedDB.open('noacg-studio');
  request.onsuccess = () => {
    const tx = request.result.transaction('kv', 'readonly'), get = tx.objectStore('kv').get(key);
    tx.oncomplete = () => { const v = get.result; request.result.close(); resolve(v === undefined ? null : String(v)); };
    tx.onerror = () => reject(tx.error);
  };
  request.onerror = () => reject(request.error);
}), key);
const link = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().saved);
const library = (page: Page) => page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics());

/** One command through the editor's command surface; `discard` clicks Discard in the same turn. */
async function command(page: Page, kind: 'text' | 'undo', discard = false) {
  await page.evaluate(async ({ kind, discard }) => {
    const { activeEditorCommands } = await import('/src/components/editorFoundation/commandAdapter.ts');
    const c = activeEditorCommands(), i = c.inspect();
    if (!i.ok) throw Error(i.refusal.message);
    const result = kind === 'undo'
      ? c.history({ expected: i.expected, direction: 'undo' })
      : c.apply({ expected: i.expected, transactionId: crypto.randomUUID(), commands: [{ id: 'text.set', args: { targetId: i.targets.find(t => t.capabilities['text.set'].supported)!.id!, text: 'Third checker ' + crypto.randomUUID().slice(0, 6) } }] });
    if (!result.ok) throw Error(result.refusal.message);
    if (discard) (document.querySelector('[data-testid=switch-discard]') as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r));
  }, { kind, discard });
}

/** Real input the user could give while the decision is busy: a drag on the artwork, Ctrl+Z,
 * Escape and a browser Back. Returns whether any of it reached the source or the route. */
async function ordinaryInput(page: Page) {
  const before = JSON.stringify(await source(page)), url = page.url();
  const box = (await page.locator('.ef-artboard').boundingBox())!;
  await page.mouse.move(box.x + box.width * .8, box.y + box.height * .7); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .9, box.y + box.height * .8, { steps: 6 }); await page.mouse.up();
  await page.keyboard.press('Control+z'); await page.keyboard.press('Escape');
  await page.evaluate(() => history.back()); await page.waitForTimeout(400);
  return { sourceChanged: JSON.stringify(await source(page)) !== before, urlChanged: page.url() !== url, url: page.url() };
}

async function saveNamed(page: Page, name: string) {
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill(name);
  await page.getByTestId('save-confirm').click(); await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page);
}

for (const wait of ['autosave', 'replacement'] as const) for (const after of ['reload', 'redo-retry'] as const) {
  test(`third checker: linked draft, newer history edit during the ${wait} wait, then ${after}`, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page); await draw(page, .22); await saveNamed(page, 'Third linked');
    const [saved] = await library(page), libraryBytes = await raw(page, 'spx-gfx-graphics');
    expect(libraryBytes).not.toBeNull();
    await draw(page, .5); await draw(page, .7); await settleDurableWrites(page);
    await page.evaluate(async () => (await import('/src/store/templateStore.ts')).flushPendingProject());
    await settleDurableWrites(page);
    await page.getByTestId('open-home').click(); await expect(page.getByTestId('confirm-switch')).toBeVisible();
    await gate(page, 1);
    // The autosave case changes the text and clicks Discard in one turn, so the autosave is
    // pending when Discard drains it; the replacement case leaves nothing pending.
    if (wait === 'autosave') await command(page, 'text', true);
    else await page.getByTestId('switch-discard').click();
    await expect.poll(async () => (await gateState(page)).ready).toEqual([true]);
    const requested = await source(page), heldWrite = (await gateState(page)).held[0];
    if (wait === 'autosave') { expect(heldWrite.template).toEqual(requested); expect(heldWrite.dirty).toBe(true); }
    else { expect(heldWrite.template).toEqual(saved.template); expect(heldWrite.dirty).toBe(false); }
    await expect(page.getByTestId('switch-discard')).toBeDisabled();
    const input = await ordinaryInput(page);
    expect(input.sourceChanged, 'ordinary input reached the source through the busy decision').toBe(false);
    expect(input.urlChanged, 'browser Back moved the route while Discard was pending').toBe(false);
    await command(page, 'undo');
    const newer = await source(page), context = await inspection(page), selection = await selected(page);
    expect(newer).not.toEqual(requested);
    await openGate(page, 0);
    await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toContainText('changed while discarding');
    await expect(page.getByTestId('home-page')).toHaveCount(0); await expect(page).toHaveURL(/#\/editor-foundation$/);
    expect(await source(page)).toEqual(newer);
    const kept = await inspection(page);
    expect(kept.expected).toEqual(context.expected); expect(kept.history).toEqual(context.history); expect(await selected(page)).toEqual(selection);
    expect(await link(page)).toMatchObject({ graphicId: saved.id, dirty: true });
    expect(await raw(page, 'spx-gfx-graphics')).toBe(libraryBytes);
    const slot = JSON.parse((await raw(page, 'spx-gfx-project'))!);
    expect(slot.template).toEqual(newer); expect(slot.graphicId).toBe(saved.id); expect(slot.dirty).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`refused-${wait}-${after}.png`) });
    if (after === 'reload') {
      // Straight after the refusal: no settle, no further input.
      await page.reload(); await ready(page);
      expect(await source(page)).toEqual(newer); expect(await link(page)).toMatchObject({ graphicId: saved.id, dirty: true });
    } else {
      await page.keyboard.press('Escape'); await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
      await redo(page); expect(await source(page)).toEqual(requested);
      await undo(page); expect(await source(page)).toEqual(newer);
      await redo(page); expect(await source(page)).toEqual(requested);
    }
    // A successful retry restores the saved copy byte for byte and creates nothing.
    await page.getByTestId('open-home').click(); await expect(page.getByTestId('confirm-switch')).toBeVisible();
    await page.getByTestId('switch-discard').click(); await expect(page.getByTestId('home-page')).toBeVisible();
    expect(JSON.stringify(await source(page))).toBe(JSON.stringify(saved.template));
    expect(await link(page)).toMatchObject({ graphicId: saved.id, dirty: false });
    expect(await raw(page, 'spx-gfx-graphics')).toBe(libraryBytes);
    const restored = JSON.parse((await raw(page, 'spx-gfx-project'))!);
    expect(JSON.stringify(restored.template)).toBe(JSON.stringify(saved.template)); expect(restored.dirty).toBe(false);
    await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible();
    expect(JSON.stringify(await source(page))).toBe(JSON.stringify(saved.template));
    await page.getByTestId('home-nav-graphics').click(); await page.locator('.lib-row', { hasText: 'Third linked' }).getByTestId('open-graphic').click();
    await page.getByTestId('control-open-editor').click(); await ready(page);
    await page.getByTestId('open-home').click(); await expect(page.getByTestId('home-page')).toBeVisible();
    await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
    expect(await raw(page, 'spx-gfx-graphics')).toBe(libraryBytes);
    writeFileSync(test.info().outputPath(`linked-${wait}-${after}.json`), JSON.stringify({ wait, after, heldDirty: heldWrite.dirty, ordinaryInput: input,
      refusedKeptNewer: true, sameContextHistorySelection: true, libraryBytesUnchanged: true, retryRestoredBytes: true, noRepeatedQuestion: true }, null, 2));
  });
}

for (const kind of ['store', 'text'] as const) {
  test(`third checker: never-saved draft, ${kind} edit during the replacement wait, retry resets to the clean default`, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page); await draw(page, .3); await draw(page, .55); await undo(page);
    const redoBefore = (await inspection(page)).history;
    expect(redoBefore.redo).toBe(1);
    await settleDurableWrites(page);
    await page.evaluate(async () => (await import('/src/store/templateStore.ts')).flushPendingProject());
    await settleDurableWrites(page);
    const libraryBytes = await raw(page, 'spx-gfx-graphics');
    await page.getByTestId('open-home').click(); await gate(page, 1); await page.getByTestId('switch-discard').click();
    await expect.poll(async () => (await gateState(page)).ready).toEqual([true]);
    expect((await gateState(page)).held[0].dirty).toBe(false); expect((await gateState(page)).held[0].graphicId).toBeNull();
    const requested = await source(page);
    const input = await ordinaryInput(page);
    expect(input.sourceChanged).toBe(false); expect(input.urlChanged).toBe(false);
    if (kind === 'store') await page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const s = useTemplateStore.getState(); s.applyTemplate({ ...s.template, css: `${s.template.css}\n/* third checker */\n` });
      await new Promise(r => setTimeout(r));
    });
    else await command(page, 'text');
    await ready(page);
    const newer = await source(page), context = await inspection(page);
    expect(newer).not.toEqual(requested);
    await openGate(page, 0);
    await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toContainText('changed while discarding');
    await expect(page.getByTestId('home-page')).toHaveCount(0); expect(await source(page)).toEqual(newer);
    expect((await inspection(page)).history).toEqual(context.history);
    expect(JSON.parse((await raw(page, 'spx-gfx-project'))!).template).toEqual(newer);
    // Retry from the same dialog.
    await page.getByTestId('switch-discard').click(); await expect(page.getByTestId('home-page')).toBeVisible();
    const clean = await page.evaluate(async () => JSON.stringify((await import('/src/templates/defaultTemplate.ts')).createDefaultTemplate()));
    expect(JSON.stringify(await source(page))).toBe(clean);
    expect(await link(page)).toMatchObject({ graphicId: null, dirty: false });
    expect(await library(page)).toHaveLength(0); expect(await raw(page, 'spx-gfx-graphics')).toBe(libraryBytes);
    expect(JSON.stringify(JSON.parse((await raw(page, 'spx-gfx-project'))!).template)).toBe(clean);
    await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible();
    expect(JSON.stringify(await source(page))).toBe(clean); expect(await library(page)).toHaveLength(0);
    await page.locator('[data-door="new-graphic"]').click(); await expect(page.getByTestId('creation-wizard')).toBeVisible();
    await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
    writeFileSync(test.info().outputPath(`unsaved-${kind}.json`), JSON.stringify({ kind, redoBefore, ordinaryInput: input, refusedKeptNewer: true,
      retryCleanDefault: true, noLibraryRecord: true, libraryBytes, noRepeatedQuestion: true }, null, 2));
  });
}

test('third checker: Back asks, Cancel keeps the editor; ordinary Discard of a never-saved and a linked draft survive reload', async ({ page }) => {
  test.setTimeout(150_000);
  await open(page); await draw(page, .3); await settleDurableWrites(page);
  const edited = await source(page), history = (await inspection(page)).history, editorUrl = page.url();
  let backs = 0;
  while (await page.getByTestId('confirm-switch').count() === 0 && backs < 3) { await page.evaluate(() => history.back()); backs++; await page.waitForTimeout(500); }
  await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await expect(page.getByTestId('editor-foundation')).toBeVisible(); await expect(page.getByTestId('home-page')).toHaveCount(0);
  await page.getByTestId('switch-cancel').click(); await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  expect(page.url()).toBe(editorUrl); expect(await source(page)).toEqual(edited); expect((await inspection(page)).history).toEqual(history);
  // Ordinary Discard of the never-saved experiment via a hash change to Home.
  await page.evaluate(() => { location.hash = '#/home'; }); await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await expect(page.getByTestId('home-page')).toHaveCount(0);
  await page.getByTestId('switch-discard').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  const clean = await page.evaluate(async () => JSON.stringify((await import('/src/templates/defaultTemplate.ts')).createDefaultTemplate()));
  expect(JSON.stringify(await source(page))).toBe(clean); expect(await library(page)).toHaveLength(0);
  expect(await raw(page, 'spx-gfx-graphics')).toBeNull();
  await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible(); expect(JSON.stringify(await source(page))).toBe(clean);
  await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  // Linked: save, edit, ordinary Discard to the saved-graphics destination.
  await open(page); await draw(page, .4); await saveNamed(page, 'Third ordinary');
  const [saved] = await library(page), bytes = await raw(page, 'spx-gfx-graphics');
  await draw(page, .62); await settleDurableWrites(page);
  await page.getByTestId('save-menu').click(); await page.getByRole('menuitem', { name: 'Open saved graphics…', exact: true }).click();
  await expect(page.getByTestId('confirm-switch')).toBeVisible(); await page.getByTestId('switch-discard').click();
  await expect(page).toHaveURL(/#\/home\/graphics$/);
  expect(JSON.stringify(await source(page))).toBe(JSON.stringify(saved.template)); expect(await raw(page, 'spx-gfx-graphics')).toBe(bytes);
  expect(await library(page)).toHaveLength(1);
  await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible();
  expect(JSON.stringify(await source(page))).toBe(JSON.stringify(saved.template)); expect(await raw(page, 'spx-gfx-graphics')).toBe(bytes);
  await page.locator('[data-door="new-graphic"]').click(); await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  writeFileSync(test.info().outputPath('ordinary-discard.json'), JSON.stringify({ backsBeforeQuestion: backs, cancelKeptUrlSourceHistory: true,
    unsavedCleanDefault: true, noLibraryRecord: true, linkedBytesUnchanged: true, reloadNoQuestion: true }, null, 2));
});

// Diagnosis for the intermittent leave-checker.spec.ts:24 failure: the same preamble, then every
// library put between the injection point and the Save click is recorded with its stack.
test('third checker diagnosis: library writes after the linked-save preamble', async ({ page }) => {
  await open(page); await draw(page, .23); await saveNamed(page, 'Independent kept');
  await page.evaluate(async () => {
    const m = await import('/src/model/shows.ts');
    const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    const show = m.createShowNamed('Independent live copy'); m.addGraphicToShow(show.id, s.template, { graphicId: s.saved.graphicId });
  });
  await draw(page, .61); await settleDurableWrites(page);
  await page.evaluate(() => {
    const log: { at: number; stack: string }[] = []; (window as unknown as { libPuts: typeof log }).libPuts = log;
    const put = IDBObjectStore.prototype.put, start = performance.now();
    IDBObjectStore.prototype.put = function(value, key) {
      if (key === 'spx-gfx-graphics') log.push({ at: Math.round(performance.now() - start), stack: String(new Error().stack) });
      return put.call(this, value, key);
    };
  });
  await page.getByTestId('save-menu').click(); await page.getByRole('menuitem', { name: 'Open saved graphics…', exact: true }).click();
  await expect(page.getByTestId('confirm-switch')).toBeVisible(); await page.waitForTimeout(3000);
  const beforeSave = await page.evaluate(() => (window as unknown as { libPuts: unknown[] }).libPuts.length);
  await page.getByTestId('switch-save').click(); await expect(page.getByTestId('home-page')).toBeVisible(); await page.waitForTimeout(1500);
  const puts = await page.evaluate(() => (window as unknown as { libPuts: unknown[] }).libPuts);
  writeFileSync(test.info().outputPath('library-puts.json'), JSON.stringify({ beforeSave, puts }, null, 2));
});

/** Refuse the next working-slot put with QuotaExceededError (one shot). */
const refuseNextSlotPut = (page: Page) => page.evaluate(() => {
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(value, key) {
    if (key === 'spx-gfx-project') { IDBObjectStore.prototype.put = put; throw new DOMException('Third checker refusal', 'QuotaExceededError'); }
    return put.call(this, value, key);
  };
});

for (const refused of ['autosave', 'replacement'] as const) {
  test(`third checker: quota refusal of the ${refused} write keeps Undo/Redo, reload straight after keeps the draft, retry restores saved bytes`, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page); await draw(page, .22); await saveNamed(page, 'Third quota');
    const [saved] = await library(page), libraryBytes = await raw(page, 'spx-gfx-graphics');
    await draw(page, .5); await draw(page, .7); await undo(page); await settleDurableWrites(page);
    await page.evaluate(async () => (await import('/src/store/templateStore.ts')).flushPendingProject()); await settleDurableWrites(page);
    await page.getByTestId('open-home').click(); await expect(page.getByTestId('confirm-switch')).toBeVisible();
    await refuseNextSlotPut(page);
    if (refused === 'autosave') await command(page, 'text', true); else await page.getByTestId('switch-discard').click();
    await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toBeVisible();
    await expect(page.getByTestId('home-page')).toHaveCount(0);
    const edited = await source(page), context = await inspection(page), selection = await selected(page);
    expect(edited).not.toEqual(saved.template);
    if (refused === 'replacement') expect(context.history.redo).toBe(1);
    expect(await raw(page, 'spx-gfx-graphics')).toBe(libraryBytes);
    // Undo/Redo after the refusal, from the same live session.
    await page.keyboard.press('Escape'); await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
    expect(await selected(page)).toEqual(selection);
    await undo(page); expect(await source(page)).not.toEqual(edited);
    await redo(page); expect(await source(page)).toEqual(edited);
    if (refused === 'replacement') { await redo(page); expect(await source(page)).not.toEqual(edited); await undo(page); expect(await source(page)).toEqual(edited); }
    // Reload straight after (no settle): the live draft, not the saved copy, comes back.
    const slotBeforeReload = JSON.parse((await raw(page, 'spx-gfx-project'))!);
    await page.reload(); await ready(page);
    const reloaded = await source(page);
    const reloadKeptDraft = JSON.stringify(reloaded) === JSON.stringify(edited);
    if (refused === 'replacement') expect(reloadKeptDraft).toBe(true);
    expect(JSON.stringify(reloaded)).not.toBe(JSON.stringify(saved.template));
    expect(await link(page)).toMatchObject({ graphicId: saved.id, dirty: true });
    // Successful retry.
    await page.getByTestId('open-home').click(); await expect(page.getByTestId('confirm-switch')).toBeVisible();
    await page.getByTestId('switch-discard').click(); await expect(page.getByTestId('home-page')).toBeVisible();
    expect(JSON.stringify(await source(page))).toBe(JSON.stringify(saved.template));
    expect(await raw(page, 'spx-gfx-graphics')).toBe(libraryBytes);
    await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible();
    expect(JSON.stringify(await source(page))).toBe(JSON.stringify(saved.template)); expect(await library(page)).toHaveLength(1);
    writeFileSync(test.info().outputPath(`quota-${refused}.json`), JSON.stringify({ refused, history: context.history, undoRedoAfterRefusal: true,
      reloadKeptDraft, slotBeforeReloadMatchesDraft: JSON.stringify(slotBeforeReload.template) === JSON.stringify(edited), retryRestoredSavedBytes: true, libraryBytesUnchanged: true }, null, 2));
  });
}
