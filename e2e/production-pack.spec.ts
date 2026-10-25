// covers: src/components/{editorFoundation/EditorFoundation,save/{SaveControls,SaveDialogs}}.tsx
// focus
//
// The graphics-pack ROUND TRIP (src/packs/graphicsPack.ts buildPack + the export dialog's
// download): one spec drives export -> re-import through the real UI, plus the shipped Fight Night
// pack's install (rundown order included) - so the format owner and both UI ends select it,
// unioning with the pack-import covers lines.
// covers: src/{packs/**,components/home/{ProductionExportDialog.tsx,sections/ProductionsSection.tsx}}
//
// The pack CONTENT and its builder: the sample-import test drives the built file end to
// end (import gate included), so editing a pack graphic or the assembler selects it.
// covers: {packs/**,public/packs/**,scripts/build-production-pack.mjs}
// covers: src/components/home/ProductionShell.tsx

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

// THE ELECTION REHEARSAL PACKAGE (docs/work-specs/playout-election-package/spec.md, E7.2a, AC-1):
// the shipped pack installs four graphics already connected (bindings, the candidate collection
// recipe, three candidate cues and the first synthetic count), so preview and Take need no binding
// by hand; the cue editor's Live candidate menu is the selection writer; and the production
// exports and imports again with its fonts, its picture, its labels and its data.
const ELECTION = fileURLToPath(new URL('../public/packs/election-rehearsal.noacgpack.json', import.meta.url));
const program = (page: import('@playwright/test').Page, title: string) => page.frameLocator(`[data-testid="program-stage"] iframe[title="${title}"]`);
const previewFrame = (page: import('@playwright/test').Page) => page.frameLocator('[data-testid="production-preview"] iframe');
const cueRow = (page: import('@playwright/test').Page, label: string) => page.getByTestId('cue-list').locator('.pd-cue').filter({ hasText: label }).first();
async function takeCue(page: import('@playwright/test').Page, label: string) {
  await cueRow(page, label).locator('.pd-cue-label').click();
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  await page.getByTestId('verb-take').click();
}
async function installElection(page: import('@playwright/test').Page) {
  await page.goto('/app#/home/productions');
  await page.getByTestId('import-pack-card').getByTestId('import-pack-file').setInputFiles(ELECTION);
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(6);
}
const stored = (page: import('@playwright/test').Page, name: string) =>
  page.evaluate(async (n) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().filter((s) => s.name === n).map((s) => JSON.parse(JSON.stringify(s)));
  }, name);

test('the election package installs connected: preview and Take all four, and the Live candidate menu writes the cue', async ({ page }) => {
  test.setTimeout(120_000);
  await installElection(page);
  const [show] = await stored(page, 'Election night rehearsal');
  expect(show.graphics.map((g: { name: string; layer: number }) => [g.name, g.layer])).toEqual([['Party totals', 10], ['Candidate card', 20], ['Count bug', 30], ['Ticker', 40]]);
  expect(show.collections).toHaveLength(1);
  expect(show.cues.map((c: { selection?: unknown }) => c.selection ?? null)).toEqual([
    null, null,
    { v: 1, recipe: 'candidates', key: ['02', 101] },
    { v: 1, recipe: 'candidates', key: ['01', 101] },
    { v: 1, recipe: 'candidates', key: ['02', 103] },
    null,
  ]);
  expect(Object.keys(show.bindings['Party totals'])).toHaveLength(22);
  expect(show.sources).toBeUndefined();

  // Every graphic previews and takes with the starter count, nothing bound by hand.
  await cueRow(page, 'Party totals').locator('.pd-cue-label').click();
  await expect(previewFrame(page).locator('#f7')).toHaveText('22.3%');
  await takeCue(page, 'Party totals');
  await expect(program(page, 'Party totals').locator('#f7')).toHaveText('22.3%');
  await expect(program(page, 'Party totals').locator('#f8')).toHaveText('225,000');
  await expect(program(page, 'Party totals').locator('#f54')).toHaveText('Synthetic rehearsal results, not a real count');
  await takeCue(page, 'Count status');
  await expect(program(page, 'Count bug').locator('#f2')).toHaveText('60 of 100 areas counted');
  await takeCue(page, 'Headlines');
  await expect(program(page, 'Ticker').locator('.tk-crawl')).toContainText('Counts shown here are synthetic rehearsal data');

  // Two people with one number in two districts: each cue shows its own.
  await cueRow(page, 'Leo Example').locator('.pd-cue-label').click();
  await expect(previewFrame(page).locator('#f0')).toHaveText('Leo Example');
  await takeCue(page, 'Aino Example');
  const card = program(page, 'Candidate card');
  await expect(card.locator('#f0')).toHaveText('Aino Example');
  await expect(card.locator('#f1')).toHaveText('National Coalition · Uusimaa');
  await expect(card.locator('#f2')).toHaveText('3,500');
  await expect(page.getByTestId('cue-candidate-f0').locator('input')).toHaveValue('Aino Example');

  // THE WRITER: the aired cue now picks Sara. The record changes at once; the picture keeps Aino
  // until Update, which then changes every field of the card together.
  const pick = page.getByTestId('cue-candidate-pick');
  await expect(pick).toHaveValue(JSON.stringify(['candidates', ['02', 101]]));
  await pick.selectOption(JSON.stringify(['candidates', ['02', 103]]));
  await expect.poll(async () => (await stored(page, 'Election night rehearsal'))[0].cues[2].selection).toEqual({ v: 1, recipe: 'candidates', key: ['02', 103] });
  await expect(page.getByTestId('cue-candidate-unsent')).toBeVisible();
  await expect(card.locator('#f0')).toHaveText('Aino Example');
  await page.getByTestId('verb-update').click();
  await expect(card.locator('#f0')).toHaveText('Sara Example');
  await expect(card.locator('#f1')).toHaveText('Greens · Uusimaa');
  await expect(card.locator('#f2')).toHaveText('2,100');
  await expect(page.getByTestId('cue-candidate-unsent')).toHaveCount(0);

  // FIXED VALUES detaches the cue with what the candidate showed; picking again reconnects it.
  await pick.selectOption('');
  await expect.poll(async () => {
    const cue = (await stored(page, 'Election night rehearsal'))[0].cues[2];
    return [cue.selection ?? null, cue.values.f0, cue.values.f2];
  }).toEqual([null, 'Sara Example', '2,100']);
  await expect(page.getByTestId('cue-field-f0')).toBeEditable();
  await pick.selectOption(JSON.stringify(['candidates', ['02', 101]]));
  await expect.poll(async () => (await stored(page, 'Election night rehearsal'))[0].cues[2].selection).toEqual({ v: 1, recipe: 'candidates', key: ['02', 101] });
  await expect(page.getByTestId('cue-candidate-f0').locator('input')).toHaveValue('Aino Example');

  // A record the reader refuses is never written, and the list the page is handed is untouched.
  const refused = await page.evaluate(async () => {
    const S = await import('/src/model/shows.ts');
    const { selectionCheck } = await import('/src/control/sourceMapping.ts');
    const show = S.loadShows().find((s) => s.name === 'Election night rehearsal')!;
    const cue = show.cues![2];
    const r = S.setCueSelection(show.id, cue.id, { v: 1, recipe: 'nowhere', key: ['02', 101] }, selectionCheck);
    return { error: r.error, handed: r.shows.find((s) => s.id === show.id)!.cues![2].selection, stored: S.loadShows().find((s) => s.id === show.id)!.cues![2].selection };
  });
  expect(refused.error).toMatch(/does not have/);
  expect([refused.handed, refused.stored]).toEqual([{ v: 1, recipe: 'candidates', key: ['02', 101] }, { v: 1, recipe: 'candidates', key: ['02', 101] }]);
});

test('the election production exports and imports again with its fonts, picture, labels, picks and data', async ({ page }) => {
  test.setTimeout(120_000);
  await installElection(page);
  await settleDurableWrites(page);
  await page.getByTestId('production-home').click();
  await page.getByTestId('home-nav-productions').click();
  await page.getByTestId('export-production-row').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('prod-export-pack').click()]);
  const text = readFileSync(await download.path(), 'utf8');
  const pack = JSON.parse(text);
  const shipped = JSON.parse(readFileSync(ELECTION, 'utf8'));
  expect(pack.version).toBe(3);
  // Assets ride along byte for byte: each graphic's font, and the card's portrait silhouette.
  expect(pack.graphics.map((g: { assets: { path: string; data: string }[] }) => g.assets)).toEqual(shipped.graphics.map((g: { assets: unknown }) => g.assets));
  expect(pack.graphics[1].assets.map((a: { path: string }) => a.path)).toEqual(['fonts/manrope.woff2', 'images/portrait.svg']);
  expect(pack.graphics.map((g: { html: string }) => g.html)).toEqual(shipped.graphics.map((g: { html: string }) => g.html));
  expect([pack.data, pack.bindings, pack.collections]).toEqual([shipped.data, shipped.bindings, shipped.collections]);
  expect(pack.cues.map((c: { label: string; selection?: unknown }) => [c.label, c.selection ?? null])).toEqual(shipped.cues.map((c: { label: string; selection?: unknown }) => [c.label, c.selection ?? null]));
  // No source, address, key or credential travels: the rebind is explicit.
  expect(pack.sources).toBeUndefined();
  expect(text).not.toMatch(/data_key|dataKey|bearer|password|token/i);
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByTestId('import-pack-card').getByTestId('import-pack-file').setInputFiles({ name: 'again.noacgpack.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByTestId('production-page')).toBeVisible();
  const [first, again] = await stored(page, 'Election night rehearsal');
  expect(again).toBeTruthy();
  const shape = (s: { graphics: { name: string; layer: number; template: { assets: unknown; fields: unknown } }[]; cues: { label: string; values: unknown; selection?: unknown }[]; data: unknown; bindings: unknown; collections: unknown }) => ({
    graphics: s.graphics.map((g) => [g.name, g.layer, g.template.assets, g.template.fields]),
    cues: s.cues.map((c) => [c.label, c.values, c.selection ?? null]),
    data: s.data,
    bindings: s.bindings,
    collections: s.collections,
  });
  expect(shape(again)).toEqual(shape(first));
  await takeCue(page, 'Aino Example');
  await expect(program(page, 'Candidate card').locator('#f2')).toHaveText('3,500');
});
