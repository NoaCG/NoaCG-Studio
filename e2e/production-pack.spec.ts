import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bootstrapGraphic, openWorkingGraphicInEditor } from './_create';
import { settleDurableWrites } from './_durable';

// The graphics-pack ROUND TRIP and the Fight Night pack (src/packs/graphicsPack.ts,
// docs/GRAPHICS_PACKS.md, docs/FIGHT_NIGHT_PACK_PLAN.md): any production exports as one
// re-importable .noacgpack.json - rundown included, as the format's top-level ordered cue
// list - and the Fight Night pack file installs whole through the same door the
// Uutishuone spec (pack-import.spec.ts) covers. Everything here runs offline.

const FIGHT_NIGHT = fileURLToPath(new URL('../public/packs/fight-night.noacgpack.json', import.meta.url));

test('a production exports as a graphics pack and imports back with its rundown intact', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openWorkingGraphicInEditor(page);
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Anchor L3');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  // A production with one graphic and one edited cue - the data the round trip must carry.
  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-productions').click();
  await page.getByTestId('new-production-name').fill('Pack Origin');
  await page.getByTestId('new-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.getByTestId('add-graphic-pick').selectOption({ label: 'Anchor L3' });
  await page.getByTestId('add-graphic').click();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(1);
  await page.getByTestId('cue-label').fill('Anna Pack');
  await page.getByTestId('cue-note').fill('after the intro');
  await page.getByTestId('cue-field-f0').fill('Anna Andersson');
  await expect(page.getByTestId('cue-list').locator('.pd-cue').first()).toContainText('Anna Pack');

  // Cue edits are a DRAFT that debounces into the Show record - the export reads the
  // RECORD, so wait until the typed value has actually landed before leaving the page.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { loadShows } = await import('/src/model/shows.ts');
        return loadShows().find((s) => s.name === 'Pack Origin')?.cues?.[0]?.values.f0 ?? null;
      }),
    )
    .toBe('Anna Andersson');
  const originalId = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((s) => s.name === 'Pack Origin')?.id ?? null;
  });

  await settleDurableWrites(page);
  await page.getByTestId('production-home').click();
  await page.getByTestId('home-nav-productions').click();

  // Export the pack from the export dialog - the format's export half.
  await page.getByTestId('export-production-row').click();
  await expect(page.getByTestId('production-export-dialog')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('prod-export-pack').click(),
  ]);
  expect(download.suggestedFilename()).toBe('pack-origin.noacgpack.json');
  const packText = readFileSync(await download.path(), 'utf8');
  const pack = JSON.parse(packText);
  expect(pack.format).toBe('noacg-pack');
  expect(pack.version).toBe(1);
  expect(pack.graphics).toHaveLength(1);
  expect(pack.cues).toHaveLength(1); // the rundown exports as the top-level ordered list
  expect(pack.cues[0]).toMatchObject({ graphic: 'Anchor L3', label: 'Anna Pack' });
  expect(pack.cues[0].values.f0).toBe('Anna Andersson');
  await page.getByRole('button', { name: 'Close' }).click();

  // Import it back through the pack door (the same parser and gate every pack uses).
  await page.getByTestId('import-pack-card').getByTestId('import-pack-file').setInputFiles({
    name: 'pack-origin.noacgpack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(packText),
  });
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(1);
  await expect(page.getByTestId('cue-list').locator('.pd-cue').first()).toContainText('Anna Pack');

  const imported = await page.evaluate(async (origin) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows().find((s) => s.name === 'Pack Origin' && s.id !== origin);
    if (!show) return null;
    return {
      graphics: show.graphics.length,
      graphicName: show.graphics[0]?.name,
      linked: Boolean(show.graphics[0]?.graphicId),
      cueLabel: show.cues?.[0]?.label,
      cueNote: show.cues?.[0]?.note,
      f0: show.cues?.[0]?.values.f0,
    };
  }, originalId);
  expect(imported).toEqual({
    graphics: 1,
    graphicName: 'Anchor L3',
    linked: true, // the imported graphic landed as an editable LIBRARY record
    cueLabel: 'Anna Pack',
    cueNote: 'after the intro',
    f0: 'Anna Andersson',
  });
});

test('the Fight Night pack installs whole: 12 graphics, the 19-cue rundown in show order', async ({ page }) => {
  // This is the pack's real gate: install runs every graphic through validateTemplate -
  // one failure refuses the whole pack, so this test failing names the culprit.
  await page.goto('/app#/home/productions');
  const card = page.getByTestId('import-pack-card');
  await expect(card).toBeVisible();
  await card.getByTestId('import-pack-file').setInputFiles(FIGHT_NIGHT);

  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('production-page')).toContainText('Fight Night');
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(19);

  const installed = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows().find((s) => s.name === 'Fight Night');
    if (!show) return null;
    const byId = new Map(show.graphics.map((g) => [g.id, g.name]));
    return {
      graphics: show.graphics.length,
      layers: show.graphics.map((g) => g.layer),
      cueLabels: (show.cues ?? []).slice(0, 4).map((c) => c.label),
      // The rundown interleaves graphics (the whole point of the top-level cue list):
      // both fight-bug cues air the SAME pool graphic, rounds apart.
      bugCues: (show.cues ?? []).filter((c) => byId.get(c.sourceId) === 'Fight bug').length,
      roundTwoAfterStats:
        (show.cues ?? []).findIndex((c) => c.label === 'Round 2 - bug up') >
        (show.cues ?? []).findIndex((c) => c.label === 'Mid-fight stats'),
    };
  });
  expect(installed).toEqual({
    graphics: 12,
    layers: [5, 6, 7, 8, 9, 10, 12, 14, 15, 16, 17, 19],
    cueLabels: ['Opening slate', 'Main card rundown', 'Wipe to bout 1', 'Bout 1 - matchup'],
    bugCues: 2,
    roundTwoAfterStats: true,
  });
});

test('a broken or too-new pack is refused with a readable message', async ({ page }) => {
  await page.goto('/app#/home/productions');
  const card = page.getByTestId('import-pack-card');
  await expect(card).toBeVisible();

  // Not JSON at all.
  await card.getByTestId('import-pack-file').setInputFiles({
    name: 'not-a-pack.noacgpack.json',
    mimeType: 'application/json',
    buffer: Buffer.from('hello'),
  });
  await expect(card.locator('.status-bad')).toContainText('not readable JSON');

  // A pack from a NEWER format version refuses honestly instead of guessing (rule 6).
  await card.getByTestId('import-pack-file').setInputFiles({
    name: 'future.noacgpack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'noacg-pack', version: 99, name: 'X', graphics: [] })),
  });
  await expect(card.locator('.status-bad')).toContainText('newer version of NoaCG Studio');
});
