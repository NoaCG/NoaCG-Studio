// THE COMPANION MODULE'S SIDE of a hardware panel, for the configured specs that walk an answering
// page (panel-page.spec.ts on the hosted control page, panel-production-page.spec.ts on the
// production page): an anonymous Supabase client holding only the panel key, as the module is
// (docs/work-specs/hardware-panel-control/protocol.md §4, §7), and the published production both
// walk.

import { expect, type Page } from '@playwright/test';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, signIn, SUPABASE_URL } from './_helpers';

export const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';

export type Json = Record<string, unknown>;
type Heard = { event: string; payload: Json; at: number };

/** The module's side: a panel key, the feedback topic, and presses. */
export async function panelModule(code: string) {
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
  // Where the latest press was sent from: a state read after a press is one that arrived after it.
  let mark = 0;
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
    hello: () => call('panel_hello', { p_key: key }),
    /** The newest state since the latest press, waited for until `pred` holds. */
    state: (pred: (s: Json) => boolean = () => true, what = 'state') => until(() => last('state', pred, mark)?.payload, what),
    /** The newest rows the page published. */
    rows: async () => (await until(() => last('rows')?.payload, 'rows')).rows as { id: string; label: string; kind: string }[],
    /** Press as the module does, wait for the page's result. */
    press: async (verb: string, target: string, seen: number, id = `specdeck:${++n}`) => {
      // Only a result that arrives after this send answers it: a repeated id has one already.
      const from = heard.length;
      const sent = Date.now();
      const answer = await call('panel_press', { p_key: key, p_press: { verb, target, seen, id } });
      if (!answer.ok) return { outcome: `refused ${answer.refused}`, id, ms: 0 };
      const r = await until(() => last('result', (p) => p.id === id, from), `result for ${id}`);
      // A press that ran moves what the page shows; a refused one publishes nothing new.
      if (r.payload.outcome === 'ran') mark = from;
      return { outcome: r.payload.outcome as string, note: r.payload.note as string | undefined, id, ms: r.at - sent };
    },
    /** Milliseconds from the page sending each state to this client hearing it: the page stamps
     *  `at` as it sends, and both clocks are this machine's. */
    stateLags: () => heard.filter((m) => m.event === 'state' && typeof m.payload.at === 'number').map((m) => m.at - (m.payload.at as number)),
    close: async () => {
      await sb.removeAllChannels();
      sb.realtime.disconnect();
    },
  };
}

/** A publish opens the production page's Playout panel by itself; shut it, so the header's doors
 *  are in reach. */
export async function shutStatusPanel(op: Page) {
  const status = op.getByTestId('production-status-panel');
  if (await status.isVisible()) await op.getByTestId('production-status').click();
  await expect(status).toBeHidden();
}

/** Pair a panel from an operator page's Panel dialog (opened if it is not), as the module does
 *  with the code it shows; the dialog is left open on the listed panel. */
export async function pairPanel(op: Page) {
  if (!(await op.getByTestId('panel-dialog').isVisible())) await op.getByTestId('panel-open').click();
  await expect(op.getByTestId('panel-dialog')).toBeVisible();
  await op.getByTestId('panel-pair').click();
  const codeText = (await op.getByTestId('panel-code').locator('.panel-code').textContent()) ?? '';
  expect(codeText).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const deck = await panelModule(codeText);
  await expect(op.getByTestId('panel-row')).toHaveCount(1, { timeout: 10_000 });
  await expect(op.getByTestId('panel-row')).toContainText('Spec deck');
  await expect(op.getByTestId('panel-code')).toBeHidden();
  return deck;
}

/** Switch "Answer the panel on this page" on in the open Panel dialog. */
export async function answerPanel(op: Page) {
  await op.getByTestId('panel-answer').locator('input').check();
  await expect(op.getByTestId('panel-status')).toHaveText('This page answers the panel.');
  await expect(op.getByTestId('panel-open')).toHaveAttribute('data-state', 'ok');
}

/** The published production's hosted control page, open with its two cues. */
export async function openHosted(page: Page, slug: string) {
  await page.goto(`/app?control=${encodeURIComponent(slug)}`);
  await expect(page.getByTestId('hosted-control-page')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.pd-cue')).toHaveCount(2);
}

/** A published production of two cues, Anna and Ben, left open on its production page; its
 *  hosted control slug. */
export async function publishTwoCues(page: Page, showName: string): Promise<string> {
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
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
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  const slug = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((x) => x.name === name)?.hostedSlug ?? null;
  }, showName);
  expect(slug, 'publishing must mint a hosted control slug').toBeTruthy();
  return slug as string;
}
