// covers: src/blocks/**
// covers: src/components/timeline/{StepTimeline.tsx,LegacyTimeline.tsx,Inspector.tsx,PlayoutSimulator.tsx}

import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { createProject } from './_create';
import { showCode } from './_code';
import { applyLegacyRegion, applyUnconvertibleRegion, applyUnreadableRegion } from './_legacy';

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
// migration still WORKS:
//   1. the dock picks the surface from the CODE, never from the category;
//   2. a legacy region the importer can read is shown truthfully and can be converted;
//   3. one it CANNOT read is still charted, read-only and honest, and never silently regenerated;
//   4. the escape hatch out of unconvertible code leads to DATA, and undo brings the hand-written
//      version straight back.
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

const templateJs = (page: Page) =>
  page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.js;
  });

test('the dock picks the surface from the CODE: data edits, readable legacy converts', async ({ page }) => {
  await createCard(page);
  // Created as data: the step timeline, editable, no chips.
  await expect(page.getByTestId('timeline-v2')).toBeVisible();
  await expect(page.getByTestId('timeline-v2-convert')).toHaveCount(0);

  // Rewritten as legacy code, the SAME template gets the step timeline READ-ONLY plus the one
  // action that surface offers — the code decides, not the category.
  await applyLegacyRegion(page, { prefix: 'info-card', presetId: 'line-reveal' });
  await expect(page.getByTestId('timeline-v2')).toBeVisible();
  await expect(page.getByTestId('timeline-v2-convert')).toBeVisible();

  // "Use keyframes" rewrites the region as data — one undoable apply, and the code is shown.
  await page.getByTestId('timeline-v2-convert').click();
  await awaitPreviewRebuild(page);
  expect(await templateJs(page)).toContain('var NOACG_ANIM');
  await expect(page.locator('.tabs .tab.active')).toHaveText('JS');
  await expect(page.getByTestId('timeline-v2-convert')).toHaveCount(0); // nothing left to convert

  // Undo restores the legacy code, and with it the read-only surface.
  await page.keyboard.press('Control+z');
  await awaitPreviewRebuild(page);
  expect(await templateJs(page)).not.toContain('var NOACG_ANIM');
  await expect(page.getByTestId('timeline-v2-convert')).toBeVisible();
});

test('a region the importer refuses is still CHARTED — read-only, and honest about why', async ({ page }) => {
  await createCard(page);
  // Measured motion written inline: the travel is read off the DOM, so no keyframe can hold it.
  // The importer refuses it rather than guessing, and regenerating it would discard the owner's
  // tuning — so the timeline must still show the truth.
  await applyUnconvertibleRegion(page, 'info-card');

  // It charts the real playout on the real clocks: an endless entrance, the hold, a 0.30s exit.
  await expect(page.getByTestId('timeline-ov-sec-in')).toContainText('∞');
  await expect(page.getByTestId('timeline-ov-sec-out')).toContainText('0.30s');
  expect(await page.locator('.timeline-bar').count()).toBeGreaterThan(0);
  // Rows are named by the shared registry, exactly as everywhere else.
  await expect(page.locator('.timeline-ov-labels .timeline-label').first()).toHaveText('Panel');

  // It says WHY it cannot be edited here, and offers no affordance it does not have: no convert
  // chip (it cannot be converted), and none of the old strip's editing controls exist any more.
  await expect(page.getByTestId('timeline-readonly-note')).toBeVisible();
  await expect(page.getByTestId('timeline-v2-convert')).toHaveCount(0);
  for (const gone of ['timeline-phase-preset', 'timeline-speed', 'timeline-out-mode', 'timeline-seg-in']) {
    await expect(page.getByTestId(gone)).toHaveCount(0);
  }
  expect(await page.locator('.timeline-bar.editable').count()).toBe(0);
});

test('scrubbing the read-only chart drives the preview and writes nothing', async ({ page }) => {
  await createCard(page);
  await applyUnconvertibleRegion(page, 'info-card');
  const before = await templateJs(page);

  const playhead = page.getByTestId('timeline-playhead');
  const x0 = (await playhead.boundingBox())!.x;
  await page.getByTestId('timeline-scrub').fill('0.35');
  await page.waitForTimeout(300);

  await expect(page.getByTestId('timeline-time')).toHaveText('0.35s');
  // The playhead followed. It MOVED rather than moved right: idle parks it at the settled end
  // of the entrance, so scrubbing back to 0.35s walks it left.
  expect(Math.abs((await playhead.boundingBox())!.x - x0)).toBeGreaterThan(4);
  expect(await templateJs(page)).toBe(before); // reading the code, never writing it
});

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

test('start over: the escape hatch out of unconvertible code writes DATA, and undo goes back', async ({ page }) => {
  await createCard(page);
  await applyUnreadableRegion(page); // hand-crafted past every shape we can parse
  const handWritten = await templateJs(page);

  // The one write this surface offers. It does not edit the hand-written motion — it replaces
  // the region with a preset, as modern data, so the way out of legacy code leads FORWARD.
  await awaitPreviewRebuild(page, () =>
    page.getByTestId('timeline-preset-reset').selectOption('slide-up'),
  );
  const js = await templateJs(page);
  expect(js).toContain('var NOACG_ANIM'); // data, never a fresh legacy region
  expect(js).not.toContain('var animSpeed =');
  await expect(page.locator('.tabs .tab.active')).toHaveText('JS'); // the new code is shown
  await expect(page.getByTestId('timeline-v2')).toBeVisible(); // and it is fully editable

  // Undo brings the hand-written version straight back, exactly as it was.
  await awaitPreviewRebuild(page, () => page.keyboard.press('Control+z'));
  expect(await templateJs(page)).toBe(handWritten);
  await expect(page.getByTestId('timeline-unreadable')).toBeVisible();
});
