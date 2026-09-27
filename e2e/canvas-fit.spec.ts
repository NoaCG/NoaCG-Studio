// covers: none - its subject, PreviewFrame, is CORE, so a change there already runs the full suite

import { test, expect, type Page } from '@playwright/test';
import { createProject } from './_create';

// The canvas FIT invariant: the preview iframe is only ever visible because PreviewFrame scales
// it to the stage, so `fit` is the single number standing between the graphic and a blank
// canvas. The stage can legitimately measure zero — a dock still sizing on the first paint, a
// stage in a pane the browser is not rendering — and committing that zero scales the iframe to
// nothing. The recovery path is a ResizeObserver notification, which a page that is not being
// rendered never delivers, so a committed zero can strand the canvas blank for the whole
// session with no gesture that brings it back.
//
// These tests pin the rule that makes that unreachable: a non-positive measurement is never
// committed. The scale holds its last good value and re-asks, instead of collapsing.

/** The live scale factor PreviewFrame has committed onto the preview iframe. */
async function previewScale(page: Page): Promise<number> {
  return page.locator('iframe.preview-frame').evaluate((el: HTMLIFrameElement) => {
    const m = /scale\(([-\d.eE]+)\)/.exec(el.style.transform || '');
    return m ? Number(m[1]) : NaN;
  });
}

/** Collapse (or restore) the stage's own row, the way an unsized dock does on first paint. */
async function setStageHeight(page: Page, height: string) {
  await page.evaluate((h) => {
    const stage = document.querySelector('[data-testid="preview-stage"]') as HTMLElement | null;
    const host = (stage?.closest('.center-stage') ?? stage?.parentElement) as HTMLElement | null;
    if (host) host.style.height = h;
  }, height);
}

test('the graphic is scaled onto the canvas, not collapsed', async ({ page }) => {
  await createProject(page, 'Hairline');
  const scale = await previewScale(page);
  expect(scale).toBeGreaterThan(0);

  // The scale must actually FIT the stage — a positive-but-wrong number is still a broken
  // canvas, so check the painted iframe lands inside the stage it is supposed to fill.
  const geo = await page.locator('iframe.preview-frame').evaluate((el: HTMLIFrameElement) => {
    const stage = document.querySelector('[data-testid="preview-stage"]')!.getBoundingClientRect();
    const frame = el.getBoundingClientRect();
    return { stage: { w: stage.width, h: stage.height }, frame: { w: frame.width, h: frame.height } };
  });
  expect(geo.frame.w).toBeGreaterThan(0);
  expect(geo.frame.h).toBeGreaterThan(0);
  expect(geo.frame.w).toBeLessThanOrEqual(geo.stage.w + 1);
  expect(geo.frame.h).toBeLessThanOrEqual(geo.stage.h + 1);
});

test('a zero-sized stage never commits a zero scale', async ({ page }) => {
  await createProject(page, 'Hairline');
  const good = await previewScale(page);
  expect(good).toBeGreaterThan(0);

  // Collapse the stage. This is the measurement that used to be committed verbatim.
  await setStageHeight(page, '0px');
  await page.waitForTimeout(400);
  const collapsed = await previewScale(page);
  expect(collapsed, 'a zero measurement must not become the committed scale').toBeGreaterThan(0);

  // And it recovers to a real fit once the stage has room again.
  await setStageHeight(page, '');
  await expect
    .poll(async () => previewScale(page), { timeout: 5000 })
    .toBeGreaterThan(0);
  const restored = await previewScale(page);
  expect(Math.abs(restored - good)).toBeLessThan(0.02);
});
