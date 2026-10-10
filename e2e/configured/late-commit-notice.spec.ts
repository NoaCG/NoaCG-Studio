// A TAKE THAT LANDS AFTER ITS PAGE GAVE UP ON IT IS NOT REPORTED AS FAILED (#917).
//
// Both attempts of a send can be abandoned at their 1.5 s deadline while the server commits one
// anyway (failedSends.ts ATTEMPT_TIMEOUT_MS, WHAT THIS CANNOT DO). Seen on hosted staging: the
// Take was on air and the page said "on this monitor only" for as long as anyone looked, because
// its follower dropped the returning row as its own and nothing withdrew the notice.
//
// The delay is on the SERVER's side of the browser, as a slow link puts it: the request reaches
// the database and commits, and only its answer is late (`route.fetch`, then a wait) - or the
// request is held and then sent from outside the page, after the page has given up and said so.
// Holding the request in the browser instead is the other story, late-send-abandoned.spec.ts.
//
// Mutation-tested: without the transport's check (hostedControl.ts `heard`) the first walk shows
// the notice; without a page's `hearCommand` its notice stays up after the late row lands.
// covers: src/control/failedSends.ts

import { publishProduction } from '../_publish';
import { test, expect, type Page, type Route } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, signIn, watchLogReads, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

/** Past one attempt's deadline (ATTEMPT_TIMEOUT_MS, 1.5 s), so every attempt is abandoned. */
const ANSWER_LATE_MS = 1700;
/** Past the whole window (RESEND_WINDOW_MS, 4 s): the page has given up before the hold ends. */
const HOLD_MS = 5000;
/** When a send pressed this long ago has settled, whichever way: the window and a margin. */
const SETTLED_MS = 4500;

const SEND = '**/rest/v1/rpc/control_send_*';
const carriesPlay = (route: Route) =>
  ((route.request().postDataJSON() as { p_items?: { msg?: { t?: string } }[] } | null)?.p_items ?? []).some((item) => item.msg?.t === 'play');

/** A send that reaches the server and commits at once, and whose answer comes too late. */
async function answerLate(op: Page): Promise<void> {
  await op.route(SEND, async (route) => {
    if (!carriesPlay(route)) return route.continue();
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, ANSWER_LATE_MS));
    await route.fulfill({ response }).catch(() => {});
  });
}

/** Every attempt held until the page has given up on it, then dropped. What the first attempt
 *  carried is kept, so the test can commit it from outside the page: the late commit. */
async function holdThenDrop(op: Page): Promise<() => Promise<void>> {
  const kept: { url: string; headers: Record<string, string>; body: string }[] = [];
  await op.route(SEND, async (route) => {
    if (!carriesPlay(route)) return route.continue();
    const request = route.request();
    const headers = Object.fromEntries(
      Object.entries(await request.allHeaders()).filter(([name]) => !name.startsWith(':') && name !== 'host' && name !== 'content-length'),
    );
    kept.push({ url: request.url(), headers, body: request.postData() ?? '' });
    await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
    await route.abort().catch(() => {});
  });
  return async () => {
    expect(kept.length, 'the Take was sent and held').toBeGreaterThan(0);
    const { url, headers, body } = kept[0];
    const answer = await op.context().request.fetch(url, { method: 'POST', headers, data: body });
    expect(answer.ok(), `the held Take commits when it is let go (${answer.status()})`).toBe(true);
  };
}

test('a Take that commits after its page gave up takes the "on this monitor only" notice down', async ({ page, context }) => {
  test.setTimeout(300_000);
  await signIn(page);
  await page.keyboard.press('Escape'); // the wizard signIn leaves open — not this walk
  await clearPublishedShows(page);

  // A scorebug: a plain entrance, so only a `play` reaching a stage moves `data-plays`.
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  const showName = `Late commit ${Date.now()}`;
  await openProductionWithCurrent(page, showName);
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  const links = page.getByTestId('production-status-panel');
  if (await links.isVisible()) await page.getByTestId('production-status').click();
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
  const airPlays = () => air.evaluate(() => Number(document.body.getAttribute('data-plays')));
  expect(await airPlays()).toBe(0);

  const op = await context.newPage();
  const followerLevel = watchLogReads(op);
  await op.goto(`/app?control=${encodeURIComponent(slugs.hosted as string)}`);
  await expect(op.getByTestId('hosted-control-page')).toBeVisible({ timeout: 60_000 });
  const chip = op.getByTestId('hosted-live-chip');
  const notice = op.getByTestId('hosted-error');
  await expect(chip).toContainText('nothing on air');
  await op.getByTestId('hosted-cues').locator('.pd-cue').first().getByTestId('hosted-select-cue').click();

  // ── Its row came back before the page gave up: the send landed. ──────────────────────────────
  await answerLate(op);
  await followerLevel();
  const takenAt = Date.now();
  await op.getByTestId('hosted-take-cue').click();
  await expect.poll(airPlays, { timeout: 30_000 }).toBe(1);
  // Every attempt abandoned unanswered by now: the send is over.
  await op.waitForTimeout(Math.max(0, takenAt + SETTLED_MS - Date.now()));
  await expect(chip).toContainText('on air:');
  await expect(notice, 'a Take on air is not "on this monitor only"').toHaveCount(0);
  await op.unrouteAll({ behavior: 'ignoreErrors' });
  await op.getByTestId('hosted-out-cue').click();
  await expect(chip).toContainText('nothing on air');

  // ── Its row came back after the page had said it failed: the notice comes down. ──────────────
  const commitLate = await holdThenDrop(op);
  await followerLevel();
  await op.getByTestId('hosted-take-cue').click();
  await expect(notice).toContainText('on this monitor only', { timeout: 10_000 });
  expect(await airPlays()).toBe(1);
  await commitLate();
  await expect.poll(airPlays, { timeout: 30_000 }).toBe(2);
  await expect(notice, 'the late Take is on air, so the notice is withdrawn').toHaveCount(0, { timeout: 10_000 });
  await op.unrouteAll({ behavior: 'ignoreErrors' });
  await op.getByTestId('hosted-out-cue').click();
  await expect(chip).toContainText('nothing on air');

  // ── The same on the production page. ─────────────────────────────────────────────────────────
  const note = page.getByTestId('production-note').filter({ hasText: 'on this monitor only' });
  const pageChip = page.getByTestId('live-cue-chip');
  await expect(pageChip).toContainText('nothing on air');
  const commitLateHere = await holdThenDrop(page);
  await page.getByTestId('verb-take').click();
  await expect(note).toHaveCount(1, { timeout: 10_000 });
  await commitLateHere();
  await expect.poll(airPlays, { timeout: 30_000 }).toBe(3);
  await expect(note, 'the late Take is on air, so the notice is withdrawn').toHaveCount(0, { timeout: 10_000 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  await op.close();
  await air.close();
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
