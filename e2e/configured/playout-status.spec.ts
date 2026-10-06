// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change.
//
// THE ONE PLAYOUT STATUS (docs/work-specs/studio-day-playout AC-7 to AC-10). The production page
// answers "will a Take air?" in one control: grey offline, amber for attention, green on air and
// ready, red when something that should work is broken, always with words beside the colour, and a
// panel that names the check behind it. Every publish also asks the outputs to load the new
// version. None of it exists offline: there is nothing to start, no output to report and no
// version to move to.
//
// NoaCG Bridge and CasparCG are FAKED at the network layer (e2e/_fakeBridge.ts), because what the
// status reads from them is one `/state` answer: what the output's slot holds.
// The real-server walk of the same states is docs/work-specs/studio-day-playout/evidence/landing-2.md.
// covers: src/control/{playoutStatus,prepareBridge}.ts, src/model/readyMemory.ts, src/components/home/PlayoutStatusControl.tsx, src/components/home/ProductionLinks.tsx, src/components/home/PlayoutMonitors.tsx

import { publishProduction } from '../_publish';
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { addCatalogGraphic, bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { fakeBridge, seedSettings } from '../_fakeBridge';
import { SERVICE_ROLE_KEY, SUPABASE_URL, clearPublishedShows, haveCreds, readyOf, signIn, wipeMyGraphics, type ReadyWindow } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

test('the playout status: grey offline, amber with no output, red when the slot is wrong, green on air, and every publish prepares', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  const showId = await openProductionWithCurrent(page, `Status ${Date.now()}`);
  // This walk deliberately exercises an existing production without new output metadata.
  await page.evaluate(async id => { const S=await import('/src/model/shows.ts');const show=S.loadShows().find(s=>s.id===id)!;delete show.outputSetup;S.upsertShow(show);await (await import('/src/model/durableStore.ts')).commitDurableWrites(); }, showId);
  const status = page.getByTestId('production-status');
  const monitor = page.getByTestId('program-monitor');

  // ── Not started: grey, "Offline", Start beside it, and the monitor does not call itself on air. ──
  await expect(status).toHaveAttribute('data-started', 'false');
  await expect(status).toHaveAttribute('data-tone', 'idle');
  await expect(status).toContainText('Offline');
  await expect(page.getByTestId('production-publish')).toBeVisible();
  await expect(monitor).toHaveAttribute('data-live', 'false');
  await expect(page.getByTestId('program-monitor-name')).toHaveText('PREVIEW · NOT LIVE');

  // ── Started with nothing to air it: amber "No output connected", and the panel says why. ──
  await publishProduction(page);
  await expect(status).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  await expect(page.getByTestId('program-monitor-name')).toHaveText('PROGRAM · ON AIR');
  await expect(monitor).toHaveAttribute('data-live', 'true');
  await expect(status).toHaveAttribute('data-tone', 'warn');
  await expect(status).toContainText('No output connected');
  const panel = page.getByTestId('production-status-panel');
  await expect(panel, 'publishing opens the Playout panel').toBeVisible();
  await expect(panel.getByTestId('status-check-outputs')).toHaveAttribute('data-tone', 'warn');
  await expect(panel.getByTestId('production-links')).toBeVisible();
  await page.keyboard.press('Escape');
  const { outputSlug } = (await page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return { outputSlug: loadShows().find((x) => x.id === id)?.outputSlug ?? '' };
  }, showId)) as { outputSlug: string };
  expect(outputSlug).toBeTruthy();

  // ── A paired Bridge whose server shows nothing on the output's slot: red, and Put on air is the
  //    press that is due. ──
  // NoaCG Bridge 0.7 in front of CasparCG 2.5, as far as the status can see it: it answers, it can
  // read a channel, and Put on air (a take of a URL) and Take off change the slot as the server would.
  const studio = await fakeBridge(page, { version: '0.7.0', features: ['state', 'playback', 'sequence', 'servers'] });
  await seedSettings(page);
  // Recorded managed activity establishes legacy relevance on this exact studio target.
  await page.evaluate(async id => { const M=await import('/src/model/readyMemory.ts');const P=await import('/src/control/playoutLink.ts');const {casparOutputTarget}=await import('/src/control/playoutStatus.ts');M.saveReadyMemory(id,{...M.loadReadyMemory(id),casparOutput:casparOutputTarget(P.loadPlayoutSettings())}); }, showId);
  // A reload, not a goto: the page is already on this URL, so a goto would only move the hash.
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(status).toHaveAttribute('data-tone', 'bad', { timeout: 30_000 });
  await expect(status).toContainText('Output not on air');
  await status.click();
  await expect(panel.getByTestId('status-check-slot')).toHaveAttribute('data-tone', 'bad');
  await expect(panel.getByTestId('status-check-slot')).toContainText('Nothing on 1-20');
  await expect(panel.getByTestId('status-check-bridge')).toHaveAttribute('data-tone', 'ok');
  await expect(panel.getByTestId('caspar-put-on-air')).toHaveClass(/primary/);

  // ── Another production on that slot: red, by name. ──
  studio.showPage('1-20', 'https://noacg.studio/output?production=someone-else&name=CasparCG%201-20');
  await panel.getByTestId('prepare-for-live-button').click();
  await expect(status).toHaveAttribute('data-tone', 'bad');
  await expect(status).toContainText('Another production on 1-20', { timeout: 20_000 });
  await expect(panel.getByTestId('status-check-slot')).toContainText('Channel 1 shows another production on 1-20');

  // ── A server that will not say what the slot shows (a channel it does not have): red, with its
  //    own sentence, never "Checking…" for ever. ──
  studio.refuseState = true;
  await panel.getByTestId('prepare-for-live-button').click();
  await expect(status).toContainText('Cannot read 1-20', { timeout: 20_000 });
  await expect(status).toHaveAttribute('data-tone', 'bad');
  await expect(panel.getByTestId('status-check-slot')).toContainText('401 INFO ERROR');
  studio.refuseState = false;
  await panel.getByTestId('prepare-for-live-button').click();
  await expect(status).toContainText('Another production on 1-20', { timeout: 20_000 });

  // ── Put on air: read again at once, without waiting for the next 10 s read. The page is on the
  //    slot but has not reported yet (here nothing runs it), so it is loading, in amber. ──
  await panel.getByTestId('caspar-put-on-air').click();
  await expect(panel.getByTestId('caspar-air-result')).toHaveAttribute('data-state', 'ok');
  expect(studio.runs['1-20']?.entries[0].file).toContain(`production=${encodeURIComponent(outputSlug)}`);
  await expect(status).toContainText('Loading on 1-20', { timeout: 5_000 });
  await expect(status).toHaveAttribute('data-tone', 'warn');
  await expect(panel.getByTestId('caspar-put-on-air')).not.toHaveClass(/primary/);

  // Take off clears recorded managed activity. Unconfirmed legacy setup becomes quiet.
  await panel.getByTestId('caspar-take-off-air').click();
  await expect(status).toHaveAttribute('data-tone', 'warn', { timeout: 5_000 });
  await expect(status).toContainText('No output connected');
  await page.keyboard.press('Escape');
  expect(studio.actions.map((a) => a.verb)).toEqual(['take', 'out']);

  // ── An output elsewhere (OBS, say) reports READY: the empty slot is no longer a fault, and the
  //    status is green on the outputs' own word. ──
  const anon = await browser.newContext();
  const air = await anon.newPage();
  air.on('pageerror', (e) => console.log('[output pageerror]', e.message));
  await air.goto(`/output?production=${encodeURIComponent(outputSlug)}&name=${encodeURIComponent('Desk A')}&debug=1`);
  await expect(air.locator('pre')).toContainText('realtime: following', { timeout: 60_000 });
  const presence = () => air.evaluate(() => (window as ReadyWindow).__noacgLive!.presence());
  await expect.poll(presence, { timeout: 30_000 }).not.toBe('joining');
  test.skip((await presence()) !== 'joined', 'this server has no live topic (migration 0068): READY rides Presence');
  await expect.poll(async () => (await readyOf(air))?.v?.n, { timeout: 30_000 }).toBe(1);
  // Fonts the host could not fetch are this host's truth: READY then reads amber, and so does the
  // status. Everything below reads either.
  const fontsOk = ((await readyOf(air))?.is ?? []).every((i) => i.k !== 'font');
  const settled = fontsOk ? 'ok' : 'warn';
  await expect(status).toHaveAttribute('data-outputs', '1', { timeout: 30_000 });
  await expect(status).toHaveAttribute('data-tone', settled, { timeout: 30_000 });
  if (fontsOk) await expect(status).toContainText('Ready · 1 output');
  // Browser-only output with stale paired settings: a disconnected Bridge contributes no fault.
  studio.missing = true;
  await status.click();
  await expect(panel.getByTestId('playout-check-again')).toHaveCount(0);
  await expect(panel.getByTestId('status-check-bridge')).toHaveCount(0, { timeout: 30_000 });
  await expect(panel.getByTestId('status-check-slot')).toHaveCount(0);
  await expect(status).toHaveAttribute('data-tone', settled);
  await expect(panel.getByTestId('publish-guarantees')).toContainText('check changed graphics and assets automatically');
  await expect(panel.getByTestId('prepare-for-live-button')).toHaveText('Check readiness');
  await panel.getByTestId('prepare-for-live-button').click();
  await expect(panel.getByTestId('prepare-stamp')).toBeVisible({ timeout: 90_000 });
  await expect(panel.getByTestId('prepare-checklist')).not.toContainText('NoaCG Bridge');
  await page.screenshot({ path: test.info().outputPath('browser-health-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath('browser-health-phone.png'), fullPage: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  studio.missing = false;
  await page.keyboard.press('Escape');
  // With an output reporting, this production on its slot is green, and says where.
  await status.click();
  await panel.getByTestId('caspar-put-on-air').click();
  if (fontsOk) await expect(status).toContainText('Ready · on air 1-20', { timeout: 5_000 });
  // A successful CasparCG action proves intent, even when a browser output stays healthy.
  studio.missing = true;
  await panel.getByTestId('prepare-for-live-button').click();
  await expect(status).toContainText('Bridge not running', { timeout: 30_000 });
  await page.reload();
  await expect(status).toContainText('Bridge not running', { timeout: 30_000 });
  studio.missing = false;
  await status.click();
  await panel.getByTestId('prepare-for-live-button').click();
  await expect(panel.getByTestId('status-check-bridge')).toHaveAttribute('data-tone', 'ok', { timeout: 30_000 });
  await page.keyboard.press('Escape');

  // ── AC-10: a change is amber until published, and the publish moves the open output onto the
  //    new version BY ITSELF: this spec never reloads it. The output builds the new version beside
  //    the running one, checks it, and reloads onto it because nothing is on air (src/output/
  //    prepare.ts). Without the publish's prepare request it would stay behind on v1 until a person
  //    reloaded it, which is what the studio day met. ──
  await addCatalogGraphic(page, showId, 'Hairline');
  await expect(status).toHaveAttribute('data-tone', 'warn', { timeout: 30_000 });
  await expect(status).toContainText('Unpublished changes');
  await status.click();
  await panel.getByTestId('prepare-for-live-button').click();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  await expect
    .poll(async () => {
      const { data } = await admin.from('control_shows').select('output').eq('id', showId).single();
      return (data?.output as { ver?: { n: number } }).ver?.n;
    }, { timeout: 30_000 })
    .toBe(2);
  await expect.poll(async () => (await readyOf(air))?.v?.n, { timeout: 90_000, message: 'the output moved onto v2 by itself' }).toBe(2);
  await expect(status).toHaveAttribute('data-tone', settled, { timeout: 30_000 });
  await expect(status).not.toContainText('Unpublished');

  // ── Unpublished again: grey and offline, whatever the outputs last said. ──
  if (!(await panel.isVisible())) await status.click();
  await panel.getByTestId('production-unpublish').click();
  await expect(status).toHaveAttribute('data-started', 'false', { timeout: 30_000 });
  await expect(status).toHaveAttribute('data-tone', 'idle');
  await expect(page.getByTestId('program-monitor-name')).toHaveText('PREVIEW · NOT LIVE');

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await anon.close();
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
