import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { haveCreds, signIn } from './_helpers';

// THE HOSTED CONTROL PAGE SURVIVES ITS OPERATOR'S FIRST TAKE (docs/CLOUD_PLAYOUT.md §3).
//
// The page rebuilds its PROGRAM monitor once on boot, so an operator opening it mid-show sees
// what is really on air instead of an empty box beside a rundown row marked ON AIR. That rebuild
// reads the layers THE RESOLVE reported (`show.liveCue` as `control_show_by_slug` answered it),
// and it is latched by a ref so it can only ever run once.
//
// Both of those are load-bearing, and the round-1 bug is what proves it: keyed on the LIVE
// `liveCue` state instead, the rebuild re-fired the moment the operator's own first take came
// back round the log - a round-trip after the press, with nothing else on screen to explain it.
// On this page it replayed the entrance the follower had just applied (the graphic playing in
// twice); the cockpit had the same shape and a worse ending, snapping to a stale "off" and
// taking the graphic OFF AIR. A first take is the single most common thing an operator does,
// and the class drives this surface from a phone.
//
// THIS CANNOT BE PINNED OFFLINE, which is why it sits here and why it went unverified so long:
// the defect needs a real durable log to come back round. An offline build has no `control_shows`
// row, no `control_events` to follow and no resolve to key on, so the whole mechanism is absent
// rather than merely untested (`e2e/hosted-control.spec.ts` says as much and covers the local
// half only).
//
// WHAT THIS GATES, MEASURED RATHER THAN ASSUMED. The first version of this file asserted on the
// PICTURE - on air, monitor not blank - and was mutation-tested on 2026-08-21 by putting the
// round-1 bug back. It PASSED. That is the defect's whole nature: replaying `play` on a graphic
// already up re-runs an animation and settles on exactly the picture that was already there, so
// the buggy surface is pixel-identical to the correct one. GSAP does not visibly tick headless
// and the monitor's iframes are sandboxed without same-origin, so nothing downstream could tell
// them apart either.
//
// So the count is the observable: `PayloadStage` publishes how many entrances it has played as
// `data-plays`, and the invariant is arithmetic rather than visual. A take is `update` + `play` +
// `cue` (`takeCueItems`), the `cue` row is status and never reaches a stage, and the follower
// dedupes by row id - so ONE take must leave the PROGRAM monitor on exactly ONE play, before and
// after the row comes back round. Under the round-1 bug the returning `cue` row moves `liveCue`,
// the boot replay re-fires, and the count is 2. Re-mutation-tested with the counter in place, and
// it now reads `Expected: "1"  Received: "2"` - the gate this file was supposed to be.
//
// Underneath that it also walks the path itself, none of which had ever run against a real
// backend: a signed-out capability URL resolves, the boot replay runs against a real
// `control_show_by_slug` answer, a take reaches the durable log, and the layer is still on air
// afterwards - which is the cockpit's ending (a replay that blanks the monitor or drops the
// layer) caught as well.

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

/** Publish nothing behind us: this account is shared by the live suite, and a leftover published
 *  production would still hold its reserved addresses on the next run (migration 0040). */
async function clearPublishedShows(page: import('@playwright/test').Page): Promise<void> {
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
}

test('a fresh operator page boots, takes its first cue, and holds it on air', async ({ page, context }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await page.keyboard.press('Escape'); // the wizard signIn leaves open — not this walk
  await clearPublishedShows(page);

  await bootstrapGraphic(page);
  // Answer the analytics prompt the way a first-visit operator does. It no longer covers the
  // Links popover's Publish row - a notice lost to popovers and dialogs on 2026-09-03 (the
  // layer scale in src/styles/base.css) - so this is part of the walk rather than a dodge.
  const consent = page.getByTestId('analytics-consent');
  if (await consent.isVisible().catch(() => false)) {
    await consent.getByRole('button', { name: 'No thanks' }).click();
  }

  const showName = `Recovery Walk ${Date.now()}`;
  await openProductionWithCurrent(page, showName);

  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  await page.keyboard.press('Escape');

  const slug = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((x) => x.name === name)?.hostedSlug ?? null;
  }, showName);
  expect(slug, 'publishing must mint a hosted control slug').toBeTruthy();

  // A SEPARATE PAGE is the point: this is the capability URL an operator opens on their phone,
  // signed out, with no memory of the production - exactly the boot the rebuild runs on.
  const op = await context.newPage();
  await op.goto(`/app?control=${encodeURIComponent(slug as string)}`);
  await expect(op.getByTestId('hosted-control-page')).toBeVisible({ timeout: 60_000 });

  // Nothing has ever aired on this production, so the rebuild has nothing to replay and the
  // monitor says so. Establishing this is what makes the assertions after the take mean
  // something: whatever appears below was put there by the TAKE, not by the boot.
  const chip = op.getByTestId('hosted-live-chip');
  const program = op.getByTestId('hosted-program-stage');
  const programEmpty = program.locator('.prod-monitor-empty');
  await expect(chip).toContainText('nothing on air');
  await expect(programEmpty).toBeVisible();
  // Nothing has aired, so the boot replay had nothing to play. Every count below is measured
  // against this zero rather than against an assumption about it.
  await expect(program).toHaveAttribute('data-plays', '0');

  // THE FIRST TAKE OF THE SESSION - the press that used to detonate the rebuild.
  await op.getByTestId('hosted-cues').locator('.pd-cue').first().getByTestId('hosted-select-cue').click();
  await op.getByTestId('hosted-take-cue').click();
  await expect(chip).toContainText('on air:', { timeout: 30_000 });
  await expect(programEmpty).toHaveCount(0);

  // WAIT FOR THE TAKE TO COME BACK ROUND THE LOG. This is the whole timing of the defect: the
  // press is local and optimistic, the regression fires when the row returns over the follower.
  // The action log renders exactly those returned rows, so a row appearing IS the round-trip -
  // a fixed sleep would either race it or outlast the evidence.
  //
  // ATTACHED, not visible: the log is a collapsed <details>, so its rows render hidden until an
  // operator opens it. Asserting visibility here waited out the full timeout on a row that had
  // been in the DOM for thirty seconds.
  //
  // The TAKE row is the one to wait for, by class rather than by position: it is the `cue` row,
  // the last of the batch and the only one that moves `liveCue` - which is precisely the trigger
  // the round-1 bug hung the replay on. Waiting for any row would sometimes pass on the `update`
  // that precedes it and assert the count before the trigger had even arrived.
  await expect(op.locator('.prod-log-take')).toBeAttached({ timeout: 30_000 });

  // THE CLAIM. One take, one entrance - the returning `cue` row moved `liveCue`, and the boot
  // replay must not have answered it. Under the round-1 bug this reads '2'.
  await expect(program).toHaveAttribute('data-plays', '1');

  // The graphic is still up and the monitor still has it - the cockpit's ending, where the
  // re-fired replay snapped to a stale "off" and took the layer off air.
  await expect(chip).toContainText('on air:');
  await expect(programEmpty).toHaveCount(0);

  // And it HOLDS once the WHOLE batch has landed. A take is three logged rows - the field
  // update, the entrance, and the cue marker - and each one re-renders the page, so a replay
  // latched wrongly has three chances rather than one. Waiting for all three makes the reading
  // above a property of the page rather than of the instant it was taken.
  await expect(op.getByTestId('hosted-action-log-row')).toHaveCount(3, { timeout: 30_000 });
  await expect(program).toHaveAttribute('data-plays', '1');
  await expect(chip).toContainText('on air:');
  await expect(programEmpty).toHaveCount(0);

  await op.close();
  await clearPublishedShows(page);
});
