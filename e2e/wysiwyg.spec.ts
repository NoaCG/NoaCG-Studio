// covers: src/templates/shared/base.ts

import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { createProject } from './_create';
import { showCode } from './_code';
import { canvasBox } from './_canvas';

// The old canvas's direct manipulation (src/components/canvas/CanvasInteraction.tsx, deleted on
// 2026-10-17 with the three cases that drove it) wrote the same zone+nudge patch the wizard's
// Style step writes (zoneCssText, src/templates/shared/base.ts). The case left asserts that patch
// on the preview root; it still boots through the retired helper and skips until it is rewritten
// onto the wizard (issue #800).

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
