// covers: src/templates/shared/base.ts
// covers: src/components/wizard/**, !src/components/wizard/import/**

import { test, expect, type FrameLocator } from '@playwright/test';
import { finishIntoNewEditor } from './_create';
import { mountWorkingDocument } from './_frame';
import { chooseType, pickDesign } from './_browse';

// The zone+nudge code patch (zoneCssText, src/templates/shared/base.ts) that re-anchors a
// graphic. The old canvas's direct manipulation (deleted on 2026-10-17) wrote it from a drag;
// the wizard's Style step writes the same patch from its zone picker, and that is the door
// this case takes. The new editor's own canvas gestures are editor-base-edits's and
// editor-transforms's.

/** The root rule's anchoring sides from the composed document's stylesheet (behavior-true: what
 *  renders). Read as style properties, not cssText — Chrome serializes the sides into the
 *  `inset` shorthand. */
async function rootAnchor(doc: FrameLocator): Promise<{ top: string; right: string; bottom: string; left: string }> {
  return doc.locator('body').evaluate(() => {
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

test('the Style step re-anchors the graphic via a zone+nudge code patch', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, 'Lower thirds');
  await pickDesign(page, 'Hairline'); // home zone: bottom-left
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields
  await page.getByRole('button', { name: 'Next →' }).click(); // Style
  const more = page.getByTestId('wz-size-position');
  await more.locator('summary').click();
  await page.locator('.wz-zone[title="top-right"]').click();
  await expect(more.locator('summary')).toContainText('top right');
  await finishIntoNewEditor(page);

  // The patch landed in the created code: the root rule anchors top-right and nothing else.
  // Freshly generated code omits the explicit `auto` resets (zoneCssText), so an unset side
  // reads as an empty property rather than `auto`.
  const unset = ['', 'auto'];
  const anchor = await rootAnchor(await mountWorkingDocument(page));
  expect(unset).not.toContain(anchor.right);
  expect(unset).not.toContain(anchor.top);
  expect(unset).toContain(anchor.left);
  expect(unset).toContain(anchor.bottom);
});
