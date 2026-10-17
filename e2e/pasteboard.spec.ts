// covers: src/preview/composeDocument.ts

import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { createProject } from './_create';
import { elementPoint } from './_canvas';

// The off-canvas pasteboard (src/components/canvas/pasteboard.ts, the retired code editor's
// working margin) was deleted on 2026-10-17 with the four cases that drove it. What is left is
// the invariant that outlived it: the pad never entered persisted state, and an exported document
// stays clipped to the canvas. It still boots through the retired helper and skips until it is
// rewritten onto the composer (issue #800).

async function createHairline(page: Page) {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await expect(page.getByTestId('timeline-v2')).toBeVisible();
}

/** Select the Name line (#f0) and park the playhead mid-entrance so a canvas drag keys x/y. */
async function selectAndPark(page: Page, t = 0.35) {
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  await expect(page.getByTestId('inspector')).toBeVisible({ timeout: 3000 });
  await page.evaluate((time) => {
    void (async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const s = useTemplateStore.getState();
      s.setPlayhead({ step: 0, t: time });
      s.sendScrub('in', time);
    })();
  }, t);
  await page.waitForTimeout(200);
}

test('the pasteboard pad never enters persisted state; export stays clipped to the canvas', async ({ page }) => {
  await createHairline(page);
  await selectAndPark(page);
  const start = await elementPoint(page, '#f0');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 300 * start.scale, start.y, { steps: 8 });
  await page.mouse.up();
  await awaitPreviewRebuild(page);

  const probe = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const { computePad } = await import('/src/components/canvas/pasteboard.ts');
    const tpl = useTemplateStore.getState().template;
    const { padX } = computePad(tpl);
    return {
      padX,
      // The preview/export composition WITHOUT authoring keeps the canvas clip and no pasteboard.
      exportDoc: composeDocument(tpl),
      authoringDoc: composeDocument(tpl, { authoring: { padX, padY: 0 } }),
      // Everything persisted lives in the template — serialize it whole and search for the pad.
      serialized: JSON.stringify(tpl),
    };
  });

  // Sanity: the pad is real (non-zero) so the negative-below tests are meaningful.
  expect(probe.padX).toBeGreaterThan(0);
  // Semantic, not numeric: the persisted template carries no authoring/pad concept at all.
  expect(probe.serialized).not.toContain('pasteboard');
  expect(probe.serialized).not.toContain('padX');
  expect(probe.serialized).not.toContain('spx-authoring-style');
  // The exported/on-air document clips to the true canvas; only the authoring preview opts in.
  expect(probe.exportDoc).toContain('overflow: hidden');
  expect(probe.exportDoc).not.toContain('spx-authoring-style');
  expect(probe.authoringDoc).toContain('spx-authoring-style');
});
