// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). Only a real backend relays a press to a page.
//
// GRAPHIC ACTIONS THROUGH A HARDWARE PANEL (docs/work-specs/playout-companion-actions/spec.md E6.1,
// AC-1 to AC-3; pinned live controls AC-8; protocol.md §10): the production page offers each pool
// graphic's live controls to a paired panel exactly as its live block draws them, and runs a press
// through the block's own verbs on the cue live on that graphic's layer, never the selection. A
// duplicate, a replaced instance, an unknown capability, bad arguments and an off-air graphic are
// refused without a second effect; the relay (0103) refuses what is out of its bounds; a database
// without 0103 is said so on the page and refused by the relay. The "module" is an anonymous
// Supabase client holding only the panel key (./_panel.ts).
// covers: src/components/home/ProductionPage.tsx, src/components/control/PanelControl.tsx
// covers: src/control/panelRelay.ts, src/control/panelActions.ts, src/control/panelFeedback.ts
// covers: src/control/graphicVerbs.ts, src/control/liveControls.ts
// covers: supabase/migrations/0103_panel_graphic_actions.sql

import { test, expect, type Page } from '@playwright/test';
import { haveCreds, SUPABASE_URL } from './_helpers';
import { answerPanel, ANON_KEY, pairPanel, publishTwoCues, shutStatusPanel, type Json } from './_panel';

test.skip(!haveCreds || !SUPABASE_URL || !ANON_KEY, 'E2E_EMAIL / E2E_PASSWORD and the Supabase pair unset - configured-mode spec');

const GRAPHIC = 'House Score';

type Cap = { id: string; label: string; kind: string; allowed: boolean; args: Json | null; note?: string };
type Offered = { graphic: string; live: string | null; caps: Cap[] };
const graphicOf = (a: Json) => (a.graphics as Offered[]).find((g) => g.graphic === GRAPHIC);

/** A published production of two House Score cues, paired and answered, Anna on air and Ben
 *  selected: what the deck sees, and PROGRAM's frame. */
async function scoreWithDeck(page: Page, name: string) {
  const slug = await publishTwoCues(page, `${name} ${Date.now()}`, GRAPHIC);
  await shutStatusPanel(page);
  const deck = await pairPanel(page);
  await answerPanel(page);
  await page.getByTestId('panel-close').click();
  await deck.hello();
  const rows = await deck.rows();
  const [anna, ben] = rows.map((r) => r.id);
  const first = await deck.state((s) => Array.isArray(s.live));
  expect((await deck.press('select-cue', anna, first.ver as number)).outcome).toBe('ran');
  const selected = await deck.state((s) => s.selected === anna, 'Anna selected');
  expect((await deck.press('take', anna, selected.ver as number)).outcome).toBe('ran');
  await expect(page.getByTestId('live-cue-chip')).toContainText('Anna');
  const onAir = await deck.state((s) => (s.live as string[]).includes(anna), 'Anna on air');
  // The selection moves to Ben: a graphic action still acts on Anna, the cue live on the layer.
  expect((await deck.press('select-cue', ben, onAir.ver as number)).outcome).toBe('ran');
  await deck.state((s) => s.selected === ben, 'Ben selected');
  await expect(page.getByTestId('cue-label')).toHaveValue('Ben');
  const program = page.frameLocator('[data-testid="program-stage"] iframe').first();
  return { slug, deck, anna, ben, program };
}

test('a panel presses the live graphic\'s own controls through the one dispatcher, once, and is refused what no longer holds', async ({ page }) => {
  test.setTimeout(120_000);
  const { deck, anna, ben, program } = await scoreWithDeck(page, 'Panel actions');

  // AC-1: the offer is the live block, control for control, by id, label and order.
  const offer = await deck.actions((a) => graphicOf(a)?.live === anna, 'House Score offered with Anna live');
  expect(offer).toMatchObject({ av: 2, relay: true });
  expect('v' in offer, 'an actions event carries no `v`, so an older module ignores it').toBe(false);
  const caps = graphicOf(offer)!.caps;
  // With nothing pinned the page draws one block, the selected graphic's: House Score's.
  const drawnEvents = await page.locator('.pd-action[data-testid^="cue-action-"]:not(.pd-pick-option)').evaluateAll((els) =>
    els.map((el) => [el.getAttribute('data-testid')!.replace('cue-action-', 'event:'), (el.textContent ?? '').replace(/^⚡\s*/, '').trim()]),
  );
  const drawnNumbers = await page.locator('.pd-live-number').evaluateAll((els) =>
    els.map((el) => [el.getAttribute('data-testid')!.replace('live-number-', 'step:'), el.querySelector('.pd-live-number-label')!.textContent]),
  );
  expect(drawnEvents.length, 'House Score draws ⚡ controls').toBeGreaterThan(0);
  expect(caps.filter((c) => c.kind === 'event' && !c.args).map((c) => [c.id, c.label])).toEqual(drawnEvents);
  expect(caps.filter((c) => c.kind === 'step').map((c) => [c.id, c.label])).toEqual(drawnNumbers);
  expect(caps.find((c) => c.id === 'event:goalA')?.allowed).toBe(true);

  // AC-2: one press, one effect, on Anna (live), not Ben (selected).
  // House Score's f1 is the home score Goal A moves (playout-adjust-race.spec.ts).
  await expect(program.locator('#f1')).toHaveText(/^\d+$/, { timeout: 20_000 });
  const base = Number(await program.locator('#f1').textContent());
  const score = (n: number) => String(base + n);
  const seen = offer.actionsVer as number;
  const goal = await deck.action({ target: GRAPHIC, cap: 'event:goalA', instance: anna, seen });
  expect(goal.outcome).toBe('ran');
  expect(goal.settled).toMatchObject({ outcome: 'accepted' });
  await expect(program.locator('#f1')).toHaveText(score(1), { timeout: 20_000 });
  await expect(page.getByTestId('cue-label')).toHaveValue('Ben');

  // The same press again (a lost acknowledgement, a replay) is a duplicate and moves nothing: the
  // next press counts from one goal, so a second Goal would read three.
  const again = await deck.action({ target: GRAPHIC, cap: 'event:goalA', instance: anna, seen, id: goal.id });
  expect(again.outcome).toBe('duplicate');
  const step = await deck.action({ target: GRAPHIC, cap: 'step:f1', instance: anna, seen, args: { delta: 1 } });
  expect(step.settled).toMatchObject({ outcome: 'accepted' });
  await expect(program.locator('#f1')).toHaveText(score(2), { timeout: 20_000 });

  // Refused by the page, nothing sent: a replaced instance, an unknown capability, arguments the
  // schema does not take, a key drawn from an offer the page no longer holds.
  const refusals = [
    [{ cap: 'event:goalA', instance: ben }, 'stale', `the cue on ${GRAPHIC} changed`],
    [{ cap: 'event:nosuch', instance: anna }, 'stale', `that action is no longer on ${GRAPHIC}`],
    [{ cap: 'step:f1', instance: anna, args: { delta: 5 } }, 'invalid', /delta 5 is not one of the declared values/],
    [{ cap: 'event:goalA', instance: anna, seen: 1 }, 'stale', 'the key was drawn too long ago'],
  ] as const;
  for (const [press, outcome, note] of refusals) {
    const r = await deck.action({ target: GRAPHIC, seen, ...press });
    expect(r.outcome, JSON.stringify(press)).toBe(outcome);
    if (typeof note === 'string') expect(r.note).toBe(note);
    else expect(r.note).toMatch(note);
  }
  // Refused by the relay (0103), before any page hears it.
  const big = await deck.action({ target: GRAPHIC, cap: 'event:goalA', instance: anna, seen, args: { t: 'x'.repeat(4096) } });
  expect(big).toMatchObject({ outcome: 'refused bad-press', note: 'args-size' });
  const verb = await deck.action({ target: GRAPHIC, cap: 'paste:goalA', instance: anna, seen });
  expect(verb).toMatchObject({ outcome: 'refused bad-press', note: 'cap' });
  await expect(program.locator('#f1')).toHaveText(score(2));
  // A refused press is in the activity feed, naming the panel.
  await expect(page.getByTestId('action-log')).toContainText(`on ${GRAPHIC} refused, the cue on ${GRAPHIC} changed`);

  // Off air: the offer says so, and a press is refused with the reason.
  const now = await deck.state(() => true);
  expect((await deck.press('all-out', '', now.ver as number)).outcome).toBe('ran');
  const off = await deck.actions((a) => graphicOf(a)?.live === null, 'House Score off air');
  expect(graphicOf(off)!.caps.every((c) => !c.allowed && c.note === `${GRAPHIC} is off air`)).toBe(true);
  const late = await deck.action({ target: GRAPHIC, cap: 'event:goalA', instance: '', seen: off.actionsVer as number });
  expect(late).toMatchObject({ outcome: 'not-allowed', note: `${GRAPHIC} is off air` });
  await deck.close();
});

test('a database without graphic actions is said so on the page, and the offer tells the panel', async ({ page }) => {
  test.setTimeout(120_000);
  // The relay as an older database answers it: no panel_relay function at all.
  await page.route('**/rest/v1/rpc/panel_relay', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.panel_relay without parameters in the schema cache' }) }),
  );
  const { deck, anna } = await scoreWithDeck(page, 'Panel old relay');
  const offer = await deck.actions((a) => graphicOf(a)?.live === anna, 'House Score offered');
  expect(offer.relay).toBe(false);
  // The header's panel status opens the dialog.
  await page.getByTestId('panel-header-status').click();
  await expect(page.getByTestId('panel-old-relay')).toHaveText('Graphic actions on the panel wait for a NoaCG server update.');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await deck.close();
});
