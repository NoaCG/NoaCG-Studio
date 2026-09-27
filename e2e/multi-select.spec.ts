// covers: src/blocks/**, src/components/canvas/**

import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { createProject } from './_create';
import { canvasBox, elementPoint } from './_canvas';

// The interaction model's selection foundations (docs/TIMELINE_INTERACTION_MODEL.md):
// one ordered multi-selection in the store — plain click replaces, shift-click toggles,
// a drag on EMPTY canvas lassos — synchronized across canvas, timeline, and Inspector.
// Selection stays editor UI state only: none of this ever writes code or history.

async function createHairline(page: Page) {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await expect
    .poll(async () =>
      page.frameLocator('iframe.preview-frame').locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity),
    )
    .toBe('1');
}

/** Screen point over a preview element (pad-agnostic — see e2e/_canvas.ts). */
async function partPoint(page: Page, selector: string, dx = 0.5, dy = 0.5) {
  const p = await elementPoint(page, selector, dx, dy);
  return { x: p.x, y: p.y };
}

async function storeSelection(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const s = useTemplateStore.getState();
    return { parts: s.selectedParts, primary: s.selectedPart, history: s.history.length };
  });
}

test('shift-click builds a multi-selection synced across canvas, timeline, and Inspector', async ({ page }) => {
  await createHairline(page);
  const baseline = (await storeSelection(page)).history;

  // Click the Name line, then shift-click the Title line (mouse.click has no modifiers
  // option — hold Shift on the keyboard around the click).
  const p0 = await partPoint(page, '#f0');
  await page.mouse.click(p0.x, p0.y);
  await expect(page.getByTestId('canvas-selection')).toBeVisible();
  const p1 = await partPoint(page, '#f1');
  await page.keyboard.down('Shift');
  await page.mouse.click(p1.x, p1.y);
  await page.keyboard.up('Shift');

  // The store holds both, primary first; the canvas shows a chip + a secondary outline.
  let sel = await storeSelection(page);
  expect(sel.parts).toEqual(['#f0', '#f1']);
  expect(sel.primary).toBe('#f0');
  await expect(page.getByTestId('canvas-selection-extra')).toHaveCount(1);
  // Both timeline rows wash; the Inspector shows the primary plus the multi note.
  await expect(page.locator('.tlv2-labels .timeline-label[data-part="#f0"]')).toHaveClass(/selected/);
  await expect(page.locator('.tlv2-labels .timeline-label[data-part="#f1"]')).toHaveClass(/selected/);
  await expect(page.getByTestId('inspector-part-label')).toHaveText('Name');
  await expect(page.getByTestId('inspector-multi')).toContainText('+1 more');

  // Shift-click the Name again: it leaves the selection; Title becomes primary.
  const p0b = await partPoint(page, '#f0');
  await page.keyboard.down('Shift');
  await page.mouse.click(p0b.x, p0b.y);
  await page.keyboard.up('Shift');
  sel = await storeSelection(page);
  expect(sel.parts).toEqual(['#f1']);
  expect(sel.primary).toBe('#f1');

  // Escape clears everything; selection never wrote history.
  await page.keyboard.press('Escape');
  sel = await storeSelection(page);
  expect(sel.parts).toEqual([]);
  expect(sel.history).toBe(baseline);
});

test('preview zoom: the buttons scale the viewport, and a click still hits the right element', async ({ page }) => {
  await createHairline(page);
  const reset = page.getByTestId('zoom-reset');
  await expect(reset).toHaveText('100%'); // the default is fit
  const iframeTransform = () => page.locator('.preview-frame').evaluate((el) => (el as HTMLElement).style.transform);
  const fitTransform = await iframeTransform();

  // Zoom in — the readout and the iframe scale both change.
  await page.getByTestId('zoom-in').click();
  await expect(reset).toHaveText('125%');
  expect(await iframeTransform()).not.toBe(fitTransform);

  // Coordinate correctness under zoom: partPoint derives the live scale from the layer, so
  // a click lands on #f0 even though the canvas is now 1.25× (selection never wrote history).
  const p = await partPoint(page, '#f0');
  await page.mouse.click(p.x, p.y);
  expect((await storeSelection(page)).primary).toBe('#f0');

  // Reset returns to fit.
  await reset.click();
  await expect(reset).toHaveText('100%');
  expect(await iframeTransform()).toBe(fitTransform);
});

test('timeline labels shift-click into the same multi-selection', async ({ page }) => {
  await createHairline(page);
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  await page.locator('.tlv2-labels .timeline-label[data-part="#f1"]').click({ modifiers: ['Shift'] });
  const sel = await storeSelection(page);
  expect(sel.parts).toEqual(['#f0', '#f1']);
  // Plain click on a third label REPLACES the selection.
  await page.locator('.tlv2-labels .timeline-label[data-part=".lower-third-accent"]').click();
  expect((await storeSelection(page)).parts).toEqual(['.lower-third-accent']);
});

test('a drag on empty canvas lassos the parts it touches — no code, no history', async ({ page }) => {
  await createHairline(page);
  const baseline = (await storeSelection(page)).history;
  // Fractions are of the TRUE canvas (not the pasteboard overlay), so the lasso starts on
  // empty canvas near the left edge exactly as before the pasteboard existed.
  const canvas = await canvasBox(page);
  const target = await partPoint(page, '.lower-third-box', 0.5, 0.5);

  // Start well above the graphic (empty canvas near the left edge) and sweep down across the
  // whole lower third.
  await page.mouse.move(canvas.x + canvas.width * 0.02, canvas.y + canvas.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(target.x + 60, target.y + 60, { steps: 8 });
  // The marquee is visible mid-drag.
  await expect(page.getByTestId('canvas-lasso')).toBeVisible();
  await page.mouse.up();

  const sel = await storeSelection(page);
  // The sweep crossed the panel and its lines (never the root — a marquee that grabbed
  // the root would make every lasso a whole-graphic selection).
  expect(sel.parts.length).toBeGreaterThanOrEqual(2);
  expect(sel.parts).not.toContain('.lower-third');
  expect(sel.parts).toContain('#f0');
  expect(sel.history).toBe(baseline);

  // The root drag still works untouched: a drag STARTING on the graphic is a move.
  await page.keyboard.press('Escape');
  const start = await partPoint(page, '.lower-third-box', 0.5, 0.5);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 120, start.y - 80, { steps: 6 });
  await expect(page.locator('.move-ghost')).toBeVisible(); // the zone-move ghost, not a lasso
  await page.keyboard.press('Escape');
  await page.mouse.up();
});

test('canvas: a selected layer shows scale + rotate handles that key at the playhead', async ({ page }) => {
  await createHairline(page);
  const hasProp = async (prop: string) =>
    page.evaluate(async (p) => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const d = parseAnimData(useTemplateStore.getState().template.js)!;
      return d.steps.some((s) => (s.layers['#f0']?.[p]?.length ?? 0) > 0);
    }, prop);

  // Select the Name line via its timeline row (a clean single-layer selection).
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  const scaleHandle = page.getByTestId('layer-scale-handle');
  const rotateHandle = page.getByTestId('layer-rotate-handle');
  await expect(scaleHandle).toBeVisible();
  await expect(rotateHandle).toBeVisible();
  expect(await hasProp('scale')).toBe(false);
  expect(await hasProp('rotation')).toBe(false);

  // Drag the corner handle out → a scale keyframe lands on #f0 at the playhead.
  const sh = (await scaleHandle.boundingBox())!;
  await page.mouse.move(sh.x + sh.width / 2, sh.y + sh.height / 2);
  await page.mouse.down();
  await page.mouse.move(sh.x + 70, sh.y + 70, { steps: 10 });
  await page.mouse.up();
  // The keyed apply rebuilds the preview; let it land before grabbing the next handle, or the
  // overlay re-render can swallow the rotate drag mid-gesture.
  await awaitPreviewRebuild(page);
  await expect.poll(() => hasProp('scale')).toBe(true);

  // Drag the top handle sideways → a rotation keyframe lands too.
  const rh = (await rotateHandle.boundingBox())!;
  await page.mouse.move(rh.x + rh.width / 2, rh.y + rh.height / 2);
  await page.mouse.down();
  await page.mouse.move(rh.x + 60, rh.y + 30, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => hasProp('rotation')).toBe(true);
});
