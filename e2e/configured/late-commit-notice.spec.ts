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
// Red before the fix, at the first walk's notice assertion (configured-suite run 38055424031), and
// green with it (run 38055648571).
//
// SINCE #2655 a Take is not given up on after 4 s: it is sent until it lands, and PROGRAM says
// "still sending" beside Stop sending (docs/work-specs/live-publishing/evidence/fix-2655.md R2, R6).
// The second walk is that: no "on this monitor only" while it is being sent, and the late commit
// ends it as landed. The third walk is the notice this file was written for, reached the way an
// operator now reaches it: Stop sending, then the late commit takes the notice down.
// Mutation-tested: with the press never held (hostedControl.ts `held` forced false), the second
// walk fails at "still sending": the tag reads "not confirmed", the old give-up.
// covers: src/control/hostedControl.ts, src/control/seqSend.ts, src/control/playoutStatus.ts
// covers: src/components/home/PlayoutMonitors.tsx
// covers: src/control/failedSends.ts
// covers: src/control/airState.ts, src/control/sessionWire.ts
// covers: src/control/graphicVerbs.ts, src/control/verbDispatch.ts, src/control/verbView.ts
// covers: src/control/cueDraft.ts
// covers: src/components/home/ProductionPage.tsx

import { publishProduction } from '../_publish';
import { test, expect, type Page, type Route } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, openSecondProductionPage, signIn, watchLogReads, wipeMyGraphics } from './_helpers';
import { installDoor } from '../_door';

// This file also runs in pages that are not the app (e2e/_door.ts).
test.beforeEach(({ context }) => installDoor(context));

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

/** Past one attempt's deadline (ATTEMPT_TIMEOUT_MS, 1.5 s), so every attempt is abandoned. */
const ANSWER_LATE_MS = 1700;
/** Past the old window (RESEND_WINDOW_MS, 4 s): before #2655 the page gave up before this. */
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
  const showId = await openProductionWithCurrent(page, showName);
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  const links = page.getByTestId('production-status-panel');
  if (await links.isVisible()) await page.getByTestId('production-status').click();
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
  const airPlays = () => air.evaluate(() => Number(document.body.getAttribute('data-plays')));
  expect(await airPlays()).toBe(0);

  // A second operator's production page on the same production.
  // Each held press waits for the page to be level with the log, or its monitor would not move.
  let followerLevel: () => Promise<void> = async () => {};
  const op = await openSecondProductionPage(page, showId, {
    prepare: async (tab) => {
      followerLevel = await watchLogReads(tab);
    },
  });
  const chip = op.getByTestId('live-cue-chip');
  const notice = op.getByTestId('production-note').filter({ hasText: 'on this monitor only' });
  await expect(chip).toContainText('nothing on air');
  await op.getByTestId('cue-list').locator('.pd-cue').first().getByTestId('select-cue').click();

  // ── Its row came back before the page gave up: the send landed. ──────────────────────────────
  await answerLate(op);
  await followerLevel();
  const takenAt = Date.now();
  await op.getByTestId('verb-take').click();
  await expect.poll(airPlays, { timeout: 30_000 }).toBe(1);
  // Every attempt abandoned unanswered by now: the send is over.
  await op.waitForTimeout(Math.max(0, takenAt + SETTLED_MS - Date.now()));
  await expect(chip).toContainText('on air:');
  await expect(notice, 'a Take on air is not "on this monitor only"').toHaveCount(0);
  await op.unrouteAll({ behavior: 'ignoreErrors' });
  await op.getByTestId('verb-out').click();
  await expect(chip).toContainText('nothing on air');

  // ── Past the old window it is still being sent, and says so; its late commit lands it. ───────
  const status = op.getByTestId('program-air');
  const commitLate = await holdThenDrop(op);
  await followerLevel();
  const heldAt = Date.now();
  await op.getByTestId('verb-take').click();
  await expect(status).toContainText('still sending', { timeout: 10_000 });
  await expect(op.getByTestId('stop-sending')).toBeVisible();
  // Past the old window and the hold: never "failed", never "on this monitor only".
  await op.waitForTimeout(Math.max(0, heldAt + HOLD_MS + 1000 - Date.now()));
  await expect(notice, 'a Take still being sent is not reported as failed').toHaveCount(0);
  await expect(status).toContainText('still sending');
  expect(await airPlays()).toBe(1);
  await commitLate();
  await expect.poll(airPlays, { timeout: 30_000 }).toBe(2);
  // Its own row heard back ends it as landed (R3): the tag moves on and no notice ever came.
  await expect(status).not.toContainText('still sending', { timeout: 30_000 });
  await expect(notice).toHaveCount(0);
  await op.unrouteAll({ behavior: 'ignoreErrors' });
  await op.getByTestId('verb-out').click();
  await expect(chip).toContainText('nothing on air');

  // ── The same on the page that published it. ──────────────────────────────────────────────────
  const note = page.getByTestId('production-note').filter({ hasText: 'on this monitor only' });
  const pageChip = page.getByTestId('live-cue-chip');
  await expect(pageChip).toContainText('nothing on air');
  const commitLateHere = await holdThenDrop(page);
  await page.getByTestId('verb-take').click();
  // Stop sending (R6): the Take ends as the old give-up did, owed, with its plain notice.
  await page.getByTestId('stop-sending').click({ timeout: 15_000 });
  await expect(note).toHaveCount(1, { timeout: 10_000 });
  await expect(note).toContainText('(sending stopped)');
  await expect(page.getByTestId('stop-sending')).toHaveCount(0);
  await commitLateHere();
  await expect.poll(airPlays, { timeout: 30_000 }).toBe(3);
  await expect(note, 'the late Take is on air, so the notice is withdrawn').toHaveCount(0, { timeout: 10_000 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  await op.close();
  await air.close();
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
