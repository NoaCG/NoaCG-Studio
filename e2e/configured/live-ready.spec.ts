// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change.
//
// READY (Phase 6 Step 3: docs/work-specs/playout-ready/spec.md AC-1 to AC-7). An output decides for
// itself whether it is ready and says so in its Presence entry; both operator surfaces read one line
// from those entries: the plan's words, a broken graphic named, an older version called behind, and
// an output that was there and is gone in red. None of it exists offline: there is no production to
// resolve and no topic to join.
// covers: src/control/readiness.ts, src/control/payloadVersion.ts, src/components/control/OutputHealth.tsx, src/output/main.ts, src/output/stage.ts, src/preview/composeDocument.ts, src/model/readyMemory.ts

import { publishProduction } from '../_publish';
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { addCatalogGraphic, bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { SERVICE_ROLE_KEY, SUPABASE_URL, clearPublishedShows, haveCreds, readyOf, signIn, wipeMyGraphics, type ReadyWindow, unpublishForCleanup } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

/** Where the screenshots go: READY_SHOTS when a person wants to look at them after the run, the
 *  test's own output folder otherwise. */
const shot = (name: string) => (process.env.READY_SHOTS ? `${process.env.READY_SHOTS}/ready-${name}.png` : test.info().outputPath(`${name}.png`));

test('READY: every output says whether it is ready, both surfaces read one line, a broken graphic is named and a dead output is red', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  const showName = `Ready ${Date.now()}`;
  const showId = await openProductionWithCurrent(page, showName);
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  await page.getByTestId('production-status').click();
  const { outputSlug, hostedSlug } = (await page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const s = loadShows().find((x) => x.id === id);
    return { outputSlug: s?.outputSlug ?? '', hostedSlug: s?.hostedSlug ?? '' };
  }, showId)) as { outputSlug: string; hostedSlug: string };
  expect(outputSlug && hostedSlug, 'publishing mints both capabilities').toBeTruthy();

  // ── AC-4: the publish wrote a version stamp into the payload. ──
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const stampOf = async () => {
    const { data } = await admin.from('control_shows').select('output').eq('id', showId).single();
    return (data?.output as { ver?: { n: number; h: string; g: Record<string, string> } }).ver ?? null;
  };
  const v1 = await stampOf();
  expect(v1?.n).toBe(1);
  expect(Object.keys(v1?.g ?? {})).toEqual(['House Scorebug']);

  // ── AC-1: an output, signed out as in a studio, named on its URL, reports READY. ──
  const anon = await browser.newContext();
  const air = await anon.newPage();
  air.on('pageerror', (e) => console.log('[output pageerror]', e.message));
  await air.goto(`/output?production=${encodeURIComponent(outputSlug)}&destination=browser&name=${encodeURIComponent('Desk A')}&debug=1`);
  await expect(air.locator('pre')).toContainText('realtime: following', { timeout: 60_000 });
  const presence = () => air.evaluate(() => (window as ReadyWindow).__noacgLive!.presence());
  await expect.poll(presence, { timeout: 30_000 }).not.toBe('joining');
  test.skip((await presence()) !== 'joined', 'this server has no live topic (migration 0068): READY rides Presence');
  await expect.poll(async () => (await readyOf(air))?.n, { timeout: 30_000 }).toBe(1);
  const first = (await readyOf(air))!;
  expect(first.of).toBe(1);
  expect(first.v).toEqual({ n: 1, h: v1!.h });
  expect(first.is.filter((i) => i.k === 'script' || i.k === 'silent'), 'nothing threw while loading').toEqual([]);
  await expect(air.locator('pre')).toContainText('ready: ');
  // Fonts the host could not fetch are this host's truth and are reported, never hidden: the words
  // on both surfaces are then the fallback line, amber. Everything below reads either.
  const fontsOk = first.is.every((i) => i.k !== 'font');
  test.info().annotations.push({ type: 'fonts', description: fontsOk ? 'every typeface loaded' : `fallback: ${first.is.map((i) => i.d).join(', ')}` });

  // ── AC-5: the production page and the hosted page show ONE line, from the output's own entry.
  //    An entry changes at most once per 10 s (the Presence budget, presenceGate.ts), so a state
  //    the output reached a moment ago can take that long to reach the pages. ──
  // The production page reads READY through its one playout status (studio-day-playout AC-7),
  // which carries READY's own words and counts.
  const desk = page.getByTestId('production-status');
  await expect(desk).toHaveAttribute('data-source', 'ready', { timeout: 30_000 });
  await expect(desk).toHaveAttribute('data-outputs', '1');
  if (fontsOk) {
    await expect(desk).toHaveAttribute('data-tone', 'ok', { timeout: 30_000 });
    await expect(desk).toHaveAttribute('data-ready-label', '● Ready for playout · 1 of 1 output');
  } else {
    await expect(desk).toHaveAttribute('data-tone', 'warn', { timeout: 30_000 });
    await expect(desk).toHaveAttribute('data-ready-label', /Using a fallback font for/);
  }
  const hosted = await anon.newPage();
  await hosted.setViewportSize({ width: 1440, height: 900 });
  await hosted.goto(`/app?control=${encodeURIComponent(hostedSlug)}`);
  const phoneLine = hosted.getByTestId('hosted-output-health');
  await expect(phoneLine).toHaveAttribute('data-source', 'ready', { timeout: 60_000 });
  await expect(phoneLine.locator('.pd-health-full')).toHaveText((await desk.getAttribute('data-ready-label'))!, { timeout: 30_000 });
  // The panel names the output by the name its URL gave it.
  await desk.click();
  const panel = page.getByTestId('production-status-panel');
  await expect(panel.getByTestId('ready-output')).toHaveCount(1);
  await expect(panel).toContainText('Desk A');
  await expect(panel).toContainText('Holds v1');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: shot('desk-1920-panel') });
  await desk.click();
  // READY never blocks a verb: Take is enabled whatever the line says (AC-5, the rule of §9.1).
  await expect(page.getByTestId('verb-take')).toBeEnabled();

  // ── AC-3: the warm pass is off air and never reported, and never runs over what is on air. ──
  const reportOf = () =>
    page.evaluate(async (slug) => {
      const { controlShowBySlug } = await import('/src/control/hostedControl.ts');
      const answer = await controlShowBySlug(slug);
      return answer.ok ? (answer.value?.live['House Scorebug']?.data ?? null) : 'unanswered';
    }, hostedSlug);
  // The output warmed the graphic minutes ago (its READY answer came after it) and wrote no report:
  // nothing has been taken, so there is nothing to report.
  await page.waitForTimeout(2_000);
  expect(await reportOf()).toBeNull();
  // A Take of a value the PUBLISHED cue does not hold (edited here, not published), so a warm pass
  // running over the top of it would put the published value back.
  const teamA = page.getByTestId('cue-field-f0');
  await teamA.fill('READY TEST');
  await page.getByTestId('verb-take').click();
  await expect.poll(async () => air.evaluate(() => document.body.getAttribute('data-plays')), { timeout: 30_000 }).toBe('1');
  const scorebug = () => air.frameLocator('iframe[title="House Scorebug"]').locator('body');
  await expect(scorebug()).toContainText('READY TEST', { timeout: 10_000 });
  // Reloaded while the graphic is on air: recovery rebuilds it, and nothing warms it over the top.
  await air.reload();
  await expect.poll(async () => (await readyOf(air))?.n, { timeout: 60_000 }).toBe(1);
  await expect(scorebug()).toContainText('READY TEST', { timeout: 10_000 });
  await page.waitForTimeout(1_500);
  await expect(scorebug()).toContainText('READY TEST');

  // ── AC-4: after a publish, an open output with a graphic ON AIR keeps the version before, and
  //    says so. (With nothing on air every publish now moves it onto the new version by itself:
  //    docs/work-specs/studio-day-playout AC-10, e2e/configured/playout-status.spec.ts.) ──
  await addCatalogGraphic(page, showId, 'Hairline');
  await page.getByTestId('production-publish-changes').click();
  await expect.poll(async () => (await stampOf())?.n, { timeout: 30_000 }).toBe(2);
  await expect(desk).toHaveAttribute('data-ready-label', /Behind: showing v1/, { timeout: 30_000 });
  await expect(phoneLine.locator('.pd-health-full')).toContainText('Behind: showing v1', { timeout: 30_000 });
  await page.screenshot({ path: shot('desk-behind'), clip: { x: 0, y: 0, width: 1920, height: 120 } });
  await page.getByTestId('verb-out').click();
  await air.reload();
  await expect.poll(async () => (await readyOf(air))?.v?.n, { timeout: 60_000 }).toBe(2);
  await expect(desk).not.toHaveAttribute('data-ready-label', /Behind/, { timeout: 30_000 });

  // ── AC-2: a graphic that throws while loading is named, and the output reads not ready. ──
  // The publish gate refuses such a graphic in the studio, so the fault is put straight into the
  // published payload, where a host whose engine cannot run the graphic would meet it.
  const { data: row } = await admin.from('control_shows').select('output').eq('id', showId).single();
  const output = row!.output as { graphics: { key: string; js: string }[] };
  output.graphics = output.graphics.map((g) => (g.key === 'Hairline' ? { ...g, js: `throw new Error('boom from live-ready.spec.ts');\n${g.js}` } : g));
  await admin.from('control_shows').update({ output }).eq('id', showId);
  await air.reload();
  await expect.poll(async () => (await readyOf(air))?.is.find((i) => i.k === 'script')?.g, { timeout: 60_000 }).toBe('Hairline');
  await expect(desk).toHaveAttribute('data-ready-label', '▲ Not ready: Hairline (script error)', { timeout: 30_000 });
  // READY's line reads it amber (its other graphics still air); the production page's status reads
  // a graphic that cannot play red, by name (docs/work-specs/studio-day-playout AC-7).
  await expect(desk).toHaveAttribute('data-tone', 'bad');
  await expect(desk).toContainText('Not ready: Hairline');
  await expect(phoneLine.locator('.pd-health-full')).toHaveText('▲ Not ready: Hairline (script error)', { timeout: 30_000 });
  // Its other graphic still takes.
  await page.getByTestId('verb-take').click();
  await expect.poll(async () => air.evaluate(() => document.body.getAttribute('data-plays')), { timeout: 30_000 }).toBe('1');
  await page.getByTestId('verb-out').click();
  await hosted.screenshot({ path: shot('hosted-1440-not-ready'), clip: { x: 0, y: 0, width: 1440, height: 120 } });
  await hosted.setViewportSize({ width: 390, height: 844 });
  await expect(hosted.locator('.pd-ready .pd-health-short')).toBeVisible();
  await expect(hosted.getByTestId('hosted-out-all')).toBeInViewport();
  await hosted.screenshot({ path: shot('hosted-390-not-ready'), clip: { x: 0, y: 0, width: 390, height: 200 } });

  // ── AC-6: the output goes away: after 15 s both surfaces read it in red, by its name. ──
  await air.close();
  await expect(desk).toHaveAttribute('data-tone', 'bad', { timeout: 40_000 });
  await expect(desk).toHaveAttribute('data-ready-label', /Desk A not answering \(/);
  await expect(phoneLine).toHaveAttribute('data-tone', 'bad', { timeout: 40_000 });
  await hosted.getByTestId('hosted-output-health').click();
  // In the panel the line is headed by the output's name, and the state under it says the rest.
  const gonePanel = hosted.getByTestId('hosted-output-health-panel');
  await expect(gonePanel.getByTestId('ready-output')).toContainText('Desk A');
  await expect(gonePanel.getByTestId('ready-state')).toContainText('not answering (');
  await hosted.screenshot({ path: shot('hosted-390-not-answering-panel') });
  await page.screenshot({ path: shot('desk-not-answering'), clip: { x: 0, y: 0, width: 1920, height: 120 } });
  // Forgotten, it is gone from the line, and the line falls back to what it knows without it.
  await desk.click();
  await page.getByTestId('ready-forget').click();
  await expect(desk).not.toHaveAttribute('data-tone', 'bad', { timeout: 10_000 });

  await unpublishForCleanup(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'false', { timeout: 20_000 });
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await anon.close();
});
