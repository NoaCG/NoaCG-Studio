import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { open, draw, source, ready, inspection, selected, undo, redo } from './_layerProperty';
import { settleDurableWrites } from './_durable';

const library = (page) => page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics());
async function save(page, name) {
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill(name);
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page);
}
async function refusePut(page, key) {
  await page.evaluate(key => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, candidate) {
      if(candidate === key) { IDBObjectStore.prototype.put = put; throw new DOMException('Independent write refusal', 'QuotaExceededError'); }
      return put.call(this, value, candidate);
    };
  }, key);
}

test('independent linked-save refusal keeps selection/history, cancellation, retry and production revision', async ({page}) => {
  await open(page); await draw(page,.23); await save(page,'Independent kept');
  const saved = await library(page);
  const production = await page.evaluate(async () => {
    const m = await import('/src/model/shows.ts');
    const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    const show = m.createShowNamed('Independent live copy'); m.addGraphicToShow(show.id,s.template,{graphicId:s.saved.graphicId}); return m.loadShows();
  });
  await draw(page,.61); await settleDurableWrites(page);
  const edited = await source(page), history = (await inspection(page)).history, selection = await selected(page);
  await refusePut(page,'spx-gfx-graphics');
  await page.getByTestId('save-menu').click(); await page.getByRole('menuitem',{name:'Open saved graphics…',exact:true}).click();
  await page.getByTestId('switch-save').click();
  await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toBeVisible();
  await expect(page.getByTestId('home-page')).toHaveCount(0); await expect(page).toHaveURL(/#\/editor-foundation$/);
  expect(await source(page)).toEqual(edited); expect((await inspection(page)).history).toEqual(history); expect(await selected(page)).toEqual(selection);
  await page.keyboard.press('Escape'); await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  await undo(page); await redo(page); expect(await source(page)).toEqual(edited);
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  const kept = await library(page); expect(kept).toHaveLength(1); expect(kept[0].id).toBe(saved[0].id); expect(kept[0].template).toEqual(edited);
  expect(await page.evaluate(async()=>(await import('/src/model/shows.ts')).loadShows())).toEqual(production);
  await settleDurableWrites(page); await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible();
  await page.getByTestId('home-nav-graphics').click(); await page.locator('.lib-row',{hasText:'Independent kept'}).getByTestId('open-graphic').click();
  await page.getByTestId('control-open-editor').click(); await ready(page); expect(await source(page)).toEqual(edited);
  await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  writeFileSync(test.info().outputPath('linked-refusal.json'),JSON.stringify({refused:true,historySelectionKept:true,retrySavedSameId:true,reopened:true,productionUnchanged:true}));
});

test('independent discard write refusal preserves the edited session and a retry really discards',async({page})=>{
  await open(page); await draw(page,.24); await save(page,'Discard boundary');
  const saved=await library(page); await draw(page,.62); await settleDurableWrites(page);
  const edited=await source(page), history=(await inspection(page)).history, selection=await selected(page);
  await refusePut(page,'spx-gfx-project');
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-discard').click();
  await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toBeVisible();
  await expect(page.getByTestId('home-page')).toHaveCount(0); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  expect(await source(page)).toEqual(edited); expect((await inspection(page)).history).toEqual(history); expect(await selected(page)).toEqual(selection);
  await page.keyboard.press('Escape'); await undo(page); await redo(page); expect(await source(page)).toEqual(edited);
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-discard').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  expect(await library(page)).toEqual(saved); expect(await source(page)).toEqual(saved[0].template);
  await settleDurableWrites(page); await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible(); expect(await source(page)).toEqual(saved[0].template);
  await page.locator('[data-door="new-graphic"]').click(); await expect(page.getByTestId('creation-wizard')).toBeVisible(); await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
});

test('independent cancelled naming followed by a different destination leaves no delayed continuation',async({page})=>{
  await open(page); await draw(page,.36);
  const edited=await source(page), history=(await inspection(page)).history, selection=await selected(page);
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
  await page.getByTestId('save-name').fill('Never committed'); await page.keyboard.press('Escape');
  await expect(page.getByTestId('save-dialog')).toHaveCount(0); expect(await library(page)).toHaveLength(0);
  expect(await source(page)).toEqual(edited); expect((await inspection(page)).history).toEqual(history); expect(await selected(page)).toEqual(selection);
  await page.getByTestId('save-menu').click(); await page.getByRole('menuitem',{name:'Open saved graphics…',exact:true}).click();
  await expect(page.getByTestId('home-page')).toHaveCount(0); await page.getByTestId('switch-discard').click();
  await expect(page).toHaveURL(/#\/home\/graphics$/); await expect(page.getByTestId('home-page')).toBeVisible();
  expect(await library(page)).toHaveLength(0); await settleDurableWrites(page); await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible();
  expect(await library(page)).toHaveLength(0); expect(await source(page)).not.toEqual(edited); await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
});
