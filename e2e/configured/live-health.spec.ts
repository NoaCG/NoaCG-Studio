// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change.
//
// THE LIVE PATH, SEEN (Phase 6 Step 1: docs/work-specs/playout-runtime-reliability/spec.md AC-8,
// AC-9). An output says who it is and how commands reach it; both operator surfaces show one health
// line built from the outputs' Presence entries on `live-<show id>` (migration 0068), and fall back
// to the renderer heartbeat when the server refuses that topic. None of it exists offline: there is
// no production to resolve and no socket to join.
// covers: src/control/livePath.ts, src/components/control/OutputHealth.tsx, src/output/main.ts

import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

/**
 * Refuse this page's join of any `live-` topic the way a server without migration 0068 does (an
 * error reply to the join), and pass every other frame through untouched - the log and command
 * channels on the same socket must keep working, which is half of what is being proved.
 */
async function refuseLiveTopic(page: Page): Promise<void> {
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      if (typeof message === 'string') {
        try {
          const m = JSON.parse(message) as unknown;
          const [joinRef, ref, topic, event] = Array.isArray(m)
            ? m
            : [(m as { join_ref?: unknown }).join_ref, (m as { ref?: unknown }).ref, (m as { topic?: unknown }).topic, (m as { event?: unknown }).event];
          if (event === 'phx_join' && typeof topic === 'string' && topic.startsWith('realtime:live-')) {
            const payload = { status: 'error', response: { reason: 'Unauthorized: refused by live-health.spec.ts' } };
            ws.send(
              JSON.stringify(
                Array.isArray(m) ? [joinRef, ref, topic, 'phx_reply', payload] : { topic, event: 'phx_reply', payload, ref, join_ref: joinRef },
              ),
            );
            return;
          }
        } catch {
          // not a JSON frame: pass it through
        }
      }
      server.send(message);
    });
    server.onMessage((message) => ws.send(message));
  });
}

/** Where the screenshots go: LIVE_HEALTH_SHOTS when a person wants to look at them after the run
 *  (the output folder is cleared by the next run), the test's own output folder otherwise. */
const shot = (name: string) =>
  process.env.LIVE_HEALTH_SHOTS ? `${process.env.LIVE_HEALTH_SHOTS}/live-health-${name}.png` : test.info().outputPath(`${name}.png`);

type LiveWindow = {
  __noacgLive?: {
    identity: { id: string; build: string; protocol: number };
    engine: () => string;
    presence: () => string;
    summary: () => {
      rx: { fast: number; log: number; tail: number };
      dup: number;
      late: number;
      last: { road: string; rx: number; apply: number; frame: number } | null;
    };
  };
};

test('an output says who it is and how commands reach it, and both operator pages show one health line', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  const showName = `Live Health ${Date.now()}`;
  await openProductionWithCurrent(page, showName);
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  const links = page.getByTestId('production-links');
  await expect(links).toBeVisible();
  await page.getByTestId('production-links-toggle').click();
  await expect(links).toBeHidden();
  const published = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const s = loadShows().find((x) => x.name === name);
    return s ? { id: s.id, outputSlug: s.outputSlug ?? null, hostedSlug: s.hostedSlug ?? null } : null;
  }, showName);
  expect(published?.outputSlug && published.hostedSlug, 'publishing mints both capabilities').toBeTruthy();
  const { id: showId, outputSlug, hostedSlug } = published as { id: string; outputSlug: string; hostedSlug: string };

  // Renderers and the hosted page are SIGNED OUT, as they are in a studio.
  const anon = await browser.newContext();
  const output = await anon.newPage();
  output.on('pageerror', (e) => console.log('[output pageerror]', e.message));
  const outputUrl = `/output?production=${encodeURIComponent(outputSlug)}&debug=1`;
  await output.goto(outputUrl);
  const debug = output.locator('pre');
  await expect(debug).toContainText('realtime: following', { timeout: 60_000 });

  // ── WHO IT IS: an id that survives a reload of the same source, the engine in words, the build
  //    and the protocol. ──
  const identity = await output.evaluate(() => (window as LiveWindow).__noacgLive!.identity);
  expect(identity.id).toMatch(/^[a-z0-9]{12}$/);
  expect(identity.protocol).toBe(1);
  expect(identity.build.length).toBeGreaterThan(0);
  await expect(debug).toContainText(`identity: ${identity.id}`);
  expect(await output.evaluate(() => (window as LiveWindow).__noacgLive!.engine())).toMatch(/Chrome \d+/);
  await output.reload();
  await expect(debug).toContainText('realtime: following', { timeout: 60_000 });
  expect(await output.evaluate(() => (window as LiveWindow).__noacgLive!.identity.id)).toBe(identity.id);

  // ── HOW IT HEARS: a Take carries its press time, and the output times it to the frame. ──
  await page.getByTestId('verb-take').click();
  await expect
    .poll(async () => output.evaluate(() => (window as LiveWindow).__noacgLive!.summary().last), { timeout: 60_000 })
    .not.toBeNull();
  const summary = await output.evaluate(() => (window as LiveWindow).__noacgLive!.summary());
  // A Take is an update and a play; each reaches this output on the fast road and the log road,
  // and the second copy of each is dropped.
  expect(summary.rx.fast + summary.rx.log + summary.rx.tail).toBeGreaterThanOrEqual(2);
  expect(summary.last!.frame).toBeGreaterThanOrEqual(0);
  expect(summary.last!.apply).toBeGreaterThanOrEqual(0);
  // One machine, one clock: press to receive is exact here, and a healthy Take is not late.
  expect(summary.last!.rx).toBeGreaterThanOrEqual(0);
  expect(summary.late).toBe(0);
  await expect(debug).toContainText('press→rx');
  await output.screenshot({ path: shot('output-debug') });

  // ── THE HEARTBEAT the fallback reads, before the hosted page resolves. ──
  await expect
    .poll(
      async () =>
        page.evaluate(async (id) => {
          const { controlOutputSeenAt } = await import('/src/control/hostedControl.ts');
          return controlOutputSeenAt(id);
        }, showId),
      { timeout: 30_000 },
    )
    .not.toBeNull();

  // ── A SECOND output whose server refuses the live topic: it still follows and airs, it only
  //    goes unannounced. On a server with the numbered log (migration 0070, which needs 0068, so no
  //    real server refuses the topic there) the live topic is also the renderer's log road: refused,
  //    that output follows on the poll floor and says so. ──
  const numbered = ((await debug.textContent()) ?? '').includes('protocol: numbered log');
  const refused = await anon.newPage();
  await refuseLiveTopic(refused);
  await refused.goto(outputUrl);
  const refusedDebug = refused.locator('pre');
  await expect(refusedDebug).toContainText(numbered ? 'realtime: NOT JOINED' : 'realtime: following', { timeout: 60_000 });
  await expect(refusedDebug).toContainText('presence: NOT JOINED', { timeout: 30_000 });

  const hosted = await anon.newPage();
  await hosted.setViewportSize({ width: 1440, height: 900 });
  await hosted.goto(`/app?control=${encodeURIComponent(hostedSlug)}`);
  await expect(hosted.getByTestId('hosted-control-page')).toBeVisible({ timeout: 60_000 });
  const hostedLine = hosted.getByTestId('hosted-output-health');
  await expect(hostedLine).toBeVisible({ timeout: 30_000 });

  // A hosted page whose own live join is refused: the heartbeat as it was when the page opened,
  // and it says so rather than claiming a live connection.
  const hostedRefused = await anon.newPage();
  await refuseLiveTopic(hostedRefused);
  await hostedRefused.goto(`/app?control=${encodeURIComponent(hostedSlug)}`);
  const refusedLine = hostedRefused.getByTestId('hosted-output-health');
  await expect(refusedLine).toHaveAttribute('data-source', 'heartbeat', { timeout: 30_000 });
  await expect(refusedLine).toContainText('output seen when this page opened');
  await hostedRefused.screenshot({ path: shot('hosted-fallback'), clip: { x: 0, y: 0, width: 1280, height: 90 } });

  // Does this server have the live topic? The first output answers that for the rest.
  await expect
    .poll(async () => output.evaluate(() => (window as LiveWindow).__noacgLive!.presence()), { timeout: 30_000 })
    .not.toBe('joining');
  const serverHasLiveTopic = (await output.evaluate(() => (window as LiveWindow).__noacgLive!.presence())) === 'joined';
  test.info().annotations.push({ type: 'live topic', description: serverHasLiveTopic ? 'migration 0068 present' : 'server without 0068: fallback asserted' });

  if (serverHasLiveTopic) {
    // ONE output: the announced one. The refused one is on air but not in the line, by design.
    await expect(hostedLine).toHaveAttribute('data-source', 'presence', { timeout: 30_000 });
    await expect(hostedLine).toHaveAttribute('data-outputs', '1');
    await expect(hostedLine).toHaveAttribute('data-tone', 'ok');
    await expect(hostedLine).toContainText('1 output');
    await expect(hostedLine).toContainText('Chrome');
    // The production dashboard reads the same line from the same entries.
    const deskLine = page.getByTestId('renderer-status');
    await expect(deskLine).toHaveAttribute('data-source', 'presence', { timeout: 30_000 });
    await expect(deskLine).toContainText('1 output');
  } else {
    await expect(hostedLine).toHaveAttribute('data-source', 'heartbeat');
    await expect(hostedLine).toContainText('when this page opened');
  }
  await page.screenshot({ path: shot('desk'), clip: { x: 0, y: 0, width: 1280, height: 90 } });
  await hosted.screenshot({ path: shot('hosted-desktop'), clip: { x: 0, y: 0, width: 1440, height: 120 } });
  await hosted.setViewportSize({ width: 390, height: 844 });
  await expect(hosted.locator('.pd-health-short')).toBeVisible();
  await expect(hosted.getByTestId('hosted-out-all')).toBeInViewport();
  await hosted.screenshot({ path: shot('hosted-phone'), clip: { x: 0, y: 0, width: 390, height: 160 } });

  // Every renderer still airs the Take: the refused join cost nothing but the announcement.
  await expect.poll(async () => refused.evaluate(() => document.body.getAttribute('data-plays')), { timeout: 30_000 }).not.toBe('0');

  if (serverHasLiveTopic) {
    // Closing the output drops it: Presence is held by the socket, not written anywhere.
    await output.close();
    await expect(hostedLine).toHaveAttribute('data-outputs', '0', { timeout: 30_000 });
    await expect(hostedLine).toContainText('no output connected');
    // …on the dashboard too, which had heard that output since before its reload. (The refused
    // output keeps beating over REST, so the dashboard may go on to say one is off the live
    // channel; what it must not do is keep listing the closed one.)
    await expect(page.getByTestId('renderer-status')).not.toContainText('Chrome', { timeout: 30_000 });
  }

  // Out, unpublish, and leave the throwaway account clean.
  await page.getByTestId('verb-out').click();
  await page.getByTestId('production-links-toggle').click();
  await page.getByRole('button', { name: /Unpublish/ }).click();
  await expect(page.getByTestId('production-mode')).toContainText('NOT PUBLISHED', { timeout: 20_000 });
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await anon.close();
});
