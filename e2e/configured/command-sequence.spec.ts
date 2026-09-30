// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite has no server to refuse a press.
//
// THE NUMBERED LOG AND THE STALE PRESS (Phase 6 Step 2, migration 0070): a production's rows are
// numbered in commit order, and every press says what the operator had seen, so the server can
// refuse a press that another screen, or the same page's own later press, has overtaken. Both can
// only be judged against a real server, and both are about AIR: a refused press must write nothing
// to the log, so no renderer can ever apply it.
// covers: src/control/seqSend.ts, src/control/seqFollow.ts, src/control/hostedControl.ts
// covers: src/output/main.ts, src/components/HostedControlPage.tsx
// covers: supabase/migrations/0069_control_heads.sql, supabase/migrations/0070_command_sequence.sql
//
// Measured before this existed (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.6): a Take held 6 s on its
// way to the database, with the Out pressed 1.5 s behind it, aired AFTER the Out, and air ended
// with the graphic up while the operator's page said nothing was on air.

import { test, expect, type Page, type Route } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

const GRAPHIC = 'House Scorebug';

/** Does this server have the sequence road? A server without 0070 answers PGRST202 for its resolve. */
async function hasSequenceRoad(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const { getSupabase } = await import('/src/backend/supabase.ts');
    const sb = await getSupabase();
    if (!sb) return false;
    const { error } = await sb.rpc('control_show_resolve', { p_slug: 'no-such-production' });
    return !error;
  });
}

/** The server's own log after `afterSeq`, read as a signed-out page reads it. */
async function rowsAfter(page: Page, slug: string, afterSeq: number): Promise<{ seq: number; graphic: string; t: string }[]> {
  return page.evaluate(
    async ({ slug, afterSeq }) => {
      const { hostedControlTailSeq } = await import('/src/control/hostedControl.ts');
      const tail = await hostedControlTailSeq(slug, afterSeq, null);
      return (tail?.rows ?? []).map((r) => ({ seq: r.seq, graphic: r.graphic, t: r.msg.t }));
    },
    { slug, afterSeq },
  );
}

/** The head's seq and this graphic's summary, from the proto-2 resolve. */
async function head(page: Page, slug: string): Promise<{ seq: number; on: boolean | null }> {
  return page.evaluate(
    async ({ slug, graphic }) => {
      const { getSupabase } = await import('/src/backend/supabase.ts');
      const sb = await getSupabase();
      const { data } = await sb!.rpc('control_show_resolve', { p_slug: slug });
      const d = data as { seq?: number; graphics?: Record<string, { on?: boolean }> } | null;
      return { seq: Number(d?.seq ?? 0), on: d?.graphics?.[graphic]?.on ?? null };
    },
    { slug, graphic: GRAPHIC },
  );
}

async function publishScorebug(page: Page, showName: string): Promise<{ hosted: string; output: string }> {
  await bootstrapGraphic(page, { name: GRAPHIC });
  await openProductionWithCurrent(page, showName);
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  const links = page.getByTestId('production-links');
  await expect(links).toBeVisible();
  await page.getByTestId('production-links-toggle').click();
  await expect(links).toBeHidden();
  const slugs = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const s = loadShows().find((x) => x.name === name);
    return { hosted: s?.hostedSlug ?? '', output: s?.outputSlug ?? '' };
  }, showName);
  expect(slugs.hosted, 'publishing must mint a hosted control slug').toBeTruthy();
  expect(slugs.output, 'publishing must mint an output slug').toBeTruthy();
  return slugs;
}

async function openAir(page: Page, output: string): Promise<Page> {
  const air = await page.context().newPage();
  await air.goto(`/output?production=${encodeURIComponent(output)}&debug=1`);
  // The renderer says which road it follows; this file is about the numbered one.
  await expect(air.locator('pre')).toContainText('protocol: numbered log', { timeout: 60_000 });
  await expect(air.locator('pre')).toContainText('realtime: following', { timeout: 60_000 });
  return air;
}

async function openOperator(page: Page, hosted: string): Promise<Page> {
  const op = await page.context().newPage();
  await op.goto(`/app?control=${encodeURIComponent(hosted)}`);
  await expect(op.getByTestId('hosted-control-page')).toBeVisible({ timeout: 60_000 });
  await op.getByTestId('hosted-cues').locator('.pd-cue').first().getByTestId('hosted-select-cue').click();
  return op;
}

/** Hold the page's NEXT control_send_seq until `release` resolves, then deliver it to the server
 *  from here whatever the page has done with it meanwhile, and hand back the server's answer. */
function holdNextSend(op: Page, release: Promise<void>): Promise<unknown> {
  return new Promise((resolveAnswer) => {
    let taken = false;
    const handler = async (route: Route) => {
      if (taken) return route.continue();
      taken = true;
      await release;
      const response = await route.fetch();
      resolveAnswer(await response.json().catch(() => null));
      await route.fulfill({ response }).catch(() => {});
      await op.unroute('**/rest/v1/rpc/control_send_seq', handler).catch(() => {});
    };
    void op.route('**/rest/v1/rpc/control_send_seq', handler);
  });
}

const airPlays = (air: Page) => air.evaluate(() => document.body.getAttribute('data-plays'));

test('a press another screen overtook is refused, writes nothing, and the operator is told', async ({ page }) => {
  test.setTimeout(360_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  test.skip(!(await hasSequenceRoad(page)), 'this server has not applied 0070 (the sequence road); see expected-run.json');
  await clearPublishedShows(page);
  const { hosted, output } = await publishScorebug(page, `Stale Press ${Date.now()}`);
  const air = await openAir(page, output);
  const a = await openOperator(page, hosted);
  const b = await openOperator(page, hosted);

  // A takes the cue; both operators see it on air, and so does air.
  await a.getByTestId('hosted-take-cue').click();
  await expect.poll(() => airPlays(air), { timeout: 30_000 }).toBe('1');
  await expect(b.getByTestId('hosted-live-chip')).toContainText('on air:', { timeout: 30_000 });

  // A presses Out, and its request is held on the way. While it is held, B re-takes the cue.
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  const answered = holdNextSend(a, released);
  await a.getByTestId('hosted-out-cue').click();
  await b.getByTestId('hosted-retake-cue').click();
  await expect.poll(() => airPlays(air), { timeout: 30_000 }).toBe('2');
  const before = await head(page, hosted);
  expect(before.on, 'B re-took it: on air per the server').toBe(true);

  // A's Out reaches the server now, made on what A saw before B's re-take.
  release();
  const answer = (await answered) as { ok?: boolean; refused?: string } | null;
  expect(answer?.ok, 'the server refused it').toBe(false);
  expect(answer?.refused).toBe('stale');

  // It wrote NOTHING, so no renderer can ever apply it: air stays on B's re-take.
  expect(await rowsAfter(page, hosted, before.seq), 'the refused Out left no row').toEqual(
    expect.not.arrayContaining([expect.objectContaining({ t: 'stop' })]),
  );
  expect((await head(page, hosted)).on).toBe(true);
  await expect.poll(() => airPlays(air), { timeout: 5_000 }).toBe('2');

  // And A is told, in plain words, what happened and what air did.
  await expect(a.getByTestId('hosted-error')).toContainText(`${GRAPHIC} was changed from another screen, so air did not change.`, {
    timeout: 15_000,
  });
  // A's own page follows the log, so it ends agreeing with air.
  await expect(a.getByTestId('hosted-live-chip')).toContainText('on air:', { timeout: 30_000 });

  await Promise.all([a.close(), b.close(), air.close()]);
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});

test('a Take held on its way arrives after the Out, is refused, and never airs', async ({ page }) => {
  test.setTimeout(360_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  test.skip(!(await hasSequenceRoad(page)), 'this server has not applied 0070 (the sequence road); see expected-run.json');
  await clearPublishedShows(page);
  const { hosted, output } = await publishScorebug(page, `Late Take ${Date.now()}`);
  const air = await openAir(page, output);
  const op = await openOperator(page, hosted);
  await expect.poll(() => airPlays(air), { timeout: 30_000 }).toBe('0');

  // The Take's request is held 6 s (a slow uplink, a queue in front of the database); the
  // operator presses Out 1.5 s after the Take, as in the measured case.
  const answered = holdNextSend(op, new Promise((r) => setTimeout(r, 6_000)));
  await op.getByTestId('hosted-take-cue').click();
  await op.waitForTimeout(1_500);
  await op.getByTestId('hosted-out-cue').click();
  await expect(op.getByTestId('hosted-live-chip')).toContainText('nothing on air', { timeout: 30_000 });
  const afterOut = await head(page, hosted);

  // The held Take reaches the server after the Out: it is the page's own EARLIER press, so it is
  // superseded, and it writes nothing.
  const answer = (await answered) as { ok?: boolean; refused?: string } | null;
  expect(answer?.ok).toBe(false);
  expect(answer?.refused).toBe('superseded');
  expect(await rowsAfter(page, hosted, afterOut.seq)).toEqual(expect.not.arrayContaining([expect.objectContaining({ t: 'play' })]));
  expect((await head(page, hosted)).on).not.toBe(true);

  // Air never played it, and the operator's page still says what air shows: the operator's last
  // press is what stands, so the refusal itself needs no sentence.
  await op.waitForTimeout(3_000);
  expect(await airPlays(air)).toBe('0');
  await expect(op.getByTestId('hosted-live-chip')).toContainText('nothing on air');
  expect((await op.getByTestId('hosted-error').allInnerTexts()).join(' ')).not.toContain('changed from another screen');

  await Promise.all([op.close(), air.close()]);
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
