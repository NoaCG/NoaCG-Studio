import { test, expect, type Page } from '@playwright/test';
import { createProject } from '../_create';
import { haveCreds, signIn, wipeMyGraphics } from './_helpers';

// ONE PRESS, ONE ENTRANCE - on every surface, with the verb travelling TWO roads.
//
// A published verb goes out twice from a single press (docs/backlog/playout-lag-when-working-the-queue.md
// "The fix: send the picture over broadcast, keep the log as the truth"): a Realtime BROADCAST
// that every following surface applies on arrival, and the `control_send_many` insert that stays
// the durable, ordered truth. Both roads carry the same command. Every consumer therefore has to
// apply it EXACTLY ONCE, whichever road brought it first, and the client-minted `oid` inside
// `msg` is what makes that decidable.
//
// WHY THIS FILE EXISTS AT ALL. A doubled entrance is invisible. Replaying `play` on a graphic
// that is already up re-runs an animation and settles on exactly the picture that was already
// there, so a surface with the bug is pixel-identical to a surface without it - the same reason
// `e2e/configured/hosted-control-recovery.spec.ts` had to stop asserting on the picture and start
// asserting on a COUNT. `PayloadStage` publishes `data-plays` for the app's monitors and
// `src/output/main.ts` publishes the same attribute on the renderer's own body, and this file is
// arithmetic over those three numbers.
//
// IT CANNOT BE PINNED OFFLINE. Offline there is no `control_shows` row, no broadcast channel, no
// durable log and therefore no second road: `runVerb` applies locally and stops. The whole subject
// is ABSENT rather than untested, which is why this sits in the configured suite beside the other
// walks that need a real backend.
//
// THE THREE SEATS, and they fail differently:
//
//   the SENDER's own monitor  applies its own items the instant it sends them, and must then
//                             recognise both the broadcast echo and its own durable row.
//                             Breaking it double-plays every verb the operator presses.
//   ANOTHER operator's page   receives the broadcast and the durable row and nothing else.
//                             This is the pure two-roads seat.
//   the OUTPUT renderer       the same two roads, on AIR. It is the half an optimistic local
//                             apply could never have reached, because the renderer never sent
//                             anything to be optimistic about.
//
// AND THE TWO CASES THAT MUST STAY DIFFERENT. One press that arrives twice is a bug; two presses
// that arrive twice are two entrances the operator asked for. Re-take is exactly that second
// case, so the walk presses it and requires the number to MOVE - a reconciler that deduped on the
// command's content rather than on its own minted id would pass every assertion above and fail
// this one.

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

/** Publish nothing behind us: this account is shared by the live suite, and a leftover published
 *  production would still hold its reserved addresses on the next run (migration 0040). */
async function clearPublishedShows(page: Page): Promise<void> {
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

/**
 * The renderer's own count of the DURABLE rows it has applied, off the `&debug=1` overlay.
 *
 * The overlay is the only thing the output page ever says out loud, and `last row` is written
 * from the durable row's own id - a broadcast has no id and never touches it. So waiting for this
 * number to move is waiting for the SLOW road specifically, which is the whole point: the count
 * being right before the durable row lands proves nothing at all.
 */
async function lastRow(air: Page): Promise<number> {
  const text = await air.locator('pre').textContent();
  const m = /last row: (\d+)/.exec(text ?? '');
  return m ? Number(m[1]) : 0;
}

/** Wait until the output renderer has applied `rows` more durable rows than it had. */
async function awaitDurable(air: Page, was: number, rows: number): Promise<void> {
  await expect.poll(() => lastRow(air), { timeout: 60_000 }).toBeGreaterThanOrEqual(was + rows);
}

test('one press is one entrance on the sender, on another operator, and on air', async ({ page, context }) => {
  test.setTimeout(360_000);
  await signIn(page);
  await page.keyboard.press('Escape'); // the wizard signIn leaves open — not this walk
  await clearPublishedShows(page);

  // A scorebug, for the same reason output-realtime-floor.spec.ts uses one: it has a plain
  // entrance with nothing conditional in it, so the only thing that can move `data-plays` is a
  // `play` command actually reaching a stage.
  await createProject(page, { name: 'House Scorebug' });

  const showName = `Both Roads ${Date.now()}`;
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByPlaceholder('New production name').fill(showName);
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();

  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  // Publishing opens the links popover; its own toggle closes it (never Escape — quiz-output.spec.ts
  // says why, and the Escape route was a flake of its own).
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

  // ── The other two seats. ───────────────────────────────────────────────────────────────────
  //
  // AIR first, and its follow proved up before anything is pressed: `realtime:` appears only
  // after the resolve, the stage and the boot catch-up, so nothing asserted below can have been
  // recovered by the cold-boot path instead of delivered by a road.
  const air = await context.newPage();
  air.on('pageerror', (e) => console.log('[output pageerror]', e.message));
  await air.goto(`/output?production=${encodeURIComponent(slugs.output as string)}&debug=1`);
  await expect(air.locator('pre')).toContainText('realtime:', { timeout: 60_000 });

  // …and the capability URL an operator opens on their phone, signed out, with no memory of the
  // production. It sends nothing yet: for the first half of this walk it is the pure two-roads
  // seat, receiving a verb it did not press.
  const op = await context.newPage();
  await op.goto(`/app?control=${encodeURIComponent(slugs.hosted as string)}`);
  await expect(op.getByTestId('hosted-control-page')).toBeVisible({ timeout: 60_000 });

  const deskProgram = page.getByTestId('program-stage');
  const opProgram = op.getByTestId('hosted-program-stage');
  const airPlays = () => air.evaluate(() => document.body.getAttribute('data-plays'));

  // NOTHING HAS EVER AIRED on this production, so every count below is measured against a zero
  // that was read rather than assumed.
  await expect(deskProgram).toHaveAttribute('data-plays', '0');
  await expect(opProgram).toHaveAttribute('data-plays', '0');
  await expect.poll(airPlays, { timeout: 30_000 }).toBe('0');

  // ── ONE press. ─────────────────────────────────────────────────────────────────────────────
  let rowsAt = await lastRow(air);
  await page.getByTestId('verb-take').click();

  // WAIT FOR THE SLOW ROAD before reading any number. The fast road is the one that gets there
  // first; the double-apply happens when the durable row lands on top of it, so a count taken
  // before that row exists is a count taken before the defect could have happened. A take is
  // three rows (`takeCueItems`: update, play, cue).
  await awaitDurable(air, rowsAt, 3);
  await expect(op.getByTestId('hosted-action-log-row')).toHaveCount(3, { timeout: 60_000 });

  // THE CLAIM, in three seats. Under a reconciler that misses, the operator page and the
  // renderer read '2' and the sender's own monitor reads '2' as well.
  await expect(deskProgram).toHaveAttribute('data-plays', '1');
  await expect(opProgram).toHaveAttribute('data-plays', '1');
  await expect.poll(airPlays, { timeout: 30_000 }).toBe('1');
  await expect(op.getByTestId('hosted-live-chip')).toContainText('on air:');

  // ── TWO presses are two entrances. Re-take is the operator deliberately replaying the
  //    entrance of a cue that is already up: same cue, same values, same three commands, and the
  //    number MUST move. A reconciler keyed on what the command says rather than on the id this
  //    press minted would swallow it and leave every assertion above intact. ────────────────────
  rowsAt = await lastRow(air);
  await page.getByTestId('verb-retake').click();
  await awaitDurable(air, rowsAt, 3);
  await expect(op.getByTestId('hosted-action-log-row')).toHaveCount(6, { timeout: 60_000 });
  await expect(deskProgram).toHaveAttribute('data-plays', '2');
  await expect(opProgram).toHaveAttribute('data-plays', '2');
  await expect.poll(airPlays, { timeout: 30_000 }).toBe('2');

  // ── OUT, from the same desk. It plays nothing, so the counts must HOLD - a `stop` that
  //    doubled would be invisible here, but a reconciler that let the whole batch through twice
  //    shows up on the cue marker below going out of step with air. ─────────────────────────────
  rowsAt = await lastRow(air);
  await page.getByTestId('verb-out').click();
  await awaitDurable(air, rowsAt, 2); // `clearCueItems`: stop, cue
  await expect(op.getByTestId('hosted-live-chip')).toContainText('nothing on air', { timeout: 30_000 });
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  await expect(deskProgram).toHaveAttribute('data-plays', '2');
  await expect(opProgram).toHaveAttribute('data-plays', '2');
  await expect.poll(airPlays, { timeout: 30_000 }).toBe('2');

  // ── AND THE OTHER DIRECTION. The phone takes; the desk is now the seat that receives a verb it
  //    did not press, and the renderer is on the two roads either way. Both senders reconcile, or
  //    only the one that happened to be walked first does. ───────────────────────────────────────
  rowsAt = await lastRow(air);
  await op.getByTestId('hosted-cues').locator('.pd-cue').first().getByTestId('hosted-select-cue').click();
  await op.getByTestId('hosted-take-cue').click();
  await awaitDurable(air, rowsAt, 3);
  await expect(op.getByTestId('hosted-action-log-row')).toHaveCount(11, { timeout: 60_000 });
  await expect(deskProgram).toHaveAttribute('data-plays', '3');
  await expect(opProgram).toHaveAttribute('data-plays', '3');
  await expect.poll(airPlays, { timeout: 30_000 }).toBe('3');

  // The picture is still up on every seat - the ending the recovery spec next door guards, where
  // a mis-reconciled replay snapped to a stale "off" and took the layer off air.
  await expect(op.locator('.prod-monitor-empty')).toHaveCount(0);
  await expect(page.getByTestId('live-cue-chip')).toContainText('on air');

  await op.close();
  await air.close();
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
