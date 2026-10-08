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

/** Edit a production graphic's design in the library, as the editor's save does. */
async function editInLibrary(page: Page, showId: string, graphic: string, note: string): Promise<void> {
  const edited = await page.evaluate(
    async ([id, name, comment]) => {
      const { loadShows } = await import('/src/model/shows.ts');
      const { loadGraphics, resolveSavedGraphicDoc, updateGraphic } = await import('/src/model/library.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const pooled = loadShows().find((s) => s.id === id)?.graphics.find((g) => g.name === name);
      const doc = pooled ? resolveSavedGraphicDoc(pooled, loadGraphics()) : undefined;
      if (!doc) return false;
      const { error } = updateGraphic(doc.id, { template: { ...doc.template, css: `${doc.template.css}\n/* ${comment} */` } });
      return !error && !(await commitDurableWrites());
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
  await expect(page.getByTestId('production-status')).toContainText('Waiting for clear', { timeout: 30_000 });
  await page.getByTestId('production-status').click();
  const panel = page.getByTestId('production-status-panel');
  for (const name of ['Desk A', 'Desk B']) {
    await expect(panel.getByTestId('ready-output').filter({ hasText: name })).toContainText(`Waiting for clear: ${SCOREBUG}`, { timeout: 30_000 });
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
  await expect(page.getByTestId('production-status')).not.toContainText('Waiting for clear', { timeout: 30_000 });

  await unpublishForCleanup(page);
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await anon.close();
});
