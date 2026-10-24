// covers: src/control/connectorReview.ts, src/components/home/CueEditor.tsx, src/export/spxLeftBehind.ts
// covers: src/control/sourceMapping.ts, src/model/shows.ts
//
// SAMPLE-BASED API MAPPING IN CONNECT DATA (docs/work-specs/playout-api-mapping/spec.md, E5.2;
// AC-1, AC-3, AC-4), in the browser with no backend: a JSON endpoint's sample is a stub this spec
// serves at NoaCG's hosted fetcher (`/api/data/feed?as=json`), which is what the page asks for a
// public address. The route's guard and the agent's sample through the real database are
// scripts/connector-sample.test.mjs and e2e/configured/external-data-connector.spec.ts.
//
// - The first walk connects two graphics from one nested sample with no path syntax: it inspects
//   the matches, the sample, the rendered PREVIEW and the cues affected, repairs one mismatch,
//   cancels another review, fills a cue from the same source and then changes the source. A sample
//   never reaches PROGRAM or the tree, and the starter download still matches the graphic.
// - The second saves, reloads and reconnects: the recipe, the source and the stable keys stay; a
//   changed schema marks the field for repair and keeps it connected until a pick; a replace made
//   on a stale review is refused; a later recipe version is read-only; the export carries the
//   non-secret recipe and no credential.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { addCatalogGraphic, bootstrapGraphic, openProductionWithCurrent } from './_create';
import { awaitDurableReady, settleDurableWrites } from './_durable';
import { PRODUCTION_DATA_KEY } from '../src/model/productionState';

const ENDPOINT = 'https://results.example/live/guests';
/** A provider's nested answer: the guest's name and post under their own words, and a list. */
const GUESTS = (name: string, position: string) => ({
  updated: '2026-10-24T18:30:00Z',
  guest: { name, position, team: { id: 'T1', city: 'Espoo' } },
  panel: [
    { id: 'p1', name: 'Aino', seat: 1 },
    { id: 'p2', name: 'Eero', seat: 2 },
  ],
});

/** The hosted fetcher's stub: it answers whatever `sample` holds at the moment of the read. */
async function stubSample(page: Page, sample: unknown) {
  const hosted = { sample, asked: [] as { url: string; auth: string | undefined }[] };
  await page.context().route(/\/api\/data\/feed\?as=json/, async (route) => {
    hosted.asked.push({ url: new URL(route.request().url()).searchParams.get('url') ?? '', auth: route.request().headers().authorization });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, sample: hosted.sample }) });
  });
  return hosted;
}

async function stored(page: Page, showId: string) {
  return page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows().find((s) => s.id === id);
    return { bindings: show?.bindings ?? {}, sources: (show?.sources ?? []) as { id: string; kind: string; label: string; config: Record<string, unknown> }[] };
  }, showId);
}

/** The production's live tree as stored: a sample must never appear in it. */
const tree = (page: Page) => page.evaluate((key) => localStorage.getItem(key) ?? '', PRODUCTION_DATA_KEY);

async function openReview(page: Page) {
  await page.getByTestId('cue-connect').click();
  const review = page.getByTestId('cue-connect-menu');
  await expect(review).toBeVisible();
  return review;
}

async function readAddress(page: Page) {
  const review = await openReview(page);
  await review.getByTestId('cue-connect-link').fill(ENDPOINT);
  await review.getByTestId('cue-connect-read').click();
  await expect(review.getByTestId('cue-connect-map')).toBeVisible();
  return review;
}

async function reuseConnector(page: Page) {
  const review = await openReview(page);
  await review.getByTestId('cue-connect-reuse').selectOption({ label: 'Connector: Guests' });
  await expect(review.getByTestId('cue-connect-map')).toBeVisible();
  return review;
}

async function starterCsv(page: Page): Promise<string> {
  const review = await openReview(page);
  const [download] = await Promise.all([page.waitForEvent('download'), review.getByTestId('cue-connect-template').click()]);
  await page.keyboard.press('Escape');
  await expect(review).toBeHidden();
  return readFileSync((await download.path())!, 'utf8');
}

test('two graphics connect from one nested sample with no path syntax; repair, cancel, Fill; a sample never airs', async ({ page }) => {
  test.setTimeout(120_000);
  const hosted = await stubSample(page, GUESTS('Aino Virtanen', 'Mayor of Espoo'));
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const showId = await openProductionWithCurrent(page, 'Guest Night');
  await addCatalogGraphic(page, showId, 'Underline');
  const cues = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(cues).toHaveCount(2);
  await cues.nth(0).locator('.pd-cue-label').click();
  const preview = page.frameLocator('iframe[title="Cue preview"]');
  const program = page.frameLocator('[data-testid="program-stage"] iframe[title="Hairline"]');
  const starterBefore = await starterCsv(page);
  const treeBefore = await tree(page);

  // ── Hairline: the address is read, every field proposed under the sample's own words. ──
  let review = await readAddress(page);
  expect(hosted.asked).toEqual([{ url: ENDPOINT, auth: undefined }]);
  await expect(review.getByTestId('cue-connect-row-f0')).toHaveAttribute('data-status', 'name');
  await expect(review.getByTestId('cue-connect-row-f1')).toHaveAttribute('data-status', 'unmatched');
  await expect(review.getByTestId('cue-connect-row-f0')).toContainText('Aino Virtanen');
  await expect(review.getByTestId('cue-connect-summary')).toContainText('1 connected · 1 needs attention · Used by 1 cue');
  // The pick lists the sample's values by their words, never a path.
  const options = await review.getByTestId('cue-connect-pick-f1').locator('option').allTextContents();
  expect(options).toEqual(['Not connected', 'updated', 'name', 'position', 'id', 'city']);
  // The rendered output: the sample on the real graphic, on PREVIEW only.
  await expect(preview.locator('#f0')).toHaveText('Aino Virtanen');
  // Repair the mismatch by a pick, by its words.
  await review.getByTestId('cue-connect-pick-f1').selectOption({ label: 'position' });
  await expect(review.getByTestId('cue-connect-row-f1')).toContainText('Mayor of Espoo');
  await expect(review.getByTestId('cue-connect-summary')).toContainText('2 connected · 0 need attention');
  await expect(preview.locator('#f1')).toHaveText('Mayor of Espoo');
  await review.getByTestId('cue-connect-label').fill('Guests');
  await review.getByTestId('cue-connect-confirm').click();
  await expect(review).toBeHidden();

  let saved = await stored(page, showId);
  expect(saved.sources).toHaveLength(1);
  const id = saved.sources[0].id;
  expect(saved.sources[0]).toEqual({
    id,
    kind: 'external',
    label: 'Guests',
    config: { v: 1, configRevision: 1, endpoint: ENDPOINT, mapping: { v: 1, sourceId: id, configRevision: 1, outputs: { 'guest.name': { from: 'guest.name' }, 'guest.position': { from: 'guest.position' } } } },
  });
  expect(saved.bindings).toEqual({ Hairline: { f0: `external.${id}.guest.name`, f1: `external.${id}.guest.position` } });
  // Connected, it waits for the source's own next read: the sample was never applied.
  await expect(page.getByTestId('cue-bound-f0')).toContainText('Connector: Guests');
  await expect(page.getByTestId('cue-bound-f0').locator('input')).toHaveValue('');
  await expect(page.getByTestId('cue-bound-f0').locator('input')).toHaveAttribute('placeholder', 'waits for the next read');
  await expect(page.getByTestId('cue-connected-mark').first()).toHaveAttribute('title', 'Connected to Connector: Guests · mapping v1');
  expect(await tree(page)).toBe(treeBefore);
  await expect(program.locator('#f0')).not.toHaveText(/Aino|Eero/);
  // The review gone, PREVIEW shows the cue again: the sample's values leave with it.
  await expect(preview.locator('#f0')).not.toHaveText('Aino Virtanen');

  // ── Underline: the same source, its consumers named; Cancel changes nothing. ──
  await cues.nth(1).locator('.pd-cue-label').click();
  await expect(page.getByTestId('cue-field-f0')).toBeVisible();
  const underlineName = await page.getByTestId('cue-field-f0').inputValue();
  review = await reuseConnector(page);
  await expect(review.getByTestId('cue-connect-row-f0')).toHaveAttribute('data-status', 'name');
  await expect(review.getByTestId('cue-connect-summary')).toContainText('Used by 2 cues');
  await expect(preview.locator('#f0')).toHaveText('Aino Virtanen');
  await review.getByTestId('cue-connect-cancel').click();
  await expect(review).toBeHidden();
  await expect(preview.locator('#f0')).toHaveText(underlineName);
  expect(await stored(page, showId)).toEqual(saved);
  await expect(page.getByTestId('cue-field-f0')).toHaveValue(underlineName);

  // ── Fill: the same source's values copied into the cue, connecting nothing. ──
  review = await reuseConnector(page);
  await review.getByTestId('cue-connect-pick-f1').selectOption({ label: 'position' });
  await review.getByTestId('cue-connect-fill').click();
  await expect(review).toBeHidden();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Aino Virtanen');
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('Mayor of Espoo');
  expect(await stored(page, showId)).toEqual(saved);

  // ── Then connect Underline's name only: one key, two graphics. ──
  review = await reuseConnector(page);
  await review.getByTestId('cue-connect-pick-f1').selectOption({ label: 'Not connected' });
  await review.getByTestId('cue-connect-confirm').click();
  await expect(review).toBeHidden();
  saved = await stored(page, showId);
  expect(saved.bindings).toEqual({ Hairline: { f0: `external.${id}.guest.name`, f1: `external.${id}.guest.position` }, Underline: { f0: `external.${id}.guest.name` } });
  expect(Object.keys((saved.sources[0].config.mapping as { outputs: object }).outputs)).toEqual(['guest.name', 'guest.position']);

  // ── The source changes: the filled cue keeps its snapshot. ──
  hosted.sample = GUESTS('Eero Laine', 'Minister');
  review = await reuseConnector(page);
  await expect(preview.locator('#f0')).toHaveText('Eero Laine');
  await review.getByTestId('cue-connect-cancel').click();
  await expect(review).toBeHidden();
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('Mayor of Espoo');
  await settleDurableWrites(page);
  expect(await page.evaluate(async (sid) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows().find((s) => s.id === sid)!;
    const underline = show.graphics.find((g) => g.name === 'Underline')!;
    return show.cues!.find((c) => c.sourceId === underline.id)!.values?.f1;
  }, showId)).toBe('Mayor of Espoo');

  // ── Nothing reached PROGRAM or the tree, and the starter data still matches the graphic. ──
  expect(await tree(page)).toBe(treeBefore);
  await expect(program.locator('#f0')).not.toHaveText(/Aino|Eero/);
  await cues.nth(0).locator('.pd-cue-label').click();
  await expect(page.getByTestId('cue-bound-f0')).toBeVisible();
  expect(await starterCsv(page)).toBe(starterBefore);
});

/** A production with Hairline connected to the Guests connector through the page's own writer. */
async function seedConnected(page: Page): Promise<{ showId: string; id: string }> {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const showId = await openProductionWithCurrent(page, 'Reload Night');
  const review = await readAddress(page);
  await review.getByTestId('cue-connect-pick-f1').selectOption({ label: 'position' });
  await review.getByTestId('cue-connect-label').fill('Guests');
  await review.getByTestId('cue-connect-confirm').click();
  await expect(review).toBeHidden();
  const { sources } = await stored(page, showId);
  return { showId, id: sources[0].id };
}

test('save, reload and reconnect keep the recipe; a changed schema asks for repair; a stale replace is refused; a later recipe is read-only; the export is non-secret', async ({ page }) => {
  test.setTimeout(120_000);
  const hosted = await stubSample(page, GUESTS('Aino Virtanen', 'Mayor of Espoo'));
  const { showId, id } = await seedConnected(page);
  const before = await stored(page, showId);
  await settleDurableWrites(page);

  // ── Reload and reconnect: nothing lost. ──
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  await awaitDurableReady(page);
  expect(await stored(page, showId)).toEqual(before);
  await expect(page.getByTestId('cue-bound-f0')).toContainText('Connector: Guests');
  let review = await reuseConnector(page);
  await expect(review.getByTestId('cue-connect-pick-f0')).toHaveValue(`external.${id}.guest.name`);
  await expect(review.getByTestId('cue-connect-pick-f1')).toHaveValue(`external.${id}.guest.position`);
  await expect(review.getByTestId('cue-connect-summary')).toContainText('2 connected · 0 need attention · Used by 1 cue');
  await review.getByTestId('cue-connect-cancel').click();

  // ── The provider renames a key: the field is marked for repair and stays connected. ──
  hosted.sample = { ...GUESTS('Aino Virtanen', 'x'), guest: { full_name: 'Aino Virtanen', position: 'Mayor of Espoo' } };
  review = await reuseConnector(page);
  await expect(review.getByTestId('cue-connect-repair-f0')).toHaveText('not in the sample: pick another');
  await expect(review.getByTestId('cue-connect-summary')).toContainText('1 needs attention');
  await expect(review.getByTestId('cue-connect-pick-f0')).toHaveValue(`external.${id}.guest.name`);
  // Connect with no pick changes nothing: no silent retarget.
  await review.getByTestId('cue-connect-confirm').click();
  await expect(review).toBeHidden();
  expect(await stored(page, showId)).toEqual(before);
  // The repair is a pick, and the recipe follows it under the same config revision.
  review = await reuseConnector(page);
  await review.getByTestId('cue-connect-pick-f0').selectOption({ label: 'full name' });
  await expect(preview(page).locator('#f0')).toHaveText('Aino Virtanen');
  await review.getByTestId('cue-connect-confirm').click();
  await expect(review).toBeHidden();
  const repaired = await stored(page, showId);
  expect(repaired.bindings.Hairline).toEqual({ f0: `external.${id}.guest.full_name`, f1: `external.${id}.guest.position` });
  expect(repaired.sources[0].config).toEqual({
    v: 1,
    configRevision: 1,
    endpoint: ENDPOINT,
    mapping: { v: 1, sourceId: id, configRevision: 1, outputs: { 'guest.full_name': { from: 'guest.full_name' }, 'guest.position': { from: 'guest.position' } } },
  });

  // ── A replace made on a review the configuration moved under is refused, whole. ──
  review = await reuseConnector(page);
  await review.getByTestId('cue-connect-pick-f1').selectOption({ label: 'Not connected' });
  const moved = await page.evaluate(async ({ sid, src }) => {
    const { connectConnectorSource, loadShows } = await import('/src/model/shows.ts');
    const source = loadShows().find((s) => s.id === sid)!.sources!.find((s) => s.id === src)!;
    const config = { ...(source.config as Record<string, unknown>), endpoint: `${(source.config as { endpoint: string }).endpoint}?moved=1` };
    return connectConnectorSource(sid, { ...source, config } as never, [], JSON.stringify(source.config)).error;
  }, { sid: showId, src: id });
  expect(moved).toBeNull();
  await review.getByTestId('cue-connect-confirm').click();
  await expect(review.getByTestId('cue-connect-save-error')).toContainText('changed while the review was open');
  expect((await stored(page, showId)).bindings.Hairline.f1).toBe(`external.${id}.guest.position`);
  await review.getByTestId('cue-connect-cancel').click();

  // ── The export: the registration and its non-secret recipe, which a new production rebinds. ──
  const exported = () =>
    page.evaluate(async ({ sid }) => {
      const { loadShows } = await import('/src/model/shows.ts');
      const { buildShowZip } = await import('/src/export/showExport.ts');
      const zip = await buildShowZip(loadShows().find((s) => s.id === sid)!);
      const readme = await zip.file(/^[^/]+\/README\.md$/)[0].async('string');
      return readme.slice(readme.indexOf('- **The connector'), readme.indexOf('\n- **', readme.indexOf('- **The connector') + 1));
    }, { sid: showId });
  const item = await exported();
  expect(item).toContain(`The connector Guests** (${ENDPOINT})`);
  expect(item).not.toContain('moved=1');
  expect(item).toContain('register it in the new\n  production and start its agent for that production');
  expect(item).toContain(JSON.stringify(repaired.sources[0].config.mapping));
  expect(item).not.toMatch(/bearer|authorization|token|secret/i);

  // ── A recipe of a later version: kept, read-only, never offered for editing or exported. ──
  const later = await page.evaluate(async ({ sid, src }) => {
    const { connectConnectorSource, loadShows } = await import('/src/model/shows.ts');
    const source = loadShows().find((s) => s.id === sid)!.sources!.find((s) => s.id === src)!;
    const config = { ...(source.config as Record<string, unknown>), mapping: { v: 2, steps: ['a later shape'] } };
    const set = connectConnectorSource(sid, { ...source, config } as never, [], JSON.stringify(source.config)).error;
    const again = connectConnectorSource(sid, source as never, [], JSON.stringify(config)).error;
    return { set, again };
  }, { sid: showId, src: id });
  expect(later.set).toBeNull();
  expect(later.again).toMatch(/read-only/);
  review = await openReview(page);
  await expect(review.getByTestId('cue-connect-reuse').locator('option', { hasText: 'Connector: Guests' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cue-connected-mark').first()).toHaveAttribute('title', 'Connected to Connector: Guests · a later version, read-only');
  const kept = await stored(page, showId);
  expect(kept.sources[0].config.mapping).toEqual({ v: 2, steps: ['a later shape'] });
  expect(kept.bindings.Hairline.f0).toBe(`external.${id}.guest.full_name`);
  const laterItem = await exported();
  expect(laterItem).toContain('one this build does not read, left out');
  expect(laterItem).not.toContain('a later shape');
});

const preview = (page: Page) => page.frameLocator('iframe[title="Cue preview"]');

test('a ticker reads the sample\'s list: the record key kept, a column picked by its key, the list registered', async ({ page }) => {
  test.setTimeout(90_000);
  await stubSample(page, GUESTS('Aino Virtanen', 'Mayor of Espoo'));
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const showId = await openProductionWithCurrent(page, 'Panel Night');
  // The connector exists (Hairline reads it); the ticker reuses it.
  let review = await readAddress(page);
  await review.getByTestId('cue-connect-label').fill('Guests');
  await review.getByTestId('cue-connect-confirm').click();
  await expect(review).toBeHidden();
  await addCatalogGraphic(page, showId, 'Index Strip');
  await page.getByTestId('cue-list').locator('.pd-cue').nth(1).locator('.pd-cue-label').click();
  review = await reuseConnector(page);
  const id = (await stored(page, showId)).sources[0].id;
  // The one list in the sample is the list field's candidate, read by its first key after the id.
  await expect(review.getByTestId('cue-connect-pick-f0')).toHaveValue(`external.${id}.panel`);
  await expect(review.getByTestId('cue-connect-column-f0-0')).toHaveValue('name');
  await expect(preview(page).locator('#f0')).toHaveText('Aino\nEero');
  await review.getByTestId('cue-connect-column-f0-0').selectOption('seat');
  await expect(preview(page).locator('#f0')).toHaveText('1\n2');
  await review.getByTestId('cue-connect-confirm').click();
  await expect(review).toBeHidden();
  const { sources, bindings } = await stored(page, showId);
  expect(bindings['Index Strip']).toEqual({ f0: `external.${id}.panel` });
  expect(sources[0].config.lists).toEqual({ panel: 'lines' });
  expect((sources[0].config.mapping as { outputs: Record<string, unknown> }).outputs.panel).toEqual({ from: 'panel', id: 'id', columns: [{ from: 'seat' }] });
});
