// covers: src/components/home/ProductionPage.tsx, src/control/{hostedControl,seqSend,productionDataApi}.ts
// covers: src/components/home/CueEditor.tsx
// covers: src/control/playoutSession.ts, src/control/productionDataSession.ts, src/components/home/useStorePart.ts
// covers: src/components/home/CueActions.tsx
// covers: src/components/home/useProductionPublish.ts
// covers: src/control/airState.ts, src/control/sessionWire.ts
// covers: src/control/graphicVerbs.ts, src/control/verbDispatch.ts, src/control/verbView.ts
// covers: src/control/cueDraft.ts, src/control/playoutStatus.ts
// covers: supabase/migrations/0125_relative_presses.sql
//
// TWO ⚡ ADJUST PRESSES INSIDE ONE ROUND TRIP MOVE A SHARED VALUE TWICE (production-page refactor,
// phase 1, S1; docs/work-specs/production-page-refactor/spec.md §1.3).
//
// A scoreboard's Goal carries `adjust: { f1: 1 }`. With f1 bound to a path in the production's
// tree, the press sends the event, and once the send has answered (or has no answer, fix-2617 R8a)
// it queues "+1 on the path" with a press id, which the server applies under the row lock and the
// page resends until it lands (#2617, migration 0125). A second Goal pressed while the first send
// is still out used to count from the same tree and write the same figure, so two goals moved the
// score by one. A Goal and a + on the ± stepper of the same score lost a count the same way.
//
// The last two tests are #2617's: presses survive calls that fail or whose answer is lost, and a
// Take whose row lands after a +1's still airs the stored figure.
//
// Only a real backend shows it: the tree a published production follows is the server's, written
// through `control_data_patch_by_slug`. The hold is on `control_send_seq` in the browser: the first
// event's request waits a moment before it goes, as a slow venue link would make it, and the second
// press lands inside that wait. The hold stays under the page's 1.5 s attempt deadline
// (failedSends.ts), so nothing is abandoned and both events are ordinary late answers.
//
// A second operator screen has to count from the same tree: the hosted control page (since retired)
// had the same defect after the production page was fixed (#1567), its Goal reading the bound figure
// as the page drew it at the press. The last test walks a second signed-in production page, which
// learns the score from the server's follow rather than from its own presses.

import { publishProduction } from '../_publish';
import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, openSecondProductionPage, signIn, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');

// Cleanup runs whatever the walk's outcome: the account is shared by the whole configured suite.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await clearPublishedShows(page).catch(() => {});
  await wipeMyGraphics(page).catch(() => {});
});

const GRAPHIC = 'House Score';
const PATH = 'match.home.score';
/** The longest the first event's request is held if the walk never lets it go: short of the page's
 *  1.5 s attempt deadline (failedSends.ts), so nothing is abandoned and resent. */
const HOLD_MS = 1_000;

/** A published production with House Score on air, its home score bound to PATH and seeded at 2.
 *  Hands back the server's figure, PROGRAM's frame and a hold on the event sends. */
async function scoreOnAir(page: Page, name: string) {
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { name: GRAPHIC });
  const showId = await openProductionWithCurrent(page, `${name} ${Date.now()}`);

  // The binding travels with the publish, so it goes on the record first, through the model's door.
  await page.evaluate(
    async ({ showId, GRAPHIC, PATH }) => {
      const { setFieldBindings } = await __noacgImport('/src/model/shows.ts');
      const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
      setFieldBindings(showId, [{ graphic: GRAPHIC, fieldId: 'f1', path: PATH }]);
      await commitDurableWrites();
    },
    { showId, GRAPHIC, PATH },
  );

  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  await page.keyboard.press('Escape');

  // The starting score goes in as a feed's would, with the production's own data key.
  const key = await page.evaluate(async (showId) => {
    const { productionDataKey, patchProductionData } = await __noacgImport('/src/control/productionDataApi.ts');
    const key = await productionDataKey(showId);
    if (key) await patchProductionData(key, { match: { home: { score: 2 } } });
    return key;
  }, showId);
  expect(key, 'publishing must mint a data key').toBeTruthy();
  const serverScore = () =>
    page.evaluate(async (key) => {
      const { fetchProductionData } = await __noacgImport('/src/control/productionDataApi.ts');
      const state = await fetchProductionData(key);
      return Number((state?.data as { match?: { home?: { score?: unknown } } } | undefined)?.match?.home?.score);
    }, key as string);

  // The page re-reads the tree when the feed's row comes round the log. Taken before that, the
  // Take would carry the tree it held, which is a different race from the one walked here.
  await expect(page.getByTestId('cue-bound-f1').locator('input')).toHaveValue('2', { timeout: 20_000 });
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('on air:');
  const program = page.frameLocator('[data-testid="program-stage"] iframe').first();
  await expect(program.locator('#f1')).toHaveText('2', { timeout: 20_000 });

  return { serverScore, program, events: await holdFirstEvent(page), showId };
}

/** THE HOLD on one page's event sends. */
async function holdFirstEvent(page: Page) {
  // THE HOLD: the first event request waits until the walk lets it go (`events.release`), or
  // HOLD_MS at most; the ones after it go straight through. Counted, so a walk can say the next
  // press really landed while the first was out.
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const events = { seen: 0, inFlight: 0, release };
  await page.route('**/rest/v1/rpc/control_send_seq', async (route) => {
    const body = route.request().postDataJSON() as { p_items?: { msg?: { t?: string } }[] } | null;
    if (!(body?.p_items ?? []).some((item) => item.msg?.t === 'event')) return route.continue();
    events.seen += 1;
    if (events.seen > 1) return route.continue();
    events.inFlight += 1;
    await Promise.race([released, new Promise((resolve) => setTimeout(resolve, HOLD_MS))]);
    events.inFlight -= 1;
    await route.continue().catch(() => {});
  });
  return events;
}

test('two Goal presses inside one round trip move the bound score by two', async ({ page }) => {
  test.setTimeout(240_000);
  const { serverScore, program, events } = await scoreOnAir(page, 'Adjust race');

  const goal = page.getByTestId('cue-action-goalA');
  await goal.click();
  await expect.poll(() => events.seen, { message: 'the first Goal reached the wire', intervals: [20] }).toBe(1);
  expect(events.inFlight, 'the first event is still on its way').toBe(1);
  await goal.click();
  expect(events.inFlight, 'the second Goal was pressed inside the first one round trip').toBe(1);
  events.release();

  // Both events go (one send in flight per graphic, so the second follows the first).
  await expect.poll(() => events.seen, { timeout: 10_000 }).toBe(2);
  // Two goals: the shared figure moves by two, on the server and on air.
  await expect.poll(serverScore, { timeout: 20_000, message: 'the server tree after two Goal presses' }).toBe(4);
  await expect(program.locator('#f1')).toHaveText('4', { timeout: 20_000 });
});

test('a Goal and a + on the same bound score inside one round trip both count', async ({ page }) => {
  test.setTimeout(240_000);
  const { serverScore, program, events } = await scoreOnAir(page, 'Adjust and bump');

  await page.getByTestId('cue-action-goalA').click();
  await expect.poll(() => events.seen, { message: 'the Goal reached the wire', intervals: [20] }).toBe(1);
  expect(events.inFlight, 'the Goal event is still on its way').toBe(1);
  // The ± stepper moves the same shared value with no event of its own.
  await page.getByTestId('live-number-f1-up').click();
  expect(events.inFlight, 'the + was pressed inside the Goal round trip').toBe(1);
  events.release();

  await expect.poll(serverScore, { timeout: 20_000, message: 'the server tree after a Goal and a +' }).toBe(4);
  await expect(program.locator('#f1')).toHaveText('4', { timeout: 20_000 });
});

test('on a second production page, one Goal moves the bound score by one and two inside one round trip by two', async ({ page }) => {
  test.setTimeout(240_000);
  const { serverScore, showId } = await scoreOnAir(page, 'Second page adjust race');

  // Another operator's screen on the same production: it holds the score only as the server's
  // follow brought it in, never from a press of its own.
  const op = await openSecondProductionPage(page, showId);
  try {
    await op.getByTestId('cue-list').locator('.pd-cue').first().getByTestId('select-cue').click();
    await expect(op.getByTestId('cue-bound-f1').locator('input')).toHaveValue('2', { timeout: 20_000 });
    const goal = op.getByTestId('cue-action-goalA');
    await expect(goal).toBeEnabled({ timeout: 20_000 });

    // ONE GOAL, nothing held: the score moves by exactly one.
    await goal.click();
    await expect.poll(serverScore, { timeout: 20_000, message: 'the server tree after one Goal' }).toBe(3);
    await expect(op.getByTestId('cue-bound-f1').locator('input')).toHaveValue('3', { timeout: 20_000 });

    // TWO GOALS, the second pressed while the first event is held on its way.
    const events = await holdFirstEvent(op);
    await goal.click();
    await expect.poll(() => events.seen, { message: 'the first Goal reached the wire', intervals: [20] }).toBe(1);
    expect(events.inFlight, 'the first event is still on its way').toBe(1);
    await goal.click();
    expect(events.inFlight, 'the second Goal was pressed inside the first one round trip').toBe(1);
    events.release();

    await expect.poll(() => events.seen, { timeout: 10_000 }).toBe(2);
    await expect.poll(serverScore, { timeout: 20_000, message: 'the server tree after two more Goals' }).toBe(5);
    // And no point is doubled once everything has settled (a late answer, a re-read of the tree).
    await expect(op.getByTestId('cue-bound-f1').locator('input')).toHaveValue('5', { timeout: 20_000 });
    expect(await serverScore()).toBe(5);
  } finally {
    await op.unrouteAll({ behavior: 'ignoreErrors' });
    await op.close();
  }
});

/** The control slug of a production this page published. */
const controlSlug = (page: Page, showId: string) =>
  page.evaluate(async (id) => (await __noacgImport('/src/model/shows.ts')).loadShows().find((s) => s.id === id)?.hostedSlug ?? '', showId);

test('Goal presses through calls that fail or lose their answer each land exactly once, and the page counts them meanwhile (#2617)', async ({ page }) => {
  test.setTimeout(240_000);
  const { serverScore, program, events } = await scoreOnAir(page, 'Presses resent');
  events.release();
  // The first call never reaches the server; the second commits and its answer is lost; the rest go.
  let calls = 0;
  await page.route('**/rest/v1/rpc/control_data_adjust_by_slug', async (route) => {
    calls += 1;
    if (calls === 1) return route.abort('timedout');
    if (calls === 2) {
      await route.fetch().catch(() => undefined);
      return route.abort('timedout');
    }
    return route.continue();
  });
  const goal = page.getByTestId('cue-action-goalA');
  for (let i = 0; i < 3; i++) await goal.click();
  await expect(page.getByTestId('program-air')).toContainText(/press(es)? unsent/, { timeout: 10_000 });
  await expect.poll(serverScore, { timeout: 30_000, message: 'three goals on 2, none lost and none twice' }).toBe(5);
  await expect(page.getByTestId('program-air')).not.toContainText('unsent', { timeout: 30_000 });
  expect(calls, 'a lost answer was sent again').toBeGreaterThanOrEqual(3);
  await expect(program.locator('#f1')).toHaveText('5', { timeout: 20_000 });
  expect(await serverScore()).toBe(5);
});

for (const paused of [false, true]) {
  test(`a Take or Update whose row lands after a +1's update row still airs the stored figure${paused ? ', with the data feed paused' : ''} (#2617 R5a)`, async ({ page }) => {
    test.setTimeout(240_000);
    const { serverScore, events, showId } = await scoreOnAir(page, `Take after a press${paused ? ' paused' : ''}`);
    events.release();
    const slug = await controlSlug(page, showId);
    expect(slug).toBeTruthy();
    if (paused) {
      await page.evaluate(async (slug) => (await __noacgImport('/src/control/productionDataApi.ts')).setAnotherSystemPaused(slug, true), slug);
    }
    // Hold the next send of the bound field (an update carrying data) until the walk lets it go.
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let held = 0;
    let holding = false;
    let heldFigure: string | undefined;
    await page.route('**/rest/v1/rpc/control_send_seq', async (route) => {
      const body = route.request().postDataJSON() as { p_items?: { msg?: { t?: string; data?: Record<string, string> } }[] } | null;
      const bound = (body?.p_items ?? []).find((item) => item.msg?.t === 'update' && item.msg.data?.f1 !== undefined);
      if (!bound || held > 0) return route.continue();
      held += 1;
      heldFigure = bound.msg?.data?.f1;
      // Under the page's 1.5 s attempt deadline, so the held send is never cut and resent.
      holding = true;
      await Promise.race([released, new Promise((resolve) => setTimeout(resolve, HOLD_MS))]);
      holding = false;
      await route.continue().catch(() => {});
    });
    // The bound rows on the log, in seq order: what air ends on is the last.
    const boundRows = () =>
      page.evaluate(async (slug) => {
        const sb = await (await __noacgImport('/src/backend/supabase.ts')).getSupabase();
        const { data } = await sb!.rpc('control_tail_seq', { p_slug: slug, p_after: 0, p_epoch: null });
        return ((data as { rows?: { seq: number; msg: { t: string; data?: Record<string, string> } }[] } | null)?.rows ?? [])
          .filter((r) => r.msg.t === 'update' && r.msg.data?.f1 !== undefined)
          .sort((a, b) => a.seq - b.seq)
          .map((r) => r.msg.data!.f1);
      }, slug);
    const before = (await boundRows()).length;
    // ✎ Update re-sends the live cue's values, the bound one overlaid from the page's tree (2).
    await page.getByTestId('verb-update').click();
    await expect.poll(() => held, { message: 'the Update is held' }).toBe(1);
    expect(heldFigure, 'it carries the page\'s figure, 2').toBe('2');
    // Another operator's +1 lands while it is out (this page's own + would wait for its own send):
    // its update row (3) is numbered first.
    await page.evaluate(async (slug) => {
      const { adjustProductionDataBySlug } = await __noacgImport('/src/control/productionDataApi.ts');
      await adjustProductionDataBySlug(slug, [{ id: crypto.randomUUID(), path: 'match.home.score', by: 1 }]);
    }, slug);
    expect(holding, 'the +1 landed while the Update was still held').toBe(true);
    expect(await serverScore()).toBe(3);
    release();
    // The held send's row (still 2) lands after the +1's; the server follows it with the stored 3.
    await expect.poll(async () => (await boundRows()).length >= before + 2, { timeout: 20_000, message: 'the +1\'s row, then the held send\'s' }).toBe(true);
    expect((await boundRows()).at(-1), 'the last bound row on the log, which air ends on').toBe('3');
  });
}

test('this page\'s PROGRAM ends on the stored figure when its own Update carried an older one (#2617 R5a)', async ({ page }) => {
  test.setTimeout(240_000);
  const { program, events, showId } = await scoreOnAir(page, 'Program after a press');
  events.release();
  const slug = await controlSlug(page, showId);
  // This page's reads of the tree are held, so its tree stays at 2 while the stored score moves.
  let releaseReads!: () => void;
  const readsHeld = new Promise<void>((resolve) => (releaseReads = resolve));
  await page.route('**/api/data/state', async (route) => {
    await readsHeld;
    await route.continue().catch(() => {});
  });
  let sentFigure: string | undefined;
  let releaseSend!: () => void;
  const sendHeld = new Promise<void>((resolve) => (releaseSend = resolve));
  await page.route('**/rest/v1/rpc/control_send_seq', async (route) => {
    const body = route.request().postDataJSON() as { p_items?: { msg?: { t?: string; data?: Record<string, string> } }[] } | null;
    const bound = (body?.p_items ?? []).find((item) => item.msg?.t === 'update' && item.msg.data?.f1 !== undefined);
    if (bound && sentFigure === undefined) {
      sentFigure = bound.msg?.data?.f1;
      // Under the page's 1.5 s attempt deadline, so it is never cut and resent.
      await Promise.race([sendHeld, new Promise((resolve) => setTimeout(resolve, HOLD_MS))]);
    }
    await route.continue().catch(() => {});
  });
  try {
    // Another operator's +1: stored 3, and its update row brings PROGRAM to 3.
    const stored = await page.evaluate(async (slug) => {
      const { adjustProductionDataBySlug } = await __noacgImport('/src/control/productionDataApi.ts');
      const answer = await adjustProductionDataBySlug(slug, [{ id: crypto.randomUUID(), path: 'match.home.score', by: 1 }]);
      return (answer.data as { match?: { home?: { score?: unknown } } }).match?.home?.score;
    }, slug);
    expect(stored).toBe(3);
    await expect(program.locator('#f1')).toHaveText('3', { timeout: 20_000 });
    // ✎ Update from a tree that still says 2: PROGRAM shows its own 2 at the press ...
    await page.getByTestId('verb-update').click();
    await expect.poll(() => sentFigure, { message: 'the Update carried the page\'s figure' }).toBe('2');
    await expect(program.locator('#f1')).toHaveText('2', { timeout: HOLD_MS });
    releaseSend();
    // ... and ends on the stored 3, which the server put after it on the log.
    await expect(program.locator('#f1')).toHaveText('3', { timeout: 20_000 });
  } finally {
    releaseReads();
  }
});
