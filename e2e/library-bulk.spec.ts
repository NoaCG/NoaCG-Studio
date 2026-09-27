// covers: src/components/{home,save}/**
// focus

import { test, expect, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';

// The Graphics section's organisation layer (docs/SAVED_CONTENT_MODEL.md §6): multi-select
// with a bulk bar, and FLAT folders — GraphicDoc.folder, one level, additive-optional (no
// version bump), deliberately not the retired packages. Since the 2026-08-23 owner walk the
// folders GROUP the view rather than filtering a flat one, and every "+ Production" door is
// one shared picker whose direction is measured. Everything here drives the real UI over the
// real model layer; the seeds go through createGraphic like any save.

async function seedLibrary(page: Page, names: string[]): Promise<void> {
  await page.goto('/app#/home/graphics');
  await page.keyboard.press('Escape');
  await page.evaluate(async (list: string[]) => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const tpl = variantsFor('lower-third')[0].create({});
    for (const name of list) createGraphic(tpl, { name });
  }, names);
  // Accepted is not landed, and the reload below tears the page down (e2e/_durable.ts) — which
  // is why this seed used to come back short by a graphic every other run.
  await settleDurableWrites(page);
  // RELOAD, never a second goto to the URL this page is already on. The seeds are written into a
  // page that has already rendered its EMPTY library, so something has to make the list re-read
  // the mirror - and /app is HASH-ROUTED (src/app/router.ts). A goto whose hash is unchanged is a
  // same-document navigation that fires no `hashchange`, so the router never runs, nothing
  // re-renders, and the section stays exactly as empty as it was. (The same helper shape in
  // control-panel-types.spec.ts is safe for precisely that reason: its hash CHANGES, so the
  // router does the work.) Measured 2026-08-15: three of six runs failed, on whichever test ran
  // first, each waiting out its full timeout for a testid that only exists once a graphic is
  // listed - `select-graphic`, `folder-cards`. With the reload, six of six pass. The UI
  // assertions are then enough on their own, because the shell cannot render before hydration
  // resolves; the count is asserted HERE so a short seed fails as a seed rather than as a
  // mystery sixty seconds into the test body.
  await page.reload();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('select-graphic')).toHaveCount(names.length);
}

test('multi-select: checkbox + shift-click range, select all, and one-confirm bulk delete', async ({ page }) => {
  await seedLibrary(page, ['Alpha', 'Bravo', 'Charlie', 'Delta']);
  const boxes = page.getByTestId('select-graphic');
  await expect(boxes).toHaveCount(4);

  // Plain click selects one; shift-click extends over the VISIBLE order.
  await boxes.nth(0).click();
  await expect(page.getByTestId('bulk-bar')).toContainText('1 selected');
  await boxes.nth(2).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('bulk-bar')).toContainText('3 selected');

  // Select all covers the rest.
  await page.getByTestId('bulk-bar').getByText('Select all 4').click();
  await expect(page.getByTestId('bulk-bar')).toContainText('4 selected');

  // Delete is armed (two-step), then removes every selected row in one write.
  await page.getByTestId('bulk-delete').click();
  await expect(page.getByTestId('bulk-delete')).toContainText('Delete 4?');
  await page.getByTestId('bulk-delete').click();
  await expect(page.getByTestId('select-graphic')).toHaveCount(0);
  await expect(page.getByTestId('bulk-note')).toContainText('Deleted 4');
});

test('folders GROUP the table: rows first, unfiled under them, opening one shows it alone', async ({ page }) => {
  await seedLibrary(page, ['Strap A', 'Strap B', 'Ticker C']);
  // Folders are one thing in two presentations — cards in the card grid, ROWS in the table
  // (docs/SAVED_CONTENT_MODEL.md §6). This walk is the table half, so it switches the view.
  await page.getByTestId('library-view-list').click();
  const boxes = page.getByTestId('select-graphic');

  // Move two into a NEW folder from the bulk bar.
  await boxes.nth(0).click();
  await boxes.nth(1).click();
  await page.getByTestId('bulk-move-folder').click();
  await page.getByTestId('bulk-new-folder-name').fill('Match Night');
  await page.getByTestId('bulk-new-folder').click();

  // THE GROUPING. The folder is listed, and only the graphic in NO folder is listed under it —
  // the owner's finding was a folder that organised nothing you could see, because every
  // graphic stayed in one flat list below the chips.
  const folder = page.getByTestId('folder-item-Match Night');
  await expect(folder).toContainText('2 graphics');
  await expect(page.locator('.lib-row')).toHaveCount(1);
  const folderBox = (await folder.boundingBox())!;
  const firstRow = (await page.locator('.lib-row').first().boundingBox())!;
  expect(folderBox.y).toBeLessThan(firstRow.y);

  // The folder survives a reload (additive-optional field, persisted with the record). So
  // does the VIEW — it is a device preference (model/prefs.ts), not session state.
  await page.reload();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('library-thead')).toBeVisible();

  // OPENING one shows its contents alone, with the band gone and the way back on screen.
  await page.getByTestId('folder-item-Match Night').getByTestId('open-folder').click();
  await expect(page.getByTestId('folder-head')).toContainText('Match Night');
  await expect(page.getByTestId('folder-items')).toHaveCount(0);
  await expect(page.locator('.lib-row')).toHaveCount(2);
  await page.getByTestId('folder-back').click();
  await expect(page.getByTestId('folder-items')).toBeVisible();
  await expect(page.locator('.lib-row')).toHaveCount(1);

  // A SEARCH dissolves the grouping: the question is about the whole library, so a filed
  // graphic must answer it. Clearing the query restores the grouping.
  await page.getByTestId('home-search').fill('Strap');
  await expect(page.getByTestId('folder-items')).toHaveCount(0);
  await expect(page.locator('.lib-row')).toHaveCount(2);
  await page.getByTestId('home-search').fill('');
  await expect(page.getByTestId('folder-items')).toBeVisible();

  // Unfiling empties the folder, and the folder goes with the data — there is no record.
  await page.getByTestId('folder-item-Match Night').getByTestId('open-folder').click();
  await page.getByTestId('select-graphic').nth(0).click();
  await page.getByTestId('select-graphic').nth(1).click({ modifiers: ['Shift'] });
  await page.getByTestId('bulk-move-folder').click();
  await page.getByTestId('bulk-unfile').click();
  // ...and the view walks back out of the place that no longer exists, rather than sitting in
  // an "empty folder" indistinguishable from a real one.
  await expect(page.getByTestId('folder-head')).toHaveCount(0);
  await expect(page.locator('[data-testid^="folder-item-"]')).toHaveCount(0);
  await expect(page.locator('.lib-row')).toHaveCount(3);
});

test('search is GLOBAL: it says which folder each match came from, and gives the folder back', async ({ page }) => {
  // The owner ratified the scope on 2026-08-23: folders are the browsing structure, search is
  // a question about the WHOLE library. Two obligations come with that — a match has to say
  // where it lives, or a flat answer loses the structure it crossed; and clearing the query has
  // to put you back where you were standing, or every search costs a walk back in.
  // The CARD grid is the default view (model/prefs libraryView), so it is what this walks.
  await seedLibrary(page, ['Strap A', 'Strap B', 'Ticker C']);
  const boxes = page.getByTestId('select-graphic');
  await boxes.nth(0).click();
  await page.getByTestId('bulk-move-folder').click();
  await page.getByTestId('bulk-new-folder-name').fill('Match Night');
  await page.getByTestId('bulk-new-folder').click();

  // Stand INSIDE the folder — the case where a global search costs the most if it forgets.
  await page.getByTestId('folder-item-Match Night').getByTestId('open-folder').click();
  await expect(page.getByTestId('folder-head')).toContainText('Match Night');
  await expect(page.locator('.lib-row')).toHaveCount(1);

  // The search crosses out of it: the unfiled Ticker is an answer to "Strap or Ticker" too.
  await page.getByTestId('home-search').fill('r');
  await expect(page.getByTestId('folder-head')).toHaveCount(0);
  await expect(page.locator('.lib-row')).toHaveCount(3);

  // WHERE THE MATCH LIVES. On a card, not only in the table's column — the card is what most
  // people are looking at. Exactly one of the three is filed, so exactly one tag shows.
  const tag = page.getByTestId('row-folder');
  await expect(tag).toHaveCount(1);
  await expect(tag).toContainText('Match Night');
  // It is a PILL, sized by its word. Stretched by the card's flex column it becomes a
  // full-width bar and stops reading as a tag at all — the defect a visibility check misses.
  const tagBox = (await tag.boundingBox())!;
  const cardBox = (await page.locator('.lib-row', { hasText: 'Strap A' }).first().boundingBox())!;
  expect(tagBox.width).toBeLessThan(cardBox.width * 0.75);

  // Clearing it gives the folder back, rather than dropping you at the root.
  await page.getByTestId('home-search').fill('');
  await expect(page.getByTestId('folder-head')).toContainText('Match Night');
  await expect(page.locator('.lib-row')).toHaveCount(1);
  await expect(page.getByTestId('row-folder')).toHaveCount(0);
});

test('folder CARDS: name one, drag a graphic in, open it, and rename it from inside', async ({ page }) => {
  await seedLibrary(page, ['Strap A', 'Strap B', 'Ticker C']);

  // A folder is only a name on its graphics, so an empty one has nothing to persist — the
  // dashed card names it and holds it until something lands in it. The band stands with no
  // folders at all, because that card is how the first one is made.
  await expect(page.getByTestId('folder-items')).toBeVisible();
  await expect(page.locator('[data-testid^="folder-item-"]')).toHaveCount(0);
  await page.getByTestId('new-folder').click();
  await page.getByTestId('new-folder-name').fill('Match Night');
  await page.getByTestId('new-folder-name').press('Enter');
  const card = page.getByTestId('folder-item-Match Night');
  await expect(card).toContainText('0 graphics');

  // Drag a card onto it. ONE DataTransfer carries the gesture, so the row's real dragstart
  // handler is what writes the id the drop then reads — Playwright's dragTo carries no
  // payload, and a hand-written payload would test the drop against a fiction.
  const source = page.locator('.lib-row--grid').first();
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent('dragstart', { dataTransfer: dt });
  await card.dispatchEvent('drop', { dataTransfer: dt });
  await expect(card).toContainText('1 graphic');
  await expect(page.getByTestId('bulk-note')).toContainText('Moved 1');
  // Grouping again: the dragged graphic left the root listing for the folder.
  await expect(page.locator('.lib-row--grid')).toHaveCount(2);

  // Opening it shows that graphic alone; the head is the way back.
  await card.click();
  await expect(page.locator('.lib-row--grid')).toHaveCount(1);
  await expect(page.getByTestId('folder-to-production')).toBeVisible();

  // The folder's own verbs live on the HEAD too, because the band is not on screen at this
  // level — rename reachable only by walking back out is a dead end you have to know already.
  await page.getByTestId('folder-head').getByTestId('row-menu').click();
  await page.getByTestId('rename-folder').click();
  await page.getByTestId('folder-rename-input').fill('Cup Final');
  await page.getByTestId('folder-rename-input').press('Enter');
  await expect(page.getByTestId('folder-head')).toContainText('Cup Final');
  await page.getByTestId('folder-back').click();
  await expect(page.getByTestId('folder-item-Cup Final')).toContainText('1 graphic');
  // The rename is a durable write, and a durable write is ACCEPTED synchronously and lands a
  // moment later (src/model/durableStore.ts) - so a reload fired the instant the mutator
  // returns aborts it, and the reloaded page shows the OLD folder name, or none. The
  // assertion above passes either way, because it reads the in-memory mirror. Measured
  // failing here on 2026-08-08.
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('folder-item-Cup Final')).toContainText('1 graphic');
});

test('bulk add to a NEW production pools the selection and lands on its page', async ({ page }) => {
  await seedLibrary(page, ['One', 'Two', 'Three']);
  const boxes = page.getByTestId('select-graphic');
  await boxes.nth(0).click();
  await boxes.nth(2).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('bulk-bar')).toContainText('3 selected');

  await page.getByTestId('bulk-add-production').click();
  await page.getByTestId('bulk-new-production-name').fill('Evening Bulletin');
  await page.getByTestId('bulk-new-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(3);
});

test('the bulk "+ Production" picker opens UPWARD, fully on screen', async ({ page }) => {
  // The owner's report was "the pop-up goes underneath my view field": the bulk bar floats at
  // the bottom of the viewport by design, so a menu that always opened downward was off-screen
  // — bulk add looked broken while it was in fact adding every graphic.
  // Enough rows that the bar is pinned at the bottom rather than riding a short page.
  await seedLibrary(page, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
  await page.getByTestId('select-graphic').nth(0).click();
  await page.getByTestId('bulk-add-production').click();

  const menu = page.getByTestId('bulk-production-menu');
  await expect(menu).toBeVisible();
  // The DECISION is measured, so assert on it and on the geometry it claims to produce.
  // `toBeVisible()` is blind to a box hanging past the fold, which is the whole defect.
  await expect(menu).toHaveAttribute('data-placement', 'up');
  const box = (await menu.boundingBox())!;
  const height = page.viewportSize()!.height;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(height);
  // And it is actually reachable there — a box inside the viewport can still sit under
  // something. The hit test is what a click would find.
  const onTop = await menu.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + 8));
  });
  expect(onTop).toBe(true);

  // ONE press moves between the bar's two popovers. The shell used to close by covering the
  // page with a backdrop, which meant the press that dismissed this menu never reached the
  // Folder button — a dead first click on the surface the owner had just reported. So this
  // asserts the switch happens in a SINGLE click, and that the folder menu flips on the same
  // measurement (it shares the shell).
  await page.getByTestId('bulk-move-folder').click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId('bulk-folder-menu')).toHaveAttribute('data-placement', 'up');

  // Escape closes the standing menu — the keyboard route the backdrop never offered.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('bulk-folder-menu')).toHaveCount(0);

  // And a plain press on something outside the menu's host still closes it. The count beside
  // the popovers is the target: same bar, outside the host, and it does nothing when clicked.
  await page.getByTestId('bulk-add-production').click();
  await expect(menu).toBeVisible();
  await page.locator('.lib-bulkbar strong').click();
  await expect(menu).toHaveCount(0);
});

test('a "+ Production" pick CLOSES the picker and confirms on the button', async ({ page }) => {
  // It used to show a ✓ inside the menu for two seconds and stay open, hiding the library
  // behind a popover that had already done its job (owner walk 2026-08-23).
  await seedLibrary(page, ['One', 'Two', 'Three']);
  await page.getByTestId('select-graphic').nth(0).click();
  await page.getByTestId('bulk-add-production').click();
  await page.getByTestId('bulk-new-production-name').fill('Evening Bulletin');
  await page.getByTestId('bulk-new-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();

  await page.goto('/app#/home/graphics');
  const row = page.locator('.lib-row', { hasText: 'Two' });
  await row.getByTestId('add-to-production').click();
  await expect(page.getByTestId('add-to-production-menu')).toBeVisible();
  await page.getByTestId('add-to-production-menu').getByRole('menuitem').first().click();

  await expect(page.getByTestId('add-to-production-menu')).toHaveCount(0);
  // The confirmation moves to the button, which is still on screen afterwards.
  await expect(row.getByTestId('production-added')).toBeVisible();
  // Re-opening marks the production it now sits in — the picker reads the live model.
  await row.getByTestId('add-to-production').click();
  await expect(page.getByTestId('add-to-production-menu')).toContainText('in it');
});

test('a folder pools WHOLE into an existing production, through the bulk verb', async ({ page }) => {
  await seedLibrary(page, ['Strap A', 'Strap B', 'Ticker C']);
  // One production to pool into, made from a single graphic.
  await page.getByTestId('select-graphic').nth(2).click();
  await page.getByTestId('bulk-add-production').click();
  await page.getByTestId('bulk-new-production-name').fill('Match Day');
  await page.getByTestId('bulk-new-production').click();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(1);

  // File the other two, then add the folder itself.
  await page.goto('/app#/home/graphics');
  await page.getByTestId('select-graphic').nth(0).click();
  await page.getByTestId('select-graphic').nth(1).click({ modifiers: ['Shift'] });
  await page.getByTestId('bulk-move-folder').click();
  await page.getByTestId('bulk-new-folder-name').fill('Straps');
  await page.getByTestId('bulk-new-folder').click();
  const folder = page.getByTestId('folder-item-Straps');
  await expect(folder).toContainText('2 graphics');

  await folder.getByTestId('folder-to-production').click();
  await page.getByTestId('folder-production-menu').getByRole('menuitem').first().click();
  // The SAME report the bulk bar gives — one pooling verb, one wording, one partial-failure
  // story (src/components/home/sections/GraphicsSection.tsx addListTo).
  await expect(page.getByTestId('bulk-note')).toContainText('Added 2 to "Match Day"');
  await expect(page.getByTestId('folder-production-menu')).toHaveCount(0);

  await page.goto('/app#/home/productions');
  await page.locator('[data-testid^="production-row-"]', { hasText: 'Match Day' })
    .getByTestId('open-production')
    .click();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(3);
});
