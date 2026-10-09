// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). Only a real backend relays a press to a page.
//
// HARDWARE PANELS, THE PAGE HALF (docs/work-specs/hardware-panel-control/spec.md AC-1, AC-3, AC-4,
// AC-7; protocol.md §6; the lease of docs/work-specs/panel-ownership-lease AC-2, AC-5): a hosted
// control page pairs a panel, takes it with "Use here", runs its presses through the page's own
// dispatcher, refuses a repeated or stale press, publishes what the keys draw from, and hands the
// panel to another page only by that page's "Use here". The "module" here is an anonymous Supabase
// client holding only the panel key, as the Companion module is.
// covers: src/control/panelRelay.ts, src/control/panelFeedback.ts, src/components/control/PanelControl.tsx
// covers: src/components/HostedControlPage.tsx

import { test, expect } from '@playwright/test';
import { haveCreds, SUPABASE_URL } from './_helpers';
import { answerPanel, ANON_KEY, openHosted, pairPanel, publishTwoCues, type Json } from './_panel';

test.skip(!haveCreds || !SUPABASE_URL || !ANON_KEY, 'E2E_EMAIL / E2E_PASSWORD and the Supabase pair unset - configured-mode spec');

test('a hosted page pairs a panel, answers it, runs its presses and refuses repeated and stale ones', async ({ page, context }) => {
  test.setTimeout(300_000);
  const slug = await publishTwoCues(page, `Panel Page ${Date.now()}`);
  // Off the production page, which would take a paired panel by itself: this walk is the hosted
  // page's alone.
  await page.goto('/app#/home');

  const op = await context.newPage();
  await openHosted(op, slug);
  // No panel paired: the door says Off.
  await expect(op.getByTestId('panel-open')).toHaveAttribute('data-state', 'off');
  await op.getByTestId('panel-open').click();
  await expect(op.getByTestId('panel-dialog')).toBeVisible();
  await expect(op.getByTestId('panel-status')).toContainText('No page answers the panel');

  // PAIRING: a code, typed into the "module", and the panel appears in the list.
  const deck = await pairPanel(op);
  expect((await deck.hello()).answering).toBe(false);

  // ANSWERING: the hosted page takes nothing by itself (panel lease P1); Use here takes it, and the
  // page publishes what the keys draw from.
  await op.waitForTimeout(5_000);
  expect((await deck.hello()).answering).toBe(false);
  await answerPanel(op);
  await op.getByTestId('panel-dialog').screenshot({ path: 'test-results/panel-dialog-answering.png' });
  await deck.hello();
  const first = await deck.state((s) => Array.isArray(s.live));
  expect(first).toMatchObject({ v: 1, where: 'control', label: 'Hosted control page', space: 'take', live: [], bridge: 'off', clip: null });
  expect((first.allowed as Json).take).toBe(true);
  expect((first.allowed as Json).out).toBe(false);
  const rows = await deck.rows();
  expect(rows.map((r) => r.label)).toEqual(['Anna', 'Ben']);
  const [anna, ben] = rows.map((r) => r.id);
  expect(first.selected).toBe(anna);

  // A PRESS runs through the page's dispatcher: Take airs Anna, as SPACE would.
  const take = await deck.press('take', anna, first.ver as number);
  expect(take.outcome).toBe('ran');
  await expect(op.getByTestId('hosted-live-chip')).toContainText('Anna');
  const afterTake = await deck.state((s) => (s.live as string[]).includes(anna), 'Anna on air');
  expect(afterTake.space).toBe('take-off');
  expect((afterTake.allowed as Json).out).toBe(true);
  console.log(`a relayed Take: press call to the page's result in ${take.ms} ms`);

  // A REPEATED press id runs nothing: still exactly one Take.
  const again = await deck.press('take', anna, first.ver as number, take.id);
  expect(again.outcome).toBe('duplicate');
  await op.waitForTimeout(800);
  await expect(op.getByTestId('hosted-live-chip')).toContainText('Anna');

  // A STALE press: drawn when TAKE said Take, arriving now that it would take Anna off.
  const stale = await deck.press('take', anna, first.ver as number);
  expect(stale.outcome).toBe('stale');
  await expect(op.getByTestId('hosted-live-chip')).toContainText('Anna');
  await expect(op.getByTestId('panel-last')).toContainText('refused');
  // The refusal is in the page's own activity feed, naming the panel and the reason (AC-4).
  await expect(op.getByTestId('hosted-action-log')).toContainText('Spec deck: Take refused, what Take does changed');
  // And a selection that moved: Out for Ben while Anna is selected.
  expect((await deck.press('out', ben, afterTake.ver as number)).outcome).toBe('stale');

  // TAKE A CUE airs that cue whatever is selected, and again takes it off. The selection stays on
  // Anna, where the operator put it (spec D4).
  const cur = await deck.state();
  expect(cur.selected).toBe(anna);
  expect((await deck.press('take-cue', ben, cur.ver as number)).outcome).toBe('ran');
  const benUp = await deck.state((s) => (s.live as string[]).includes(ben), 'Ben on air');
  expect(benUp.selected).toBe(anna);
  await expect(op.locator('.pd-cue.selected')).toContainText('Anna');
  expect((await deck.press('take-cue', ben, benUp.ver as number)).outcome).toBe('ran');
  await deck.state((s) => !(s.live as string[]).includes(ben), 'Ben off air');

  // ALL OUT is pressable with nothing on air, as the production page's is (playout-workflow-
  // simplification D11): the page clears what the server's heads say is on, not only its own list.
  // With Anna up it takes everything off. (Anna and Ben share a graphic, so Ben's Take had replaced her.)
  const nothingUp = await deck.state();
  expect((nothingUp.allowed as Json)['all-out']).toBe(true);
  await expect(op.getByTestId('hosted-out-all')).toBeEnabled();
  expect((await deck.press('take-cue', anna, nothingUp.ver as number)).outcome).toBe('ran');
  const beforeAllOut = await deck.state((s) => (s.live as string[]).includes(anna), 'Anna back on air');
  expect((await deck.press('all-out', '', beforeAllOut.ver as number)).outcome).toBe('ran');
  await deck.state((s) => (s.live as string[]).length === 0, 'nothing on air');
  await expect(op.getByTestId('hosted-live-chip')).toContainText('nothing on air');

  // NEVER STOLEN, MOVED BY USE HERE: a second page opened later says who answers and takes nothing;
  // its Use here moves the panel, and the first page stops answering and says who has it.
  const op2 = await context.newPage();
  await openHosted(op2, slug);
  await op2.getByTestId('panel-open').click();
  await expect(op2.getByTestId('panel-status')).toHaveText('Hosted control page answers the panel.', { timeout: 15_000 });
  await expect(op2.getByTestId('panel-open')).toHaveAttribute('data-state', 'held');
  await answerPanel(op2);
  await expect(op.getByTestId('panel-status')).toHaveText('Hosted control page answers the panel.', { timeout: 5_000 });
  await expect(op.getByTestId('panel-use-here')).toBeVisible();
  const second = await deck.state((s) => s.page !== first.page, 'the second page');
  expect((await deck.press('select-next', '', second.ver as number)).outcome).toBe('ran');
  await deck.state((s) => s.page === second.page && s.selected === ben, 'Ben selected on the second page');

  // CLOSING the answering page lets go once its lease lapses (15 s): hello then says no page answers,
  // and the hosted page left open does not take it by itself.
  await op2.close();
  await expect.poll(async () => (await deck.hello()).answering, { timeout: 30_000 }).toBe(false);
  await expect(op.getByTestId('panel-status')).toHaveText('No page answers the panel.', { timeout: 10_000 });
  await deck.close();
});
