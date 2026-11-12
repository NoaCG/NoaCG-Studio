// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change.
//
// PER-GRAPHIC REPLACEMENT ON TWO OUTPUTS (docs/work-specs/per-graphic-replacement/spec.md AC-1,
// AC-2, AC-5, G2): one production published to two browser outputs, a scorebug taken on air from
// the production page, then two publishes from its header's Publish changes. The first changes the
// lower third: both outputs swap it in place, each on its own, with the scorebug's frame and the
// page itself untouched. The second changes the scorebug while it is on air: both outputs keep it,
// both rows read "Waiting for clear", and after its Out both swap it. The offline
// e2e/output-prepare.spec.ts covers the same rules on one output in detail.
// covers: src/output/swap.ts, src/output/prepare.ts, src/output/stage.ts, src/output/main.ts, src/control/readiness.ts

import { publishProduction } from '../_publish';
import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic } from '../_create';
import { clearPublishedShows, haveCreds, readyOf, signIn, wipeMyGraphics, unpublishForCleanup, type ReadyWindow } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

const SCOREBUG = 'House Scorebug';
const STRAP = 'Hairline';

/** Bootstrap a catalog graphic and save it in the library, as a graphic made and saved from Home. */
async function libraryGraphic(page: Page, name: string): Promise<void> {
  await bootstrapGraphic(page, { name });
  expect(
    await page.evaluate(async () => {
      const { createGraphic } = await import('/src/model/library.ts');
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const { template } = useTemplateStore.getState();
      const { error } = createGraphic(template, { name: template.name });
      return error ?? (await commitDurableWrites());
    }),
  ).toBeFalsy();
}

/** Edit a production graphic's design in the library, as the editor's save does, then take it
 *  into the production with Update (live-publishing O4): the copy is what publishes. */
async function editInLibrary(page: Page, showId: string, graphic: string, note: string): Promise<void> {
  const edited = await page.evaluate(
    async ([id, name, comment]) => {
      const { loadShows, updateCopyFromLibrary } = await import('/src/model/shows.ts');
      const { loadGraphics, newerLibraryDesign, resolveSavedGraphicDoc, updateGraphic } = await import('/src/model/library.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const pooled = loadShows().find((s) => s.id === id)?.graphics.find((g) => g.name === name);
      const doc = pooled ? resolveSavedGraphicDoc(pooled, loadGraphics()) : undefined;
      if (!pooled || !doc) return false;
      const { error } = updateGraphic(doc.id, { template: { ...doc.template, css: `${doc.template.css}\n/* ${comment} */` } });
      if (error) return false;
      const newer = newerLibraryDesign(pooled, loadGraphics());
      if (!newer) return false;
      const updated = updateCopyFromLibrary(id, pooled.id, newer, pooled.savedAt);
      return !updated.error && !(await commitDurableWrites());
    },
    [showId, graphic, note] as [string, string, string],
  );
  expect(edited, `${graphic} is a library graphic of the production`).toBe(true);
}

/** The frame on air for a graphic on an output (not one prepared beside it). */
const frameOf = (air: Page, graphic: string) => air.locator(`iframe[title="${graphic}"]:not([data-prepared])`);
const mark = (air: Page, graphic: string) => frameOf(air, graphic).evaluate((el) => el.setAttribute('data-probe', 'before'));
const marked = (air: Page, graphic: string) => frameOf(air, graphic).evaluate((el) => el.getAttribute('data-probe'));

test('two outputs each swap a changed graphic in place, and hold one on air until it is cleared', async ({ page, browser }) => {
  test.setTimeout(420_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await libraryGraphic(page, SCOREBUG);
  await libraryGraphic(page, STRAP);
  const showId = await page.evaluate(
    async ([showName, names]) => {
      const { createShowNamedChecked, addGraphicToShow } = await import('/src/model/shows.ts');
      const { loadGraphics } = await import('/src/model/library.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const { useRouter } = await import('/src/app/router.ts');
      const { show, error: notCreated } = createShowNamedChecked(showName);
      if (notCreated) throw new Error(notCreated);
      for (const name of names) {
        const doc = loadGraphics().find((g) => g.name === name);
        if (!doc) throw new Error(`no library graphic ${name}`);
        const { error } = addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
        if (error) throw new Error(error);
      }
      const failure = await commitDurableWrites();
      if (failure) throw new Error(failure);
      useRouter.getState().navigate({ view: 'production', id: show.id });
      // Answer from a later task (rule e2e/async-whose-last-act-starts-work).
      await new Promise((resolve) => setTimeout(resolve));
      return show.id;
    },
    [`Swap ${Date.now()}`, [SCOREBUG, STRAP]] as [string, string[]],
  );
  await expect(page.getByTestId('production-page')).toBeVisible();
  await publishProduction(page);
  await page.getByTestId('production-status').click();
  const outputSlug = await page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((x) => x.id === id)?.outputSlug ?? '';
  }, showId);
  expect(outputSlug).toBeTruthy();

  // Two outputs, signed out as in a studio.
  const anon = await browser.newContext();
  const outputs: { page: Page; reloads: number }[] = [];
  for (const name of ['Desk A', 'Desk B']) {
    const air = await anon.newPage();
    await air.goto(`/output?production=${encodeURIComponent(outputSlug)}&name=${encodeURIComponent(name)}&debug=1`);
    await expect(air.locator('pre')).toContainText('realtime: following', { timeout: 60_000 });
    await expect.poll(() => air.evaluate(() => (window as ReadyWindow).__noacgLive!.presence()), { timeout: 30_000 }).not.toBe('joining');
    if ((await air.evaluate(() => (window as ReadyWindow).__noacgLive!.presence())) !== 'joined') {
      await anon.close();
      test.skip(true, 'this server has no live topic (migration 0068): a publish asks outputs over Presence');
    }
    await expect.poll(async () => (await readyOf(air))?.n, { timeout: 60_000 }).toBe(2);
    const entry = { page: air, reloads: 0 };
    air.on('domcontentloaded', () => {
      entry.reloads += 1;
    });
    outputs.push(entry);
  }

  // The scorebug on air from the production page.
  await page.getByTestId('select-cue').filter({ hasText: SCOREBUG }).first().click();
  await page.getByTestId('verb-take').click();
  for (const { page: air } of outputs) {
    await expect.poll(() => air.locator('body').getAttribute('data-plays'), { timeout: 30_000 }).toBe('1');
    await mark(air, SCOREBUG);
    await mark(air, STRAP);
  }
  // Both outputs reported running it: PROGRAM says "ran", never more (live-publishing G2 section 6).
  await expect(page.getByTestId('program-air')).toHaveAttribute('data-state', 'ran', { timeout: 15_000 });
  await expect(page.getByTestId('program-air')).toHaveAttribute('title', /A browser cannot prove the broadcast picture/);

  // ── AC-1: the lower third changes while the scorebug is up. Each output swaps it on its own. ──
  await editInLibrary(page, showId, STRAP, 'first change');
  await expect(page.getByTestId('production-publish-changes')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('production-publish-changes').click();
  for (const { page: air } of outputs) {
    await expect.poll(async () => (await readyOf(air))?.v?.n ?? 0, { timeout: 120_000 }).toBe(2);
    expect((await readyOf(air))?.chg).toBeUndefined();
    await expect.poll(() => marked(air, STRAP)).toBeNull();
    expect(await marked(air, SCOREBUG), 'the scorebug on air is the same frame').toBe('before');
    expect(await air.locator('body').getAttribute('data-plays'), 'no entrance replayed').toBe('1');
  }

  // ── AC-2: the scorebug itself changes while on air. Both outputs keep it and say so. ──
  await editInLibrary(page, showId, SCOREBUG, 'second change');
  await expect(page.getByTestId('production-publish-changes')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('production-publish-changes').click();
  for (const { page: air } of outputs) {
    await expect.poll(async () => (await readyOf(air))?.chg?.w ?? [], { timeout: 120_000 }).toEqual([SCOREBUG]);
    expect(await marked(air, SCOREBUG)).toBe('before');
  }
  // O3 (live-publishing G2 section 5): green, naming the graphic that takes its new design at its next Take.
  await expect(page.getByTestId('production-status')).toContainText(`${SCOREBUG}: new design at next Take`, { timeout: 30_000 });
  await page.getByTestId('production-status').click();
  const panel = page.getByTestId('production-status-panel');
  for (const name of ['Desk A', 'Desk B']) {
    await expect(panel.getByTestId('ready-output').filter({ hasText: name })).toContainText(`${SCOREBUG}: new design at next Take`, { timeout: 30_000 });
  }
  await page.screenshot({ path: test.info().outputPath('waiting-for-clear.png') });
  await page.keyboard.press('Escape');

  // Out: both outputs take the new scorebug once it has cleared.
  await page.getByTestId('select-cue').filter({ hasText: SCOREBUG }).first().click();
  await page.getByTestId('verb-out').click();
  for (const { page: air, reloads } of outputs) {
    await expect.poll(async () => (await readyOf(air))?.v?.n ?? 0, { timeout: 60_000 }).toBe(3);
    expect((await readyOf(air))?.chg).toBeUndefined();
    expect(await marked(air, SCOREBUG)).toBeNull();
    expect(reloads, 'no output reloaded for a graphic change').toBe(0);
  }
  await expect(page.getByTestId('production-status')).not.toContainText('new design at next Take', { timeout: 30_000 });

  await unpublishForCleanup(page);
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await anon.close();
});

// ── HELD TAKES AND THE HONEST LIGHT (live-publishing G2, AC-3) ─────────────────────────────────
// Two graphics are added and published while each output's read of the payload is held back on
// purpose (Desk A 2 s, Desk B 8 s). A Take of the first reaches both outputs before they hold it:
// Desk A shows it with its entrance once loaded, Desk B (past 5 s) shows it at its final state
// without its entrance and says so. The second is taken and taken out while loading: it is never
// shown. Meanwhile the production page's light is never green, and it is green again once both
// outputs have run everything pressed.
const LOWER = 'News Strip';

test('a Take of a graphic still loading plays once loaded, a cancelled one never shows, and the light waits for both outputs', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  for (const name of [SCOREBUG, STRAP, LOWER]) await libraryGraphic(page, name);
  const showId = await page.evaluate(async (showName) => {
    const { createShowNamedChecked, addGraphicToShow } = await import('/src/model/shows.ts');
    const { loadGraphics } = await import('/src/model/library.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const { useRouter } = await import('/src/app/router.ts');
    const { show, error: notCreated } = createShowNamedChecked(showName);
    if (notCreated) throw new Error(notCreated);
    const doc = loadGraphics().find((g) => g.name === 'House Scorebug');
    if (!doc) throw new Error('no scorebug');
    const { error } = addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    if (error) throw new Error(error);
    const failure = await commitDurableWrites();
    if (failure) throw new Error(failure);
    useRouter.getState().navigate({ view: 'production', id: show.id });
    await new Promise((resolve) => setTimeout(resolve));
    return show.id;
  }, `Held ${Date.now()}`);
  await expect(page.getByTestId('production-page')).toBeVisible();
  await publishProduction(page);
  const outputSlug = await page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((x) => x.id === id)?.outputSlug ?? '';
  }, showId);
  const anon = await browser.newContext();
  const outputs: { page: Page; name: string; delay: number }[] = [];
  for (const [name, delay] of [['Desk A', 2_000], ['Desk B', 8_000]] as const) {
    const air = await anon.newPage();
    // What an output says when it gives up on a held Take: printed, so a failure names its cause.
    air.on('console', (m) => {
      if (/did not play here|output stage/.test(m.text())) console.log(`[${name}] ${m.text()}`);
    });
    await air.goto(`/output?production=${encodeURIComponent(outputSlug)}&name=${encodeURIComponent(name)}&debug=1`);
    await expect(air.locator('pre')).toContainText('realtime: following', { timeout: 60_000 });
    await expect.poll(() => air.evaluate(() => (window as ReadyWindow).__noacgLive!.presence()), { timeout: 30_000 }).not.toBe('joining');
    const joined = (await air.evaluate(() => (window as ReadyWindow).__noacgLive!.presence())) === 'joined';
    if (!joined) await anon.close();
    test.skip(!joined, 'this server has no live topic (migration 0068): outputs report on Presence');
    await expect.poll(async () => (await readyOf(air))?.n, { timeout: 60_000 }).toBe(1);
    // From here every read of the published payload is late by `delay`: the loading delayed on purpose.
    await air.route('**/rest/v1/rpc/control_output_resolve*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      await route.continue().catch(() => {});
    });
    outputs.push({ page: air, name, delay });
  }
  const status = page.getByTestId('production-status');
  await expect(status).toHaveAttribute('data-tone', 'ok', { timeout: 60_000 });

  // Both new graphics join the production and are published.
  await page.evaluate(async ([id, names]) => {
    const { addGraphicToShow } = await import('/src/model/shows.ts');
    const { loadGraphics } = await import('/src/model/library.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    for (const name of names) {
      const doc = loadGraphics().find((g) => g.name === name);
      if (!doc) throw new Error(`no ${name}`);
      const { error } = addGraphicToShow(id, doc.template, { graphicId: doc.id });
      if (error) throw new Error(error);
    }
    const failure = await commitDurableWrites();
    if (failure) throw new Error(failure);
  }, [showId, [STRAP, LOWER]] as [string, string[]]);
  await expect(page.getByTestId('production-publish-changes')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('production-publish-changes').click();
  await expect(status).not.toContainText('Publishing', { timeout: 30_000 });

  // A Take of the strap, then the second strap taken and taken out, while both outputs load them.
  const tookAt = Date.now();
  await page.getByTestId('select-cue').filter({ hasText: STRAP }).first().click();
  await page.getByTestId('verb-take').click();
  await page.getByTestId('select-cue').filter({ hasText: LOWER }).first().click();
  await page.getByTestId('verb-take').click();
  await page.getByTestId('verb-out').click();

  // Never green while an output has not run what was pressed (E1), sampled through the hold.
  const tones: string[] = [];
  const b = outputs[1].page;
  while (Date.now() - tookAt < 30_000) {
    // What Desk B has run, as its Presence entry says it (live-publishing G2 section 1).
    const run = await b.evaluate(() => (window as unknown as { __noacgLive: { entry(): { ready?: { run?: { h: Record<string, unknown> } } } } }).__noacgLive.entry().ready?.run);
    const held = !run || Object.keys(run.h).length > 0;
    const tone = (await status.getAttribute('data-tone')) ?? '';
    if (!held && (await b.locator(`iframe[title="${STRAP}"]`).count()) > 0) break;
    tones.push(tone);
    await page.waitForTimeout(250);
  }
  expect(tones.length, 'the light was sampled while Desk B held the Take').toBeGreaterThan(4);
  expect(tones.filter((t) => t === 'ok'), 'the light is never green while an output holds a Take').toEqual([]);
  // Desk B waited past 5 s: its Take appeared without its entrance, and it says so.
  await expect
    .poll(() => b.evaluate(() => ((window as unknown as { __noacgLive: { entry(): { ready?: { lt?: { g: string }[] } } } }).__noacgLive.entry().ready?.lt ?? []).map((l) => l.g)), { timeout: 60_000 })
    .toContain(STRAP);

  for (const { page: air, name } of outputs) {
    // The strap ran once on each output; the second strap was cancelled while it loaded and was
    // never played at all, so its frame never showed (`data-plays` counts every entrance).
    await expect.poll(() => air.locator('body').getAttribute('data-plays'), { timeout: 60_000, message: name }).toBe('1');
    // The Take's own values reached the strap's document before its entrance (the update that came
    // before the play, settled while the frame loaded): it airs the cue, not the template's defaults.
    const handed = await air.evaluate((g) => (window as unknown as { __noacgLive: { handed(g: string): unknown } }).__noacgLive.handed(g), STRAP);
    expect(handed, `${name}: the strap's document was handed the cue's values`).toBeTruthy();
    expect(Object.keys(handed as object).length, `${name}: with the cue's fields`).toBeGreaterThan(0);
    await expect(air.locator(`iframe[title="${LOWER}"]`)).toHaveCount(1, { timeout: 60_000 });
  }
  // Everything pressed has run on both outputs: green, and the panel names the late Take.
  await expect(status).toHaveAttribute('data-tone', 'ok', { timeout: 60_000 });
  await expect(status).toContainText('Ready');
  await page.screenshot({ path: test.info().outputPath('held-take-green.png') });
  await anon.close();
  await unpublishForCleanup(page);
});
