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

import { test, expect, type Page } from '@playwright/test';
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

/** The command rows the log holds for this production after `after`, as the hosted page reads them:
 *  `staged` and `live` are traffic about a press, not the press (hosted-control-profile.spec.ts). */
async function commands(op: Page, slug: string, after = 0): Promise<{ id: number; graphic: string; kind: string }[]> {
  return op.evaluate(
    async ({ slug, after }) => {
      const { hostedControlTail } = await import('/src/control/hostedControl.ts');
      return (await hostedControlTail(slug, after))
        .map((row) => ({ id: row.id, graphic: row.graphic, kind: (row.msg as { t: string }).t }))
        .filter((row) => row.kind !== 'staged' && row.kind !== 'live');
    },
    { slug, after },
  );
}

test('every transport and selection verb runs once through the relay, reaching the command log and PROGRAM', async ({ page, context }) => {
  // H0 AC-2 (docs/work-specs/playout-companion-qualification/spec.md): each declared verb pressed
  // through the real relay, asserted on its target, the command log and the rendered result. A
  // Take is one dispatch; the same press id again is none. Walking and selecting write nothing.
  test.setTimeout(300_000);
  // Clean Steps has steps, so Next has somewhere to go.
  const slug = await publishTwoCues(page, `Panel Verbs ${Date.now()}`, 'Clean Steps');
  await page.goto('/app#/home');
  const op = await context.newPage();
  await openHosted(op, slug);
  const deck = await pairPanel(op);
  await answerPanel(op);
  await op.getByTestId('panel-close').click();
  await deck.hello();
  const first = await deck.state((s) => Array.isArray(s.live));
  const [anna, ben] = (await deck.rows()).map((r) => r.id);
  expect(first.selected).toBe(anna);
  const program = op.getByTestId('hosted-program-stage');
  await expect(program).toHaveAttribute('data-plays', '0');

  /** Wait until the log carries `kinds` after `from`, in that order, then make sure nothing more
   *  follows; hand back the newest id. `update` and `cue` rows ride with a take and are not counted. */
  const counted = new Set(['play', 'stop', 'next']);
  const settle = async (from: number, kinds: string[], what: string) => {
    const pick = async () => (await commands(op, slug, from)).filter((r) => counted.has(r.kind) || kinds.includes(r.kind));
    await expect.poll(async () => (await pick()).map((r) => r.kind), { timeout: 20_000, message: what }).toEqual(kinds);
    await op.waitForTimeout(1_500);
    const rows = await pick();
    expect(rows.map((r) => r.kind), `${what}: nothing more`).toEqual(kinds);
    const all = await commands(op, slug, from);
    return all.length ? all[all.length - 1].id : from;
  };
  let head = (await commands(op, slug)).at(-1)?.id ?? 0;

  // SELECT-NEXT and SELECT-PREV walk the selection and write nothing to the log.
  expect((await deck.press('select-next', '', first.ver as number)).outcome).toBe('ran');
  const onBen = await deck.state((s) => s.selected === ben, 'Ben selected');
  expect((await deck.press('select-prev', '', onBen.ver as number)).outcome).toBe('ran');
  const onAnna = await deck.state((s) => s.selected === anna, 'Anna selected again');
  await expect(op.locator('.pd-cue.selected')).toContainText('Anna');
  head = await settle(head, [], 'walking writes no command');

  // TAKE airs the selected cue: one play in the log, one entrance on PROGRAM.
  const take = await deck.press('take', anna, onAnna.ver as number);
  expect(take.outcome).toBe('ran');
  head = await settle(head, ['play'], 'one Take, one play');
  await expect(program).toHaveAttribute('data-plays', '1');
  // The same press id again is answered duplicate and dispatches nothing.
  expect((await deck.press('take', anna, onAnna.ver as number, take.id)).outcome).toBe('duplicate');
  head = await settle(head, [], 'a duplicate press, no command');
  await expect(program).toHaveAttribute('data-plays', '1');
  const up = await deck.state((s) => (s.live as string[]).includes(anna), 'Anna on air');
  expect(up.allowed).toMatchObject({ retake: true, update: true, next: true, out: true });

  // NEXT steps the cue on air.
  expect((await deck.press('next', anna, up.ver as number)).outcome).toBe('ran');
  head = await settle(head, ['next'], 'one Next');
  // UPDATE sends the values again without a new entrance. A step moves nothing a key shows, so no
  // new state follows a press here: the keys below are drawn from `up`, as a deck's would be.
  expect((await deck.press('update', anna, up.ver as number)).outcome).toBe('ran');
  head = await settle(head, ['update'], 'one Update, no play');
  await expect(program).toHaveAttribute('data-plays', '1');
  // RE-TAKE plays it again: one more entrance.
  expect((await deck.press('retake', anna, up.ver as number)).outcome).toBe('ran');
  head = await settle(head, ['play'], 'one Re-take');
  await expect(program).toHaveAttribute('data-plays', '2');
  // OUT takes it off.
  expect((await deck.press('out', anna, up.ver as number)).outcome).toBe('ran');
  head = await settle(head, ['stop'], 'one Out');
  const off = await deck.state((s) => (s.live as string[]).length === 0, 'nothing on air');
  await expect(op.getByTestId('hosted-live-chip')).toContainText('nothing on air');

  // TRIGGER plays Ben by his own row id and leaves the selection on Anna; pressed again it restarts.
  expect((await deck.press('trigger-cue', ben, off.ver as number)).outcome).toBe('ran');
  head = await settle(head, ['play'], 'one Trigger');
  const benUp = await deck.state((s) => (s.live as string[]).includes(ben), 'Ben on air');
  expect(benUp.selected).toBe(anna);
  await expect(op.locator('.pd-cue.selected')).toContainText('Anna');
  await expect(op.getByTestId('hosted-live-chip')).toContainText('Ben');
  expect((await deck.press('trigger-cue', ben, benUp.ver as number)).outcome).toBe('ran');
  head = await settle(head, ['play'], 'a second Trigger restarts');
  await expect(op.locator('.pd-cue.selected')).toContainText('Anna');
  await expect(program).toHaveAttribute('data-plays', '4');
  // The clip verbs are not on this page, and say so; nothing reaches the log.
  const pause = await deck.press('pause-toggle', ben, benUp.ver as number);
  expect(pause).toMatchObject({ outcome: 'not-here' });
  await settle(head, [], 'a refused press, no command');
  await deck.close();
});
