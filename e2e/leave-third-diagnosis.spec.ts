// covers: none - disposable third-checker diagnosis (P1C3); never land
// The original independent linked-SAVE refusal preamble and injection, unchanged, with every
// library put and every app-level storage error recorded, to name what consumes the refusal
// when the refused save navigates.
import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { open, draw, source } from './_layerProperty';
import { settleDurableWrites } from './_durable';

const library = (page) => page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics());

test('third diagnosis: what the linked-save refusal hits', async ({ page }) => {
  await open(page); await draw(page, .23);
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Independent kept');
  await page.getByTestId('save-confirm').click(); await page.getByTestId('save-status').filter({ hasText: 'Saved' }).waitFor();
  await settleDurableWrites(page);
  await page.evaluate(async () => {
    const m = await import('/src/model/shows.ts');
    const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    const show = m.createShowNamed('Independent live copy'); m.addGraphicToShow(show.id, s.template, { graphicId: s.saved.graphicId });
  });
  await draw(page, .61); await settleDurableWrites(page);
  const edited = await source(page);
  await page.evaluate(() => {
    const w = window as unknown as { diag: { t0: number; puts: unknown[]; errors: unknown[]; refusedAt?: number } };
    w.diag = { t0: performance.now(), puts: [], errors: [] };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      w.diag.puts.push({ at: Math.round(performance.now() - w.diag.t0), key, stack: String(new Error().stack).split('\n').slice(2, 9).join(' | ') });
      return put.call(this, value, key);
    };
    window.addEventListener('spx-storage-error', (e) => w.diag.errors.push({ at: Math.round(performance.now() - w.diag.t0), detail: (e as CustomEvent).detail, hash: location.hash }));
  });
  // The original refusePut, unchanged.
  await page.evaluate(key => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, candidate) {
      if (candidate === key) { (window as unknown as { diag: { refusedAt?: number; t0: number } }).diag.refusedAt = Math.round(performance.now() - (window as unknown as { diag: { t0: number } }).diag.t0); IDBObjectStore.prototype.put = put; throw new DOMException('Independent write refusal', 'QuotaExceededError'); }
      return put.call(this, value, candidate);
    };
  }, 'spx-gfx-graphics');
  await page.getByTestId('save-menu').click(); await page.getByRole('menuitem', { name: 'Open saved graphics…', exact: true }).click();
  const clickAt = await page.evaluate(() => Math.round(performance.now() - (window as unknown as { diag: { t0: number } }).diag.t0));
  await page.getByTestId('switch-save').click();
  await page.waitForTimeout(2500);
  const diag = await page.evaluate(() => (window as unknown as { diag: unknown }).diag);
  const state = {
    hash: await page.evaluate(() => location.hash),
    leaveError: await page.getByTestId('confirm-switch').locator('.status-bad').count(),
    libraryHasEdit: JSON.stringify((await library(page))[0]?.template) === JSON.stringify(edited),
    link: await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().saved),
  };
  const navigated = !state.hash.endsWith('/editor-foundation');
  writeFileSync(test.info().outputPath('diag.json'), JSON.stringify({ navigated, state, saveClickAt: clickAt, diag }, null, 2));
});
