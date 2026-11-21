// A SEND ATTEMPT CANNOT COMMIT LONG AFTER IT WAS PRESSED (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.6
// and §16 item 4).
//
// Replays the late Take of §5.6 (the story is at `ATTEMPT_TIMEOUT_MS` in
// src/control/failedSends.ts): the held Take is now abandoned in the browser and never reaches
// the server.
//
// ONLY A REAL BACKEND CAN SHOW IT: the late commit, the output following the log and the page's
// own follower dropping the returning row by its minted id are all absent offline. The unit half
// (scripts/failed-sends.test.mjs) pins the timing rules with a transport that never answers.
//
// Mutation-tested (before #2671): with the attempt deadline taken out, the held Take commits at 6 s
// and the output's entrance count reads 1.
//
// SINCE #2655 a Take no server answers is not given up on after 4 s: it is sent until it lands,
// "still sending" beside Stop sending (docs/work-specs/live-publishing/evidence/fix-2655.md R2,
// R6). The first walk is that, ended by Stop sending, which cancels the attempt in the browser.
// SINCE #2671 a held attempt is cut at 8 s, not 1.5 s (R2a), so the first walk holds the request
// past that cut. The second walk: an Out replaces the graphic, so it ends the held Take (R7, newest
// wins); the Take's attempt in flight runs to its answer, reaches the server after the Out landed
// and is skipped there. Its claims about air are unchanged; the proof is now the server's skip, read
// from the answer, where it used to be the 1.5 s cut abandoning the request in the browser.
// covers: src/control/failedSends.ts, src/control/markerSender.ts, src/components/home/ProductionPage.tsx

import { publishProduction } from '../_publish';
import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, openSecondProductionPage, lastAppliedRow, signIn, watchLogReads, wipeMyGraphics } from './_helpers';
import { installDoor } from '../_door';

// This file also runs in pages that are not the app (e2e/_door.ts).
test.beforeEach(({ context }) => installDoor(context));

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

/** How long the Take's request is held in the browser, and how far behind it the Out is pressed:
 *  the numbers of the research run this reproduces. */
const HOLD_MS = 6000;
const OUT_AFTER_MS = 1500;
/** Walk 1's hold: past a held attempt's 8 s cut (failedSends.ts HELD_ATTEMPT_MS, #2671), so only
 *  Stop sending ends the Take, never the hold or the cut. */
const HOLD_PAST_CUT_MS = 12_000;

test('a held Take is abandoned inside the window and never reaches air, even behind a later Out',async ({ page, context }) => {
  test.setTimeout(300_000);
  await signIn(page);
  await page.keyboard.press('Escape'); // the wizard signIn leaves open — not this walk
  await clearPublishedShows(page);

  // A scorebug: a plain entrance, so only a `play` reaching a stage moves `data-plays`.
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  const showName = `Late Take ${Date.now()}`;
  const showId = await openProductionWithCurrent(page, showName);
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  const links = page.getByTestId('production-status-panel');
  await expect(links).toBeVisible();
  await page.getByTestId('production-status').click();
  await expect(links).toBeHidden();

  const slugs = await page.evaluate(async (name) => {
    const { loadShows } = await __noacgImport('/src/model/shows.ts');
    const s = loadShows().find((x) => x.name === name);
    return { output: s?.outputSlug ?? null };
  }, showName);
  expect(slugs.output, 'publishing must mint an output slug').toBeTruthy();

  // AIR, its follow proved up before anything is pressed.
  const air = await context.newPage();
  await air.goto(`/output?production=${encodeURIComponent(slugs.output as string)}&debug=1`);
  await expect(air.locator('pre')).toContainText('realtime:', { timeout: 60_000 });
  const airPlays = () => air.evaluate(() => document.body.getAttribute('data-plays'));
  expect(await airPlays()).toBe('0');

  // A second operator's production page on the same production.
  // Each held press waits for the page to be level with the log, or its monitor would not move.
  let followerLevel: () => Promise<void> = async () => {};
  const op = await openSecondProductionPage(page, showId, {
    prepare: async (tab) => {
      followerLevel = await watchLogReads(tab);
    },
  });
  const chip = op.getByTestId('live-cue-chip');
  await expect(chip).toContainText('nothing on air');

  // THE HOLD: every send carrying a `play` waits HOLD_MS in the browser before it may leave. The
  // Out carries none and goes straight through. An attempt the page abandons meanwhile is
  // cancelled, so letting it go afterwards finds nothing to send. Both send RPCs: `control_send_many`
  // on the id road, `control_send_seq` on the numbered log (migration 0071), whichever the page
  // negotiated with this server.
  const held: Promise<void>[] = [];
  let holdMs = HOLD_PAST_CUT_MS;
  await op.route('**/rest/v1/rpc/control_send_*', async (route) => {
    const body = route.request().postDataJSON() as { p_items?: { msg?: { t?: string } }[] } | null;
    if (!body?.p_items?.some((item) => item.msg?.t === 'play')) return route.continue();
    const release = new Promise<void>((resolve) => setTimeout(resolve, holdMs)).then(() =>
      route.continue().catch(() => {}),
    );
    held.push(release);
    await release;
  });
  const abandoned: string[] = [];
  op.on('requestfailed', (r) => {
    if (/\/rpc\/control_send_(many|seq)\b/.test(r.url())) abandoned.push(r.failure()?.errorText ?? '');
  });
  // What the server answered each Take copy that reached it.
  const takeAnswers: unknown[] = [];
  op.on('response', async (r) => {
    if (!/\/rpc\/control_send_seq\b/.test(r.url())) return;
    const body = r.request().postDataJSON() as { p_items?: { msg?: { t?: string } }[] } | null;
    if (!body?.p_items?.some((item) => item.msg?.t === 'play')) return;
    takeAnswers.push(await r.json().catch(() => null));
  });

  const notice = op.getByTestId('production-note').filter({ hasText: 'on this monitor only' });
  await op.getByTestId('cue-list').locator('.pd-cue').first().getByTestId('select-cue').click();

  // ── An abandoned attempt is sent again until the operator stops it, then ends in the notice. ──
  //
  // A Take held with no Out behind it: every attempt is abandoned in the browser at its deadline.
  // The page says it is still sending past the old window and reports no failure; Stop
  // sending ends it, and then the page says that the graphic on its monitor is on no other screen.
  await followerLevel();
  const takenAt = Date.now();
  await op.getByTestId('verb-take').click();
  await expect(chip).toContainText('on air:');
  await expect(op.getByTestId('program-air')).toContainText('still sending', { timeout: 10_000 });
  expect(Date.now() - takenAt, '"still sending" shows before the held request would have been let go').toBeLessThan(HOLD_MS + 1000);
  await expect(notice, 'a Take still being sent is not reported as failed').toHaveCount(0);
  await op.getByTestId('stop-sending').click();
  await expect(notice).toHaveCount(1, { timeout: 10_000 });
  await expect(notice).toContainText('(sending stopped)');
  // The live marker the fast road moved at the press goes back with the failure (#1713): a second
  // operator reads it to know what is on air, and nothing is. So there is nothing to play out.
  await expect(chip).toContainText('nothing on air');
  await expect(op.getByTestId('verb-out')).toBeDisabled();
  await Promise.all(held);
  await op.waitForTimeout(3000);
  expect(await airPlays(), 'an abandoned Take must never reach air').toBe('0');
  expect(abandoned.length, 'Stop sending cancelled the held Take in the browser').toBeGreaterThan(0);
  expect(takeAnswers, 'no copy of the stopped Take reached the server').toEqual([]);
  await expect(chip).toContainText('nothing on air');

  // ── The late Take of §5.6. ──────────────────────────────────────────────────────────────────
  held.length = 0;
  abandoned.length = 0;
  holdMs = HOLD_MS;
  await followerLevel();
  await op.getByTestId('verb-take').click();
  await expect(chip).toContainText('on air:');
  // The scenario's interval, not a wait for a state: the Out is pressed while the Take is held.
  await op.waitForTimeout(OUT_AFTER_MS);
  const rowsBeforeOut = await lastAppliedRow(air);
  await op.getByTestId('verb-out').click();
  await expect(chip).toContainText('nothing on air');

  // The Out reaches air (a stop and a cue row)...
  await expect.poll(() => lastAppliedRow(air), { timeout: 30_000 }).toBeGreaterThanOrEqual(rowsBeforeOut + 2);
  // ...and then every held Take attempt is let go, with time for anything it carried to arrive.
  expect(held.length, 'the Take was held in flight').toBeGreaterThan(0);
  await Promise.all(held);
  const rowsAfterOut = await lastAppliedRow(air);
  await op.waitForTimeout(3000);

  // THE CLAIM. The Out ended the held Take (R7): no new copy, and the one in flight ran to its
  // answer. It reached the server after the Out had landed, which skipped it (0125 step 6), so
  // nothing late reached the log or air: no entrance was ever played on the output, and no row
  // arrived after the Out's.
  expect(await airPlays(), 'the late Take must never reach air').toBe('0');
  expect(await lastAppliedRow(air)).toBe(rowsAfterOut);
  await expect.poll(() => takeAnswers.length, { message: 'the late Take copy was answered' }).toBeGreaterThan(0);
  for (const answer of takeAnswers) {
    const a = answer as { ok?: boolean; skipped?: unknown[] } | null;
    expect(a?.ok, `the late Take copy was skipped, not refused: ${JSON.stringify(answer)}`).toBe(true);
    expect(a?.skipped?.length ?? 0, `the server skipped the late Take copy: ${JSON.stringify(answer)}`).toBeGreaterThan(0);
  }

  // And the operator page agrees with air. Whether the abandoned Take's notice is still up is not
  // asserted: the Out's landing takes it down when the Take gave up first and cannot when the Out
  // landed first, and which comes first is the backend's round trip against the resend delay.
  await expect(chip).toContainText('nothing on air');

  // ── With the link healthy, the same Take airs, so the zeros above were not an output that
  // could not play at all. ─────────────────────────────────────────────────────────────────────
  await op.unrouteAll({ behavior: 'ignoreErrors' });
  await op.getByTestId('verb-take').click();
  await expect.poll(airPlays, { timeout: 30_000 }).toBe('1');
  await expect(chip).toContainText('on air:');
  await expect(notice).toHaveCount(0, { timeout: 30_000 });

  await op.close();
  await air.close();
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
