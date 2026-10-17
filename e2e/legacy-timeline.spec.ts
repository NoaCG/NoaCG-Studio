// covers: src/blocks/**

import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { createProject } from './_create';
import { showCode } from './_code';
import { applyLegacyRegion } from './_legacy';

// PHASE 8 — what happens to a LEGACY TEMPLATE now that the classic strip's editing patchers are
// gone (docs/TIMELINE_V2_PLAN.md, DYNAMIC_MOTION_SCOPE §8.1).
//
// This suite replaces the old 33-test classic-strip suite. Those tests drove the strip's literal
// patchers — bar drags, edge resizes, ease chips, the enters-from drawer, phase preset swaps,
// the steps toggle. All of that is deleted, because motion is now edited as DATA, and every one
// of those capabilities has an equivalent on the step timeline that e2e/timeline-v2.spec.ts
// already pins. Nothing about the product's editing model is untested; it just moved.
//
// What is left to guarantee, and what this suite covers, is that a template written before the
// migration still WORKS. The dock, the read-only chart and the escape hatch were the retired
// code editor's surfaces (src/components/timeline/LegacyTimeline.tsx, deleted on 2026-10-17 with
// the four cases that drove them); the one case left asserts that a legacy template still
// renders settled, and skips until it is rewritten onto a current surface (issue #800).
//
// The subject is a Hairline Card (card01), the old suite's own fixture — created as a data block
// now, then rewritten to legacy code, which is exactly what an old saved project holds.

async function createCard(page: Page) {
  await createProject(page, { category: 'Info cards', name: 'Hairline Card' });
  // Several cases assert which code TAB the surface jumps to, so the pane must be open.
  await showCode(page);
}

function frame(page: Page): FrameLocator {
  return page.frameLocator('iframe.preview-frame');
}

test('the settled design view still works on a legacy template — no Play needed', async ({ page }) => {
  await createCard(page);
  // A saved legacy project (ordinary motion, importable). The canvas shows the graphic SETTLED
  // after every rebuild, whatever surface charts it — never blank, never waiting for Play.
  await applyLegacyRegion(page, { prefix: 'info-card', presetId: 'line-reveal' });
  await expect
    .poll(async () => frame(page).locator('.info-card').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  await expect(frame(page).locator('#f0')).toHaveText('The Story in Numbers');
});
