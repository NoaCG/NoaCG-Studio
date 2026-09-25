import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { haveCreds, signIn, wipeMyGraphics } from './_helpers';

// THE PUBLISHED SPORTS PATH (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 4): a scorebug driven from
// the production dashboard and rendered by the REAL /output page over the REAL hosted log.
//
// The quiz path next door proves a SEQUENCE survives the wire. A scoreboard is a different
// problem and this file exists for the difference: it stays on air for a whole match, so the
// interesting questions are whether a score bumped from the cockpit reaches the renderer, and
// whether a clock STARTED there is genuinely running inside it — which no state chip can
// answer, because the chip is fed by the local monitor and would read "Clock running" over a
// completely dead wire.
//
// Two behaviours are encoded here as CORRECT rather than fought, because both look like bugs
// until you follow the wire:
//   - a renderer reboot REWINDS the clock to the last operator-typed value. The renderer
//     reports what it was sent, never what its own clock ticked to, so recovery replays the
//     field. Asserting "it resumed where it was" would be asserting a thing the design does not
//     promise.
//   - a Take/Update/Snap carrying an UNCHANGED clock value no longer re-seeds the running
//     clock (shared/matchClock.ts). It used to, because the wire carries the whole cue's
//     values and the clock's is one of them, so a score bumped on air pulled the clock back to
//     the cue's clock field — an on-air fault, fixed and pinned by e2e/sports.spec.ts. The
//     walk below still finishes with the clock, which now reads as ordinary tidiness rather
//     than as working around that behaviour. A CHANGED value is still an operator correction
//     and still re-seeds.

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

test('a published scorebug takes a score bump and a running clock on the real output renderer', async ({ page, context }) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  // A prior FAILED run can leave its published production behind, and the account SYNCS shows —
  // a stale record with an outputSlug then shadows this run's. Clean slate first.
  await page.evaluate(async () => {
    const { loadShows, deleteShow } = await import('/src/model/shows.ts');
    const { unpublishControlShow } = await import('/src/control/hostedControl.ts');
    for (const s of loadShows()) {
      if (s.hostedSlug || s.outputSlug) await unpublishControlShow(s.id).catch(() => {});
      deleteShow(s.id);
    }
    const { syncNow } = await import('/src/backend/syncController.ts');
    await syncNow();
  });
  // The house scorebug counts UP from 0:00, so a running clock is visibly moving rather than
  // merely reported as running.
  await bootstrapGraphic(page, { name: 'House Scorebug' });

  const showName = `Live Match ${Date.now()}`;
  await openProductionWithCurrent(page, showName);
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  // Publishing opens the links popover; its own toggle closes it (quiz-output.spec.ts says why
  // that rather than Escape, and why not a backdrop).
  const links = page.getByTestId('production-links');
  await expect(links).toBeVisible();
  await page.getByTestId('production-links-toggle').click();
  await expect(links).toBeHidden();

  const outputSlug = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((s) => s.name === name)?.outputSlug ?? null;
  }, showName);
  expect(outputSlug).toBeTruthy();

  const output = await context.newPage();
  output.on('console', (m) => console.log('[output]', m.type(), m.text()));
  output.on('pageerror', (e) => console.log('[output pageerror]', e.message));
  // The browser only reports a failed request as a bare "status 400" in the console, with no URL —
  // which reads as an unexplained backend error in an otherwise green run. Name the request, so a
  // non-2xx on this page is diagnosable from the log alone.
  output.on('response', (r) => {
    if (r.status() >= 400) console.log('[output http]', r.status(), r.request().method(), r.url());
  });
  await output.goto(`/output?production=${encodeURIComponent(outputSlug!)}&debug=1`);
  const graphic = output.frameLocator('iframe');

  const shotBoth = async (name: string) => {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/signed-in/${name}-dashboard.png` });
    await output.screenshot({ path: `test-results/signed-in/${name}-output.png` });
  };

  // ── TAKE. The opacity poll is the wire proof: the team names sit in the markup either way,
  // so asserting on text would pass over a dead wire. ──
  await page.getByTestId('verb-take').click();
  await expect
    .poll(
      async () => graphic.locator('.scoreboard').evaluate((el) => Number(getComputedStyle(el).opacity)),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0.9);
  await shotBoth('sport-live-1-on-air');

  // ── THE SCORE, bumped with the stepper rather than typed. Staged first, aired on Update. ──
  const scoreA = page.getByTestId('cue-field-f1');
  await expect(scoreA).toHaveAttribute('type', 'number');
  await scoreA.fill('1');
  await page.getByTestId('verb-update').click();
  await expect(graphic.locator('#f1')).toHaveText('1', { timeout: 20_000 });
  await shotBoth('sport-live-2-goal');

  // ── THE RECOVERY DRILL, which is the frame that matters most on a graphic that stays up for
  // ninety minutes. Take the board to full time, reload the renderer, and check what comes
  // back: the aired score, and NONE of the machinery the board keeps for itself. ──
  await page.getByTestId('cue-action-final').click();
  await expect
    .poll(async () => graphic.locator('.scoreboard').getAttribute('class'), { timeout: 20_000 })
    .toContain('scoreboard-final');
  await output.reload();
  await expect
    .poll(
      async () => graphic.locator('.scoreboard').evaluate((el) => Number(getComputedStyle(el).opacity)),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0.9);
  await expect(graphic.locator('#f1')).toHaveText('1');
  // The club-colour holders and the period source must be invisible. They are hidden by a
  // stylesheet rule precisely because the entrance reset a recovery replays clears INLINE
  // styles — with the old inline hiding, this is the assertion that failed and put a raw hex
  // string on air.
  for (const sel of ['.scoreboard-colour-a', '.scoreboard-colour-b']) {
    await expect(graphic.locator(sel)).toBeHidden();
  }
  await shotBoth('sport-live-3-recovered-at-full-time');

  // ── THE CLOCK, last, because every Update re-seeds it. Its only honest proof is two reads
  // separated by real seconds: a single frame cannot tell a running clock from a stopped one.
  // A fresh entrance is the reset (both halves), so play the entrance again to leave full time
  // behind - through RE-TAKE, which is what that is now. Take became a TOGGLE on 2026-08-07
  // (docs/PLAYOUT_DASHBOARD.md §2), so pressing it on a live cue takes the board OFF air: the
  // log for this run shows `stop` + `cue: null` a tenth of a second before the clock verb this
  // spec then blamed the product for greying. Re-take moved to its own button and the R key. ──
  await page.getByTestId('verb-retake').click();
  await page.getByTestId('cue-action-clockStart').click();
  const clockNow = () => graphic.locator('.scoreboard-clock').textContent();
  const started = await clockNow();
  await expect.poll(async () => (await clockNow()) !== started, { timeout: 30_000 }).toBe(true);
  await shotBoth('sport-live-4-clock-running');

  // Stopped means STOPPED: identical across two reads several seconds apart.
  await page.getByTestId('cue-action-clockStop').click();
  await output.waitForTimeout(1500);
  const held = await clockNow();
  await output.waitForTimeout(3000);
  expect(await clockNow()).toBe(held);
  await shotBoth('sport-live-5-clock-held');

  // Out, unpublish, and leave the throwaway account clean.
  await page.getByTestId('verb-out').click();
  await page.getByTestId('production-links-toggle').click();
  await page.getByRole('button', { name: /Unpublish/ }).click();
  await expect(page.getByTestId('production-mode')).toContainText('NOT PUBLISHED', { timeout: 20_000 });
  await page.evaluate(async () => {
    const { loadShows, deleteShow } = await import('/src/model/shows.ts');
    for (const s of loadShows()) deleteShow(s.id);
  });
  await wipeMyGraphics(page);
  await output.close();
});
