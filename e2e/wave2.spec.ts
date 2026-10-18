// covers: src/templates/**

import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { bootstrapGraphic } from './_create';
import { mountWorkingDocument, updateWorkingDocument } from './_frame';

// Wave-2 categories with a runtime of their own: starting-soon, game timer, infographic. One
// create + play + behavior spec per category. (The scoreboard, corner bug and quiz cases that
// opened here are pinned on live surfaces by production-controls, catalog-baseline and
// community-packs.)

/** Create the variant through the live door and mount it the way playout composes it: the
 *  document whose runtime (the clocks, the count-up) these cases read, fed the sample data the
 *  create put in the store (the mounted document renders the design's own defaults until an
 *  update arrives). */
async function createFrom(page: Page, categoryId: string, variantName: string): Promise<FrameLocator> {
  await bootstrapGraphic(page, { category: categoryId, name: variantName });
  const doc = await mountWorkingDocument(page);
  const sample = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().sampleData as Record<string, string>;
  });
  await updateWorkingDocument(doc, sample);
  return doc;
}

/** play() on the mounted document, the way playout starts it. */
async function play(doc: FrameLocator): Promise<void> {
  await doc.locator('body').evaluate(() => (window as unknown as { play: () => void }).play());
}

test('starting soon: holds on screen and the countdown ticks', async ({ page }) => {
  const doc = await createFrom(page, 'starting-soon', 'Quiet Hold');
  const clock = doc.locator('.starting-soon-clock');
  await expect(clock).toHaveText('5:00'); // idle paint shows the full duration
  await play(doc);
  // startClock() fires after the entrance, so give the first tick a wide window.
  await expect(clock).not.toHaveText('5:00', { timeout: 6000 });
  await expect(clock).toHaveText(/^\d+:\d{2}$/);
});

test('game timer: label binds and the clock runs', async ({ page }) => {
  const doc = await createFrom(page, 'game-timer', 'Clean Clock');
  await expect(doc.locator('#f0')).toHaveText('ROUND 1');
  await play(doc);
  await expect(doc.locator('.game-timer-clock')).not.toHaveText('3:00', { timeout: 6000 });
});

test('infographic: the stat counts up to its value', async ({ page }) => {
  const doc = await createFrom(page, 'infographic', 'Big Stat');
  const value = doc.locator('#f0');
  await expect(value).toHaveText('87%');
  await play(doc);
  // Mid-count the text is a smaller number; it must settle back on the target.
  await expect(value).toHaveText('87%', { timeout: 8000 });
  await expect
    .poll(async () => doc.locator('.infographic').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
});
