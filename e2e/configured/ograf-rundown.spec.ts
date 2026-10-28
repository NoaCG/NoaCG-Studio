// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). Only a real backend publishes a package and serves its files.
//
// A STRANGER'S OGRAF PACKAGE IN A NORMAL MIXED RUNDOWN, ON A REAL BROWSER OUTPUT
// (docs/work-specs/playout-ograf-rundown/spec.md, E3.2a, AC-2). One production holds a NoaCG graphic
// and two cues over an imported package (e2e/fixtures/foreign-ograf/rundown/), published. The output
// asks the server for the package's sealed base (api/_lib/outputOgraf.ts, migration 0105) and mounts
// it behind the isolation boundary. An All-together Take with one child the Graphic refuses reports
// each child on its own; Update, a typed Update, » Next, a declared action and Out all reach the
// package, read from the OUTPUT's frame (its instance id, the values it was given as it got them);
// a Take on the package's layer by a NoaCG graphic replaces it there; a folder whose children share
// a layer is refused before anything is sent. The production page's PROGRAM monitor draws a plate
// for the package (it never loads one) and lists what the outputs said, apart from its picture.
// covers: src/output/stage.ts, src/output/main.ts, src/output/foreignOgraf.ts, src/control/ografOutcome.ts
// covers: src/control/hostedControl.ts, src/backend/productionOgraf.ts, api/_lib/outputOgraf.ts, api/output/assets.ts
// covers: supabase/migrations/0105_output_ograf_files.sql, src/components/home/PlayoutMonitors.tsx

import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishProduction } from '../_publish';
import { bootstrapGraphic } from '../_create';
import { parkFocusOffControls } from '../_keys';
import { settleDurableWrites } from '../_durable';
import { clearPublishedShows, haveCreds, SERVICE_ROLE_KEY, signIn, SUPABASE_URL, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds || !SERVICE_ROLE_KEY, 'E2E_EMAIL / E2E_PASSWORD / SUPABASE_SERVICE_ROLE_KEY unset - configured-mode spec');

const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PACKAGE = fileURLToPath(new URL('../fixtures/foreign-ograf/rundown/', import.meta.url));

async function packageZip(): Promise<string> {
  const zip = new JSZip();
  for (const name of readdirSync(PACKAGE)) zip.file(`rundown/${name}`, readFileSync(join(PACKAGE, name)));
  return (await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })).toString('base64');
}

type Row = { id: number; graphic: string; msg: { t: string } };
async function commands(showId: string): Promise<Row[]> {
  const { data, error } = await admin().from('control_events').select('id, graphic, msg').eq('show_id', showId).order('id');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).filter((r) => !['live', 'cue', 'staged', 'ping'].includes(r.msg?.t));
}

/** What the output's report holds for a graphic's package (its `state.ograf`). */
async function reported(showId: string, graphic: string): Promise<{ i?: string; call?: string; status?: string; on?: boolean } | null> {
  const { data } = await admin().from('control_heads').select('live').eq('show_id', showId).single();
  return ((data?.live ?? {}) as Record<string, { state?: { ograf?: { i?: string } } }>)[graphic]?.state?.ograf ?? null;
}

const rundown = (page: Page) => page.getByTestId('cue-list');
const folder = (page: Page, name: string) => rundown(page).locator('.pd-folder', { hasText: name });
const cueRow = (page: Page, label: string) => rundown(page).locator('.pd-cue').filter({ has: page.locator('.pd-cue-label strong', { hasText: new RegExp(`^${label}$`) }) });

test('a mixed rundown takes a foreign package on a real output: per-child outcomes, same-layer replacement, a refused collision, the outputs apart from the simulation', async ({ page, context }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Strap' });

  const showId = await page.evaluate(async (zip) => {
    const { importForeignOgraf } = await import('/src/export/targets/ografForeign.ts');
    const m = await import('/src/model/shows.ts');
    const { deleteGraphic, loadGraphics } = await import('/src/model/library.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { useRouter } = await import('/src/app/router.ts');
    const read = await importForeignOgraf('rundown.zip', Uint8Array.from(atob(zip), (c) => c.charCodeAt(0)));
    if (!read || !read.ok) throw new Error(`the package did not import: ${read && !read.ok ? read.reason : 'not foreign'}`);
    const { template } = useTemplateStore.getState();
    for (const g of loadGraphics()) deleteGraphic(g.id);
    const { show, error } = m.createShowNamedChecked(`Mixed ${Date.now()}`);
    if (error) throw new Error(error);
    const add = (t: typeof template, name: string, layer: number) => {
      m.addGraphicToShow(show.id, { ...t, name });
      const g = m.loadShows().find((s) => s.id === show.id)!.graphics.find((x) => x.name === name)!;
      m.setShowGraphicLayer(show.id, g.id, layer);
      return g.id;
    };
    add(template, 'Strap', 20);
    const board = add(read.template, 'Board', 21);
    add(read.template, 'Poll', 22);
    add(template, 'Bug', 21);
    const cues = () => m.loadShows().find((s) => s.id === show.id)!.cues!;
    const cueOf = (graphicName: string) => {
      const g = m.loadShows().find((s) => s.id === show.id)!.graphics.find((x) => x.name === graphicName)!;
      return cues().find((c) => c.sourceId === g.id)!;
    };
    m.updateShowCueChecked(show.id, cueOf('Board').id, { label: 'Board', values: { headline: 'Opening', score: '3' } });
    m.updateShowCueChecked(show.id, cueOf('Poll').id, { label: 'Poll', values: { headline: 'Poll', fail: 'yes' } });
    m.updateShowCueChecked(show.id, cueOf('Strap').id, { label: 'Strap' });
    m.updateShowCueChecked(show.id, cueOf('Bug').id, { label: 'Bug' });
    const again = m.addShowCue(show.id, board, { label: 'Board again', values: { headline: 'Again', score: '1' } });
    const opening = m.addFolderFromSelection(show.id, [cueOf('Strap').id, cueOf('Board').id, cueOf('Poll').id], 'Opening');
    m.setFolderMode(show.id, opening.folderId!, 'together');
    const clash = m.addFolderFromSelection(show.id, [cueOf('Bug').id, again.cueId!], 'Clash');
    m.setFolderMode(show.id, clash.folderId!, 'together');
    const failure = await commitDurableWrites();
    if (failure) throw new Error(failure);
    useRouter.getState().navigate({ view: 'production', id: show.id });
    await new Promise((resolve) => setTimeout(resolve));
    return show.id;
  }, await packageZip());
  await expect(page.getByTestId('production-page')).toBeVisible();
  await publishProduction(page);
  await page.keyboard.press('Escape');

  // The published payload carries the package as its own files and record, never a composed page.
  const { data: row } = await admin().from('control_shows').select('output_slug, output').eq('id', showId).single();
  const published = (row!.output as { graphics: { key: string; html: string; ograf?: { revision: string } }[] }).graphics;
  expect(published.filter((g) => g.ograf).map((g) => [g.key, g.html])).toEqual([['Board', ''], ['Poll', '']]);

  // THE OUTPUT mounts both packages from the server, behind the boundary.
  const output = await context.newPage();
  await output.goto(`/output?production=${encodeURIComponent(row!.output_slug)}`);
  const boardFrame = output.locator('iframe[data-ograf="foreign"][title="Board"]');
  await expect(boardFrame).toHaveAttribute('sandbox', 'allow-scripts', { timeout: 30_000 });
  await expect(output.locator('iframe[data-ograf="foreign"][title="Poll"]')).toHaveCount(1);
  const board = output.frameLocator('iframe[title="Board"]').locator('.card');
  const poll = output.frameLocator('iframe[title="Poll"]').locator('.card');
  await expect(board).toHaveAttribute('data-on', 'false', { timeout: 30_000 });
  const instance = await boardFrame.getAttribute('data-instance');
  expect(instance).toMatch(/^[0-9a-f]{8}$/);

  // PREPARE: the package is loaded on the output before any Take (its `load()` answered, nothing up),
  // and this page's PREVIEW says it is not previewed here rather than showing an empty frame.
  await expect.poll(async () => (await reported(showId, 'Board'))?.call, { timeout: 20_000 }).toBe('mount');
  expect((await reported(showId, 'Board'))?.status).toBe('done');
  await cueRow(page, 'Board').getByTestId('select-cue').click();
  await expect(page.getByTestId('preview-ograf')).toContainText('Plays on the outputs; no preview here.');

  // ALL TOGETHER, ONE CHILD REFUSED: each child's outcome is its own.
  await folder(page, 'Opening').getByTestId('select-folder').click();
  await parkFocusOffControls(page);
  await expect(page.getByTestId('verb-take')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('production-note')).toContainText('Take: Opening, 1 of 3 on air, 2 sent to the outputs', { timeout: 20_000 });
  await expect(board).toHaveAttribute('data-on', 'true', { timeout: 20_000 });
  await expect(board).toHaveText('Opening 3');
  expect(JSON.parse((await board.getAttribute('data-values'))!)).toEqual({ headline: 'Opening', score: '3', fail: '' });
  await expect(poll).toHaveAttribute('data-on', 'false');
  const confirmed = page.getByTestId('program-confirmed');
  await expect(confirmed.locator('li[data-graphic="Board"]')).toHaveText('Board: on air on the output, step 1', { timeout: 20_000 });
  await expect(confirmed.locator('li[data-graphic="Board"]')).toHaveAttribute('data-tone', 'ok');
  await expect(confirmed.locator('li[data-graphic="Poll"]')).toHaveText('Poll: the graphic refused the Take (503: not ready)');
  await expect(confirmed.locator('li[data-graphic="Poll"]')).toHaveAttribute('data-tone', 'bad');
  // The instance the page's line is about is the output's own, read off its report.
  await expect.poll(async () => (await reported(showId, 'Board'))?.i, { timeout: 20_000 }).toBe(instance);
  // PROGRAM is this page's simulation: it never loads the package, and says so on the picture.
  await expect(page.getByTestId('program-monitor').locator('[data-testid="ograf-unavailable"]', { hasText: 'Board · not shown here' })).toBeVisible();

  // UPDATE, TYPED: the cue's values typed by its manifest reach the Graphic as a number.
  await cueRow(page, 'Board').getByTestId('select-cue').click();
  await page.getByTestId('cue-typed-toggle').check();
  await expect(page.getByTestId('cue-typed-score')).toHaveValue('3');
  await parkFocusOffControls(page);
  await page.getByTestId('verb-update').click();
  await expect.poll(async () => JSON.parse((await board.getAttribute('data-values')) ?? '{}').score, { timeout: 20_000 }).toBe(3);

  // » NEXT and A DECLARED ACTION, confirmed by the output.
  await page.getByTestId('verb-next').click();
  await expect(board).toHaveAttribute('data-step', '1', { timeout: 20_000 });
  await expect(confirmed.locator('li[data-graphic="Board"]')).toHaveText('Board: on air on the output, step 2', { timeout: 20_000 });
  await page.getByTestId('cue-args-mark-v').fill('from the rundown');
  await page.getByTestId('cue-args-mark-v').blur();
  await page.getByTestId('cue-action-mark').click();
  await expect(board).toHaveAttribute('data-mark', 'from the rundown', { timeout: 20_000 });

  // OUT, confirmed by the output; then a Take of the same cue airs the same instance again.
  await parkFocusOffControls(page);
  await page.getByTestId('verb-out').click();
  await expect(board).toHaveAttribute('data-on', 'false', { timeout: 20_000 });
  await expect(confirmed.locator('li[data-graphic="Board"]')).toHaveText('Board: off air on the output', { timeout: 20_000 });
  await page.getByTestId('verb-take').click();
  await expect(board).toHaveAttribute('data-on', 'true', { timeout: 20_000 });
  await expect(confirmed.locator('li[data-graphic="Board"]')).toHaveText('Board: on air on the output, step 1', { timeout: 20_000 });
  expect(await boardFrame.getAttribute('data-instance')).toBe(instance);

  // SAME-LAYER REPLACEMENT: a NoaCG graphic taken on the package's layer takes it off there, by
  // the package's own Out sent with the Take, so the page no longer marks it on air either.
  await cueRow(page, 'Bug').getByTestId('select-cue').click();
  await parkFocusOffControls(page);
  await page.getByTestId('verb-take').click();
  await expect(board).toHaveAttribute('data-on', 'false', { timeout: 20_000 });
  await expect(confirmed.locator('li[data-graphic="Board"]')).toHaveText('Board: off air on the output', { timeout: 20_000 });
  expect((await reported(showId, 'Board'))?.i, 'the same instance, taken off, not a new one').toBe(instance);
  // In the log: the package's Out right before the Take's update and play, after its last Take.
  const rows = await commands(showId);
  const at = (graphic: string, t: string) => rows.findLastIndex((r) => r.graphic === graphic && r.msg.t === t);
  expect(at('Board', 'stop')).toBeGreaterThan(at('Board', 'play'));
  expect(at('Bug', 'play') - at('Board', 'stop'), 'the package\'s Out rode with the Take').toBe(2);

  // A FOLDER WHOSE CHILDREN SHARE A LAYER is refused before anything is sent. Bug goes off first:
  // with one of its cues up, the folder's button would be its Out, not a Take.
  await page.getByTestId('verb-out').click();
  await expect.poll(async () => (await commands(showId)).at(-1)?.msg.t, { timeout: 20_000 }).toBe('stop');
  const sent = (await commands(showId)).length;
  await folder(page, 'Clash').getByTestId('select-folder').click();
  await expect(page.getByTestId('folder-take-blocked')).toContainText('both air on layer 21');
  await expect(page.getByTestId('verb-take')).toBeDisabled();
  expect((await commands(showId)).length).toBe(sent);

  await settleDurableWrites(page);
  await output.close();
  await clearPublishedShows(page);
});
