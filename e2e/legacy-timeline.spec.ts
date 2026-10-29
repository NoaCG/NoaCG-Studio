// covers: src/blocks/**

import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { bootstrapGraphic } from './_create';
import { applyLegacyRegion } from './_legacy';

// PHASE 8 — what happens to a LEGACY TEMPLATE now that the classic strip's editing patchers are
// gone (docs/STATE_MACHINE_SCHEMA.md, DYNAMIC_MOTION_SCOPE §8.1).
//
// This suite replaced the old 33-test classic-strip suite. Those tests drove the strip's literal
// patchers — bar drags, edge resizes, ease chips, the enters-from drawer, phase preset swaps,
// the steps toggle. All of that is deleted, because motion is now edited as DATA, and the new
// editor's timeline and keyframe edits are pinned by e2e/editor-*.spec.ts.
//
// What is left to guarantee, and what this suite covers, is that a template written before the
// migration still WORKS. The dock, the read-only chart and the escape hatch were the retired
// code editor's surfaces (src/components/timeline/LegacyTimeline.tsx, deleted on 2026-10-17 with
// the four cases that drove them); the one case left asserts that a legacy template still
// renders settled, on the document every card and thumbnail composes (settleGraphic's recipe).
//
// The subject is a Hairline Card (card01), the old suite's own fixture — created as a data block
// now, then rewritten to legacy code, which is exactly what an old saved project holds.

async function createCard(page: Page) {
  await bootstrapGraphic(page, { category: 'Info cards', name: 'Hairline Card' });
}

/** The working graphic composed the way every card and thumbnail shows it: settled with its
 *  sample data (composeDocument's settleWithData, the shared settleGraphic recipe), mounted in
 *  a hidden iframe. */
async function settledDocument(page: Page): Promise<FrameLocator> {
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    document.querySelectorAll('iframe.settled-document').forEach((f) => f.remove());
    const f = document.createElement('iframe');
    f.className = 'settled-document';
    f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1920px;height:1080px;';
    document.body.appendChild(f);
    const { template, sampleData } = useTemplateStore.getState();
    await new Promise((res) => {
      f.onload = res;
      f.srcdoc = composeDocument(template, { settleWithData: JSON.stringify(sampleData) });
    });
  });
  return page.frameLocator('iframe.settled-document');
}

test('the settled design view still works on a legacy template — no Play needed', async ({ page }) => {
  await createCard(page);
  // A saved legacy project (ordinary motion, importable). The canvas shows the graphic SETTLED
  // after every rebuild, whatever surface charts it — never blank, never waiting for Play.
  await applyLegacyRegion(page, { prefix: 'info-card', presetId: 'line-reveal' });
  const doc = await settledDocument(page);
  await expect
    .poll(async () => doc.locator('.info-card').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  await expect(doc.locator('#f0')).toHaveText('The Story in Numbers');
});
