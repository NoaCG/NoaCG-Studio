// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). Only a real backend relays a press to a page.
//
// HARDWARE PANELS ON THE PRODUCTION PAGE (docs/work-specs/hardware-panel-control/spec.md AC-1,
// AC-3, AC-4, AC-7; protocol.md §6; the lease of docs/work-specs/panel-ownership-lease AC-1, AC-4,
// AC-5): the production page pairs a panel and answers it by itself, runs its presses through its
// own onVerb, refuses a repeated or stale press, publishes what the keys draw from, hands the panel
// to the hosted control page by that page's Use here, and takes it back once that page is gone.
// The same walk as panel-page.spec.ts, on the other operator page. The "module" is an anonymous
// Supabase client holding only the panel key, as the Companion module is (./_panel.ts). The second
// test follows the clip clock a panel counts down while a server clip plays, with NoaCG Bridge and
// CasparCG faked at the network layer (e2e/_fakeBridge.ts) and only the relay real.
// covers: src/components/home/ProductionPage.tsx, src/components/control/PanelControl.tsx
// covers: src/control/panelRelay.ts, src/control/panelFeedback.ts, src/control/serverPlayoutStore.ts

import { test, expect } from '@playwright/test';
import { settleDurableWrites } from '../_durable';
import { evaluateInPage } from '../_evaluate';
import { fakeBridge, seedSettings } from '../_fakeBridge';
import { haveCreds, SUPABASE_URL } from './_helpers';
import { answerPanel, ANON_KEY, openHosted, pairPanel, panelDoor, publishTwoCues, shutStatusPanel, type Json } from './_panel';

test.skip(!haveCreds || !SUPABASE_URL || !ANON_KEY, 'E2E_EMAIL / E2E_PASSWORD and the Supabase pair unset - configured-mode spec');

test('the production page pairs a panel, answers it, runs its presses and refuses repeated and stale ones', async ({ page, context }) => {
  test.setTimeout(300_000);
  const slug = await publishTwoCues(page, `Panel Production ${Date.now()}`);
  const op = page;
  await shutStatusPanel(op);

  // No panel paired: the door in Setup says Off, and the header shows no panel status.
  await expect(op.getByTestId('panel-header-status')).toHaveCount(0);
  const door = await panelDoor(op);
  await expect(door).toHaveAttribute('data-state', 'off');
  await door.click();
  await expect(op.getByTestId('panel-status')).toContainText('No page answers the panel');

  // PAIRING: a code, typed into the "module", and the panel appears in the list.
  const deck = await pairPanel(op);

  // ANSWERING: the production page takes the panel by itself as soon as it is paired (panel lease
  // AC-1), and publishes what the keys draw from.
  await answerPanel(op);
  expect((await deck.hello()).answering).toBe(true);
  await op.getByTestId('panel-dialog').screenshot({ path: 'test-results/panel-production-dialog-answering.png' });
  await op.getByTestId('panel-close').click();
  await deck.hello();
  const first = await deck.state((s) => Array.isArray(s.live));
  // No Bridge is set up on a runner, so `bridge` is off and no clip clock runs.
  expect(first).toMatchObject({ v: 1, where: 'production', label: 'Production page', live: [], bridge: 'off', clip: null });
  // All out is pressable whenever the production is published: the server may hold what this page
  // does not know is on (playout-workflow-simplification D11).
  expect((first.allowed as Json)['all-out']).toBe(true);
  const rows = await deck.rows();
  expect(rows.map((r) => [r.label, r.kind])).toEqual([
    ['Anna', 'cue'],
    ['Ben', 'cue'],
  ]);
  const [anna, ben] = rows.map((r) => r.id);
  // The page selected Ben as it added him; a panel's cue key moves the cursor and airs nothing.
  expect(first.selected).toBe(ben);
  expect((await deck.press('select-cue', anna, first.ver as number)).outcome).toBe('ran');
  const annaSelected = await deck.state((s) => s.selected === anna, 'Anna selected');
  expect(annaSelected).toMatchObject({ space: 'take', live: [] });
  expect((annaSelected.allowed as Json).take).toBe(true);
  expect((annaSelected.allowed as Json).out).toBe(false);
  await expect(op.getByTestId('cue-label')).toHaveValue('Anna');

  // A PRESS runs through the page's dispatcher: Take airs Anna, as SPACE would.
  const take = await deck.press('take', anna, annaSelected.ver as number);
  expect(take.outcome).toBe('ran');
  await expect(op.getByTestId('live-cue-chip')).toContainText('Anna');
  const afterTake = await deck.state((s) => (s.live as string[]).includes(anna), 'Anna on air');
  expect(afterTake.space).toBe('take-off');
  expect((afterTake.allowed as Json).out).toBe(true);
  expect((afterTake.allowed as Json)['all-out']).toBe(true);
  console.log(`a relayed Take on the production page: press call to the page's result in ${take.ms} ms`);

  // A REPEATED press id runs nothing: Anna stays up, not taken off by a second toggle.
  const again = await deck.press('take', anna, annaSelected.ver as number, take.id);
  expect(again.outcome).toBe('duplicate');
  await op.waitForTimeout(800);
  await expect(op.getByTestId('live-cue-chip')).toContainText('Anna');

  // A STALE press: drawn when TAKE said Take, arriving now that it would take Anna off.
  const stale = await deck.press('take', anna, annaSelected.ver as number);
  expect(stale.outcome).toBe('stale');
  await expect(op.getByTestId('live-cue-chip')).toContainText('Anna');
  // The refusal is in the page's own activity feed, naming the panel and the reason (AC-4).
  await expect(op.getByTestId('action-log')).toContainText('Spec deck: Take refused, what Take does changed');
  // And a selection that moved: Out for Ben while Anna is selected.
  expect((await deck.press('out', ben, afterTake.ver as number)).outcome).toBe('stale');

  // TAKE A CUE airs that cue whatever is selected, and again takes it off. The cursor stays on
  // Anna, where the operator put it.
  const cur = await deck.state();
  expect((await deck.press('take-cue', ben, cur.ver as number)).outcome).toBe('ran');
  const benUp = await deck.state((s) => (s.live as string[]).includes(ben), 'Ben on air');
  expect(benUp.selected).toBe(anna);
  await expect(op.locator('.pd-cue.selected')).toContainText('Anna');
  await expect(op.getByTestId('live-cue-chip')).toContainText('Ben');
  expect((await deck.press('take-cue', ben, benUp.ver as number)).outcome).toBe('ran');
  await deck.state((s) => !(s.live as string[]).includes(ben), 'Ben off air');

  // ALL OUT stays pressable with nothing on air here, as the header's button does: the server may
  // hold what this page does not know is up (playout-workflow-simplification D11). With Anna up it
  // takes everything off. (Anna and Ben share a graphic, so Ben's Take had replaced her.)
  const nothingUp = await deck.state((s) => (s.live as string[]).length === 0, 'nothing on air');
  expect((nothingUp.allowed as Json)['all-out']).toBe(true);
  expect((await deck.press('take-cue', anna, nothingUp.ver as number)).outcome).toBe('ran');
  const beforeAllOut = await deck.state((s) => (s.live as string[]).includes(anna), 'Anna back on air');
  expect((await deck.press('all-out', '', beforeAllOut.ver as number)).outcome).toBe('ran');
  await deck.state((s) => (s.live as string[]).length === 0, 'nothing on air after All out');
  await expect(op.getByTestId('live-cue-chip')).toContainText('nothing on air');

  // USE HERE on the hosted control page moves the panel; the production page stops answering and
  // says who has it, with its own Use here beside it (panel lease AC-5, L8).
  const hosted = await context.newPage();
  await openHosted(hosted, slug);
  await hosted.getByTestId('panel-open').click();
  await expect(hosted.getByTestId('panel-status')).toHaveText('Production page answers the panel.', { timeout: 15_000 });
  await answerPanel(hosted);
  await expect(op.getByTestId('panel-header-status')).toHaveText('Panel on Hosted control page', { timeout: 5_000 });
  await expect(op.getByTestId('panel-header-use-here')).toBeVisible();
  await op.setViewportSize({ width: 1366, height: 768 });
  await op.screenshot({ path: test.info().outputPath('production-panel-held.png'), clip: { x: 0, y: 0, width: 1366, height: 120 } });
  const doorAfter = await panelDoor(op);
  await expect(doorAfter).toHaveAttribute('data-state', 'held');
  await doorAfter.click();
  await expect(op.getByTestId('panel-status')).toHaveText('Hosted control page answers the panel.');
  const second = await deck.state((s) => s.where === 'control', 'the hosted page answering');
  expect((await deck.press('select-next', '', second.ver as number)).outcome).toBe('ran');
  await deck.state((s) => s.where === 'control' && s.selected === ben, 'Ben selected on the hosted page');

  // CLOSING the answering page lets go once its lease lapses, and the production page, still open,
  // takes the panel back by itself (panel lease AC-4).
  await hosted.close();
  await expect(op.getByTestId('panel-header-status')).toHaveText('Panel ✓', { timeout: 30_000 });
  await deck.hello();
  await deck.state((s) => s.where === 'production', 'the production page answering again');
  await deck.close();
});

test('the clip clock a panel counts follows the server clip the production page plays', async ({ page }) => {
  // AC-7, protocol §7.4 and §8: with a server clip on air the state names it and its end in the
  // page's clock; the server moving the clip moves that end; a pause from the panel freezes it; an
  // ended clip holds; the cue key again takes it off and the clip leaves the state.
  test.setTimeout(300_000);
  const name = `Panel Clip ${Date.now()}`;
  await publishTwoCues(page, name);
  const op = page;
  const studio = await fakeBridge(op, { version: '0.7.0', features: ['state', 'playback', 'sequence', 'servers'], lengths: { OPENER: 15 } });
  await seedSettings(op);
  // evaluateInPage: the function ends in a store mutation, the window e2e/_evaluate.ts closes.
  await evaluateInPage(
    op,
    async (show) => {
      const { loadShows, addPlayoutItem, setShowOutputSetup } = await import('/src/model/shows.ts');
      const { withCasparSwitch } = await import('/src/model/outputSetup.ts');
      const current = loadShows().find((s) => s.name === show)!;
      // Published with CasparCG off (the account has no default), so it is switched on first, as
      // the operator does before CasparCG files… offers a clip (playout-workflow-simplification AC-4).
      setShowOutputSetup(current.id, withCasparSwitch(current.outputSetup, true));
      addPlayoutItem(current.id, { adapter: 'casparcg', kind: 'media', name: 'OPENER', frames: 375, fps: 25, channel: 2 });
    },
    name,
  );
  await settleDurableWrites(op);
  // A reload, not a goto: the page is already on this URL, so a goto would only move the hash.
  await op.reload();
  await expect(op.getByTestId('production-page')).toBeVisible();
  await expect(op.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(3);
  await shutStatusPanel(op);

  const deck = await pairPanel(op);
  await answerPanel(op);
  await op.getByTestId('panel-close').click();
  await deck.hello();
  const ready = await deck.state((s) => s.bridge === 'ok', 'the Bridge answering');
  expect(ready.clip).toBeNull();
  expect((ready.allowed as Json)['pause-toggle']).toBe(false);
  const opener = (await deck.rows()).find((r) => r.label === 'OPENER');
  expect(opener, 'the server clip is one of the rows').toBeTruthy();
  const cue = opener!.id;
  type Clip = { cue: string; label: string; phase: string; end: number | null; remaining: number | null; estimated: boolean };
  const clip = (s: Json) => s.clip as Clip | null;
  /** Seconds left as the module counts them from one state: `end` against the state's own `at`. */
  const left = (s: Json) => (clip(s)!.end! - (s.at as number)) / 1000;
  const lastVerb = () => studio.actions.at(-1)?.verb;

  // A TAKE from the panel airs the clip on the server, and the state names the clip the clock
  // follows, with its 15 s end in the page's clock.
  expect((await deck.press('take-cue', cue, ready.ver as number)).outcome).toBe('ran');
  await expect.poll(lastVerb).toBe('take');
  const counting = await deck.state((s) => clip(s)?.phase === 'counting' && clip(s)?.end != null, 'the clip counting');
  expect(clip(counting)).toMatchObject({ cue, label: 'OPENER', estimated: false });
  expect(counting.live).toContain(cue);
  expect((counting.allowed as Json)['pause-toggle']).toBe(true);
  expect(left(counting)).toBeGreaterThan(11);
  expect(left(counting)).toBeLessThanOrEqual(15.5);

  // THE SERVER MOVES ON (the fake's clock jumps 9 s): the end the panel counts to moves with it,
  // into the warning, without a press.
  studio.skew += 9_000;
  const moved = await deck.state((s) => clip(s)?.phase === 'counting' && clip(s)?.end != null && left(s) < 7, 'the end moved with the server');
  expect(left(moved)).toBeGreaterThan(2);
  const shift = (clip(counting)!.end! - clip(moved)!.end!) / 1000;
  expect(shift).toBeGreaterThan(6);
  console.log(`the server 9 s on: the end the panel counts to moved ${shift.toFixed(2)} s`);

  // PAUSE from the panel pauses that clip on the server, and the state freezes its time.
  expect((await deck.press('pause-toggle', cue, moved.ver as number)).outcome).toBe('ran');
  await expect.poll(lastVerb).toBe('pause');
  const paused = await deck.state((s) => clip(s)?.phase === 'paused', 'the clip paused');
  expect(clip(paused)!.end).toBeNull();
  expect(clip(paused)!.remaining).toBeGreaterThan(1);
  expect(clip(paused)!.remaining).toBeLessThan(7);
  await expect(op.getByTestId('clip-clock')).toHaveAttribute('data-phase', 'paused');
  // And again resumes it.
  expect((await deck.press('pause-toggle', cue, paused.ver as number)).outcome).toBe('ran');
  await expect.poll(lastVerb).toBe('resume');
  const resumed = await deck.state((s) => clip(s)?.phase === 'counting', 'the clip counting again');
  // Pause and Resume, the keys P would be, act on the selected cue's clip: select it, then press.
  expect((await deck.press('select-cue', cue, resumed.ver as number)).outcome).toBe('ran');
  const chosen = await deck.state((s) => s.selected === cue, 'the clip selected');
  expect((chosen.allowed as Json).pause).toBe(true);
  expect((await deck.press('pause', cue, chosen.ver as number)).outcome).toBe('ran');
  await expect.poll(lastVerb).toBe('pause');
  const held = await deck.state((s) => clip(s)?.phase === 'paused', 'the clip paused by Pause');
  expect((held.allowed as Json).resume).toBe(true);
  expect((await deck.press('resume', cue, held.ver as number)).outcome).toBe('ran');
  await expect.poll(lastVerb).toBe('resume');
  await deck.state((s) => clip(s)?.phase === 'counting', 'the clip counting after Resume');

  // THE CLIP ENDS on the server and holds its last frame: the state says so, its end passed.
  studio.skew += 20_000;
  const holding = await deck.state((s) => clip(s)?.phase === 'holding', 'the clip holding');
  expect(left(holding)).toBeLessThanOrEqual(0);
  expect(holding.live).toContain(cue);

  // The cue key again takes it off: no clip, and nothing for the panel to pause.
  expect((await deck.press('take-cue', cue, holding.ver as number)).outcome).toBe('ran');
  await expect.poll(lastVerb).toBe('out');
  const off = await deck.state((s) => clip(s) === null, 'no clip');
  expect(off.live).not.toContain(cue);
  expect((off.allowed as Json)['pause-toggle']).toBe(false);
  // AC-7's figure: a page state reaching the module, measured on whatever backend this run has.
  const lags = deck.stateLags().sort((a, b) => a - b);
  console.log(`page state to the module over ${lags.length} states: p50 ${lags[Math.floor(lags.length / 2)]} ms, worst ${lags.at(-1)} ms`);

  // REVOKING from the page's own list (AC-2): the panel leaves the list, and its key is refused.
  await (await panelDoor(op)).click();
  await op.getByTestId('panel-revoke').click();
  await expect(op.getByTestId('panel-row')).toHaveCount(0, { timeout: 10_000 });
  expect((await deck.hello()).refused).toBe('revoked');
  expect((await deck.press('select-next', '', off.ver as number)).outcome).toBe('refused revoked');
  await deck.close();
});
