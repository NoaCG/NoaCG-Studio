// covers: none - its subject, src/model/layout.ts, is CORE: a change there runs the full suite, or
// the focus set this spec is in
//
// focus

import { test, expect, type Page } from '@playwright/test';
import { createProject } from './_create';
import { chooseType } from './_browse';
import { awaitDurableReady, settleDurableWrites } from './_durable';

// The flexible dockable-panel workspace (model/layout.ts): the canvas over the timeline in the
// centre, flanked by left/right docks (plus an optional bottom dock), each hosting any panels as
// tabs that can be shown, hidden, resized, and moved between docks. Runs at Playwright's default
// 1280×720 viewport (> 768px → the desktop dock layout, not the mobile stack).

async function createHairline(page: Page) {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
}

test('the default framing: code CLOSED, Inspector + tools on the right, timeline in the centre', async ({ page }) => {
  await createHairline(page);
  // The code panel starts CLOSED, so there is no left dock and the canvas gets that width.
  // Code is never hidden behind a scene model - the VIEW is optional, and the topbar opens it.
  await expect(page.getByTestId('dock-slot-left')).toHaveCount(0);
  await expect(page.getByTestId('dock-tab-code')).toHaveCount(0);
  await expect(page.getByTestId('toggle-code')).toContainText('Show code');
  await expect(page.locator('[data-testid="dock-right"] .dock-tab.active .dock-tab-label')).toHaveText('Inspector');
  for (const id of ['data', 'control', 'style', 'assets', 'ai', 'export']) {
    await expect(page.getByTestId(`dock-tab-${id}`)).toBeVisible();
  }
  // The timeline lives in the centre below the canvas — it spans the whole centre width.
  const stage = (await page.getByTestId('center-stage').boundingBox())!;
  const timeline = (await page.getByTestId('center-timeline').boundingBox())!;
  expect(Math.abs(timeline.width - stage.width)).toBeLessThan(4);
  expect(timeline.y).toBeGreaterThanOrEqual(stage.y + stage.height - 8);
});

test('opening the code pane narrows the centre, and the OPEN state persists', async ({ page }) => {
  await createHairline(page);
  const centerClosed = (await page.getByTestId('center-stage').boundingBox())!.width;

  // Open the code editor from the topbar — the left dock appears and the centre gives way.
  await page.getByTestId('toggle-code').click();
  await expect(page.getByTestId('dock-slot-left')).toBeVisible();
  await expect(page.getByTestId('dock-tab-code')).toBeVisible();
  const centerOpen = (await page.getByTestId('center-stage').boundingBox())!.width;
  expect(centerOpen).toBeLessThan(centerClosed);

  // A pro who opens code keeps it: the choice survives a reload like any other dock state.
  // (The reload restores the project directly — no startup wizard to dismiss.)
  await page.reload();
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.getByTestId('dock-slot-left')).toBeVisible();
  await expect(page.getByTestId('dock-tab-code')).toBeVisible();
});

test('closing a panel removes its dock and widens the centre; the closed state persists', async ({ page }) => {
  await createHairline(page);
  // Start from code OPEN (the default is closed), so this covers the close direction.
  await page.getByTestId('toggle-code').click();
  await expect(page.getByTestId('dock-slot-left')).toBeVisible();
  const centerBefore = (await page.getByTestId('center-stage').boundingBox())!.width;

  // Close the code editor — the left dock disappears and the centre widens.
  await page.getByTestId('toggle-code').click();
  await expect(page.getByTestId('dock-slot-left')).toHaveCount(0);
  const centerAfter = (await page.getByTestId('center-stage').boundingBox())!.width;
  expect(centerAfter).toBeGreaterThan(centerBefore);

  // It stays closed across a reload, and is offered again from a dock's "+" menu.
  // (The reload restores the project directly — no startup wizard to dismiss.)
  await page.reload();
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.getByTestId('dock-slot-left')).toHaveCount(0);
  await page.getByTestId('dock-add-right').click();
  await expect(page.locator('[data-testid="dock-right"] .dock-menu')).toContainText('Code');
});

test('dragging a dock divider resizes it, and the size persists', async ({ page }) => {
  await createHairline(page);
  // The left dock is empty by default now, so open the code pane to have a divider to drag.
  await page.getByTestId('toggle-code').click();
  await expect(page.getByTestId('dock-slot-left')).toBeVisible();
  const leftBefore = (await page.getByTestId('dock-slot-left').boundingBox())!.width;

  // Drag the left divider RIGHT by 120px (raw move/down/move/up — pointer capture needs real moves).
  const div = (await page.getByTestId('left-divider').boundingBox())!;
  const cx = div.x + div.width / 2;
  const cy = div.y + div.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy, { steps: 8 });
  await page.mouse.up();

  const leftAfter = (await page.getByTestId('dock-slot-left').boundingBox())!.width;
  expect(leftAfter).toBeGreaterThan(leftBefore + 40);

  // The wider size survives a reload (which restores the project directly — no wizard).
  await page.reload();
  await expect(page.getByTestId('dock-slot-left')).toBeVisible();
  const leftReload = (await page.getByTestId('dock-slot-left').boundingBox())!.width;
  expect(Math.abs(leftReload - leftAfter)).toBeLessThan(30);
});

test('a panel moves between docks via its tab menu', async ({ page }) => {
  await createHairline(page);
  // The Style tool starts in the right dock; move it to the left dock.
  await expect(page.locator('[data-testid="dock-left"] [data-testid="dock-tab-style"]')).toHaveCount(0);
  await page.getByTestId('dock-tab-menu-style').click();
  await page.locator('[data-testid="dock-right"] .dock-menu', { hasText: 'Move to left' }).getByText('Move to left').click();
  await expect(page.locator('[data-testid="dock-left"] [data-testid="dock-tab-style"]')).toBeVisible();
  // It became the active tab in its new dock (its body shows).
  await expect(page.locator('[data-testid="dock-left"] .dock-tab.active .dock-tab-label')).toHaveText('Style');
});

test('the timeline sits in the centre at an editing scale with real room', async ({ page }) => {
  await createHairline(page);
  await expect(page.getByTestId('timeline-v2')).toBeVisible();
  // Layer rows are real editing targets, and read at UI size.
  const row = (await page.locator('.tlv2-row').first().boundingBox())!;
  expect(row.height).toBeGreaterThanOrEqual(26);
  const labelSize = await page
    .locator('.tlv2-labels .timeline-label')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(labelSize).toBeGreaterThanOrEqual(12);
  // The timeline area is a substantial slice of the centre height (not a thin strip).
  const center = (await page.getByTestId('center-stage').boundingBox())!;
  const timeline = (await page.getByTestId('center-timeline').boundingBox())!;
  expect(timeline.height).toBeGreaterThan(center.height * 0.3);
});

test('the timeline height is resizable via the centre divider, and persists', async ({ page }) => {
  await createHairline(page);
  const tlBefore = (await page.getByTestId('center-timeline').boundingBox())!.height;

  // Drag the timeline divider UP by 100px to give the timeline more room.
  const div = (await page.getByTestId('timeline-divider').boundingBox())!;
  const cx = div.x + div.width / 2;
  const cy = div.y + div.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 100, { steps: 8 });
  await page.mouse.up();

  const tlAfter = (await page.getByTestId('center-timeline').boundingBox())!.height;
  expect(tlAfter).toBeGreaterThan(tlBefore + 40);

  await page.reload();
  await expect(page.getByTestId('center-timeline')).toBeVisible();
  const tlReload = (await page.getByTestId('center-timeline').boundingBox())!.height;
  expect(Math.abs(tlReload - tlAfter)).toBeLessThan(30);
});

// ── Mobile (≤768px): the single-column stack. The desktop dock model does not apply, so the
//    SidePanel strip is the ONLY way to reach a panel — which is why the Inspector is in it. ──

test('mobile: the Inspector is a panel tab, so a selected layer can still be edited', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createHairline(page);

  // Without this tab a phone could add fields but never edit the layer they create: the
  // Inspector is where a selection's properties, design, and motion all live.
  await page.getByTestId('panel-tab-inspector').click();
  await expect(page.getByTestId('inspector')).toBeVisible();
  await expect(page.getByTestId('inspector-empty')).toBeVisible();

  // Selecting a layer fills it in, on the phone layout too.
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  await expect(page.getByTestId('inspector-part-label')).toBeVisible();

  // The tool panels still render in the shared padded body beside it.
  await page.getByTestId('panel-tab-data').click();
  await expect(page.locator('.panel-body')).toContainText('Content');
});

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
  await page.goto('/app#/home');
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
