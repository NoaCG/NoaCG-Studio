import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { open, draw, source, ready, inspection, selected, undo, redo } from './_layerProperty';
import { settleDurableWrites } from './_durable';

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
const probe = (page: Page) => page.evaluate(() => ({ writes: (window as any).secondCheck.writes, released: (window as any).secondCheck.releases.map(Boolean) }));
const release = (page: Page, index: number) => page.evaluate(index => { (window as any).secondCheck.releases[index](); }, index);
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

test('second checker unsaved refusal keeps nonempty Redo and the same command session', async ({page}) => {
  await open(page); await draw(page,.2); await draw(page,.48); await undo(page); await settleDurableWrites(page);
  const before = await inspection(page), edited = await source(page), selection = await selected(page);
  expect(before.history.undo).toBeGreaterThan(0); expect(before.history.redo).toBe(1);
  await page.evaluate(async () => {
    const { activeEditorSession } = await import('/src/components/editorFoundation/documentAdapter.ts');
    Object.assign(window, { priorSession: activeEditorSession() });
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if (key === 'spx-gfx-project') { IDBObjectStore.prototype.put = put; throw new DOMException('Second checker unsaved refusal','QuotaExceededError'); }
      return put.call(this,value,key);
    };
  });
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-discard').click();
  await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toBeVisible();
  await expect(page.getByTestId('home-page')).toHaveCount(0);
  const after = await inspection(page);
  expect(after.expected).toEqual(before.expected); expect(after.history).toEqual(before.history); expect(after.view).toEqual(before.view);
  expect(await source(page)).toEqual(edited); expect(await selected(page)).toEqual(selection);
  expect(await page.evaluate(async () => (window as any).priorSession === (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession())).toBe(true);
  await page.keyboard.press('Escape'); await redo(page); await undo(page); expect(await source(page)).toEqual(edited);
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-discard').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  expect(await page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics())).toHaveLength(0);
  const discarded = await source(page); expect(discarded).not.toEqual(edited);
  await settleDurableWrites(page); await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible(); expect(await source(page)).toEqual(discarded);
  await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  writeFileSync(test.info().outputPath('unsaved-refusal.json'), JSON.stringify({sessionIdentity:true,history:before.history,redoRecovered:true,reloadDiscarded:true}));
});

test('second checker pending autosave completes before replacement while source and history remain live', async ({page}) => {
  await open(page); await draw(page,.2); await settleDurableWrites(page);
  await page.getByTestId('open-home').click(); await holdWrites(page,2);
  await commandEdit(page,true);
  await expect.poll(async () => (await probe(page)).released).toEqual([true]);
  const edited = await source(page), before = await inspection(page);
  expect((await probe(page)).writes).toHaveLength(1); expect((await probe(page)).writes[0].template).toEqual(edited);
  await expect(page.getByTestId('home-page')).toHaveCount(0); await expect(page.getByTestId('switch-discard')).toBeDisabled();
  await page.evaluate(() => { location.hash = '#/home/graphics'; });
  await expect(page).toHaveURL(/#\/editor-foundation$/);
  await release(page,0);
  await expect.poll(async () => (await probe(page)).released).toEqual([true,true]);
  expect(await source(page)).toEqual(edited); expect((await inspection(page)).expected).toEqual(before.expected); expect((await inspection(page)).history).toEqual(before.history);
  await expect(page.getByTestId('home-page')).toHaveCount(0);
  const writes = (await probe(page)).writes; expect(writes[1].template).not.toEqual(edited); expect(writes[1].dirty).toBe(false);
  await release(page,1); await expect(page.getByTestId('home-page')).toBeVisible(); await expect(page).toHaveURL(/#\/home$/);
  expect(await source(page)).toEqual(writes[1].template);
  await settleDurableWrites(page); await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible(); expect(await source(page)).toEqual(writes[1].template);
  await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  writeFileSync(test.info().outputPath('pending-order.json'),JSON.stringify({autosaveBeforeReplacement:true,noEarlySourceMutation:true,firstDestinationKept:true,reloadDiscarded:true}));
});

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
