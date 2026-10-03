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
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  const links = page.getByTestId('production-links');
  await expect(links).toBeVisible();
  await page.getByTestId('production-status').click();
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
 * holding only the first request, the late Take was answered as a duplicate; holding every attempt,
 * as the page's earlier press (then refused as superseded, now left out per graphic).
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

test('a Take held on its way arrives after the Out, is left out, and never airs', async ({ page }) => {
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

  // The held Take reaches the server after the Out: it is the page's own EARLIER press on the
  // graphic, so the graphic is left as the Out left it (`skipped`), and it writes nothing.
  const answer = (await answered) as { ok?: boolean; skipped?: string[] } | null;
  expect(answer?.ok).toBe(true);
  expect(answer?.skipped).toEqual([GRAPHIC]);
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

// ONE PRESS, SEVERAL BATCHES (reviews 2 and 3). A verb that leaves as batches is numbered and
// based at the press (hostedControl.ts `sendControlVerbs`), so a press the operator makes while an
// earlier batch is on its way is LATER than the batches after it: the server leaves that graphic as
// the later press left it (per graphic, `skipped`), the batch's other graphics still apply, and the
// page's own monitor leaves it alone too. And nothing the page pressed before its own All out airs
// after it (the panic mark). Driven through the page's own send module, so the numbers are the
// page's; the graphics are names only (the send checks the verb, not the rundown).
// Mutation-tested: numbered as each batch leaves, the All out's second batch took the re-Take off.
test('a press of several batches never undoes a later press, and nothing pressed before All out airs after it', async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  test.skip(!(await hasSequenceRoad(page)), 'this server has not applied 0071 (the sequence road); see expected-run.json');
  await clearPublishedShows(page);
  const { hosted } = await publishScorebug(page, `Two Batches ${Date.now()}`);
  const op = await openOperator(page, hosted);

  /** Hold every attempt of the first send `matches` picks (by its press number) until the page
   *  calls `__releaseHeld()`, then deliver each to the server from here. */
  type SendBody = { p_items?: { graphic?: string; msg?: { t?: string } }[]; p_sender?: { press?: unknown; all_out?: boolean } };
  const releases: (() => void)[] = [];
  await op.exposeFunction('__releaseHeld', () => releases.shift()?.());
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
    releases.push(release);
  };
  const onAir = (graphics: string[]) =>
    op.evaluate(
      async ({ slug, graphics }) => {
        const { sendControlVerbs } = await import('/src/control/hostedControl.ts');
        const batches: { graphic: string; msg: { t: 'play' } }[][] = [];
        for (let i = 0; i < graphics.length; i += 8) batches.push(graphics.slice(i, i + 8).map((graphic) => ({ graphic, msg: { t: 'play' } })));
        await sendControlVerbs({ slug, showId: null, batches });
      },
      { slug: hosted, graphics },
    );

  // ── A. All out over five layers leaves as two batches. The first is held; meanwhile the operator
  //    re-takes L5, which is in the second. The page's monitor (an applyHere that records) and air
  //    both keep L5. ──
  const layers = ['L1', 'L2', 'L3', 'L4', 'L5'];
  await onAir(layers);
  await holdFirst((b) => b.p_sender?.all_out === true && !!b.p_items?.some((i) => i.graphic === 'L1'));
  const a = await op.evaluate(
    async ({ slug, layers }) => {
      const { clearAllCueBatches, sendControlVerb, sendControlVerbs } = await import('/src/control/hostedControl.ts');
      const { getSupabase } = await import('/src/backend/supabase.ts');
      const sb = await getSupabase();
      const showId = ((await sb!.rpc('control_show_resolve', { p_slug: slug })).data as { id: string }).id;
      const w = window as unknown as { __releaseHeld: () => Promise<void> };
      const monitor: string[] = [];
      const applyHere = (items: { graphic: string; msg: { t: string } }[]) => monitor.push(...items.map((i) => `${i.graphic}:${i.msg.t}`));
      const allOut = sendControlVerbs({ slug, showId, batches: clearAllCueBatches(layers), allOut: true, applyHere });
      const retake = await sendControlVerb({ slug, showId, items: [{ graphic: 'L5', msg: { t: 'play' } }], applyHere });
      await w.__releaseHeld();
      return { retake, allOut: await allOut, monitor };
    },
    { slug: hosted, layers },
  );
  await op.unrouteAll({ behavior: 'ignoreErrors' });
  expect(a.allOut.skipped, 'the All out left the later Take alone').toEqual(['L5']);
  expect(a.monitor, 'the monitor took the re-Take').toContain('L5:play');
  expect(a.monitor, 'the monitor never took the All out of L5 after it').not.toContain('L5:stop');
  expect(a.monitor).toContain('L1:stop');

  // ── B. An Out of nine graphics (not All out) leaves as three batches. The first is held; the
  //    operator re-takes M6, in the second. Only M6 stays: M5, M7, M8 and M9 go off (review 3
  //    client:F1: the whole second batch used to be refused, losing three Outs). ──
  const nine = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'];
  await onAir(nine);
  await holdFirst((b) => !b.p_sender?.all_out && !!b.p_items?.some((i) => i.graphic === 'M1' && i.msg?.t === 'stop'));
  const b = await op.evaluate(
    async ({ slug, nine }) => {
      const { clearAllCueBatches, sendControlVerb, sendControlVerbs } = await import('/src/control/hostedControl.ts');
      const w = window as unknown as { __releaseHeld: () => Promise<void> };
      const out = sendControlVerbs({ slug, showId: null, batches: clearAllCueBatches(nine) });
      const retake = await sendControlVerb({ slug, showId: null, items: [{ graphic: 'M6', msg: { t: 'play' } }] });
      await w.__releaseHeld();
      return { retake, out: await out };
    },
    { slug: hosted, nine },
  );
  await op.unrouteAll({ behavior: 'ignoreErrors' });
  expect(b.out.skipped, 'the Out left only the re-taken graphic alone').toEqual(['M6']);
  expect(b.out.superseded).toEqual([]);

  // ── C. The panic control (review 2 ordering:F2). H is on air. A press on H is held; a press
  //    {Take G, Update H} queues behind it; an All out of H, which never queues, lands first.
  //    Both earlier presses then arrive and are refused whole: G never airs after the All out. ──
  await onAir(['H']);
  await holdFirst((b) => !b.p_sender?.all_out && b.p_items?.length === 1 && b.p_items[0].graphic === 'H');
  const c = await op.evaluate(async ({ slug }) => {
    const { clearAllCueBatches, sendControlVerb, sendControlVerbs } = await import('/src/control/hostedControl.ts');
    const w = window as unknown as { __releaseHeld: () => Promise<void> };
    const settle = (p: Promise<unknown>) => p.then((v) => v, (e: Error) => ({ error: e.message }));
    const p4 = settle(sendControlVerb({ slug, showId: null, items: [{ graphic: 'H', msg: { t: 'update', data: { f0: 'p4' } } }] }));
    const p5 = settle(
      sendControlVerb({
        slug,
        showId: null,
        items: [
          { graphic: 'G', msg: { t: 'play' } },
          { graphic: 'H', msg: { t: 'update', data: { f0: 'p5' } } },
        ],
      }),
    );
    const allOut = await sendControlVerbs({ slug, showId: null, batches: clearAllCueBatches(['H']), allOut: true });
    await w.__releaseHeld();
    return { p4: await p4, p5: await p5, allOut };
  }, { slug: hosted });
  await op.unrouteAll({ behavior: 'ignoreErrors' });
  expect((c.p5 as { superseded?: string[] }).superseded, 'the press queued before the All out was refused whole').toEqual(
    expect.arrayContaining(['G', 'H']),
  );

  const heads = await page.evaluate(
    async ({ slug }) => {
      const { getSupabase } = await import('/src/backend/supabase.ts');
      const sb = await getSupabase();
      const { data } = await sb!.rpc('control_show_resolve', { p_slug: slug });
      return ((data as { graphics?: Record<string, { on?: boolean }> } | null)?.graphics ?? {}) as Record<string, { on?: boolean }>;
    },
    { slug: hosted },
  );
  expect(heads.L5?.on, 'A: the Take pressed during the All out stays on air').toBe(true);
  for (const g of ['L1', 'L2', 'L3', 'L4']) expect(heads[g]?.on, `A: ${g} went off`).toBe(false);
  expect(heads.M6?.on, 'B: the re-taken graphic stays on air').toBe(true);
  for (const g of ['M1', 'M2', 'M3', 'M4', 'M5', 'M7', 'M8', 'M9']) expect(heads[g]?.on, `B: ${g} went off`).toBe(false);
  expect(heads.H?.on, 'C: the All out took H off').toBe(false);
  expect(heads.G?.on ?? false, 'C: G never aired after the All out').toBe(false);

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

  // Every attempt the operator page makes at sending a press, so a late Take says which half was
  // late: the send (an attempt abandoned at 1.5 s and sent again, failedSends.ts) or the road
  // to air. Seen once locally on a stack just started: Take 1 at 2040 and 2080 ms, the
  // abandon-and-resend signature, but never again in 23 runs with this record on.
  const sends: string[] = [];
  const sentAt = new Map<object, number>();
  let markedAt = Date.now();
  const attempt = (request: { url(): string }, outcome: string) => {
    const at = sentAt.get(request);
    if (at !== undefined) sends.push(`+${at - markedAt}ms ${outcome} after ${Date.now() - at}ms`);
  };
  op.on('request', (r) => {
    if (r.url().includes('/rpc/control_send_seq')) sentAt.set(r, Date.now());
  });
  op.on('requestfinished', (r) => attempt(r, 'answered'));
  op.on('requestfailed', (r) => attempt(r, `failed (${r.failure()?.errorText})`));
  // Take and Out, 800 ms apart, five Takes; the Presence channel is closed after the first.
  const late: number[] = [];
  for (let take = 1; take <= 5; take += 1) {
    const pressedAt = (markedAt = Date.now());
    sends.push(`Take ${take}:`);
    await op.getByTestId('hosted-take-cue').click();
    await expect.poll(() => airPlays(air), { timeout: 30_000 }).toBe(String(take));
    late.push(Date.now() - pressedAt);
    if (take === 1) {
      realtime.close('live-');
      await expect(debug).toContainText('presence: NOT JOINED', { timeout: 10_000 });
    }
    await op.waitForTimeout(800);
    markedAt = Date.now();
    sends.push('Out:');
    await op.getByTestId('hosted-out-cue').click();
    await op.waitForTimeout(800);
  }
  expect(realtime.faults.closed, 'the Presence channel was closed').toBe(1);
  // Every Take aired within 2 s of its press (a quiet Take is well under 0.5 s here).
  expect(Math.max(...late), `press to air per Take: ${late.join(', ')} ms; sends: ${sends.join(' ')}`).toBeLessThan(2_000);
  await expect(debug).toContainText('realtime: following');

  await air.unrouteAll({ behavior: 'ignoreErrors' });
  await Promise.all([op.close(), air.close()]);
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});

// A RENDERER IS NEVER LEFT DARK BY THE NEW RESOLVE (review 2 oldclients:F2; design D-u). The
// protocol-2 resolve reads more than today's, and a statement timeout on it used to be retried
// forever. Here every protocol-2 resolve answers the timeout PostgREST gives (57014): after three
// in a row the renderer boots on today's resolve, follows by row id, and airs the Take.
test('a renderer whose new resolve keeps timing out boots on today\'s road and airs', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  test.skip(!(await hasSequenceRoad(page)), 'this server has not applied 0071 (the sequence road); see expected-run.json');
  await clearPublishedShows(page);
  const { hosted, output } = await publishScorebug(page, `Resolve Timeout ${Date.now()}`);
  const op = await openOperator(page, hosted);
  await op.getByTestId('hosted-take-cue').click();

  const air = await page.context().newPage();
  let timedOut = 0;
  await air.route(/\/rest\/v1\/rpc\/control_output_resolve(\?|$)/, (route) => {
    timedOut += 1;
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ code: '57014', details: null, hint: null, message: 'canceling statement due to statement timeout' }),
    });
  });
  await air.goto(`/output?production=${encodeURIComponent(output)}&debug=1`);
  await expect(air.locator('pre')).toContainText('protocol: row id (proto 1)', { timeout: 60_000 });
  await expect.poll(() => airPlays(air), { timeout: 30_000 }).toBe('1');
  expect(timedOut, 'it gave the new resolve three tries, no more').toBe(3);

  await air.unrouteAll({ behavior: 'ignoreErrors' });
  await Promise.all([op.close(), air.close()]);
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
