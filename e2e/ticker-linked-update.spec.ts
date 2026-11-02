// covers: src/templates/tickers/tickerMotion.ts, src/templates/tickers/shared.ts
// covers: src/templates/tickers/tk01.ts, src/templates/tickers/tk03.ts
// covers: src/control/sheetSource.ts, e2e/fixtures/jev-sheet-server.mjs
//
// NATIVE TICKER CONTINUITY UNDER A LINKED SHEET (jev-svg-import row 25, AC-24). Test-only
// qualification of the existing ticker renderer: nothing in the ticker source is changed here.
//
// A native ticker on the production page follows a Sheet through the shared source bindings (the
// lines adapter into f0), read from a local fake of the export (e2e/fixtures/jev-sheet-server.mjs).
// A recorder in the program monitor samples the strip on every animation frame (time, the
// track's x, its one-set width, the items and which are showing), and the samples are judged here:
//
//  - MARQUEE (News Strip, tk01): messages replaced, reordered and deleted while moving, a
//    speed-only change, empty then filled again, Pause then Resume, and the page reopened (it
//    catches up with the Sheet before anything airs, since an unpublished production's air ends
//    with its page, and the next Take airs the newest lines). The
//    strip is never blank for a nonempty list, it never skips ahead faster than its pace, and it
//    moves back only by whole set widths (the seamless loop point, and the handover onto the new
//    track at the same offset into a set). The speed change keeps the items' nodes and changes
//    the pace from that frame. Empty clears the strip on purpose. No entrance is replayed
//    (`data-plays` stays 1).
//  - FLIP (Glass Flip, tk03): the story on screen when an edit lands keeps its whole turn, and the
//    new list starts at that item boundary; the gap between two stories after an edit is no longer
//    than the flip's own gap before it; a story never shows twice in a row; empty clears and the
//    filled list comes back without a Take; a speed-only change keeps the story on screen and
//    shortens the turns after it.
//
// A drawn (imported SVG) ticker gets no motion compiler here: moving imported artwork stays a
// stated limit of the import (docs/work-specs/jev-svg-import/spec.md, "Goal and boundaries").

import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from './_create';
import { settleDurableWrites } from './_durable';
import { startSheetServer } from './fixtures/jev-sheet-server.mjs';

type Server = Awaited<ReturnType<typeof startSheetServer>>;
interface Sample { t: number; x: number; width: number; n: number; texts: string[]; showing: string[]; mark: boolean }

const lines = (...items: string[]) => items.map((i) => `${i}\n`).join('');

/** A native ticker on a production, its f0 connected to the fake Sheet, taken to air. */
async function linkedTicker(page: Page, server: Server, sheet: string, design: string, first: string) {
  server.set(sheet, first);
  await page.context().route(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/export/, server.routeTo());
  await bootstrapGraphic(page, { name: design });
  await openProductionWithCurrent(page, `${design} linked ${Date.now()}`);
  await page.getByTestId('cue-connect').click();
  const review = page.getByTestId('cue-connect-menu');
  await review.getByTestId('cue-connect-link').fill(`https://docs.google.com/spreadsheets/d/${sheet}/edit#gid=0`);
  await review.getByTestId('cue-connect-read').click();
  await expect(review.getByTestId('cue-connect-row-f0')).toHaveAttribute('data-status', 'key');
  await review.getByTestId('cue-connect-confirm').click();
  await expect(page.getByTestId('sources-line')).toContainText('checked');
  await settleDurableWrites(page);
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(air.locator('#ticker-track .ticker-item').first()).toBeAttached();
  return air;
}

/**
 * Record the strip on every frame from now on (once per document), and answer the frame clock's
 * time now: `samples(air, since)` reads the frames after it. `mark` says whether the first item
 * node is one `markFirstItem` tagged, so a re-render of the items shows.
 */
async function record(air: FrameLocator): Promise<number> {
  return air.locator('#ticker-track').evaluate((track) => {
    const w = window as unknown as { gsap: { getProperty(t: Element, p: string): number }; __rec: Sample[]; __recOn: boolean };
    if (w.__recOn) return performance.now();
    w.__recOn = true;
    w.__rec = [];
    const frame = () => {
      const items = Array.from(track.querySelectorAll('.ticker-item')) as HTMLElement[];
      w.__rec.push({
        t: performance.now(),
        x: Number(w.gsap.getProperty(track, 'x')) || 0,
        width: track.scrollWidth / 2,
        n: items.length,
        texts: items.map((i) => (i.textContent ?? '').trim()),
        showing: items.filter((i) => Number(getComputedStyle(i).opacity) > 0.5).map((i) => (i.textContent ?? '').trim()),
        mark: !!(items[0] as unknown as { __mark?: boolean })?.__mark,
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return performance.now();
  });
}

const samples = (air: FrameLocator, since = 0) =>
  air.locator('body').evaluate((_, from) => (window as unknown as { __rec: Sample[] }).__rec.filter((s) => s.t >= from), since);
const markFirstItem = (air: FrameLocator) => air.locator('#ticker-track .ticker-item').first().evaluate((el) => { (el as unknown as { __mark: boolean }).__mark = true; });
const plays = (page: Page) => page.getByTestId('program-stage').getAttribute('data-plays');

/** Wait until the strip's items are exactly `want` (a marquee renders its set twice). */
async function itemsBecome(air: FrameLocator, want: string[], message: string) {
  await expect.poll(async () => {
    const texts = await air.locator('#ticker-track .ticker-item').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
    return [...new Set(texts)].sort().join(' | ');
  }, { timeout: 20_000, message }).toBe([...want].sort().join(' | '));
}

/**
 * The marquee rule over a run of frames: never blank while it holds items, never ahead of its pace,
 * and back only by whole set widths. `pace` is the fastest pace (px/s) it may run in the window.
 */
function judgeMarquee(run: Sample[], pace: number, what: string) {
  expect(run.length, `${what}: frames were recorded`).toBeGreaterThan(30);
  for (let i = 1; i < run.length; i++) {
    const a = run[i - 1], b = run[i];
    expect(b.n, `${what}: the strip is never blank (frame ${i})`).toBeGreaterThan(0);
    const dx = b.x - a.x, dt = (b.t - a.t) / 1000;
    if (dx <= 0) {
      expect(-dx, `${what}: never ahead of its pace (frame ${i}, ${dx.toFixed(1)} px in ${dt.toFixed(3)} s)`).toBeLessThanOrEqual(pace * dt * 1.25 + 2);
    } else {
      // A move back is the loop point, or the handover onto the new track at the same offset.
      const sets = dx / b.width;
      expect(Math.abs(sets - Math.round(sets)) * b.width, `${what}: back only by whole set widths (frame ${i}, ${dx.toFixed(1)} px, set ${b.width})`).toBeLessThan(pace * dt * 1.25 + 3);
      expect(Math.round(sets), `${what}: a move back is at least one set`).toBeGreaterThanOrEqual(1);
    }
  }
  const moved = run.at(-1)!.t - run[0].t;
  const travelled = run.slice(1).reduce((sum, s, i) => sum + Math.max(0, run[i].x - s.x), 0);
  expect(travelled / (moved / 1000), `${what}: it kept moving`).toBeGreaterThan(pace * 0.3);
}

/** Average leftward pace (px/s) over frames, wraps left out. */
function paceOf(run: Sample[]) {
  let px = 0, s = 0;
  for (let i = 1; i < run.length; i++) {
    const dx = run[i].x - run[i - 1].x;
    if (dx < 0) { px += -dx; s += (run[i].t - run[i - 1].t) / 1000; }
  }
  return px / s;
}

let server: Server;
test.beforeEach(async () => { server = await startSheetServer(); });
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.context().unrouteAll({ behavior: 'ignoreErrors' });
  await server.close();
});

const PACE = 140; // tk01's authored px/s at 100%

test('a linked marquee keeps moving through replace, reorder and delete, a speed-only change, and empty then filled again, with no entrance replayed', async ({ page }) => {
  test.setTimeout(120_000);
  const SHEET = '1NoaCGMarqueeLinked000000';
  const air = await linkedTicker(page, server, SHEET, 'News Strip', lines('Polls close at 20:00', 'Turnout 61%', 'Results from 22:00'));
  await expect(page.getByTestId('program-stage')).toHaveAttribute('data-plays', '1');
  await record(air);

  // REPLACE, REORDER, DELETE while moving: each lands on the running strip.
  const steps: [string, string[]][] = [
    ['replace', ['Polls close at 20:00', 'Turnout 64%', 'Results from 22:00']],
    ['reorder', ['Results from 22:00', 'Polls close at 20:00', 'Turnout 64%']],
    ['delete', ['Results from 22:00', 'Turnout 64%']],
  ];
  for (const [what, items] of steps) {
    const from = await record(air);
    server.set(SHEET, lines(...items));
    await itemsBecome(air, items, `${what} reached the strip`);
    await page.waitForTimeout(1500);
    judgeMarquee(await samples(air, from), PACE, what);
    expect(await plays(page), `${what}: no entrance replayed`).toBe('1');
  }

  // SPEED ONLY: the operator's Scroll speed to 200%, through Update. The items are not rendered
  // again (the marked node stays) and the pace doubles from that frame, without a jump.
  await page.waitForTimeout(1000);
  await markFirstItem(air);
  const marked = await record(air);
  await page.waitForTimeout(1500);
  const slow = await samples(air, marked);
  await page.getByTestId('cue-field-f2').fill('200');
  await page.getByTestId('verb-update').click();
  await expect.poll(async () => paceOf((await samples(air)).slice(-30)), { timeout: 10_000, message: 'the pace changed' }).toBeGreaterThan(PACE * 1.6);
  await page.waitForTimeout(1500);
  const all = await samples(air, marked);
  judgeMarquee(all, PACE * 2, 'speed only');
  expect(all.every((s) => s.mark), 'speed only: the items were not rendered again').toBe(true);
  const fast = all.slice(-40);
  expect(paceOf(fast) / paceOf(slow), 'the pace doubled').toBeGreaterThan(1.8);
  expect(paceOf(fast) / paceOf(slow)).toBeLessThan(2.2);
  expect(await plays(page)).toBe('1');

  // EMPTY clears the strip on purpose; FILLED AGAIN it moves without a Take.
  server.set(SHEET, '');
  await expect(air.locator('#ticker-track .ticker-item')).toHaveCount(0, { timeout: 20_000 });
  server.set(SHEET, lines('Back on air', 'Turnout 66%'));
  await itemsBecome(air, ['Back on air', 'Turnout 66%'], 'filled again');
  await page.waitForTimeout(500);
  const refilled = await record(air);
  await page.waitForTimeout(1500);
  judgeMarquee(await samples(air, refilled), PACE * 2, 'filled again');
  expect(await plays(page), 'filled again without a Take').toBe('1');
});

test('a linked marquee holds through Pause, takes the newest lines on Resume, and a reopened page catches up and carries on updating without a replay', async ({ page }) => {
  test.setTimeout(120_000);
  const SHEET = '1NoaCGMarqueeReopen000000';
  const air = await linkedTicker(page, server, SHEET, 'News Strip', lines('Polls close at 20:00', 'Turnout 61%'));

  // PAUSE: a change waits; RESUME (the reader reconnecting) reaches the running strip.
  await page.getByTestId('source-pause').click();
  await expect(page.getByTestId('sources-line')).toContainText('paused');
  server.set(SHEET, lines('Turnout 63%', 'Polls close at 20:00'));
  await page.waitForTimeout(6000);
  await itemsBecome(air, ['Polls close at 20:00', 'Turnout 61%'], 'paused: nothing read');
  const resumed = await record(air);
  await page.getByTestId('source-pause').click();
  await itemsBecome(air, ['Turnout 63%', 'Polls close at 20:00'], 'resumed');
  await page.waitForTimeout(1500);
  judgeMarquee(await samples(air, resumed), PACE, 'resume');
  expect(await plays(page)).toBe('1');

  // REOPEN: the page closed (an unpublished production's air is this page's own, so it ends with
  // the page), the Sheet changed meanwhile. Opened again, the reader reconnects and catches up
  // before anything airs; the Take airs the newest lines once, and a change after that reaches the
  // running strip without another entrance.
  const url = page.url();
  await page.goto('about:blank');
  server.set(SHEET, lines('Results from 22:00', 'Turnout 63%'));
  await page.goto(url);
  await expect(page.getByTestId('sources-line')).toContainText('checked', { timeout: 20_000 });
  await expect(page.getByTestId('program-stage')).toContainText('Nothing on air');
  await itemsBecome(page.frameLocator('[data-testid="production-preview"] iframe'), ['Results from 22:00', 'Turnout 63%'], 'the reopened page caught up');
  await page.getByTestId('verb-take').click();
  const again = page.frameLocator('[data-testid="program-stage"] iframe');
  await itemsBecome(again, ['Results from 22:00', 'Turnout 63%'], 'the reopened page airs the newest lines');
  await expect(page.getByTestId('program-stage')).toHaveAttribute('data-plays', '1');
  await page.waitForTimeout(500);
  const changed = await record(again);
  server.set(SHEET, lines('Results from 22:00', 'Turnout 63%', 'Polls close at 20:00'));
  await itemsBecome(again, ['Results from 22:00', 'Turnout 63%', 'Polls close at 20:00'], 'reopened page reads');
  await page.waitForTimeout(1500);
  judgeMarquee(await samples(again, changed), PACE, 'reopened');
  expect(await plays(page), 'no entrance replayed after reopening').toBe('1');
});

// ── Flip ─────────────────────────────────────────────────────────────────────────────────

/** Each run of frames one story is showing: its text, first and last frame time. */
function turns(run: Sample[]) {
  const out: { text: string; from: number; to: number }[] = [];
  for (const s of run) {
    const text = s.showing.length === 1 ? s.showing[0] : s.showing.length === 0 ? null : '<two>';
    const last = out.at(-1);
    if (text === null) continue;
    if (last && last.text === text && s.t - last.to < 120) last.to = s.t;
    else out.push({ text, from: s.t, to: s.t });
  }
  return out;
}

/** The longest stretch with no story showing, in ms. */
function longestBlank(run: Sample[]) {
  let worst = 0, since: number | null = null;
  for (const s of run) {
    if (s.showing.length === 0) since ??= s.t;
    else if (since !== null) { worst = Math.max(worst, s.t - since); since = null; }
  }
  return worst;
}

test('a linked flip hands over at its item boundary: the story on screen keeps its turn, no blank or repeat, empty clears, speed shortens the turns after it', async ({ page }) => {
  test.setTimeout(120_000);
  const SHEET = '1NoaCGFlipLinked000000000';
  const first = ['Story one', 'Story two', 'Story three'];
  const air = await linkedTicker(page, server, SHEET, 'Glass Flip', lines(...first));
  await expect(page.getByTestId('program-stage')).toHaveAttribute('data-plays', '1');
  await record(air);
  // Two whole turns as the flip runs untouched: its own turn length and gap between stories.
  await expect.poll(async () => turns(await samples(air)).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
  const before = await samples(air);
  const settled = turns(before).slice(1, -1);
  const turnMs = settled[0].to - settled[0].from;
  expect(turnMs, 'a story shows for its 0.4 s flip and 3.2 s hold').toBeGreaterThan(3200);
  const ownGap = longestBlank(before.filter((s) => s.t > settled[0].from));

  // REPLACE, REORDER, DELETE: each lands mid-turn; the story on screen keeps the rest of its turn.
  const steps: [string, string[]][] = [
    ['replace', ['Story two', 'Story four', 'Story five']],
    ['reorder', ['Story five', 'Story two', 'Story four']],
    ['delete', ['Story five', 'Story four']],
  ];
  let previous = first;
  for (const [what, items] of steps) {
    const from = await record(air);
    server.set(SHEET, lines(...items));
    // The edit has landed when the track holds the new items (plus the one finishing its turn).
    await expect.poll(async () => {
      const run = await samples(air);
      return items.every((i) => run.at(-1)!.texts.includes(i)) && run.at(-1)!.texts.length <= items.length + 1;
    }, { timeout: 20_000, message: `${what} reached the strip` }).toBe(true);
    const landed = (await samples(air)).at(-1)!.t;
    await page.waitForTimeout(turnMs * 1.6);
    // The whole history, so a turn already under way when this step began is seen from its start.
    const history = await samples(air);
    const run = history.filter((s) => s.t >= from);
    const seen = turns(run);
    // The story on screen when the edit landed: it shows on until its own turn's end.
    const onScreen = turns(history).find((x) => x.from <= landed && x.to >= landed);
    if (onScreen) {
      expect(onScreen.to - onScreen.from, `${what}: the story on screen kept its turn`).toBeGreaterThan(turnMs - 120);
    }
    let after = seen.filter((x) => x.from > landed);
    // A story still flipping in when the edit landed had begun its turn: it plays the whole turn
    // and the new list starts after it.
    if (after[0] && !items.includes(after[0].text)) {
      expect(previous, `${what}: a story finishing its turn is from the list before`).toContain(after[0].text);
      expect(after[0].to - after[0].from, `${what}: and keeps its whole turn`).toBeGreaterThan(turnMs - 120);
      after = after.slice(1);
    }
    expect(after.length, `${what}: the new list started at the boundary`).toBeGreaterThan(0);
    expect(items, `${what}: what came next is the new list`).toContain(after[0].text);
    for (let i = 1; i < seen.length; i++) expect(seen[i].text, `${what}: no story twice in a row`).not.toBe(seen[i - 1].text);
    expect(seen.some((x) => x.text === '<two>'), `${what}: never two stories at once`).toBe(false);
    expect(longestBlank(run), `${what}: no blank longer than the flip's own`).toBeLessThanOrEqual(ownGap + 120);
    expect(await plays(page), `${what}: no entrance replayed`).toBe('1');
    previous = items;
  }

  // EMPTY clears on purpose; FILLED AGAIN the stories come back without a Take.
  server.set(SHEET, '');
  await expect(air.locator('#ticker-track .ticker-item')).toHaveCount(0, { timeout: 20_000 });
  server.set(SHEET, lines('Story six', 'Story seven'));
  await expect.poll(async () => turns(await samples(air)).map((x) => x.text), { timeout: 20_000, message: 'filled again' }).toContain('Story six');
  expect(await plays(page), 'filled again without a Take').toBe('1');

  // SPEED ONLY: Item speed to 200% through Update. The story on screen stays (its node is not
  // rendered again) and the turns after it are about half as long.
  await expect.poll(async () => turns(await samples(air)).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  await markFirstItem(air);
  const pressed = await record(air);
  await page.getByTestId('cue-field-f2').fill('200');
  await page.getByTestId('verb-update').click();
  await page.waitForTimeout(turnMs * 1.8);
  const run = await samples(air, pressed);
  expect(run.every((s) => s.mark), 'speed only: the items were not rendered again').toBe(true);
  const quick = turns(run).slice(1, -1);
  expect(quick.length, 'whole turns after the speed change').toBeGreaterThan(0);
  for (const x of quick) expect(x.to - x.from, 'a turn at 200% is about half').toBeLessThan(turnMs * 0.65);
  expect(longestBlank(run), 'no blank longer than the flip’s own').toBeLessThanOrEqual(ownGap + 120);
  expect(await plays(page)).toBe('1');
});
