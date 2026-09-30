// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite has no server to refuse a press.
//
// THE NUMBERED LOG AND THE STALE PRESS (Phase 6 Step 2, migrations 0070 and 0071): a production's
// rows are numbered in commit order, and every press says what the operator had seen, so the server
// can refuse a press that another screen, or the same page's own later press, has overtaken. Both
// can only be judged against a real server, and both are about AIR: a refused press must write
// nothing to the log, so no renderer can ever apply it.
// covers: src/control/seqSend.ts, src/control/seqFollow.ts, src/control/hostedControl.ts
// covers: src/output/main.ts, src/components/HostedControlPage.tsx, src/control/commandRoads.ts
// covers: supabase/migrations/0069_control_heads.sql, supabase/migrations/0070_seq_topic.sql
// covers: supabase/migrations/0071_command_sequence.sql
//
// Measured before this existed (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.6): a Take held 6 s on its
// way to the database, with the Out pressed 1.5 s behind it, aired AFTER the Out, and air ended
// with the graphic up while the operator's page said nothing was on air.

import { test, expect, type Page, type Route } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

const GRAPHIC = 'House Scorebug';

/** Does this server have the sequence road? A server without 0071 answers PGRST202 for its resolve. */
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

/**
 * Hold every attempt of the page's NEXT press on control_send_seq (its first request's
 * `p_sender.press`, and each resend the page makes of it) until `release` resolves, then deliver
 * each to the server from here whatever the page has done with it meanwhile, and hand back the
 * server's answer to the first. Holding only the first attempt is not enough: the page abandons it
 * at 1.5 s and sends it again 0.4 s later (failedSends.ts), and that resend, let through, raced
 * the next press to the server, so which one landed first was up to the machine's load.
 * Fault-injected with the Out pressed 2.5 s after the Take, so the resend always leaves first:
 * holding only the first request, the late Take was answered as a duplicate (`ok: true`); holding
 * every attempt, as superseded.
 */
function holdNextPress(op: Page, release: Promise<void>): Promise<unknown> {
  return new Promise((resolveAnswer) => {
    let press: unknown;
    let first = true;
    void op.route('**/rest/v1/rpc/control_send_seq', async (route: Route) => {
      const body = route.request().postDataJSON() as { p_sender?: { press?: unknown } } | null;
      if (first) press = body?.p_sender?.press;
      else if (body?.p_sender?.press !== press) return route.continue();
      const answerThis = first;
      first = false;
      await release;
      // A resend still held when the test closes its pages has nowhere to go: nothing to deliver.
      const response = await route.fetch().catch(() => null);
      if (answerThis) resolveAnswer(response ? await response.json().catch(() => null) : null);
      if (response) await route.fulfill({ response }).catch(() => {});
    });
  });
}

const airPlays = (air: Page) => air.evaluate(() => document.body.getAttribute('data-plays'));

test('a press another screen overtook is refused, writes nothing, and the operator is told', async ({ page }) => {
  test.setTimeout(360_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  test.skip(!(await hasSequenceRoad(page)), 'this server has not applied 0071 (the sequence road); see expected-run.json');
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
  const answered = holdNextPress(a, released);
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
  test.skip(!(await hasSequenceRoad(page)), 'this server has not applied 0071 (the sequence road); see expected-run.json');
  await clearPublishedShows(page);
  const { hosted, output } = await publishScorebug(page, `Late Take ${Date.now()}`);
  const air = await openAir(page, output);
  const op = await openOperator(page, hosted);
  await expect.poll(() => airPlays(air), { timeout: 30_000 }).toBe('0');

  // The Take is held 6 s on its way, every attempt of it (a slow uplink, a queue in front of the
  // database); the operator presses Out 1.5 s after the Take, as in the measured case.
  const answered = holdNextPress(op, new Promise((r) => setTimeout(r, 6_000)));
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

// ONE PRESS, SEVERAL BATCHES (review ordering:F1): All out over five layers leaves as two batches,
// and both are numbered and based at the press (hostedControl.ts `sendControlVerbs`). A Take the
// operator makes while the first batch is on its way is therefore a LATER press than the second
// batch, and the server leaves it on air. Driven through the page's own send module, so the numbers
// are the page's; the graphics are names only (the send checks the verb, not the rundown).
// Mutation-tested: numbered as each batch leaves, the second batch takes the re-Take off air.
// The same module answers `superseded` for a press its own later press overtook (ordering:F2).
test('an All out in two batches never undoes a Take pressed while it was on its way', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  test.skip(!(await hasSequenceRoad(page)), 'this server has not applied 0071 (the sequence road); see expected-run.json');
  await clearPublishedShows(page);
  const { hosted } = await publishScorebug(page, `Two Batches ${Date.now()}`);
  const op = await openOperator(page, hosted);
  const layers = ['L1', 'L2', 'L3', 'L4', 'L5'];

  // All five on air, as one press.
  await op.evaluate(
    async ({ slug, layers }) => {
      const { sendControlVerb } = await import('/src/control/hostedControl.ts');
      await sendControlVerb({ slug, showId: null, items: layers.map((graphic) => ({ graphic, msg: { t: 'play' as const } })) });
    },
    { slug: hosted, layers },
  );

  /** Hold every attempt of the first send `matches` picks (by its press number) until the page
   *  calls `__releaseHeld()`, then deliver each to the server from here. */
  const holdFirst = async (matches: (body: SendBody) => boolean) => {
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let heldPress: unknown;
    await op.route('**/rest/v1/rpc/control_send_seq', async (route: Route) => {
      const body = route.request().postDataJSON() as SendBody | null;
      if (heldPress === undefined && body && matches(body)) heldPress = body.p_sender?.press;
      if (heldPress === undefined || body?.p_sender?.press !== heldPress) return route.continue();
      await released;
      const response = await route.fetch().catch(() => null);
      if (response) await route.fulfill({ response }).catch(() => {});
    });
    return release;
  };
  type SendBody = { p_items?: { graphic?: string; msg?: { t?: string } }[]; p_sender?: { press?: unknown; all_out?: boolean } };
  const releases: (() => void)[] = [];
  await op.exposeFunction('__releaseHeld', () => releases.shift()?.());

  // ── The All out's FIRST batch (the one carrying L1) is held; meanwhile the operator re-takes L5,
  //    which is in the SECOND batch. ──
  releases.push(await holdFirst((b) => b.p_sender?.all_out === true && !!b.p_items?.some((i) => i.graphic === 'L1')));
  const first = await op.evaluate(
    async ({ slug, layers }) => {
      const { clearAllCueBatches, sendControlVerb, sendControlVerbs } = await import('/src/control/hostedControl.ts');
      const w = window as unknown as { __releaseHeld: () => Promise<void> };
      const allOut = sendControlVerbs({ slug, showId: null, batches: clearAllCueBatches(layers), allOut: true });
      const retake = await sendControlVerb({ slug, showId: null, items: [{ graphic: 'L5', msg: { t: 'play' } }] });
      await w.__releaseHeld();
      return { retake, allOut: await allOut };
    },
    { slug: hosted, layers },
  );
  await op.unrouteAll({ behavior: 'ignoreErrors' });
  expect(first.allOut.skipped, 'the All out left the later Take alone').toEqual(['L5']);
  expect(first.retake.superseded).toEqual([]);

  // ── A Take of L7 is held; an All out, which never queues, lands first. The Take then arrives
  //    and is refused as superseded, and the send SAYS so, which is what keeps a page from
  //    marking L7 on air after the All out already marked it off (review ordering:F2). ──
  releases.push(await holdFirst((b) => !b.p_sender?.all_out && !!b.p_items?.some((i) => i.graphic === 'L7')));
  const second = await op.evaluate(async ({ slug }) => {
    const { clearAllCueBatches, sendControlVerb, sendControlVerbs } = await import('/src/control/hostedControl.ts');
    const w = window as unknown as { __releaseHeld: () => Promise<void> };
    const take = sendControlVerb({ slug, showId: null, items: [{ graphic: 'L7', msg: { t: 'play' } }] });
    const allOut = await sendControlVerbs({ slug, showId: null, batches: clearAllCueBatches(['L7']), allOut: true });
    await w.__releaseHeld();
    return { take: await take, allOut };
  }, { slug: hosted });
  await op.unrouteAll({ behavior: 'ignoreErrors' });
  expect(second.take.superseded, 'the held Take answered as superseded').toEqual(['L7']);

  const heads = await page.evaluate(
    async ({ slug }) => {
      const { getSupabase } = await import('/src/backend/supabase.ts');
      const sb = await getSupabase();
      const { data } = await sb!.rpc('control_show_resolve', { p_slug: slug });
      return ((data as { graphics?: Record<string, { on?: boolean }> } | null)?.graphics ?? {}) as Record<string, { on?: boolean }>;
    },
    { slug: hosted },
  );
  expect(heads.L5?.on, 'the Take pressed during the All out stays on air').toBe(true);
  for (const layer of ['L1', 'L2', 'L3', 'L4', 'L7']) expect(heads[layer]?.on, `${layer} went off`).toBe(false);

  await op.close();
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});

/**
 * Stand between one page and Realtime, passing every frame through, with two faults on demand:
 * `refuseFirst(prefix)` answers the first join of a topic starting with `prefix` with an error (a
 * passing failure: a playout box whose network is not up yet, a slow authorisation), and
 * `close(prefix)` sends the page a server close of that topic's channel, as Realtime does when a
 * channel exceeds its Presence rate limit.
 */
async function realtimeFaults(page: Page) {
  const faults = { refuse: '' as string, refused: 0, closed: 0 };
  /** Per joined topic, its join ref and whether the page speaks the array (v2) wire format. */
  const joined = new Map<string, { joinRef: unknown; array: boolean }>();
  let toPage: ((message: string) => void) | null = null;
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    const server = ws.connectToServer();
    toPage = (message) => ws.send(message);
    ws.onMessage((message) => {
      if (typeof message === 'string') {
        try {
          const m = JSON.parse(message) as unknown;
          const array = Array.isArray(m);
          const [joinRef, ref, topic, event] = array
            ? (m as unknown[])
            : [(m as { join_ref?: unknown }).join_ref, (m as { ref?: unknown }).ref, (m as { topic?: unknown }).topic, (m as { event?: unknown }).event];
          if (event === 'phx_join' && typeof topic === 'string') {
            if (faults.refuse && topic.startsWith(`realtime:${faults.refuse}`)) {
              faults.refuse = '';
              faults.refused += 1;
              const payload = { status: 'error', response: { reason: 'refused once by command-sequence.spec.ts' } };
              ws.send(JSON.stringify(array ? [joinRef, ref, topic, 'phx_reply', payload] : { topic, event: 'phx_reply', payload, ref, join_ref: joinRef }));
              return;
            }
            joined.set(topic, { joinRef, array });
          }
        } catch {
          // not a JSON frame: pass it through
        }
      }
      server.send(message);
    });
    server.onMessage((message) => ws.send(message));
  });
  return {
    faults,
    refuseFirst: (prefix: string) => {
      faults.refuse = prefix;
    },
    close: (prefix: string) => {
      for (const [topic, { joinRef, array }] of joined) {
        if (!topic.startsWith(`realtime:${prefix}`)) continue;
        const payload = { message: 'Client presence rate limit exceeded' };
        toPage?.(JSON.stringify(array ? [joinRef, null, topic, 'system', payload] : { topic, event: 'system', payload, ref: null, join_ref: joinRef }));
        toPage?.(JSON.stringify(array ? [joinRef, null, topic, 'phx_close', {}] : { topic, event: 'phx_close', payload: {}, ref: null, join_ref: joinRef }));
        joined.delete(topic);
        faults.closed += 1;
      }
    },
  };
}

// On protocol 2 the numbered topic is the renderer's road for commands. A first join that fails
// for a passing reason is asked again within 1 to 5 s (seqFollow.ts `seqJoinRetryDelay`), not on a
// 15 s backoff, which left every Take in between to the 30 s poll (review oldclients:F1).
// Mutation-tested: with the first retry at 15 s, the Take reaches air only after that retry and the
// bound below fails.
test('a renderer whose first numbered join fails joins again within seconds, and a Take reaches air', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  test.skip(!(await hasSequenceRoad(page)), 'this server has not applied 0071 (the sequence road); see expected-run.json');
  await clearPublishedShows(page);
  const { hosted, output } = await publishScorebug(page, `Join Retry ${Date.now()}`);
  const op = await openOperator(page, hosted);

  const air = await page.context().newPage();
  const realtime = await realtimeFaults(air);
  realtime.refuseFirst('seq-');
  await air.goto(`/output?production=${encodeURIComponent(output)}&debug=1`);
  await expect(air.locator('pre')).toContainText('protocol: numbered log', { timeout: 60_000 });
  // The first join was refused, and the renderer says so...
  await expect(air.locator('pre')).toContainText('realtime: NOT JOINED', { timeout: 30_000 });
  // ...and the Take pressed now reaches air within the quick retry and its refill, not the poll.
  const pressedAt = Date.now();
  await op.getByTestId('hosted-take-cue').click();
  await expect.poll(() => airPlays(air), { timeout: 20_000 }).toBe('1');
  const tookMs = Date.now() - pressedAt;
  expect(tookMs, 'the Take reached air within the quick retry, not the 15 s backoff or the 30 s poll').toBeLessThan(8_000);
  expect(realtime.faults.refused).toBe(1);
  await expect(air.locator('pre')).toContainText('realtime: following');

  await air.unrouteAll({ behavior: 'ignoreErrors' });
  await Promise.all([op.close(), air.close()]);
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});

// THE COMMAND ROAD DOES NOT SHARE FATE WITH PRESENCE (design D-s). Measured with the two on one
// channel: Realtime closed it 25 to 27 s after it opened ("Client presence rate limit exceeded"),
// and a third of the Takes pressed before it joined again never played. Here the renderer's
// Presence channel is closed by the server mid-burst; every Take still airs within a second or two
// of its press, because the numbered frames are on `seq-<show>`, which nothing closed.
test('a Presence channel closed by the server mid-burst costs the renderer no Take', async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  test.skip(!(await hasSequenceRoad(page)), 'this server has not applied 0071 (the sequence road); see expected-run.json');
  await clearPublishedShows(page);
  const { hosted, output } = await publishScorebug(page, `Presence Close ${Date.now()}`);
  const op = await openOperator(page, hosted);

  const air = await page.context().newPage();
  const realtime = await realtimeFaults(air);
  await air.goto(`/output?production=${encodeURIComponent(output)}&debug=1`);
  const debug = air.locator('pre');
  await expect(debug).toContainText('protocol: numbered log', { timeout: 60_000 });
  await expect(debug).toContainText('realtime: following', { timeout: 60_000 });
  await expect(debug).toContainText('presence: announced on the live topic', { timeout: 30_000 });

  // Take and Out, 800 ms apart, five Takes; the Presence channel is closed after the first.
  const late: number[] = [];
  for (let take = 1; take <= 5; take += 1) {
    const pressedAt = Date.now();
    await op.getByTestId('hosted-take-cue').click();
    await expect.poll(() => airPlays(air), { timeout: 30_000 }).toBe(String(take));
    late.push(Date.now() - pressedAt);
    if (take === 1) {
      realtime.close('live-');
      await expect(debug).toContainText('presence: NOT JOINED', { timeout: 10_000 });
    }
    await op.waitForTimeout(800);
    await op.getByTestId('hosted-out-cue').click();
    await op.waitForTimeout(800);
  }
  expect(realtime.faults.closed, 'the Presence channel was closed').toBe(1);
  // Every Take aired within 2 s of its press (a quiet Take is well under 0.5 s here).
  expect(Math.max(...late), `press to air per Take: ${late.join(', ')} ms`).toBeLessThan(2_000);
  await expect(debug).toContainText('realtime: following');

  await air.unrouteAll({ behavior: 'ignoreErrors' });
  await Promise.all([op.close(), air.close()]);
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
