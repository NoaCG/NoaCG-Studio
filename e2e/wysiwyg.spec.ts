// covers: src/components/canvas/**

import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { createProject } from './_create';
import { showCode } from './_code';
import { canvasBox } from './_canvas';

// Era 6 — direct manipulation (docs/WYSIWYG_PLAN.md, revised: NO move mode). The canvas
// layer is always on: a drag that STARTS on the graphic re-anchors it via the same
// zone+nudge patch the Style panel writes; drags on empty canvas do nothing; Esc cancels.
// The preview shows the settled graphic at rest, so there is always something to grab.

async function createHairline(page: Page) {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  // The subject is the CODE PATCH a drag writes, so the pane (closed by default) must be open.
  await showCode(page);
}

/** The root rule's anchoring sides from the PREVIEW's stylesheet (behavior-true: what renders).
 *  Read as style properties, not cssText — Chrome serializes the sides into the `inset` shorthand. */
async function rootAnchor(page: Page): Promise<{ top: string; right: string; bottom: string; left: string }> {
  return page.frameLocator('iframe.preview-frame').locator('body').evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSStyleRule && rule.selectorText === '.lower-third') {
          const s = rule.style;
          return { top: s.top, right: s.right, bottom: s.bottom, left: s.left };
        }
      }
    }
    return { top: '', right: '', bottom: '', left: '' };
  });
}

/** Wait until the preview shows the settled graphic (the design view after every rebuild). */
async function waitSettled(page: Page) {
  await expect
    .poll(async () =>
      page.frameLocator('iframe.preview-frame').locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity),
    )
    .toBe('1');
}

test('dragging the graphic re-anchors it via a zone+nudge code patch (no mode)', async ({ page }) => {
  await createHairline(page); // default zone: bottom-left
  const before = await rootAnchor(page);
  expect(before.bottom).not.toBe('auto');
  await waitSettled(page); // the canvas layer is always on; the graphic is visible at rest

  // Drag from the graphic's home (bottom-left) up to the top-right third.
  const box = await canvasBox(page); // fractions are of the TRUE canvas, not the pasteboard
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.82);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.15, { steps: 8 });
  await page.mouse.up();

  // The patch lands in the code, the preview rebuilds, and the root rule now anchors top-right.
  await awaitPreviewRebuild(page);
  const anchor = await rootAnchor(page);
  expect(anchor.right).not.toBe('auto');
  expect(anchor.top).not.toBe('auto');
  expect(anchor.left).toBe('auto');
  expect(anchor.bottom).toBe('auto');

  // The editor followed the gesture: the CSS tab is active with the patched rule highlighted,
  // and switching away marks the CSS tab with a change dot until the user sees the change.
  await expect(page.locator('.tabs .tab.active')).toHaveText('CSS');
  await expect(page.locator('.editor-host .changed-line').first()).toBeVisible({ timeout: 5000 });
  await page.locator('.tabs .tab', { hasText: 'HTML' }).click();
  await expect(page.locator('.tabs .tab', { hasText: 'CSS' }).locator('.change-dot')).toBeVisible();

  // Undo restores the exact previous anchoring — the drag itself is one undoable apply.
  await page.keyboard.press('Control+z');
  await awaitPreviewRebuild(page);
  expect(await rootAnchor(page)).toEqual(before);
});

test('W2: dragging the corner handle writes the --scale variable', async ({ page }) => {
  await createHairline(page);
  await waitSettled(page);

  // Hovering the graphic reveals the corner scale handle.
  const box = await canvasBox(page); // fractions are of the TRUE canvas, not the pasteboard
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.82);
  const handle = page.getByTestId('scale-handle');
  await expect(handle).toBeVisible();

  // Drag it to the right — the graphic grows, and the handle tracks its real corner.
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + 5, hb.y + 5);
  await page.mouse.down();
  await page.mouse.move(hb.x + 5 + box.width * 0.15, hb.y + 5, { steps: 6 });
  const mid = (await handle.boundingBox())!;
  expect(mid.x).toBeGreaterThan(hb.x + 10); // the handle followed the growing corner
  await page.mouse.up();

  // One --scale patch (the Style panel's size mechanism), visible in the rebuilt preview.
  await awaitPreviewRebuild(page);
  const scaleVar = await page
    .frameLocator('iframe.preview-frame')
    .locator('body')
    .evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--scale').trim());
  expect(Number(scaleVar)).toBeGreaterThan(1);
  expect(Number(scaleVar)).toBeLessThanOrEqual(4); // the drag's sanity clamp

  // The generated wrap cap follows --scale, so resizing widens the box instead of wrapping it.
  const boxMax = await page.frameLocator('iframe.preview-frame').locator('body').evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSStyleRule && rule.selectorText === '.lower-third-box') return rule.style.maxWidth;
      }
    }
    return '';
  });
  expect(boxMax).toContain('var(--scale)');

  // The resize is one undoable apply: Ctrl+Z returns the graphic to its original size.
  await page.keyboard.press('Control+z');
  await awaitPreviewRebuild(page);
  const undone = await page
    .frameLocator('iframe.preview-frame')
    .locator('body')
    .evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--scale').trim());
  expect(Number(undone)).toBe(1);
});

test('a drag starting on empty canvas does nothing', async ({ page }) => {
  await createHairline(page);
  await waitSettled(page);
  const before = await rootAnchor(page);

  // Start in the top-middle — far from the bottom-left graphic.
  const box = await canvasBox(page); // fractions are of the TRUE canvas, not the pasteboard
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6, { steps: 4 });
  await page.mouse.up();

  await page.waitForTimeout(650); // KEEP as a sleep: this asserts nothing changes, so no rebuild ever comes
  expect(await rootAnchor(page)).toEqual(before);
});

test('Escape cancels a drag without touching the code', async ({ page }) => {
  await createHairline(page);
  await waitSettled(page);
  const before = await rootAnchor(page);

  const box = await canvasBox(page); // fractions are of the TRUE canvas, not the pasteboard
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.82);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();

  await page.waitForTimeout(650); // KEEP as a sleep: this asserts nothing changes, so no rebuild ever comes
  expect(await rootAnchor(page)).toEqual(before);
});
