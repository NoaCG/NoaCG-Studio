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
// Mutation-tested: with the attempt deadline taken out, the held Take commits at 6 s and the
// output's entrance count reads 1.
// covers: src/control/failedSends.ts

import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, lastAppliedRow, signIn, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

/** How long the Take's request is held in the browser, and how far behind it the Out is pressed:
 *  the numbers of the research run this reproduces. */
const HOLD_MS = 6000;
const OUT_AFTER_MS = 1500;

test('a held Take is abandoned inside the window and never reaches air, even behind a later Out',async ({ page, context }) => {
  test.setTimeout(300_000);
  await signIn(page);
  await page.keyboard.press('Escape'); // the wizard signIn leaves open — not this walk
  await clearPublishedShows(page);

  // A scorebug: a plain entrance, so only a `play` reaching a stage moves `data-plays`.
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  const showName = `Late Take ${Date.now()}`;
  await openProductionWithCurrent(page, showName);
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  const links = page.getByTestId('production-links');
  await expect(links).toBeVisible();
  await page.getByTestId('production-links-toggle').click();
  await expect(links).toBeHidden();

  const slugs = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const s = loadShows().find((x) => x.name === name);
    return { hosted: s?.hostedSlug ?? null, output: s?.outputSlug ?? null };
  }, showName);
  expect(slugs.hosted, 'publishing must mint a hosted control slug').toBeTruthy();
  expect(slugs.output, 'publishing must mint an output slug').toBeTruthy();

  // AIR, its follow proved up before anything is pressed.
  const air = await context.newPage();
  await air.goto(`/output?production=${encodeURIComponent(slugs.output as string)}&debug=1`);
  await expect(air.locator('pre')).toContainText('realtime:', { timeout: 60_000 });
  const airPlays = () => air.evaluate(() => document.body.getAttribute('data-plays'));
  expect(await airPlays()).toBe('0');

  const op = await context.newPage();
  await op.goto(`/app?control=${encodeURIComponent(slugs.hosted as string)}`);
  await expect(op.getByTestId('hosted-control-page')).toBeVisible({ timeout: 60_000 });
  const chip = op.getByTestId('hosted-live-chip');
  await expect(chip).toContainText('nothing on air');

  // THE HOLD: every send carrying a `play` waits HOLD_MS in the browser before it may leave. The
  // Out carries none and goes straight through. An attempt the page abandons meanwhile is
  // cancelled, so letting it go afterwards finds nothing to send. Both send RPCs: `control_send_many`
  // on the id road, `control_send_seq` on the numbered log (migration 0070), whichever the page
  // negotiated with this server.
  const held: Promise<void>[] = [];
  await op.route('**/rest/v1/rpc/control_send_*', async (route) => {
    const body = route.request().postDataJSON() as { p_items?: { msg?: { t?: string } }[] } | null;
    if (!body?.p_items?.some((item) => item.msg?.t === 'play')) return route.continue();
    const release = new Promise<void>((resolve) => setTimeout(resolve, HOLD_MS)).then(() =>
      route.continue().catch(() => {}),
    );
    held.push(release);
    await release;
  });
  const abandoned: string[] = [];
  op.on('requestfailed', (r) => {
    if (/\/rpc\/control_send_(many|seq)\b/.test(r.url())) abandoned.push(r.failure()?.errorText ?? '');
  });

  const notice = op.getByTestId('hosted-error');
  await op.getByTestId('hosted-cues').locator('.pd-cue').first().getByTestId('hosted-select-cue').click();

  // ── An abandoned attempt ends in the notice, like any send nobody answered. ────────────────
  //
  // A Take held with no Out behind it: both attempts inside the window are abandoned, and within
  // the window (not at a statement timeout, 3 s to 8 s per attempt before) the page says that the
  // graphic on its monitor is on no other screen.
  const takenAt = Date.now();
  await op.getByTestId('hosted-take-cue').click();
  await expect(chip).toContainText('on air:');
  await expect(notice).toContainText('on this monitor only', { timeout: 10_000 });
  // Due at about 3.4 s; the bound is the hold, since before this change the notice never came.
  expect(Date.now() - takenAt, 'the notice comes before the held request would have been let go').toBeLessThan(HOLD_MS);
  await Promise.all(held);
  await op.waitForTimeout(3000);
  expect(await airPlays(), 'an abandoned Take must never reach air').toBe('0');
  // Out goes through, lands, and the graphic it was about is owed nothing any more.
  await op.getByTestId('hosted-out-cue').click();
  await expect(chip).toContainText('nothing on air');
  await expect(notice).toHaveCount(0, { timeout: 30_000 });

  // ── The late Take of §5.6. ──────────────────────────────────────────────────────────────────
  held.length = 0;
  abandoned.length = 0;
  await op.getByTestId('hosted-take-cue').click();
  await expect(chip).toContainText('on air:');
  // The scenario's interval, not a wait for a state: the Out is pressed while the Take is held.
  await op.waitForTimeout(OUT_AFTER_MS);
  const rowsBeforeOut = await lastAppliedRow(air);
  await op.getByTestId('hosted-out-cue').click();
  await expect(chip).toContainText('nothing on air');

  // The Out reaches air (a stop and a cue row)...
  await expect.poll(() => lastAppliedRow(air), { timeout: 30_000 }).toBeGreaterThanOrEqual(rowsBeforeOut + 2);
  // ...and then every held Take attempt is let go, with time for anything it carried to arrive.
  expect(held.length, 'the Take was held in flight').toBeGreaterThan(0);
  await Promise.all(held);
  const rowsAfterOut = await lastAppliedRow(air);
  await op.waitForTimeout(3000);

  // THE CLAIM. The held Take was abandoned in the browser, so nothing late reached the log or air:
  // no entrance was ever played on the output, and no row arrived after the Out's.
  expect(await airPlays(), 'the late Take must never reach air').toBe('0');
  expect(await lastAppliedRow(air)).toBe(rowsAfterOut);
  expect(abandoned.length, 'the held Take attempts were cancelled in the browser').toBeGreaterThan(0);

  // And the operator page agrees with air. Whether the abandoned Take's notice is still up is not
  // asserted: the Out's landing takes it down when the Take gave up first and cannot when the Out
  // landed first, and which comes first is the backend's round trip against the resend delay.
  await expect(chip).toContainText('nothing on air');

  // ── With the link healthy, the same Take airs, so the zeros above were not an output that
  // could not play at all. ─────────────────────────────────────────────────────────────────────
  await op.unrouteAll({ behavior: 'ignoreErrors' });
  await op.getByTestId('hosted-take-cue').click();
  await expect.poll(airPlays, { timeout: 30_000 }).toBe('1');
  await expect(chip).toContainText('on air:');
  await expect(notice).toHaveCount(0);

  await op.close();
  await air.close();
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
