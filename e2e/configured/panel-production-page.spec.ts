// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). Only a real backend relays a press to a page.
//
// HARDWARE PANELS ON THE PRODUCTION PAGE (docs/work-specs/hardware-panel-control/spec.md AC-1,
// AC-3, AC-4, AC-6, AC-7; protocol.md §6): the production page pairs a panel, answers it, runs its
// presses through its own onVerb, refuses a repeated or stale press, publishes what the keys draw
// from, and hands the answer over to the hosted control page when that one is switched on last.
// The same walk as panel-page.spec.ts, on the other operator page. The "module" is an anonymous
// Supabase client holding only the panel key, as the Companion module is (./_panel.ts).
// covers: src/components/home/ProductionPage.tsx, src/components/control/PanelControl.tsx
// covers: src/control/panelRelay.ts, src/control/panelFeedback.ts

import { test, expect } from '@playwright/test';
import { haveCreds, SUPABASE_URL } from './_helpers';
import { ANON_KEY, openHosted, panelModule, publishTwoCues, type Json } from './_panel';

test.skip(!haveCreds || !SUPABASE_URL || !ANON_KEY, 'E2E_EMAIL / E2E_PASSWORD and the Supabase pair unset - configured-mode spec');

test('the production page pairs a panel, answers it, runs its presses and refuses repeated and stale ones', async ({ page, context }) => {
  test.setTimeout(300_000);
  const slug = await publishTwoCues(page, `Panel Production ${Date.now()}`);
  const op = page;
  // A publish opens the Playout panel by itself; shut it, so the header's doors are in reach.
  const status = op.getByTestId('production-status-panel');
  if (await status.isVisible()) await op.getByTestId('production-status').click();
  await expect(status).toBeHidden();

  // Nothing panel-related runs until the switch is on: the door says Off.
  await expect(op.getByTestId('panel-open')).toHaveAttribute('data-state', 'off');
  await op.getByTestId('panel-open').click();
  await expect(op.getByTestId('panel-dialog')).toBeVisible();
  await expect(op.getByTestId('panel-status')).toContainText('No page answers the panel');

  // PAIRING: a code, typed into the "module", and the panel appears in the list.
  await op.getByTestId('panel-pair').click();
  const codeText = (await op.getByTestId('panel-code').locator('.panel-code').textContent()) ?? '';
  expect(codeText).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const deck = await panelModule(codeText);
  await expect(op.getByTestId('panel-row')).toHaveCount(1, { timeout: 10_000 });
  await expect(op.getByTestId('panel-row')).toContainText('Spec deck');
  await expect(op.getByTestId('panel-code')).toBeHidden();
  expect((await deck.hello()).answering).toBe(false);

  // ANSWERING: the switch claims, and the page publishes what the keys draw from.
  await op.getByTestId('panel-answer').locator('input').check();
  await expect(op.getByTestId('panel-status')).toHaveText('This page answers the panel.');
  await expect(op.getByTestId('panel-open')).toHaveAttribute('data-state', 'ok');
  await op.getByTestId('panel-dialog').screenshot({ path: 'test-results/panel-production-dialog-answering.png' });
  await op.getByTestId('panel-close').click();
  await deck.hello();
  const first = await deck.state((s) => Array.isArray(s.live));
  // No Bridge is set up on a runner, so `bridge` is off and no clip clock runs.
  expect(first).toMatchObject({ v: 1, where: 'production', label: 'Production page', live: [], bridge: 'off', clip: null });
  expect((first.allowed as Json)['all-out']).toBe(false);
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
  await expect(op.getByTestId('live-cue-chip')).toContainText('Ben');
  expect((await deck.press('take-cue', ben, benUp.ver as number)).outcome).toBe('ran');
  await deck.state((s) => !(s.live as string[]).includes(ben), 'Ben off air');

  // ALL OUT is refused with nothing on air, as the header's button is greyed; with Anna up it
  // takes everything off. (Anna and Ben share a graphic, so Ben's Take had replaced her.)
  const nothingUp = await deck.state((s) => (s.live as string[]).length === 0, 'nothing on air');
  expect((nothingUp.allowed as Json)['all-out']).toBe(false);
  expect((await deck.press('all-out', '', nothingUp.ver as number)).outcome).toBe('not-allowed');
  expect((await deck.press('take-cue', anna, nothingUp.ver as number)).outcome).toBe('ran');
  const beforeAllOut = await deck.state((s) => (s.live as string[]).includes(anna), 'Anna back on air');
  expect((await deck.press('all-out', '', beforeAllOut.ver as number)).outcome).toBe('ran');
  await deck.state((s) => (s.live as string[]).length === 0, 'nothing on air after All out');
  await expect(op.getByTestId('live-cue-chip')).toContainText('nothing on air');

  // THE LAST PAGE TO ANSWER WINS: the hosted control page takes the answer; the production page
  // switches itself off and says who answers now.
  const hosted = await context.newPage();
  await openHosted(hosted, slug);
  await hosted.getByTestId('panel-open').click();
  await hosted.getByTestId('panel-answer').locator('input').check();
  await expect(hosted.getByTestId('panel-status')).toHaveText('This page answers the panel.');
  await expect(op.getByTestId('panel-open')).toHaveAttribute('data-state', 'off', { timeout: 2_000 });
  await op.getByTestId('panel-open').click();
  await expect(op.getByTestId('panel-answer').locator('input')).not.toBeChecked();
  await expect(op.getByTestId('panel-status')).toHaveText('Hosted control page answers the panel now.');
  const second = await deck.state((s) => s.where === 'control', 'the hosted page answering');
  expect((await deck.press('select-next', '', second.ver as number)).outcome).toBe('ran');
  await deck.state((s) => s.where === 'control' && s.selected === ben, 'Ben selected on the hosted page');

  // CLOSING the answering page lets go: hello then says no page answers.
  await hosted.close();
  await expect.poll(async () => (await deck.hello()).answering, { timeout: 10_000 }).toBe(false);
  await deck.close();
});
