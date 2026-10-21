// covers: src/components/home/**, src/components/wizard/**, !src/components/wizard/import/**
// covers: src/control/playoutSession.ts, src/control/productionDataSession.ts
//
// focus

import { test, expect } from '@playwright/test';
import { chooseType } from './_browse';
import { awaitDurableReady, settleDurableWrites } from './_durable';

// The dockable-panel workspace (model/layout.ts over the retired code editor's docks) was
// deleted on 2026-10-17 with the eight cases that drove it. What is left is the MOBILE stack
// (≤768px): Home and the wizard as a single column on a phone-width viewport.

test('mobile: Home leads with Productions and a dashboard is two taps from open', async ({ page }) => {
  // The student phone path (docs/GOALS_ARCHIVE.md "Student release" step 8): open the app, tap the
  // production's Open dashboard — two taps to a control surface. Seed a saved graphic + a
  // production with it, as a returning student's device would hold.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app');
  // The seed waits for the saved library to load, and lands before the page moves on: written
  // earlier, hydration can replace it with the empty library it loaded (e2e/AGENTS.md).
  await awaitDurableReady(page);
  await page.evaluate(async () => {
    const { createBlankTemplate } = await import('/src/templates/blank.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { createShowNamed, addGraphicToShow } = await import('/src/model/shows.ts');
    const tpl = createBlankTemplate();
    const { doc } = createGraphic(tpl, { name: 'Phone strap' });
    const show = createShowNamed('Morning show');
    addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
  });
  await settleDurableWrites(page);
  // Boot Home from the returning device's committed library. A hash-only navigation keeps
  // Home mounted and can leave its initial empty read when the off-UI seed misses its listener.
  await page.goto('/app#/home');
  await page.reload();
  await expect(page.getByTestId('home-page')).toBeVisible();

  // Tap 1 is opening the app; the dashboard door is the FIRST actionable block on Home —
  // above the graphics list — and is a 44px touch target.
  const open = page.getByTestId('open-production');
  const openBox = (await open.boundingBox())!;
  expect(openBox.height).toBeGreaterThanOrEqual(44);
  // The dashboard shows graphics as a SHELF of cards now, not library rows — the assertion
  // is unchanged: productions lead, so the door to one sits above the first graphic.
  const firstGraphic = await page.getByTestId('shelf-graphic').first().boundingBox();
  expect(openBox.y).toBeLessThan(firstGraphic!.y);

  // Tap 2 lands on the production dashboard.
  await open.click();
  await expect(page.getByTestId('production-page')).toBeVisible();
});

test('mobile: the wizard preview keeps a real stage instead of collapsing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();
  // The type select sits outside the filter disclosure; opening it is harmless.
  await page.locator('.wz-browse-drawer-btn').click();
  await chooseType(page, 'Lower thirds');
  await page.locator('.wz-variant').first().click();

  // Stacked, the aside must still be given a height: `flex: 0 0 50%`'s flex-grow of 0 once
  // left it sized to its content, collapsing the stage to nothing and pushing the preview
  // iframe outside its own box.
  const side = (await page.locator('.wz-side').boundingBox())!;
  const stage = (await page.locator('.wz-stage').boundingBox())!;
  const frame = (await page.locator('.wz-side iframe').boundingBox())!;
  expect(side.height).toBeGreaterThan(200);
  expect(stage.height).toBeGreaterThan(140);
  // The iframe sits INSIDE the stage, not spilling out above it.
  expect(frame.y).toBeGreaterThanOrEqual(stage.y - 1);
  expect(frame.y + frame.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
});
