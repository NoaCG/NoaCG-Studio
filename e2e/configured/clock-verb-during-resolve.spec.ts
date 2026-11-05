// covers: src/control/airState.ts, src/control/sessionWire.ts
//
// A CLOCK COMMAND WHILE A REAL PRODUCTION PAGE READS THE OUTPUT'S STATE (#2099), on a real backend
// and a real output. The hold is in the browser, on the page's own round trips, so nothing in the
// product knows about it: the first read waits to be sent while another screen presses Stop, so its
// answer holds that row after a report older than it (the output's reports are held back too), and
// the read of the rows after the report waits while this page is asked for a press of its own.

import { publishProduction } from '../_publish';
import { test, expect, type FrameLocator } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await clearPublishedShows(page).catch(() => {});
  await wipeMyGraphics(page).catch(() => {});
});

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
