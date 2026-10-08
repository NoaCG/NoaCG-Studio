// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change.
//
// THE READINESS RUN (Phase 6 Step 3 landing b: docs/work-specs/playout-ready/spec.md AC-8, AC-9,
// AC-11), since docs/work-specs/playout-workflow-simplification behind Check now, Publish changes
// and Publish: it publishes what changed, asks every output to prepare over the production page's
// Presence entry, pings the command path, and ends in a stamp both surfaces show. Its result reads
// in the Playout panel's output rows ("110 ms") and "Checked 14:02". Nothing is locked meanwhile.
// The output's own preparation (changes built beside the running graphics, the reload) is the
// offline e2e/output-prepare.spec.ts; the words are scripts/prepare-live.test.mjs.
// The command path ping (landing c, AC-12) is said on each output's line once the outputs settle.
// covers: src/components/control/PrepareForLive.tsx, src/control/prepareLive.ts, src/output/prepare.ts, src/components/home/ProductionPage.tsx, src/components/home/PlayoutPanel.tsx, supabase/migrations/0072_command_ping.sql
// A graphic edited in the library counts as an unpublished change (docs/work-specs/studio-day-playout AC-5).
// covers: src/components/home/usePublishDrift.ts

import { publishProduction } from '../_publish';
import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, readyOf, signIn, wipeMyGraphics, unpublishForCleanup, type ReadyWindow } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

const shot = (name: string) => (process.env.READY_SHOTS ? `${process.env.READY_SHOTS}/prepare-${name}.png` : test.info().outputPath(`${name}.png`));


/** Open the READY panel if it is shut. */
async function openPanel(page: Page, testId: string): Promise<void> {
  const line = page.getByTestId(testId);
  if ((await line.getAttribute('aria-expanded')) !== 'true') await line.click();
  await expect(page.getByTestId(`${testId}-panel`)).toBeVisible();
}

test('the readiness run publishes what changed, checks every output and ends in a stamp both surfaces show', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  // A House Scorebug left in the synced test account by a run that died would make the library
  // name match below ambiguous, and the AC-5 step would fail for a reason that is not the product.
  await wipeMyGraphics(page);
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
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  await page.getByTestId('production-status').click();
  const { outputSlug, hostedSlug } = (await page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const s = loadShows().find((x) => x.id === id);
    return { outputSlug: s?.outputSlug ?? '', hostedSlug: s?.hostedSlug ?? '' };
  }, showId)) as { outputSlug: string; hostedSlug: string };

  const anon = await browser.newContext();
  const air = await anon.newPage();
  await air.goto(`/output?production=${encodeURIComponent(outputSlug)}&destination=browser&name=${encodeURIComponent('Desk A')}&debug=1`);
  await expect(air.locator('pre')).toContainText('realtime: following', { timeout: 60_000 });
  const presence = () => air.evaluate(() => (window as ReadyWindow).__noacgLive!.presence());
  await expect.poll(presence, { timeout: 30_000 }).not.toBe('joining');
  test.skip((await presence()) !== 'joined', 'this server has no live topic (migration 0068): Prepare for Live rides Presence');
  await expect.poll(async () => (await readyOf(air))?.n, { timeout: 30_000 }).toBe(1);
  let reloads = 0;
  air.on('domcontentloaded', () => { reloads++; });
  const desk = page.getByTestId('production-status');
  await expect(desk).toHaveAttribute('data-source', 'ready', { timeout: 30_000 });

  // ── AC-8: nothing unpublished, so the panel offers Check now, not a publish. ──
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openPanel(page, 'production-status');
  const panel = page.getByTestId('production-status-panel');
  await expect(panel.getByTestId('panel-publish-changes')).toHaveCount(0);
  await panel.getByTestId('playout-check-now').click();
  const checked = panel.getByTestId('playout-checked');
  await expect(checked).toHaveText(/^Checked \d\d:\d\d$/, { timeout: 90_000 });
  const deskRow = panel.getByTestId('ready-output').filter({ hasText: 'Desk A' });
  await expect(deskRow).toBeVisible();
  // ── AC-12: one ping through the command path, answered by the output (migration 0072), said on
  //    the output's own row. ──
  await expect(deskRow.getByTestId('ready-path')).toHaveText(/^(\d+ ms|Commands reach it)$/, { timeout: 30_000 });
  const stampOf = () =>
    page.evaluate(async (id) => (await import('/src/model/readyMemory.ts')).loadReadyMemory(id).stamp, showId);
  const first = await stampOf();
  expect(first?.v.n).toBe(1);
  test.info().annotations.push({ type: 'stamp', description: JSON.stringify(first) });
  await page.screenshot({ path: shot('desk-1920-checked') });

  // ── AC-11: the phone shows the same check, from the production page's Presence entry. ──
  const hosted = await anon.newPage();
  await hosted.setViewportSize({ width: 390, height: 844 });
  await hosted.goto(`/app?control=${encodeURIComponent(hostedSlug)}`);
  await openPanel(hosted, 'hosted-output-health');
  await expect(hosted.getByTestId('ready-stamp')).toContainText(/checked \d\d:\d\d/i, { timeout: 30_000 });
  await hosted.screenshot({ path: shot('phone-390-stamp') });

  // Cue fields change metadata, not prepared assets: no header action, the panel offers Publish
  // changes, and the output adopts the new version without navigating.
  const metadataReloads = reloads;
  await page.keyboard.press('Escape');
  const teamA = page.getByTestId('cue-field-f0');
  await teamA.fill('PREPARED');
  await teamA.blur();
  await expect(page.getByTestId('production-publish-changes')).toHaveCount(0);
  await openPanel(page, 'production-status');
  // Check now stays: it checks the version already published and publishes nothing (D5).
  const checkedBefore = (await stampOf())?.at ?? 0;
  await panel.getByTestId('playout-check-now').click();
  await expect.poll(async () => (await stampOf())?.at ?? 0, { timeout: 90_000 }).toBeGreaterThan(checkedBefore);
  expect((await stampOf())?.v.n, 'Check now must not publish the edit').toBe(1);
  await expect(panel.getByTestId('panel-publish-changes')).toBeVisible();
  await panel.getByTestId('panel-publish-changes').click();
  // The panel shuts on any click outside it (a Take, say), here while the run is still publishing;
  // the run goes on to its stamp regardless.
  await page.getByTestId('production-status').click();
  await expect(panel).toHaveCount(0);
  await expect.poll(async () => (await stampOf())?.v.n ?? 0, { timeout: 90_000 }).toBe(2);
  await expect.poll(async () => (await readyOf(air))?.v?.n, { timeout: 30_000 }).toBe(2);
  expect(reloads, 'cue metadata must not reload the output').toBe(metadataReloads);

  // ── docs/work-specs/studio-day-playout AC-5: the graphic edited in the LIBRARY, as the editor's
  //    save does, with the production record untouched. It is a change the outputs draw, so the
  //    header offers Publish changes, and the output moves onto it. ──
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
  await expect(page.getByTestId('production-publish-changes')).toBeVisible({ timeout: 15_000 });
  expect(await readUpdatedAt()).toBe(recordBefore);
  await page.getByTestId('production-publish-changes').click();
  await expect.poll(async () => (await readyOf(air))?.v?.n ?? 0, { timeout: 90_000 }).toBe(3);
  await expect(page.getByTestId('production-publish-changes')).toHaveCount(0, { timeout: 30_000 });

  // ── An output seen this session that goes is LOST, in red, by name. ──
  await air.close();
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-tone', 'bad', { timeout: 60_000 });
  await expect(page.getByTestId('production-status')).toContainText('Desk A lost');
  await openPanel(page, 'production-status');
  await expect(panel.getByTestId('ready-output').filter({ hasText: 'Desk A' }).getByTestId('ready-state')).toHaveText('Lost');
  await page.screenshot({ path: shot('desk-1920-lost') });

  await unpublishForCleanup(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'false', { timeout: 20_000 });
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await anon.close();
});
