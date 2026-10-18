// covers: src/templates/**

import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { bootstrapGraphic } from './_create';
import { mountWorkingDocument, updateWorkingDocument } from './_frame';
import { sampleName } from '../src/templates/shared/sampleNames';

// The NoaCG house family (styleTag 'noacg') — the brand-kit overlays rebuilt as first-class
// catalog templates: one create + play + behavior spec per house mechanism (the standard
// lower thirds are covered by the shared sweep; here the family's own runtime is exercised —
// the live clock, the sign-colored market deltas, and the label chip structure).

/** Create the house variant through the live door and mount it the way playout composes it:
 *  the document whose runtime (the clock, the ticker rebuild, the chip stack) these cases read,
 *  fed the sample data the create put in the store (the mounted document renders the design's
 *  own defaults until an update arrives, and the markets list lives in the sample). */
async function createFrom(page: Page, categoryName: string, variantName: string): Promise<FrameLocator> {
  await bootstrapGraphic(page, { category: categoryName, name: variantName });
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

test('house strap: creates from the noacg family and plays', async ({ page }) => {
  const doc = await createFrom(page, 'lower-third', 'House Strap');
  await play(doc);
  await expect
    .poll(async () => doc.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  // Bound to the roster, not to a literal: sample names are product copy that changes in one
  // place (src/templates/shared/sampleNames.ts), and a spec restating one would fail the next
  // time somebody edits the words rather than the behaviour.
  await expect(doc.locator('#f0')).toHaveText(sampleName('lt11'));
  // The house label voice: the title line renders in the bundled mono face.
  await expect
    .poll(async () =>
      doc.locator('.lower-third-title').evaluate((el) => getComputedStyle(el).fontFamily),
    )
    .toContain('JetBrains Mono');
});

test('house clock bug: the live clock ticks and the logo replaces the mark', async ({ page }) => {
  const doc = await createFrom(page, 'corner-bug', 'House Clock');
  await play(doc);
  await expect
    .poll(async () => doc.locator('.corner-bug').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  // The clock paints real local time and ticks once a second.
  const clock = doc.locator('#corner-bug-clock');
  await expect(clock).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  const first = await clock.textContent();
  await expect(clock).not.toHaveText(first!, { timeout: 3000 });
  // Three-bar placeholder shows until a logo is picked.
  await expect(doc.locator('.corner-bug-mark')).toBeVisible();
});

test('house markets: deltas are colored by sign', async ({ page }) => {
  const doc = await createFrom(page, 'ticker', 'House Markets');
  await play(doc);
  // rebuildTicker renders the items twice (marquee): 4 gains + 2 losses per set.
  await expect(doc.locator('#ticker-track .ticker-up')).toHaveCount(8);
  await expect(doc.locator('#ticker-track .ticker-down')).toHaveCount(4);
  await expect(doc.locator('#ticker-track .ticker-up').first()).toHaveText('+1.24%');
});

test('house breaking: chip and headline stack in visual order', async ({ page }) => {
  const doc = await createFrom(page, 'lower-third', 'House Breaking');
  await play(doc);
  await expect(doc.locator('#f0')).toHaveText('Coalition talks reach midnight deadline');
  await expect(doc.locator('#f1')).toHaveText('Breaking');
  // The chip (f1) renders ABOVE the headline (f0) even though the field order is f0-first.
  const chipY = await doc.locator('#f1').evaluate((el) => el.getBoundingClientRect().top);
  const headY = await doc.locator('#f0').evaluate((el) => el.getBoundingClientRect().top);
  expect(chipY).toBeLessThan(headY);
});
