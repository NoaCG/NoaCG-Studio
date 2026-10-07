// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change.
//
// THE ONE PLAYOUT STATUS (docs/work-specs/playout-workflow-simplification AC-2 to AC-5; it
// replaced studio-day-playout AC-7's words). The production page answers "will a Take air?" in one
// control, always with words beside the colour: grey while nothing is reporting (never an alarm),
// green "Connected" once a renderer reports, red only for a renderer seen this session and lost or
// a real fault, and CasparCG matters only with its switch on. Publish changes moves the open
// outputs onto the new version by themselves. None of it exists offline: there is nothing to
// publish, no output to report and no version to move to.
//
// NoaCG Bridge and CasparCG are FAKED at the network layer (e2e/_fakeBridge.ts), because what the
// status reads from them is one `/state` answer: what the output's slot holds.
// covers: src/control/{playoutStatus,prepareBridge}.ts, src/model/{readyMemory,outputSetup}.ts, src/components/home/{PlayoutStatusControl,PlayoutPanel,PlayoutMonitors}.tsx

import { publishProduction, setCasparSwitch } from '../_publish';
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { addCatalogGraphic, bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { fakeBridge, seedSettings } from '../_fakeBridge';
import { SERVICE_ROLE_KEY, SUPABASE_URL, clearPublishedShows, haveCreds, readyOf, signIn, unpublishForCleanup, wipeMyGraphics, type ReadyWindow } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

test('the playout status: quiet until something reports, green when it does, red only for loss or a fault, and Publish changes moves the outputs', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  const showId = await openProductionWithCurrent(page, `Status ${Date.now()}`);
  const status = page.getByTestId('production-status');
  const panel = page.getByTestId('production-status-panel');
  const openPanel = async () => {
    if (!(await panel.isVisible())) await status.click();
    await expect(panel).toBeVisible();
  };

  // ── Not published: grey, Publish in the action slot, the monitor never calls itself on air. ──
  await expect(status).toHaveAttribute('data-started', 'false');
  await expect(status).toHaveAttribute('data-tone', 'idle');
  await expect(status).toContainText('Not published');
  await expect(page.getByTestId('production-publish')).toBeVisible();
  await expect(page.getByTestId('program-monitor-name')).toHaveText('PREVIEW · NOT LIVE');

  // ── Published with nothing reporting: grey "Not connected". A page opened before the studio is
  //    up is quiet. ──
  await publishProduction(page);
  await expect(status).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  await expect(status).toHaveAttribute('data-tone', 'idle');
  await expect(status).toContainText('Not connected');
  const { outputSlug } = (await page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return { outputSlug: loadShows().find((x) => x.id === id)?.outputSlug ?? '' };
  }, showId)) as { outputSlug: string };
  expect(outputSlug).toBeTruthy();

  // ── CasparCG switched on, a paired Bridge, an empty slot that was never loaded today: grey, and
  //    Load is the header's action. ──
  // NoaCG Bridge 0.7 in front of CasparCG 2.5, as far as the status can see it: it answers, it can
  // read a channel, and Load (a take of a URL) and Unload change the slot as the server would.
  const studio = await fakeBridge(page, { version: '0.7.0', features: ['state', 'playback', 'sequence', 'servers'] });
  await seedSettings(page);
  // A reload, not a goto: the page is already on this URL, so a goto would only move the hash.
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await setCasparSwitch(page, true);
  await expect(status).toContainText('Not loaded on 1-20', { timeout: 30_000 });
  await expect(status).toHaveAttribute('data-tone', 'idle');
  await expect(page.getByTestId('caspar-load')).toBeVisible();
  await openPanel();
  await expect(panel.getByTestId('caspar-bridge')).toHaveAttribute('data-tone', 'ok');
  await expect(panel.getByTestId('caspar-slot')).toContainText('Empty');

  // ── Another production on that slot: red, by name, and Load asks before replacing it. ──
  studio.showPage('1-20', 'https://noacg.studio/output?production=someone-else&name=CasparCG%201-20');
  await panel.getByTestId('playout-check-now').click();
  await expect(status).toHaveAttribute('data-tone', 'bad', { timeout: 20_000 });
  await expect(status).toContainText('Another production on 1-20');
  await openPanel();
  await panel.getByTestId('caspar-put-on-air').click();
  await expect(panel.getByTestId('caspar-replace')).toBeVisible();
  expect(studio.actions, 'nothing is replaced before Replace').toEqual([]);

  // ── A server that will not say what the slot shows: red, with its own sentence. ──
  await panel.getByTestId('caspar-replace-cancel').click();
  studio.refuseState = true;
  await panel.getByTestId('playout-check-now').click();
  await expect(status).toContainText('Cannot read 1-20', { timeout: 20_000 });
  await expect(status).toHaveAttribute('data-tone', 'bad');
  studio.refuseState = false;
  await openPanel();
  await panel.getByTestId('playout-check-now').click();
  await expect(status).toContainText('Another production on 1-20', { timeout: 20_000 });

  // ── Replace: this production goes on the slot, read again at once. Nothing runs its page here,
  //    so it is still loading, in grey. ──
  await openPanel();
  await panel.getByTestId('caspar-put-on-air').click();
  await panel.getByTestId('caspar-replace-confirm').click();
  await expect.poll(() => studio.runs['1-20']?.entries[0].file ?? '').toContain(`production=${encodeURIComponent(outputSlug)}`);
  await expect(status).toContainText('Loading on 1-20', { timeout: 5_000 });
  await expect(status).toHaveAttribute('data-tone', 'idle');

  // Unload on purpose is not a loss: grey again, and Load is due.
  await openPanel();
  await panel.getByTestId('caspar-take-off-air').click();
  await expect(status).toContainText('Not loaded on 1-20', { timeout: 5_000 });
  await expect(status).toHaveAttribute('data-tone', 'idle');
  await page.keyboard.press('Escape');
  expect(studio.actions.map((a) => a.verb)).toEqual(['take', 'out']);

  // ── An output elsewhere (OBS, say) reports READY: green "Connected", the empty slot no fault. ──
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
  if (fontsOk) await expect(status).toContainText('Connected');

  // ── CasparCG switched off: a Bridge that has gone means nothing to this production. ──
  studio.missing = true;
  await setCasparSwitch(page, false);
  await openPanel();
  await expect(panel.getByTestId('caspar-bridge')).toHaveCount(0);
  await expect(panel.getByTestId('caspar-slot')).toHaveCount(0);
  await expect(status).toHaveAttribute('data-tone', settled);
  await page.screenshot({ path: test.info().outputPath('browser-health-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath('browser-health-phone.png'), fullPage: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.keyboard.press('Escape');
  // Switched on with the Bridge gone: red, named.
  await setCasparSwitch(page, true);
  await expect(status).toContainText('Bridge not running', { timeout: 30_000 });
  await expect(status).toHaveAttribute('data-tone', 'bad');
  studio.missing = false;
  await openPanel();
  await panel.getByTestId('playout-check-now').click();
  await expect(panel.getByTestId('caspar-bridge')).toHaveAttribute('data-tone', 'ok', { timeout: 30_000 });
  await page.keyboard.press('Escape');
  await setCasparSwitch(page, false);

  // ── AC-5: a change the outputs draw puts Publish changes in the header, and the publish moves the
  //    open output onto the new version BY ITSELF: this spec never reloads it. ──
  await addCatalogGraphic(page, showId, 'Hairline');
  await expect(page.getByTestId('production-publish-changes')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('production-publish-changes').click();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  await expect
    .poll(async () => {
      const { data } = await admin.from('control_shows').select('output').eq('id', showId).single();
      return (data?.output as { ver?: { n: number } }).ver?.n;
    }, { timeout: 30_000 })
    .toBe(2);
  await expect.poll(async () => (await readyOf(air))?.v?.n, { timeout: 90_000, message: 'the output moved onto v2 by itself' }).toBe(2);
  await expect(page.getByTestId('production-publish-changes')).toHaveCount(0, { timeout: 30_000 });
  await expect(status).toHaveAttribute('data-tone', settled, { timeout: 30_000 });

  // ── A renderer seen this session that goes is lost: red, by name. ──
  await air.close();
  await expect(status).toHaveAttribute('data-tone', 'bad', { timeout: 60_000 });
  await expect(status).toContainText('Desk A lost');

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await anon.close();
  await unpublishForCleanup(page);
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
