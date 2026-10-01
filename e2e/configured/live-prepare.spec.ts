// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change.
//
// PREPARE FOR LIVE (Phase 6 Step 3 landing b: docs/work-specs/playout-ready/spec.md AC-8, AC-9,
// AC-11). One optional button on the production page: it says beforehand whether unpublished
// changes will be included, publishes them, asks every output to prepare over the production
// page's Presence entry, and ends in a stamp both surfaces show. Nothing is locked meanwhile.
// The output's own preparation (changes built beside the running graphics, the reload) is the
// offline e2e/output-prepare.spec.ts; the words are scripts/prepare-live.test.mjs.
// The command path ping (landing c, AC-12) is said on each output's line once the outputs settle.
// covers: src/components/control/PrepareForLive.tsx, src/control/prepareLive.ts, src/output/prepare.ts, src/components/home/ProductionPage.tsx, supabase/migrations/0072_command_ping.sql

import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

const shot = (name: string) => (process.env.READY_SHOTS ? `${process.env.READY_SHOTS}/prepare-${name}.png` : test.info().outputPath(`${name}.png`));

type ReadyWindow = { __noacgLive?: { presence: () => string; ready: () => { n: number; of: number; v: { n: number } | null } } };

/** Open the READY panel if it is shut. */
async function openPanel(page: Page, testId: string): Promise<void> {
  const line = page.getByTestId(testId);
  if ((await line.getAttribute('aria-expanded')) !== 'true') await line.click();
  await expect(page.getByTestId(`${testId}-panel`)).toBeVisible();
}

test('Prepare for Live publishes what changed, checks every output and ends in a stamp both surfaces show', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  // In the LIBRARY too, as a graphic saved and added from Home is: a publish then reads its design
  // from the library record (by its name, `resolveSavedGraphicDoc`), which the AC-5 step edits.
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
  const showId = await openProductionWithCurrent(page, `Prepare ${Date.now()}`);
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  await page.getByTestId('production-links-toggle').click();
  const { outputSlug, hostedSlug } = (await page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const s = loadShows().find((x) => x.id === id);
    return { outputSlug: s?.outputSlug ?? '', hostedSlug: s?.hostedSlug ?? '' };
  }, showId)) as { outputSlug: string; hostedSlug: string };

  const anon = await browser.newContext();
  const air = await anon.newPage();
  await air.goto(`/output?production=${encodeURIComponent(outputSlug)}&name=${encodeURIComponent('Desk A')}&debug=1`);
  await expect(air.locator('pre')).toContainText('realtime: following', { timeout: 60_000 });
  const presence = () => air.evaluate(() => (window as ReadyWindow).__noacgLive!.presence());
  await expect.poll(presence, { timeout: 30_000 }).not.toBe('joining');
  test.skip((await presence()) !== 'joined', 'this server has no live topic (migration 0068): Prepare for Live rides Presence');
  await expect.poll(async () => air.evaluate(() => (window as ReadyWindow).__noacgLive!.ready().n), { timeout: 30_000 }).toBe(1);
  const desk = page.getByTestId('renderer-status');
  await expect(desk).toHaveAttribute('data-source', 'ready', { timeout: 30_000 });

  // ── AC-8: nothing unpublished, so it only checks, and says so before it is pressed. ──
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openPanel(page, 'renderer-status');
  const prepare = page.getByTestId('prepare-for-live');
  await expect(prepare).toContainText('Every output is checked on v1');
  await page.getByTestId('prepare-for-live-button').click();
  const stamp = page.getByTestId('prepare-stamp');
  await expect(stamp).toContainText(/(Ready for Live, checked \d\d:\d\d \(v1\))|(Checked \d\d:\d\d \(v1\): \d+ warning)/, { timeout: 90_000 });
  const clean = /Ready for Live/.test((await stamp.textContent()) ?? '');
  test.info().annotations.push({ type: 'stamp', description: (await stamp.textContent()) ?? '' });
  await expect(page.getByTestId('prepare-checklist')).toContainText('Nothing changed since v1');
  await expect(page.getByTestId('prepare-checklist')).toContainText('Desk A');
  // ── AC-12: one ping through the command path, answered by the output (migration 0072). ──
  await expect(page.getByTestId('prepare-checklist')).toContainText(/Desk A: .* · (command path \d+ ms|commands reach it)/);
  await page.screenshot({ path: shot('desk-1920-stamp') });
  if (clean) await expect(desk.locator('.pd-health-full')).toContainText('● Ready for Live · 1 of 1 output · checked', { timeout: 30_000 });

  // ── AC-11: the phone shows the same stamp, from the production page's Presence entry. ──
  const hosted = await anon.newPage();
  await hosted.setViewportSize({ width: 390, height: 844 });
  await hosted.goto(`/app?control=${encodeURIComponent(hostedSlug)}`);
  await openPanel(hosted, 'hosted-output-health');
  await expect(hosted.getByTestId('ready-stamp')).toHaveText((await stamp.textContent())!, { timeout: 30_000 });
  await hosted.screenshot({ path: shot('phone-390-stamp') });

  // ── AC-8, AC-11: an edit after the stamp keeps it honest, and the next run publishes it. Editing
  //    is never frozen: the field takes the text while the stamp stands. ──
  await page.getByTestId('renderer-status').click();
  const teamA = page.getByTestId('cue-field-f0');
  await teamA.fill('PREPARED');
  await teamA.blur();
  await openPanel(page, 'renderer-status');
  await expect(page.getByTestId('prepare-stamp')).toContainText(/Checked \d\d:\d\d on v1, 1 change since/, { timeout: 15_000 });
  await expect(prepare).toContainText('Your unpublished changes will be published and included');
  await page.getByTestId('prepare-for-live-button').click();
  // The panel shuts on any click outside it (a Take, say), here while the run is still publishing;
  // the run goes on to its stamp regardless, and the checklist is there when the panel reopens.
  await page.getByTestId('renderer-status').click();
  await expect(page.getByTestId('renderer-status-panel')).toHaveCount(0);
  await expect
    .poll(
      () =>
        page.evaluate(async (id) => {
          const { loadReadyMemory } = await import('/src/model/readyMemory.ts');
          return loadReadyMemory(id).stamp?.v.n ?? 0;
        }, showId),
      { timeout: 90_000 },
    )
    .toBe(2);
  await openPanel(page, 'renderer-status');
  await expect(page.getByTestId('prepare-checklist')).toContainText('Published your changes as v2');
  await expect(page.getByTestId('prepare-stamp')).toContainText(/checked \d\d:\d\d \(v2\)/i, { timeout: 90_000 });
  // A cue-only change moved the number, not what the output renders: it prepared nothing, and holds v1.
  expect((await air.evaluate(() => (window as ReadyWindow).__noacgLive!.ready().v))?.n).toBe(1);

  // ── docs/work-specs/studio-day-playout AC-5: the graphic edited in the LIBRARY, as the editor's
  //    save does, with the production record untouched. It is still an unpublished change (a
  //    publish resolves the library's current template), the next run publishes it, and the
  //    output moves onto it. On the studio day this read "Nothing changed" and stayed off air. ──
  const readUpdatedAt = () =>
    page.evaluate(async (id) => (await import('/src/model/shows.ts')).loadShows().find((s) => s.id === id)?.updatedAt ?? '', showId);
  const recordBefore = await readUpdatedAt();
  const edited = await page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const { loadGraphics, resolveSavedGraphicDoc, updateGraphic } = await import('/src/model/library.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const pooled = loadShows().find((s) => s.id === id)?.graphics[0];
    // The record a publish reads this graphic from (hostedControl.ts, templateForSavedGraphic).
    const doc = pooled ? resolveSavedGraphicDoc(pooled, loadGraphics()) : undefined;
    if (!doc) return false;
    const { error } = updateGraphic(doc.id, { template: { ...doc.template, css: `${doc.template.css}\n/* edited in the library */` } });
    return !error && !(await commitDurableWrites());
  }, showId);
  expect(edited, 'the production names its graphic in the library').toBe(true);
  await expect(prepare).toContainText('Your unpublished changes will be published and included', { timeout: 15_000 });
  expect(await readUpdatedAt()).toBe(recordBefore);
  await page.getByTestId('prepare-for-live-button').click();
  await expect(page.getByTestId('prepare-checklist')).toContainText('Published your changes as v3', { timeout: 90_000 });
  await expect
    .poll(async () => (await air.evaluate(() => (window as ReadyWindow).__noacgLive!.ready().v))?.n ?? 0, { timeout: 90_000 })
    .toBe(3);

  // ── AC-11: an output that has gone makes the stamp say so. ──
  await air.close();
  await page.getByTestId('prepare-for-live-button').click();
  await expect(page.getByTestId('prepare-stamp')).toContainText(/Not ready, checked \d\d:\d\d \(v3\): 1 problem/, { timeout: 90_000 });
  await expect(page.getByTestId('prepare-checklist')).toContainText('Desk A: not answering');
  await page.screenshot({ path: shot('desk-1920-not-ready') });

  await page.getByTestId('renderer-status').click();
  await page.getByTestId('production-links-toggle').click();
  await page.getByRole('button', { name: /Unpublish/ }).click();
  await expect(page.getByTestId('production-mode')).toContainText('NOT PUBLISHED', { timeout: 20_000 });
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await anon.close();
});
