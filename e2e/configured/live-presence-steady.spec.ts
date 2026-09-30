// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change.
//
// AN OUTPUT STAYS ON THE HEALTH LINE WHILE THE SHOW RUNS. Supabase Realtime closes a client that
// makes more than 5 Presence calls in 30 s, and Step 1's output re-announced every 5 s while
// commands flowed: the harness saw its live channel closed 25 to 27 s after every join, so the
// output fell off the hosted page's line for 15 s of every 40. The page's Presence calls now pass
// one gate (src/control/presenceGate.ts); this drives a busy show for 90 s and watches the line.
// Against a server without migration 0068 there is no Presence to watch, and the test says so.
// covers: src/control/presenceGate.ts, src/control/livePath.ts

import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

test('an output stays listed on the hosted health line through 90 s of a busy show', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  const showName = `Presence Steady ${Date.now()}`;
  await openProductionWithCurrent(page, showName);
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  await page.getByTestId('production-links-toggle').click();
  const { outputSlug, hostedSlug } = (await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const s = loadShows().find((x) => x.name === name);
    return { outputSlug: s?.outputSlug ?? '', hostedSlug: s?.hostedSlug ?? '' };
  }, showName)) as { outputSlug: string; hostedSlug: string };
  expect(outputSlug && hostedSlug).toBeTruthy();

  const anon = await browser.newContext();
  const output = await anon.newPage();
  await output.goto(`/output?production=${encodeURIComponent(outputSlug)}&debug=1`);
  await expect(output.locator('pre')).toContainText('realtime: following', { timeout: 60_000 });
  const presence = () => output.evaluate(() => (window as { __noacgLive?: { presence: () => string } }).__noacgLive!.presence());
  await expect.poll(presence, { timeout: 30_000 }).not.toBe('joining');
  test.skip((await presence()) !== 'joined', 'this server has no live topic (migration 0068): no Presence to keep');

  const hosted = await anon.newPage();
  await hosted.goto(`/app?control=${encodeURIComponent(hostedSlug)}`);
  const line = hosted.getByTestId('hosted-output-health');
  await expect(line).toHaveAttribute('data-outputs', '1', { timeout: 30_000 });
  // The output's READY answer rides the same entry (docs/work-specs/playout-ready).
  await expect(line).toHaveAttribute('data-source', 'ready');

  // A busy show: a Take or an Out every 3 s moves the output's counters, and each change asks for
  // a re-announce. Sampled every second for 90 s: the line must list the output every time, and
  // the output's own channel must never go down.
  const started = Date.now();
  const dropped: string[] = [];
  let press = 0;
  let onAir = false;
  while (Date.now() - started < 90_000) {
    if (press % 3 === 0) {
      onAir = press % 6 === 0;
      await page.getByTestId(onAir ? 'verb-take' : 'verb-out').click();
    }
    press += 1;
    await page.waitForTimeout(1000);
    const at = `${Math.round((Date.now() - started) / 1000)} s`;
    if ((await line.getAttribute('data-outputs')) !== '1' || (await line.getAttribute('data-source')) !== 'ready') {
      dropped.push(`${at}: line ${await line.textContent()}`);
    }
    if ((await presence()) !== 'joined') dropped.push(`${at}: output presence ${await presence()}`);
  }
  expect(dropped, 'the output left the health line during the show').toEqual([]);

  // How many passes fit in the 90 s decides whether the loop ended on a Take or an Out: on hosted
  // staging a pass takes longer, the loop ended on an Out, and clicking the disabled Out here waited
  // out the test's 6 minutes on both attempts (2026-09-30, run 36771874480). Take off only what is up.
  if (onAir) await page.getByTestId('verb-out').click();
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await anon.close();
});
