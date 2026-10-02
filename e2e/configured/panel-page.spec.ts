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
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, signIn, SUPABASE_URL } from './_helpers';

const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
test.skip(!haveCreds || !SUPABASE_URL || !ANON_KEY, 'E2E_EMAIL / E2E_PASSWORD and the Supabase pair unset - configured-mode spec');

type Json = Record<string, unknown>;
type Heard = { event: string; payload: Json; at: number };

/** The module's side: a panel key, the feedback topic, and presses. */
async function panelModule(code: string) {
  const sb: SupabaseClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const call = async (name: string, args: Json) => {
    const { data, error } = await sb.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data as Json;
  };
  const paired = await call('panel_pair_finish', { p_code: code, p_label: 'Spec deck' });
  expect(paired.ok, JSON.stringify(paired)).toBe(true);
  const key = paired.key as string;
  const heard: Heard[] = [];
  let channel: RealtimeChannel | null = null;
  const join = async (topic: string) => {
    if (channel) await sb.removeChannel(channel);
    for (let attempt = 0; attempt < 3; attempt++) {
      const ch = sb.channel(topic, { config: { private: true } });
      ch.on('broadcast', { event: '*' }, (m: { event: string; payload: Json }) => heard.push({ event: m.event, payload: m.payload, at: Date.now() }));
      const status = await new Promise<string>((resolve) => ch.subscribe((s) => resolve(s)));
      channel = ch;
      if (status === 'SUBSCRIBED') return;
      await sb.removeChannel(ch);
    }
    throw new Error(`could not join ${topic}`);
  };
  await join(paired.feedback_topic as string);
  let n = 0;
  const last = (event: string, pred: (p: Json) => boolean = () => true, from = 0) =>
    [...heard.slice(from)].reverse().find((m) => m.event === event && pred(m.payload));
  const until = async <T>(get: () => T | undefined, what: string, ms = 10_000): Promise<T> => {
    const end = Date.now() + ms;
    for (;;) {
      const v = get();
      if (v !== undefined) return v;
      if (Date.now() > end) throw new Error(`no ${what} within ${ms} ms`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  return {
    heard,
    hello: () => call('panel_hello', { p_key: key }),
    /** The newest state, waited for until `pred` holds. */
    state: (pred: (s: Json) => boolean = () => true, what = 'state') => until(() => last('state', pred)?.payload, what),
    /** Press as the module does, wait for the page's result. */
    press: async (verb: string, target: string, seen: number, id = `specdeck:${++n}`) => {
      // Only a result that arrives after this send answers it: a repeated id has one already.
      const from = heard.length;
      const sent = Date.now();
      const answer = await call('panel_press', { p_key: key, p_press: { verb, target, seen, id } });
      if (!answer.ok) return { outcome: `refused ${answer.refused}`, id, ms: 0 };
      const r = await until(() => last('result', (p) => p.id === id, from), `result for ${id}`);
      return { outcome: r.payload.outcome as string, note: r.payload.note as string | undefined, id, ms: r.at - sent };
    },
    close: () => sb.removeAllChannels(),
  };
}

async function publishTwoCues(page: Page): Promise<string> {
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const showName = `Panel Page ${Date.now()}`;
  await openProductionWithCurrent(page, showName);
  const rows = page.getByTestId('cue-list').locator('.pd-cue');
  await page.getByTestId('cue-label').fill('Anna');
  await expect(rows.first()).toContainText('Anna');
  await page.getByTestId('add-cue').click();
  await expect(rows).toHaveCount(2);
  await page.getByTestId('cue-label').fill('Ben');
  await expect(rows.nth(1)).toContainText('Ben');
  await page.getByTestId('cue-label').blur();
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  const slug = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((x) => x.name === name)?.hostedSlug ?? null;
  }, showName);
  expect(slug, 'publishing must mint a hosted control slug').toBeTruthy();
  return slug as string;
}

async function openHosted(page: Page, slug: string) {
  await page.goto(`/app?control=${encodeURIComponent(slug)}`);
  await expect(page.getByTestId('hosted-control-page')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.pd-cue')).toHaveCount(2);
}

test('a hosted page pairs a panel, answers it, runs its presses and refuses repeated and stale ones', async ({ page, context }) => {
  test.setTimeout(300_000);
  const slug = await publishTwoCues(page);

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
