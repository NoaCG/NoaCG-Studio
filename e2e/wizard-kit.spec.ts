import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { settleDurableWrites } from './_durable';
import { addToProductionFromFinish } from './_create';

// THE KIT PATH - one door, one Style per kit, and editing in any order.
//
// "A whole kit" is a switch at the top of Browse. A kit is a set of graphics for one kind of
// production in ONE Style (there is no Style dropdown): about ten graphics arrive ticked and
// the kit's larger library is one tick away. Leaving the Kit step BUILDS the whole set and
// lands on the kit's hub, where any graphic opens for editing in any order, the tray jumps
// between graphics, and "Apply this Style to all" carries one graphic's Style to the rest.
//
// What matters here is the OUTCOME the flow promises: the count on screen is the count that
// gets built, an edit survives jumping away and back, one Style can reach the whole set, and
// every graphic is saved into one PRODUCTION before either door is taken. A spec that only
// checked the picker rendered would pass on a flow that built nothing.

/** How many kits the registry offers - the source of truth the grid is rendered from. */
async function packCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const { PACKS } = await import('/src/templates/packs.ts');
    return PACKS.length;
  });
}

/** How many graphics a kit STARTS with, asked of the model rather than written down here:
 *  a starter is curated config, and the assertion worth keeping is that the screen agrees. */
async function starterOf(page: Page, packId: string): Promise<string[]> {
  return page.evaluate(async (id) => {
    const { PACKS } = await import('/src/templates/packs.ts');
    return [...PACKS.find((p: { id: string }) => p.id === id)!.starter];
  }, packId);
}

async function openKitPicker(page: Page) {
  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();
  await page.locator('[data-build-mode="kit"]').click();
  await expect(page.getByTestId('kit-picker')).toBeVisible();
}

/** A short kit to work with: Worship & Ceremony's starter, cut to its first `keep`. Building
 *  the flagship kit through the UI would re-buy this coverage at several times the cost. */
async function pickShortKit(page: Page, keep = 3) {
  await openKitPicker(page);
  await page.locator('[data-kit="ceremony"]').click();
  await expect(page.getByTestId('kit-detail')).toBeVisible();
  const items = page.locator('[data-testid="kit-contents"] [data-kit-item]');
  const total = await items.count();
  for (let i = keep; i < total; i++) await items.nth(i).uncheck();
  await expect(page.getByTestId('kit-total')).toHaveText(`${keep} graphics`);
}

/** Build the ticked set: Next from the Kit step lands on the hub. */
async function buildKit(page: Page, count: number) {
  await expect(page.locator('.wz-next')).toHaveText(`Build ${count} graphics →`);
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('kit-finish')).toBeVisible();
  await expect(page.locator('[data-kit-open]')).toHaveCount(count);
}

/** The first text line's sample value on the Fields step. */
const firstLine = (page: Page) => page.locator('.wz-line-row input').nth(1);

/** What a saved production holds, read through the model rather than raw storage (the saved
 *  documents live in the durable store - src/model/durableStore.ts). */
async function savedShow(page: Page) {
  await settleDurableWrites(page);
  return page.evaluate(async () => {
    const showId = location.hash.split('/').pop();
    const { loadShows } = await import('/src/model/shows.ts');
    const { loadGraphics } = await import('/src/model/library.ts');
    const shows = loadShows() as unknown as {
      id: string;
      name: string;
      look?: { palette?: { accent?: string } };
      graphics: { name: string; graphicId?: string; template: { html: string; js: string; css: string; fields?: unknown[] } }[];
      cues?: { sourceId: string }[];
    }[];
    const library = loadGraphics() as unknown as { id: string; packageId: string | null }[];
    const show = shows.find((s) => s.id === showId);
    if (!show) return null;
    const libraryIds = new Set(library.map((g) => g.id));
    return {
      name: show.name,
      count: show.graphics.length,
      accents: show.graphics.map((g) => g.template.css.match(/--accent:\s*([^;]+);/)?.[1]?.trim() ?? null),
      html: show.graphics.map((g) => g.template.html),
      cueCount: show.cues?.length ?? 0,
      allLinked: show.graphics.every((g) => g.graphicId && libraryIds.has(g.graphicId)),
      allStandalone: library.every((g) => g.packageId === null),
      allComplete: show.graphics.every(
        (g) => g.template.html.includes('SPXGCTemplateDefinition') && /play\s*(=|\()/.test(g.template.js),
      ),
    };
  });
}

test('the entry step offers no kit card - the question lives in Browse', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  // The card is GONE, not hidden: a second door to the same outcome would quietly become the
  // one people use.
  await expect(page.locator('[data-entry="kit"]')).toHaveCount(0);
  await page.locator('[data-entry="template"]').click();
  await expect(page.getByTestId('wz-buildmode')).toBeVisible();
  await expect(page.locator('[data-build-mode="one"]')).toHaveAttribute('aria-pressed', 'true');
});

test('the switch swaps the step body and is changeable without going back', async ({ page }) => {
  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();
  await expect(page.locator('.wz-variant-grid')).toBeVisible();
  await expect(page.getByTestId('kit-picker')).toHaveCount(0);

  await page.locator('[data-build-mode="kit"]').click();
  await expect(page.getByTestId('kit-picker')).toBeVisible();
  await expect(page.locator('.wz-variant-grid')).toHaveCount(0);
  // The rail's words follow the answer, so the walk never claims to be picking a design.
  await expect(page.locator('.wz-dot').nth(1).locator('.wz-dot-label')).toHaveText('Kit');
  // Nothing is picked yet, so Next promises nothing.
  await expect(page.locator('.wz-next')).toHaveText('Next →');
  await expect(page.locator('.wz-next')).toBeDisabled();

  await page.locator('[data-build-mode="one"]').click();
  await expect(page.locator('.wz-variant-grid')).toBeVisible();
  await expect(page.getByTestId('wz-stepcount')).toHaveText('Step 2 / 6');

  // The frame is one decision for the whole walk either way, so its picker survives the swap.
  await page.locator('[data-build-mode="kit"]').click();
  await expect(page.getByTestId('browse-format-aspect')).toBeVisible();
});

test('a kit has one Style: no Style dropdown, and every kit card shows its cover', async ({ page }) => {
  await openKitPicker(page);
  const cards = page.locator('[data-kit]');
  await expect(cards).toHaveCount(await packCount(page));
  // Every card carries its signature graphic as a real rendered cover, so twelve kits read as
  // twelve looks rather than twelve names.
  await expect(page.getByTestId('kit-cover')).toHaveCount(await packCount(page));
  await expect(cards.first().locator('iframe')).toHaveCount(1);

  await page.locator('[data-kit="sports"]').click();
  await expect(page.getByTestId('kit-detail')).toBeVisible();
  // THE STYLE DROPDOWN IS GONE. A kit is built in its own Style; the Style steps change it
  // afterwards, per graphic or across the kit.
  await expect(page.getByTestId('kit-family')).toHaveCount(0);
  await expect(page.getByTestId('kit-detail').locator('select')).toHaveCount(0);
});

test('about ten graphics arrive ticked, and the library is one tick away', async ({ page }) => {
  await openKitPicker(page);
  const starter = await starterOf(page, 'sports');
  expect(starter.length).toBeGreaterThanOrEqual(6);
  expect(starter.length).toBeLessThanOrEqual(12);

  // The card advertises what the kit STARTS with, and the picker ticks exactly that.
  await expect(page.locator('[data-kit="sports"] .wz-kit-count')).toContainText(`${starter.length} graphics`);
  await page.locator('[data-kit="sports"]').click();
  const inKit = page.locator('[data-testid="kit-contents"] [data-kit-item]');
  await expect(inKit).toHaveCount(starter.length);
  expect(await inKit.evaluateAll((els) => els.map((el) => el.getAttribute('data-kit-item')))).toEqual(starter);
  for (let i = 0; i < starter.length; i++) await expect(inKit.nth(i)).toBeChecked();
  await expect(page.getByTestId('kit-total')).toHaveText(`${starter.length} graphics`);

  // The rest of the kit's own library sits under it, unticked - and ticking one ADDS it.
  const library = page.locator('[data-testid="kit-library"] [data-kit-item]');
  expect(await library.count()).toBeGreaterThan(0);
  await expect(library.first()).not.toBeChecked();
  await library.first().check();
  await expect(page.getByTestId('kit-total')).toHaveText(`${starter.length + 1} graphics`);
  // A ticked card stays where it is: sections are fixed by membership, never by the tick.
  await expect(page.locator('[data-testid="kit-library"] [data-kit-item]').first()).toBeChecked();
  await inKit.first().uncheck();
  await expect(page.getByTestId('kit-total')).toHaveText(`${starter.length} graphics`);

  // Every OTHER graphic in the kit's Style is offered too, behind a disclosure that is closed
  // on arrival - measured, because a closed <details> around a grid does not hide by itself.
  const others = page.locator('.wz-kit-others');
  await expect(others).toBeVisible();
  const othersList = page.getByTestId('kit-extras');
  expect(await othersList.evaluate((el) => el.getBoundingClientRect().height)).toBe(0);
  await others.locator('summary').click();
  expect(await othersList.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(0);
});

test('one search box, and on the kit side it searches the kits', async ({ page }) => {
  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();
  const search = page.locator('.wz-browse-search');
  await expect(search).toHaveAttribute('placeholder', /Search all templates/);

  await page.locator('[data-build-mode="kit"]').click();
  await expect(search).toHaveAttribute('placeholder', /Search kits and graphics/);

  // A kit matches on what it is FOR, not only on its name - the reference formats are what
  // make "wedding" find Worship & Ceremony.
  await search.fill('wedding');
  await expect(page.locator('[data-kit]')).toHaveCount(1);
  await expect(page.locator('[data-kit="ceremony"]')).toBeVisible();

  // A row matches on its graphic TYPE as well as the design's name.
  await search.fill('');
  await page.locator('[data-kit="newsroom"]').click();
  const newsroom = (await starterOf(page, 'newsroom')).length;
  await expect(page.getByTestId('kit-total')).toHaveText(`${newsroom} graphics`);
  await search.fill('ticker');
  await expect(page.locator('[data-testid="kit-contents"] [data-kit-item="ticker"]')).toBeVisible();
  expect(await page.locator('[data-testid="kit-contents"] [data-kit-item]').count()).toBeLessThan(newsroom);

  // FILTERING HIDES ROWS, IT DOES NOT UNTICK THEM, and the step says so.
  await expect(page.getByTestId('kit-total')).toHaveText(`${newsroom} graphics`);
  await expect(page.getByTestId('kit-filtered')).toContainText('hidden by the search');
  await page.getByTestId('kit-filtered').getByRole('button', { name: 'Show all' }).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('[data-testid="kit-contents"] [data-kit-item]')).toHaveCount(newsroom);

  // A query that matches no kit says so and offers the way out.
  await search.fill('zzzz');
  await expect(page.getByTestId('kit-no-shows')).toBeVisible();
  await page.getByTestId('kit-no-shows').getByRole('button', { name: /Clear the search/ }).click();
  await expect(page.locator('[data-kit]')).toHaveCount(await packCount(page));
});

test('picking another kit brings back its own starter', async ({ page }) => {
  await openKitPicker(page);
  await page.locator('[data-kit="ceremony"]').click();
  await page.locator('[data-testid="kit-contents"] [data-kit-item]').first().uncheck();

  // An edited set must not leak onto the next kit, or it would stop being the kit it is.
  await page.locator('[data-kit="esports"]').click();
  await expect(page.getByTestId('kit-detail').locator('h3')).toHaveText('Esports');
  const esports = (await starterOf(page, 'esports')).length;
  await expect(page.getByTestId('kit-total')).toHaveText(`${esports} graphics`);
  const boxes = page.locator('[data-testid="kit-contents"] [data-kit-item]');
  for (let i = 0; i < esports; i++) await expect(boxes.nth(i)).toBeChecked();
});

test('Next builds the whole kit and lands on its hub, ready to save untouched', async ({ page }) => {
  await pickShortKit(page, 3);
  await buildKit(page, 3);

  // The hub is the kit's last rail step, and every graphic in it is already built.
  await expect(page.getByTestId('wz-stepcount')).toHaveText('Step 6 / 6');
  await expect(page.locator('[data-kit-open]').first().locator('iframe')).toHaveCount(1);
  // The tray is for the editing steps; the hub lays the set out itself.
  await expect(page.getByTestId('kit-tray')).toHaveCount(0);

  // Nothing has to be edited: the set saves straight away.
  await page.getByTestId('kit-finish-production-go').click();
  await expect(page).toHaveURL(/#\/production\//);
  const saved = await savedShow(page);
  expect(saved).not.toBeNull();
  expect(saved!.name).toBe('Worship & Ceremony');
  expect(saved!.count).toBe(3);
  expect(saved!.cueCount).toBe(3);
  expect(saved!.allLinked).toBe(true);
  expect(saved!.allStandalone).toBe(true);
  expect(saved!.allComplete).toBe(true);
  // ONE Style out of the box: the kit's palette on every graphic it is drawn for.
  expect(new Set(saved!.accents).size).toBe(1);
});

test('any graphic opens in any order, and an edit survives jumping away and back', async ({ page }) => {
  await pickShortKit(page, 3);
  await buildKit(page, 3);

  // Open the THIRD graphic first - there is no fixed order.
  await page.locator('[data-kit-open="2"]').click();
  await expect(page.getByTestId('wz-stepcount')).toHaveText('Step 3 / 6');
  const tray = page.getByTestId('kit-tray');
  await expect(tray).toContainText('editing 3 of 3');
  await expect(tray.locator('[data-kit-chip]').nth(2)).toHaveAttribute('aria-current', 'true');
  await firstLine(page).fill('Edited on graphic three');

  // Jump to graphic 1 on the SAME step through the tray...
  await tray.locator('[data-kit-chip]').nth(0).click();
  await expect(tray).toContainText('editing 1 of 3');
  await expect(page.getByTestId('wz-stepcount')).toHaveText('Step 3 / 6');
  await expect(firstLine(page)).not.toHaveValue('Edited on graphic three');

  // ...and back: graphic 3 still holds what was typed into it.
  await tray.locator('[data-kit-chip]').nth(2).click();
  await expect(firstLine(page)).toHaveValue('Edited on graphic three');

  // Back from a graphic's first step is the hub, and says so.
  await expect(page.locator('.wz-back')).toHaveText('← All graphics');
  await page.locator('.wz-back').click();
  await expect(page.getByTestId('kit-finish')).toBeVisible();

  // Done from a graphic's last step is the hub too.
  await page.locator('[data-kit-open="0"]').click();
  await page.locator('.wz-next').click(); // Style
  await page.locator('.wz-next').click(); // Animation
  await expect(page.locator('.wz-next')).toHaveText('Done →');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('kit-finish')).toBeVisible();

  await page.getByTestId('kit-finish-production-go').click();
  await expect(page).toHaveURL(/#\/production\//);
  const saved = await savedShow(page);
  expect(saved!.count).toBe(3);
  // The edit reached the saved graphic it was made on, and only that one.
  expect(saved!.html.map((h) => h.includes('Edited on graphic three'))).toEqual([false, false, true]);
});

test('one graphic\'s Style can be applied to the whole kit, and each can still differ', async ({ page }) => {
  await pickShortKit(page, 3);
  await buildKit(page, 3);

  await page.locator('[data-kit-open="0"]').click();
  await page.locator('.wz-next').click(); // Style
  await expect(page.getByTestId('wz-stepcount')).toHaveText('Step 4 / 6');
  await page.locator('.wz-step button', { hasText: 'Signal Red' }).first().click();

  // The offer counts the OTHER graphics and says what it carries before anything changes.
  const apply = page.getByTestId('kit-apply-style');
  await expect(apply).toHaveText('Apply this Style to all (2)');
  await apply.click();
  const confirm = page.getByTestId('kit-apply-confirm');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('Signal Red');
  await expect(confirm).toContainText('Their text and placement stay as they are.');
  await page.getByTestId('kit-apply-confirm-go').click();
  await expect(confirm).toHaveCount(0);

  // Applying is a one-off transform, not a lock: graphic 2 can still take its own Style.
  await page.getByTestId('kit-tray').locator('[data-kit-chip]').nth(1).click();
  await expect(page.getByTestId('kit-tray')).toContainText('editing 2 of 3');
  await page.locator('.wz-step button', { hasText: 'Ivory' }).first().click();
  await page.getByTestId('kit-hub').click();

  await page.getByTestId('kit-finish-production-go').click();
  await expect(page).toHaveURL(/#\/production\//);
  const saved = await savedShow(page);
  expect(saved!.accents[0]).toBe('#e63946'); // the source
  expect(saved!.accents[2]).toBe('#e63946'); // carried
  expect(saved!.accents[1]).toBe('#e8c547'); // Ivory, customised on its own afterwards
});

test('changing the contents after editing keeps every edit', async ({ page }) => {
  await pickShortKit(page, 2);
  await buildKit(page, 2);
  await page.locator('[data-kit-open="1"]').click();
  await firstLine(page).fill('Kept through a re-shape');
  await page.locator('.wz-back').click();

  // Back to the Kit step through the hub's own door, as it was built.
  await page.getByTestId('kit-edit-contents').click();
  await expect(page.getByTestId('kit-picker')).toBeVisible();
  await expect(page.getByTestId('kit-total')).toHaveText('2 graphics');
  await page.locator('[data-testid="kit-library"] [data-kit-item]').first().check();
  await expect(page.locator('.wz-next')).toHaveText('Back to the kit →');
  await page.locator('.wz-next').click();

  await expect(page.locator('[data-kit-open]')).toHaveCount(3);
  await page.locator('[data-kit-open="1"]').click();
  await expect(firstLine(page)).toHaveValue('Kept through a re-shape');
});

test('switching to another kit over an edited one asks first', async ({ page }) => {
  await pickShortKit(page, 2);
  await buildKit(page, 2);
  await page.locator('[data-kit-open="0"]').click();
  await firstLine(page).fill('Worth keeping');
  await page.locator('.wz-back').click();
  await page.getByTestId('kit-edit-contents').click();

  await page.locator('[data-kit="sports"]').click();
  await page.locator('.wz-next').click();
  const ask = page.getByTestId('kit-switch-confirm');
  await expect(ask).toBeVisible();
  await expect(ask).toContainText('Worship & Ceremony');

  // Keeping the edited kit puts the picker back on it, as it was built.
  await page.getByTestId('kit-switch-confirm-cancel').click();
  await expect(page.getByTestId('kit-detail').locator('h3')).toHaveText('Worship & Ceremony');
  await expect(page.getByTestId('kit-total')).toHaveText('2 graphics');
  await page.locator('.wz-next').click();
  await page.locator('[data-kit-open="0"]').click();
  await expect(firstLine(page)).toHaveValue('Worth keeping');
});

test('the tray survives a kit far longer than the strip', async ({ page }) => {
  // A big kit is the whole library ticked. Its size is config, so only its ORDER of magnitude
  // is asserted here.
  await openKitPicker(page);
  await page.locator('[data-kit="esports"]').click();
  const library = page.locator('[data-testid="kit-library"] [data-kit-item]');
  const more = await library.count();
  for (let i = 0; i < more; i++) await library.nth(i).check();
  const size = (await starterOf(page, 'esports')).length + more;
  expect(size).toBeGreaterThanOrEqual(30); // this test is about a LONG kit
  await expect(page.getByTestId('kit-total')).toHaveText(`${size} graphics`);
  await page.locator('.wz-next').click();
  await expect(page.locator('[data-kit-open]')).toHaveCount(size);
  await page.locator('[data-kit-open="0"]').click();

  const tray = page.getByTestId('kit-tray');
  await expect(tray.locator('[data-kit-chip]')).toHaveCount(size);
  // The strip scrolls rather than wrapping or squeezing, and keeps a sane share of the column.
  const strip = await tray.locator('.wz-kit-tray-strip').evaluate((el) => ({
    scrolls: el.scrollWidth > el.clientWidth + 1,
    rows: new Set([...el.children].map((c) => Math.round(c.getBoundingClientRect().top))).size,
  }));
  expect(strip.scrolls).toBe(true);
  expect(strip.rows).toBe(1);
  const trayShare = await page.evaluate(() => {
    const t = document.querySelector('[data-testid="kit-tray"]')!.getBoundingClientRect();
    const main = document.querySelector('.wz-main')!.getBoundingClientRect();
    return t.height / main.height;
  });
  expect(trayShare).toBeLessThan(0.35);

  // Opening a graphic far down the set scrolls its chip into view.
  await page.locator('.wz-back').click();
  await page.locator(`[data-kit-open="${size - 3}"]`).click();
  await expect(tray).toContainText(`editing ${size - 2} of ${size}`);
  const inView = await tray.evaluate((el) => {
    const s = el.querySelector('.wz-kit-tray-strip')!.getBoundingClientRect();
    const current = el.querySelector('[aria-current="true"]')!.getBoundingClientRect();
    return current.left >= s.left - 1 && current.right <= s.right + 1;
  });
  expect(inView).toBe(true);
});

test('the export door saves the whole set first, then packages it', async ({ page }) => {
  await pickShortKit(page, 2);
  await buildKit(page, 2);

  await page.getByTestId('kit-finish-name').fill('Sunday Service');
  await expect(page.getByTestId('kit-finish-export')).toContainText('Export the kit (.zip)');
  await page.getByTestId('kit-finish-export').click();

  // For a kit the editor is never involved: the door lands on the production with THE
  // production export surface open, never a second one that could disagree with it.
  await expect(page).toHaveURL(/#\/production\//);
  await expect(page.getByTestId('production-export-dialog')).toBeVisible();
  await expect(page.getByTestId('production-export-dialog')).toContainText('Sunday Service');
  await settleDurableWrites(page);

  // THE SAVE IS NOT OPTIONAL.
  const savedCount = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    return (loadGraphics() as unknown as unknown[]).length;
  });
  expect(savedCount).toBe(2);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('prod-export-download').click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const graphicHtmls = Object.keys(zip.files).filter(
    (name) => /^sunday_service\/[^/]+\/[^/]+\.html$/.test(name) && !name.endsWith('controlpanel.html'),
  );
  expect(graphicHtmls).toHaveLength(2);
});

test('a kit opened FOR a production joins that one, in its look', async ({ page }) => {
  // The wizard opened from a production's "+ New graphic" pre-applies that production's look
  // and preselects it. The kit path has to read both, or starting a kit there silently builds
  // a SECOND production beside the one the user was standing in.
  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();
  await page.locator('.wz-variant').first().click();
  await page.getByTestId('wz-skip-to-finish').click();
  await page.getByTestId('wz-finish-name').fill('Friday Desk');
  await page.getByTestId('wz-finish-production-pick').locator('select').selectOption('new');
  await page.getByTestId('wz-finish-production-name').fill('Friday Desk');
  await addToProductionFromFinish(page);
  await expect(page).toHaveURL(/#\/production\//);
  await settleDurableWrites(page);

  await page.getByTestId('production-new-graphic').click();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await page.locator('[data-build-mode="kit"]').click();
  await page.locator('[data-kit="ceremony"]').click();
  const items = page.locator('[data-testid="kit-contents"] [data-kit-item]');
  const total = await items.count();
  for (let i = 2; i < total; i++) await items.nth(i).uncheck();
  await buildKit(page, 2);

  // The production it was opened for is the DEFAULT, and both doors name it.
  await expect(page.getByTestId('kit-finish-production')).not.toHaveValue('new');
  await expect(page.getByTestId('kit-finish-production-go')).toContainText('Add to Friday Desk');
  const exportDoor = page.getByTestId('kit-finish-export');
  await expect(exportDoor).toContainText('Export Friday Desk (.zip)');
  await expect(exportDoor).toContainText('all 3 graphics');
  await exportDoor.click();
  await expect(page).toHaveURL(/#\/production\//);
  await expect(page.getByTestId('production-export-dialog')).toBeVisible();
  await settleDurableWrites(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('prod-export-download').click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const graphicHtmls = Object.keys(zip.files).filter(
    (name) => /^friday_desk\/[^/]+\/[^/]+\.html$/.test(name) && !name.endsWith('controlpanel.html'),
  );
  expect(graphicHtmls).toHaveLength(3);

  const report = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const shows = loadShows() as unknown as { name: string; graphics: { template: { css: string } }[] }[];
    return {
      names: shows.map((s) => s.name),
      pool: shows[0]?.graphics.length ?? 0,
      accents: [...new Set((shows[0]?.graphics ?? []).map((g) => g.template.css.match(/--accent:\s*([^;]+);/)?.[1]?.trim()))],
    };
  });
  // ONE production, holding the graphic it started with AND the kit, in ONE look: the
  // production's own, carried into every kit graphic by the brand the context open turns on.
  expect(report.names).toEqual(['Friday Desk']);
  expect(report.pool).toBe(3);
  expect(report.accents).toHaveLength(1);
});

test('every kit can run a show in one Style out of the box', async ({ page }) => {
  // Module-level, over every kit: the claim is about all of them, which no UI walk covers.
  await page.goto('/app');
  const report = await page.evaluate(async () => {
    const { PACKS, validatePacks, REFERENCE_FORMAT_COUNT } = await import('/src/templates/packs.ts');
    const { kitChoices, kitSelection } = await import('/src/templates/kit.ts');
    const { kitItemDraft, kitPaletteFor } = await import('/src/components/wizard/kitPlan.ts');
    const { buildDraftTemplate, initialDraft } = await import('/src/components/wizard/draft.ts');
    const found: string[] = [];
    const accentsByKit: Record<string, string[]> = {};
    for (const pack of PACKS) {
      const choices = kitChoices(pack);
      if (new Set(choices.map((c) => c.key)).size !== choices.length) found.push(`${pack.id}: duplicate keys`);
      // The starter resolves to exactly what it names, in its order.
      const starter = kitSelection(pack, pack.starter);
      if (starter.map((i) => i.key).join() !== pack.starter.join()) found.push(`${pack.id}: starter does not resolve`);
      // Every offered row builds - the picker never offers a guaranteed Create failure.
      for (const choice of choices) {
        try {
          choice.variant.create();
        } catch (e) {
          found.push(`${pack.id}/${choice.key}: ${(e as Error).message}`);
        }
        if (choice.inPack && choice.typeId && choice.variant.styleTag !== pack.family) {
          found.push(`${pack.id}/${choice.key}: a type resolved outside the kit's Style`);
        }
      }
      // The library never names one design twice (the production pool is name-keyed).
      const names = choices.filter((c) => c.inPack).map((c) => c.variant.name);
      const dupes = names.filter((n, i) => names.indexOf(n) !== i);
      if (dupes.length) found.push(`${pack.id}: duplicate names ${dupes.join(', ')}`);
      // What the kit really builds by default, through the create path's own draft.
      accentsByKit[pack.id] = starter.map((item) => {
        const draft = kitItemDraft(initialDraft(), item.variant, { packPaletteId: kitPaletteFor(pack, item.variant) });
        return buildDraftTemplate(item.variant, draft).css.match(/--accent:\s*([^;]+);/)?.[1]?.trim() ?? 'NONE';
      });
    }
    return {
      ids: PACKS.map((p) => p.id),
      problems: [...validatePacks(), ...found],
      formats: new Set(PACKS.flatMap((p) => p.formats)).size,
      expectedFormats: REFERENCE_FORMAT_COUNT,
      paletted: Object.fromEntries(PACKS.filter((p) => p.paletteId).map((p) => [p.id, accentsByKit[p.id]])),
    };
  });

  // The consolidated set of kits, pinned: changing it is a taxonomy decision (PACK_TAXONOMY.md).
  expect(report.ids).toEqual([
    'sports', 'esports', 'talk-show', 'newsroom', 'election', 'corporate', 'creator', 'stage',
    'ceremony', 'sticker-quiz', 'showtime-quiz', 'arcade-quiz',
  ]);
  expect(report.problems).toEqual([]);
  expect(report.formats).toBe(report.expectedFormats);
  // A kit that names a palette arrives in ONE accent across its whole starter.
  for (const [id, accents] of Object.entries(report.paletted)) {
    expect(new Set(accents).size, `${id}: ${accents.join(', ')}`).toBe(1);
  }
});
