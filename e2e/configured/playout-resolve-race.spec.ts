// covers: src/components/home/ProductionPage.tsx, src/control/hostedControl.ts
// covers: src/control/liveCue.ts, src/control/cueItems.ts, src/control/playoutSession.ts, src/control/productionDataSession.ts, src/components/home/useStorePart.ts
// covers: src/components/home/useProductionPublish.ts
// covers: src/control/airState.ts, src/control/sessionWire.ts
// covers: src/control/graphicVerbs.ts, src/control/verbDispatch.ts, src/control/verbView.ts
// covers: src/control/cueDraft.ts
//
// A TAKE PRESSED WHILE THE PAGE'S FIRST RESOLVE IS STILL OUT STAYS ON THIS PAGE (production-page
// refactor, phase 1; docs/work-specs/production-page-refactor/spec.md §5.3, "the initial resolve
// after a newer Take").
//
// A published production opened cold asks the server what is live (`controlShowBySlug`, through
// `control_show_resolve` or `control_show_by_slug`) and seeds its live map from the answer. An
// answer that left before the operator's Take is older than the screen: seeding from it would mark
// the graphic off while it is on air, and grey Out (the hosted-tier hang in ProductionPage's
// `setLiveCue` comment). The guard (control/airState.ts `seedFromResolve`) skips the seed when the
// live map moved while the read was out.
// The hold is in the browser, on the answer: the read reaches the server before the Take.
//
// Since #1697 a press made before that first resolve has decided the road waits for it, within the
// press's own resend window (control/hostedControl.ts `roadDecided`), so the Take goes, and moves
// the marker here, only once the answer is in. A press whose wait runs out is never sent, and its
// marker goes back (#1696): so the answer is released while the Take waits.

import { publishProduction } from '../_publish';
import { test, expect, type FrameLocator, type Page } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');

// Cleanup runs whatever the walk's outcome: the account is shared by the whole configured suite.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await clearPublishedShows(page).catch(() => {});
  await wipeMyGraphics(page).catch(() => {});
});

/** A published production reloaded with its first resolve held in the browser: the server answers
 *  at once, and the page hears the answer only on `release`. */
async function holdFirstResolve(page: Page) {
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  await openProductionWithCurrent(page, `Resolve race ${Date.now()}`);
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });

  // THE HOLD: the resolve the reloaded page sends first is answered by the server at once, and the
  // page hears that answer only after the Take: an answer older than the screen.
  let held = 0;
  let fulfilled = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/rest\/v1\/rpc\/control_show_(resolve|by_slug)(\?|$)/, async (route) => {
    held += 1;
    const response = await route.fetch();
    await released;
    await route.fulfill({ response }).catch(() => {});
    fulfilled += 1;
  });
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => held, { message: 'the page asked what is live' }).toBeGreaterThan(0);
  const links = page.getByTestId('production-status-panel');
  if (await links.isVisible()) await page.keyboard.press('Escape');

  const chip = page.getByTestId('live-cue-chip');
  const stage = page.getByTestId('program-stage');
  return { chip, stage, release, held: () => held, fulfilled: () => fulfilled };
}

test('a Take pressed while the first resolve is out stays on air here, as one entrance', async ({ page }) => {
  test.setTimeout(240_000);
  const { chip, stage, release, fulfilled } = await holdFirstResolve(page);
  await expect(stage).toHaveAttribute('data-plays', '0');
  await page.getByTestId('verb-take').click();
  expect(fulfilled(), 'the resolve is still out when the Take is pressed').toBe(0);
  // The Take waits for the road: nothing has gone, so nothing is marked on air yet.
  await expect(chip).not.toContainText('on air:');

  // The answer arrives, read before the Take: nothing on air, as far as it knows. The Take then goes.
  const answered = page.waitForResponse(/\/rest\/v1\/rpc\/control_show_(resolve|by_slug)(\?|$)/);
  release();
  await answered;
  await expect(chip).toContainText('on air:');
  const taken = (await chip.textContent()) ?? '';
  await page.waitForTimeout(1_500);
  await expect(chip).toHaveText(taken);
  await expect(page.getByTestId('verb-out')).toBeEnabled();
  await expect(stage, 'one entrance, and no replay over it').toHaveAttribute('data-plays', '1');

});

test('a Take whose wait for the first resolve runs out is never sent, and nothing is marked on air', async ({ page }) => {
  test.setTimeout(240_000);
  const { chip, stage, release, fulfilled } = await holdFirstResolve(page);
  await expect(stage).toHaveAttribute('data-plays', '0');
  await page.getByTestId('verb-take').click();
  // Held past the Take's resend window: the Take counts as unanswered and never leaves (#1697),
  // and the marker its fast road moved here goes back (#1696).
  await page.waitForTimeout(6_000);
  expect(fulfilled(), 'the resolve is still out when the Take gives up').toBe(0);
  await expect(chip).toContainText('nothing on air');
  // The answer, when it comes, agrees: nothing went.
  const answered = page.waitForResponse(/\/rest\/v1\/rpc\/control_show_(resolve|by_slug)(\?|$)/);
  release();
  await answered;
  await page.waitForTimeout(1_500);
  await expect(chip).toContainText('nothing on air');
});

//
// A CLOCK COMMAND WHILE A REAL PRODUCTION PAGE READS THE OUTPUT'S STATE (#2099), on a real backend
// and a real output. The hold is in the browser, on the page's own round trips, so nothing in the
// product knows about it: the first read waits to be sent while another screen presses Stop, so its
// answer holds that row after a report older than it (the output's reports are held back too), and
// the read of the rows after the report waits while this page is asked for a press of its own.

/** The clock in one graphic frame: its origin (null while held) and the time it shows. */
const clockIn = (graphic: FrameLocator) =>
  graphic.locator('.scoreboard-clock').evaluate((el) => ({
    at: (el.ownerDocument.defaultView as unknown as { matchClockAt: number | null }).matchClockAt,
    text: (el.textContent ?? '').trim(),
  }));

test('a Stop landed while a reloaded page reads the output\'s state shows on its PROGRAM monitor', async ({ page, context }) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  const showName = `Clock during resolve ${Date.now()}`;
  await openProductionWithCurrent(page, showName);
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  const links = page.getByTestId('production-status-panel');
  if (await links.isVisible()) await page.getByTestId('production-status').click();
  const outputSlug = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((s) => s.name === name)?.outputSlug ?? null;
  }, showName);
  expect(outputSlug).toBeTruthy();

  // ── ON AIR, the clock running, and a report that says so. ──
  const output = await context.newPage();
  await output.goto(`/output?production=${encodeURIComponent(outputSlug!)}&debug=1`);
  const air = output.frameLocator('iframe');
  await page.getByTestId('verb-take').click();
  await expect.poll(() => air.locator('.scoreboard').evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 30_000 }).toBeGreaterThan(0.9);
  await page.getByTestId('cue-action-clockStart').click();
  await expect.poll(async () => (await clockIn(air)).at, { timeout: 20_000 }).not.toBeNull();
  await output.waitForTimeout(2_500); // past the report's debounce
  // Air goes on applying what it hears, and its report stays the one that says the clock runs.
  await output.route(/\/rest\/v1\/rpc\/control_output_report/, (route) => route.abort());

  // ── A SECOND SCREEN, which presses while the first reads. ──
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.getByTestId('cue-action-clockStop')).toBeEnabled({ timeout: 30_000 });

  // ── THE HOLD: the page's resolve leaves only when released, then its read of the later rows. ──
  let resolvesAsked = 0;
  let rowsAsked = 0;
  let releaseResolve!: () => void;
  let releaseRows!: () => void;
  const resolveReleased = new Promise<void>((resolve) => (releaseResolve = resolve));
  const rowsReleased = new Promise<void>((resolve) => (releaseRows = resolve));
  await page.route(/\/rest\/v1\/rpc\/control_show_(resolve|by_slug)(\?|$)/, async (route) => {
    resolvesAsked += 1;
    await resolveReleased;
    await route.continue().catch(() => {});
  });
  await page.route(/\/rest\/v1\/rpc\/control_tail(_seq)?(\?|$)/, async (route) => {
    rowsAsked += 1;
    await rowsReleased;
    await route.continue().catch(() => {});
  });
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => resolvesAsked, { message: 'the page asked what is live' }).toBeGreaterThan(0);

  // ── THE COMMAND, during the read. ──
  await other.getByTestId('cue-action-clockStop').click();
  await expect.poll(async () => (await clockIn(air)).at, { timeout: 20_000 }).toBeNull();
  releaseResolve();
  await expect.poll(() => rowsAsked, { message: 'the page read the rows after the report' }).toBeGreaterThan(0);

  // ── WHAT THIS PAGE CAN PRESS WHILE THE ROWS ARE OUT: nothing that reaches air without moving the
  // ON AIR marker. The layer is not known to be live here until the seed. ──
  for (const verb of ['verb-update', 'verb-next', 'verb-out']) await expect(page.getByTestId(verb), verb).toBeDisabled();

  // ── THE MONITOR, against air. ──
  releaseRows();
  const monitor = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect.poll(async () => (await clockIn(monitor)).at, { timeout: 20_000, message: 'the monitor\'s clock is stopped' }).toBeNull();
  const held = await clockIn(air);
  await expect.poll(async () => (await clockIn(monitor)).text, { timeout: 10_000 }).toBe(held.text);

  // ── THE NEXT PRESS moves both. ──
  await page.getByTestId('cue-action-clockStart').click();
  await expect.poll(async () => (await clockIn(air)).at, { timeout: 20_000 }).not.toBeNull();
  await expect.poll(async () => (await clockIn(monitor)).at, { timeout: 20_000 }).not.toBeNull();
  await other.close();
  await output.close();
});
