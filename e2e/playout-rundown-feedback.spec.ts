// covers: src/components/home/{ProductionPage,CueRundown,PlayoutItemPicker,LibMenu}.tsx
// covers: src/styles/playout-dashboard.css
// focus

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { settleDurableWrites } from './_durable';
import { fakeBridge, seedSettings } from './_fakeBridge';
import { parkFocusOffControls } from './_keys';

const EVIDENCE = 'docs/work-specs/playout-rundown-feedback/evidence';
const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  if (process.env.NOACG_C_CAPTURE !== '1') return;
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('requestfailed', (request) => errors.push(`network: ${request.url()} ${request.failure()?.errorText}`));
});

test.afterEach(({ page }, info) => {
  if (process.env.NOACG_C_CAPTURE === '1') console.log(`Browser diagnostics ${info.title}: ${JSON.stringify(browserErrors.get(page))}`);
});

/** Save first, then reopen: an existing production must retain its old declarations. */
async function savedProduction(page: Page, variant: string, legacy = false, caspar = false): Promise<{ id: string; js: string }> {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  const snapshot = legacy ? JSON.parse(readFileSync(`e2e/fixtures/pre-671/${variant}.json`, 'utf8')) : null;
  const seeded = await page.evaluate(async ({ variant, snapshot, caspar }) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const shows = await import('/src/model/shows.ts');
    const template = snapshot ?? variantById(variant)!.create({});
    const { doc, error } = createGraphic(template, { name: template.name });
    if (error) throw new Error(error);
    const show = shows.createShowNamed(`Saved ${variant}`);
    if (caspar) shows.setShowOutputSetup(show.id, { v: 1, destinations: [{ id: 'casparcg', profile: 'casparcg' }] });
    shows.addGraphicToShow(show.id, template, { graphicId: doc!.id });
    return { id: show.id, js: template.js };
  }, { variant, snapshot, caspar });
  await settleDurableWrites(page);
  await page.goto(`/app#/production/${seeded.id}`);
  await expect(page.getByTestId('production-page')).toBeVisible();
  return seeded;
}

async function capture(page: Page, name: string): Promise<void> {
  if (process.env.NOACG_C_CAPTURE === '1') await page.screenshot({ path: `${EVIDENCE}/${name}.png`, fullPage: true });
}

async function labelsFit(page: Page): Promise<void> {
  const geometry = await page.getByTestId('cue-actions').locator('.pd-action').evaluateAll((buttons) => buttons.map((button) => ({
    label: button.textContent,
    clipped: button.scrollWidth > button.clientWidth || button.scrollHeight > button.clientHeight,
    outside: button.getBoundingClientRect().right > document.documentElement.clientWidth,
  })));
  expect(geometry.length).toBeGreaterThan(0);
  expect(geometry.filter((b) => b.clipped || b.outside), JSON.stringify(geometry)).toEqual([]);
}

for (const width of [1600, 390]) {
  for (const legacy of [false, true]) {
    const source = legacy ? 'pre-671 saved' : 'catalog';
    test(`${source} quiz lock and reveals remain readable and work at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const { id, js } = await savedProduction(page, 'qz01', legacy);
      const chip = page.getByTestId('machine-state-chip');
      await page.getByTestId('cue-field-f6-opt-B').click();
      await expect(page.getByTestId('cue-field-f6-opt-B')).toHaveAttribute('aria-pressed', 'true');
      await page.getByTestId('verb-take').click();
      await expect(chip).toHaveText('Question');
      await page.getByTestId('cue-actions').scrollIntoViewIfNeeded();
      await labelsFit(page);
      await capture(page, `${legacy ? 'legacy' : 'catalog'}-quiz-${width}`);
      // Lock straight from Question: the choice is hidden until its own reveal.
      await page.getByTestId('cue-action-lock').click();
      await expect(chip).toHaveText('Locked, choice hidden');
      await expect(page.getByTestId('cue-action-revealChoice')).toBeEnabled();
      await page.getByTestId('cue-action-revealChoice').click();
      await expect(chip).toHaveText('Locked in');
      const air = page.frameLocator('[data-testid="program-stage"] iframe');
      // Chromium suspends animation frames in completely offscreen iframes. On the phone,
      // return to the monitor to inspect its rendered result, as an operator would.
      await page.getByTestId('program-stage').scrollIntoViewIfNeeded();
      await expect(air.locator('.quiz-option').nth(1)).toHaveClass(/quiz-sel/);
      await page.getByTestId('cue-action-judge').click();
      await expect(chip).toHaveText('Reveal');
      await page.getByTestId('program-stage').scrollIntoViewIfNeeded();
      await expect(air.locator('.quiz-correct')).toHaveCount(1);
      expect(await page.evaluate(async (id) => (await import('/src/model/shows.ts')).loadShows().find((s) => s.id === id)!.graphics[0].template.js, id)).toBe(js);
    });

    test(`${source} scoreboard plus and minus remain readable and keep their deltas at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const { id, js } = await savedProduction(page, 'sb26', legacy);
      await page.getByTestId('verb-take').click();
      await expect(page.getByTestId('machine-state-chip')).toContainText('Live');
      await page.getByTestId('cue-actions').scrollIntoViewIfNeeded();
      await labelsFit(page);
      await capture(page, `${legacy ? 'legacy' : 'catalog'}-score-${width}`);
      const air = page.frameLocator('[data-testid="program-stage"] iframe');
      for (const [side, field] of [['A', 'f1'], ['B', 'f3']]) {
        await page.getByTestId(`cue-action-point${side}`).click();
        await expect(page.getByTestId(`cue-field-${field}`)).toHaveValue('1');
        await expect(air.locator(`#${field}`)).toHaveText('1');
        await page.getByTestId(`cue-action-undo${side}`).click();
        await expect(page.getByTestId(`cue-field-${field}`)).toHaveValue('0');
        await expect(air.locator(`#${field}`)).toHaveText('0');
      }
      expect(await page.evaluate(async (id) => (await import('/src/model/shows.ts')).loadShows().find((s) => s.id === id)!.graphics[0].template.js, id)).toBe(js);
    });
  }

  test(`rundown Add reuses media routing and keeps mixed types recognizable at ${width}px`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await seedSettings(page);
    const bridge = await fakeBridge(page);
    bridge.list = [
      { name: 'NEWS/OPENING', kind: 'movie', frames: 250, fps: 25 },
      { name: 'NEWS/THEME', kind: 'audio', frames: 250, fps: 25 },
      { name: 'NEWS/POSTER', kind: 'still' },
    ];
    await savedProduction(page, 'qz01', false, true);
    const add = page.getByTestId('rundown-add');
    await add.click();
    const menu = page.getByTestId('rundown-add-menu');
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Cue on selected graphic', 'Graphic from library…', 'New graphic…', 'Upload image…',
      'CasparCG files…', 'Audio / effect…', 'Folder from selected cues',
      'Refresh rundown',
    ]);
    await capture(page, `add-menu-${width}`);
    await expect(menu).toBeInViewport({ ratio: 1 });
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await add.click();
    await menu.getByRole('menuitem', { name: 'CasparCG files…' }).click();
    await page.getByTestId('picker-media').click();
    await page.getByTestId('picker-folder').click();
    await expect(page.getByTestId('picker-list')).toContainText('OPENING');
    await expect(page.getByTestId('picker-list')).toContainText('THEME');
    await expect(page.getByTestId('picker-list')).toContainText('POSTER');
    await expect(page.getByTestId('playout-picker')).toBeInViewport({ ratio: 1 });
    await capture(page, `server-picker-${width}`);
    await page.locator('.pd-picker-row', { hasText: 'OPENING' }).getByTestId('picker-add').click();
    await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(2);
    await expect(page.getByTestId('playout-picker')).toBeVisible();
    await page.locator('.pd-picker-row', { hasText: 'THEME' }).getByTestId('picker-add').click();
    await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(3);
    await page.getByTestId('picker-done').click();
    await page.locator('.pd-cue', { hasText: 'THEME' }).getByTestId('select-cue').click();
    // The Add folder path groups the selected audio cue through the same folder writer.
    await add.click();
    await menu.getByRole('menuitem', { name: 'Folder from selected cues' }).click();
    await expect(page.getByTestId('cue-list').locator('.pd-folder')).toHaveCount(1);
    await capture(page, `mixed-rundown-${width}`);
    await settleDurableWrites(page);
    await page.reload();
    await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(3);
    await expect(page.getByTestId('cue-list').locator('.pd-folder')).toHaveCount(1);
    const media = await page.evaluate(async () => (await import('/src/model/shows.ts')).loadShows()[0].playoutItems);
    expect(media?.map((item) => ({ name: item.name, kind: item.mediaKind, channel: item.channel, layer: item.layer }))).toEqual([
      { name: 'NEWS/OPENING', kind: 'movie', channel: 2, layer: 10 },
      { name: 'NEWS/THEME', kind: 'audio', channel: 2, layer: 5 },
    ]);
    const kinds = page.getByTestId('cue-list').getByTestId('cue-kind');
    await expect(kinds.nth(0)).toHaveAttribute('aria-label', /Arena Quiz/);
    await expect(kinds.nth(1)).toHaveAttribute('aria-label', /Video/i);
    await expect(kinds.nth(2)).toHaveAttribute('aria-label', /audio/i);
    // The retained footer entry still toggles the picker after its surface moved.
    await page.getByTestId('add-from-server').click();
    await expect(page.getByTestId('playout-picker')).toBeVisible();
    await page.getByTestId('add-from-server').click();
    await expect(page.getByTestId('playout-picker')).toBeHidden();
    // Bridge settings seeding must stand down in the sandboxed graphic frames.
    expect(pageErrors).toEqual([]);
  });

  test(`Add works with no selected graphic and explains missing server setup at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { id } = await savedProduction(page, 'qz01', false, true);
    await page.evaluate(async (id) => {
      const m = await import('/src/model/shows.ts');
      m.removeShowCues(id, m.loadShows().find((s) => s.id === id)!.cues!.map((c) => c.id));
    }, id);
    await settleDurableWrites(page);
    await page.reload();
    await expect(page.getByTestId('no-cues')).toBeVisible();
    await page.getByTestId('rundown-add').click();
    const menu = page.getByTestId('rundown-add-menu');
    await expect(menu.getByRole('menuitem', { name: 'Cue on selected graphic' })).toBeDisabled();
    await expect(menu.getByRole('menuitem', { name: 'CasparCG files…' })).toBeDisabled();
    await expect(menu).toContainText('Set up NoaCG Bridge and CasparCG under Setup');
    await capture(page, `add-without-server-${width}`);
    await menu.getByRole('menuitem', { name: 'Graphic from library…' }).click();
    await expect(page.getByTestId('add-graphic-pick')).toBeFocused();
    await page.getByTestId('add-graphic-pick').selectOption({ label: 'Arena Quiz' });
    await page.getByTestId('add-graphic').click();
    await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(1);
    await page.getByTestId('rundown-add').click();
    const chosen = page.waitForEvent('filechooser');
    await menu.getByRole('menuitem', { name: 'Upload image…' }).click();
    const input = await chosen;
    expect(input.isMultiple()).toBe(true);
    await input.setFiles({
      name: 'Opening slide.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=', 'base64'),
    });
    await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(2);
    await settleDurableWrites(page);
    await page.reload();
    await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(2);
    await page.getByTestId('rundown-add').click();
    await menu.getByRole('menuitem', { name: 'New graphic…' }).click();
    await expect(page.locator('.wz-modal')).toBeVisible();
    await expect(page).toHaveURL(/#\/new/);
  });

  test(`pending move leaves cues in place and Escape confirms cancellation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await savedProduction(page, 'qz01');
    await page.getByTestId('verb-take').click();
    await expect(page.getByTestId('machine-state-chip')).toHaveText('Question');
    const rows = page.getByTestId('cue-list').locator('.pd-cue');
    const before = await rows.first().getAttribute('data-row');
    await parkFocusOffControls(page);
    await page.keyboard.press('ControlOrMeta+x');
    await expect(page.getByTestId('production-note')).toContainText('1 cue ready to move. Still in place until you paste.');
    await expect(page.getByTestId('production-note')).toContainText('Esc cancels the move.');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-row', before!);
    await expect(rows.first()).toHaveClass(/cut/);
    await capture(page, `pending-move-${width}`);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('production-note')).toHaveText('✓ Move cancelled. The cues stayed in place.');
    await expect(rows.first()).not.toHaveClass(/cut/);
    await page.keyboard.press('ControlOrMeta+v');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-row', before!);
    await expect(page.getByTestId('machine-state-chip')).toHaveText('Question');
  });
}
