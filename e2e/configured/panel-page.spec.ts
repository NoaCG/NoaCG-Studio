// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). Only a real backend relays a press to a page.
//
// HARDWARE PANELS, THE PAGE HALF (docs/work-specs/hardware-panel-control/spec.md AC-1, AC-3, AC-4,
// AC-6, AC-7; protocol.md §6): a hosted control page pairs a panel, answers it, runs its presses
// through the page's own dispatcher, refuses a repeated or stale press, publishes what the keys
// draw from, and hands the answer over to the last page switched on. The "module" here is an
// anonymous Supabase client holding only the panel key, as the Companion module is.
// covers: src/control/panelRelay.ts, src/control/panelFeedback.ts, src/components/control/PanelControl.tsx
// covers: src/components/HostedControlPage.tsx

import { test, expect, type Page } from '@playwright/test';
import { haveCreds, SUPABASE_URL } from './_helpers';
import { ANON_KEY, panelModule, publishTwoCues, type Json } from './_panel';

test.skip(!haveCreds || !SUPABASE_URL || !ANON_KEY, 'E2E_EMAIL / E2E_PASSWORD and the Supabase pair unset - configured-mode spec');

async function openHosted(page: Page, slug: string) {
  await page.goto(`/app?control=${encodeURIComponent(slug)}`);
  await expect(page.getByTestId('hosted-control-page')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.pd-cue')).toHaveCount(2);
}

test('a hosted page pairs a panel, answers it, runs its presses and refuses repeated and stale ones', async ({ page, context }) => {
  test.setTimeout(300_000);
  const slug = await publishTwoCues(page, `Panel Page ${Date.now()}`);

  const op = await context.newPage();
  await openHosted(op, slug);
  // Nothing panel-related runs until the switch is on: the door says Off.
  await expect(op.getByTestId('panel-open')).toHaveAttribute('data-state', 'off');
  await op.getByTestId('panel-open').click();
  const dialog = op.getByTestId('panel-dialog');
  await expect(dialog).toBeVisible();
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
  await op.getByTestId('panel-dialog').screenshot({ path: 'test-results/panel-dialog-answering.png' });
  await deck.hello();
  const first = await deck.state((s) => Array.isArray(s.live));
  expect(first).toMatchObject({ v: 1, where: 'control', label: 'Hosted control page', space: 'take', live: [], bridge: 'off', clip: null });
  expect((first.allowed as Json).take).toBe(true);
  expect((first.allowed as Json).out).toBe(false);
  const rows = (await (async () => {
    for (let i = 0; i < 200; i++) {
      const r = [...deck.heard].reverse().find((m) => m.event === 'rows');
      if (r) return r.payload.rows as { id: string; label: string }[];
      await new Promise((res) => setTimeout(res, 25));
    }
    throw new Error('no rows');
  })());
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

  // TAKE A CUE airs that cue whatever is selected, and again takes it off.
  const cur = await deck.state();
  expect((await deck.press('take-cue', ben, cur.ver as number)).outcome).toBe('ran');
  const benUp = await deck.state((s) => (s.live as string[]).includes(ben), 'Ben on air');
  expect(benUp.selected).toBe(ben);
  expect((await deck.press('take-cue', ben, benUp.ver as number)).outcome).toBe('ran');
  await deck.state((s) => !(s.live as string[]).includes(ben), 'Ben off air');

  // ALL OUT is refused with nothing on air, as the header's button is greyed; with Anna up it
  // takes everything off. (Anna and Ben share a graphic, so Ben's Take had replaced her.)
  const nothingUp = await deck.state();
  expect((nothingUp.allowed as Json)['all-out']).toBe(false);
  expect((await deck.press('all-out', '', nothingUp.ver as number)).outcome).toBe('not-allowed');
  expect((await deck.press('take-cue', anna, nothingUp.ver as number)).outcome).toBe('ran');
  const beforeAllOut = await deck.state((s) => (s.live as string[]).includes(anna), 'Anna back on air');
  expect((await deck.press('all-out', '', beforeAllOut.ver as number)).outcome).toBe('ran');
  await deck.state((s) => (s.live as string[]).length === 0, 'nothing on air');
  await expect(op.getByTestId('hosted-live-chip')).toContainText('nothing on air');

  // THE LAST PAGE TO ANSWER WINS: a second page takes the answer; the first switches itself off.
  const op2 = await context.newPage();
  await openHosted(op2, slug);
  await op2.getByTestId('panel-open').click();
  await op2.getByTestId('panel-answer').locator('input').check();
  await expect(op2.getByTestId('panel-status')).toHaveText('This page answers the panel.');
  await expect(op.getByTestId('panel-answer').locator('input')).not.toBeChecked({ timeout: 2_000 });
  await expect(op.getByTestId('panel-status')).toContainText('answers the panel now');
  const second = await deck.state((s) => s.page !== first.page, 'the second page');
  expect((await deck.press('select-next', '', second.ver as number)).outcome).toBe('ran');
  await deck.state((s) => s.page === second.page && s.selected === ben, 'Ben selected on the second page');

  // CLOSING the answering page lets go: hello then says no page answers.
  await op2.close();
  await expect.poll(async () => (await deck.hello()).answering, { timeout: 10_000 }).toBe(false);
  await deck.close();
});
