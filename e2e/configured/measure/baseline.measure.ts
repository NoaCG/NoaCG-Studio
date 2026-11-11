import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';
import { fakeBridge, seedSettings } from '../../_fakeBridge';
import { readyOf } from '../_helpers';
import { answerPanel, pairPanel } from '../_panel';
import { buildFixture, cleanUp, outputSlugOf } from './_fixture';
import {
  FIXTURE, FRAME_LOADS, NET, SAMPLES, clearLpm, framePlays, instrument, meterBytes, nowOn, readLpm, screencast, summary, throttle, writeResult,
  type Lpm, type Sent,
} from './_measure';

// THE LIVE-PUBLISHING BASELINE (docs/work-specs/live-publishing/spec.md, phase 2): today's code,
// measured, no product change. One test per group, so each fits one queued browser job:
//
//   takes-a   graphic cue, folder, picture and server cue Takes: press to sent, the page's own share
//   takes-b   quick button (Goal), +1, Next and a scripted hardware-panel Take
//   render    sent to render dispatch to first seen, on one output
//   publish   press to sent while a publish is running
//   bytes     bytes and time per cue edit, graphic add and design update, until the output holds it
//   boot      output start from a cold cache, and each graphic's own load
//
// MEASURE_FIXTURE (typical|large), MEASURE_NET (fast|slow) and MEASURE_SAMPLES (default 50) choose
// the case. The words are the spec's: "press" is the pointer or key event's own timestamp (or, for
// the panel, the moment the module's request leaves this machine), "sent" the moment the page calls
// fetch for the send (`control_send_seq`, or the Bridge's `/act` for a server cue). Every button
// here acts on `click` (its pointer release), so a clicked press is stamped at the click event;
// a person's own pointer-down to release adds to that, and is not the page's work.

test.skip(!process.env.E2E_EMAIL, 'configured measurement: needs the local stack and its account');

const tag = `${FIXTURE}-${NET}`;

// A run that leaves its production behind makes the next sign-in pull it down again.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await cleanUp(page);
});
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[measure ${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

/** The kept ordering waits of W1, as a trace shows them: requests running inside press..sent. */
function attribute(lpm: Lpm, press: number, sent: Sent) {
  const inside = lpm.sends.filter((s) => s !== sent && s.t < sent.t && (s.end ?? Infinity) > press);
  const overlap = (s: Sent) => Math.max(0, Math.min(s.end ?? sent.t, sent.t) - Math.max(s.t, press));
  const kept = {
    // One send in flight per graphic: an earlier send still running when the press came.
    inflight: inside.filter((s) => /control_send_seq|control_send_many/.test(s.name) && s.t < press),
    // Road discovery: the slug's resolve inside the window.
    road: inside.filter((s) => /control_show_by_slug|control_output_by_slug/.test(s.name)),
    // A folder's own Outs (or any earlier send of this press) before its Take.
    ordered: inside.filter((s) => /control_send_seq|control_send_many/.test(s.name) && s.t >= press),
  };
  const keptMs = Math.max(0, ...[...kept.inflight, ...kept.road, ...kept.ordered].map(overlap));
  const total = sent.t - press;
  return {
    total,
    kinds: sent.kinds,
    own: total - keptMs,
    keptMs,
    kept: { inflight: kept.inflight.length > 0, road: kept.road.length > 0, ordered: kept.ordered.length > 0 },
    others: inside.filter((s) => !/control_send_seq|control_send_many|control_show_by_slug|control_output_by_slug/.test(s.name)).map((s) => s.name),
  };
}

const row = (op: Page, label: string): Locator =>
  op.locator('.pd-cue').filter({ has: op.locator('.pd-cue-label > strong', { hasText: new RegExp(`^${label}$`) }) });

async function select(op: Page, label: string) {
  log('select', label);
  await row(op, label).getByTestId('select-cue').click();
  await expect(op.locator('.pd-cue.selected .pd-cue-label > strong')).toHaveText(label);
}

/** Wait until every request the page started has answered and nothing new started for `quietMs`. */
async function settle(op: Page, quietMs = 250, timeout = 20_000, only?: RegExp) {
  const end = Date.now() + timeout;
  let last = -1, since = Date.now();
  for (;;) {
    const lpm = await readLpm(op);
    const sends = only ? lpm.sends.filter((s) => only.test(s.name)) : lpm.sends;
    const open = sends.filter((s) => s.end === undefined).length;
    if (sends.length !== last || open > 0) { last = sends.length; since = Date.now(); }
    else if (Date.now() - since >= quietMs) return;
    if (Date.now() > end) return;
    await op.waitForTimeout(40);
  }
}

/** The first matching send that started at or after `after`, waited for. */
/** The first matching send that started at or after `after` and belongs to a NEW press: a command
 *  send whose sender id was already seen (`seen`, an earlier press or its resend) is not it. */
async function sentAfter(op: Page, after: number, match: RegExp, timeout = 15_000, seen: Set<string> = new Set()): Promise<{ lpm: Lpm; sent: Sent } | null> {
  const end = Date.now() + timeout;
  for (;;) {
    const lpm = await readLpm(op);
    const sent = lpm.sends.find((s) => s.t >= after && match.test(s.name) && !(s.sid && seen.has(s.sid)));
    if (sent) return { lpm, sent };
    if (Date.now() > end) return null;
    await op.waitForTimeout(15);
  }
}

const pressOf = (lpm: Lpm, target: string) => [...lpm.presses].reverse().find((p) => p.kind === 'click' && p.target === target)?.t ?? null;

type Sample = { total: number; own: number; keptMs: number; kept: Record<string, boolean>; others: string[]; kinds?: string[] } | { failed: string };

/** One clicked press, measured: click `button`, find its send. */
/** Sender ids the page has already used: a send carrying one of them answers an earlier press. */
const sidsOf = (lpm: Lpm) => new Set(lpm.allSids ?? []);

async function pressAndMeasure(op: Page, button: Locator, testId: string, match: RegExp): Promise<Sample> {
  const seen = sidsOf(await readLpm(op));
  const before = await nowOn(op);
  await button.click();
  const got = await sentAfter(op, before, match, 15_000, seen);
  if (!got) return { failed: `no ${match} after ${testId}` };
  const press = pressOf(got.lpm, testId);
  if (press === null) return { failed: `no press stamp for ${testId}` };
  return attribute(got.lpm, press, got.sent);
}

/** Two clicks, the second as soon as the first press is sent; the second is measured. */
async function secondOfTwo(op: Page, button: Locator, testId: string, match: RegExp): Promise<Sample> {
  const before = await nowOn(op);
  await button.click();
  const first = await sentAfter(op, before, match, 15_000, sidsOf(await readLpm(op)));
  if (!first) return { failed: `no first ${match}` };
  // Every send so far, the first press's included, belongs to an earlier press.
  const seen = sidsOf(await readLpm(op));
  const mid = await nowOn(op);
  await button.click();
  const got = await sentAfter(op, Math.max(mid, first.sent.t + 0.01), match, 15_000, seen);
  if (!got) return { failed: `no second ${match} after ${testId}` };
  const press = pressOf(got.lpm, testId);
  if (press === null) return { failed: `no press stamp for ${testId}` };
  return attribute(got.lpm, press, got.sent);
}

/** Instrument the production page. Its network is throttled only once the fixture is built
 *  (`throttle` after `buildFixture`): signing in and building are set-up, not timings. */
async function opPage(page: Page, _net: typeof NET) {
  await instrument(page.context());
}

async function openOutput(browser: Browser, slug: string, size = { width: 1280, height: 720 }) {
  const ctx = await browser.newContext({ viewport: size });
  await instrument(ctx);
  await ctx.addInitScript(FRAME_LOADS);
  const out = await ctx.newPage();
  await throttle(out, NET);
  await out.goto(`/output?production=${encodeURIComponent(slug)}`);
  return out;
}

async function outputReady(out: Page, graphics: number, timeout = 180_000) {
  await expect
    .poll(async () => { const r = await readyOf(out); return r ? r.n === r.of && r.of >= graphics : false; }, { timeout, intervals: [50] })
    .toBe(true);
}

/** MEASURE_PATHS (comma-separated) narrows a takes group to some of its paths, so one path's 50
 *  samples fit one five-minute job; MEASURE_PART names the job's result file. */
const PATHS = process.env.MEASURE_PATHS ? new Set(process.env.MEASURE_PATHS.split(',')) : null;
const PART = process.env.MEASURE_PART ?? '1';
const count = (path: string) => (!PATHS || PATHS.has(path) ? SAMPLES : 0);

function report(name: string, samples: Record<string, Sample[]>, extra: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = { fixture: FIXTURE, net: NET, at: new Date().toISOString(), ...extra, paths: {} };
  for (const [path, list] of Object.entries(samples)) {
    const ok = list.filter((s): s is Exclude<Sample, { failed: string }> => !('failed' in s));
    const failed = list.filter((s): s is { failed: string } => 'failed' in s);
    (out.paths as Record<string, unknown>)[path] = {
      total: summary(ok.map((s) => s.total), failed.length),
      own: summary(ok.map((s) => s.own), failed.length),
      keptAdds: {
        inflight: ok.filter((s) => s.kept.inflight).length,
        road: ok.filter((s) => s.kept.road).length,
        ordered: ok.filter((s) => s.kept.ordered).length,
        anyMs: summary(ok.filter((s) => s.keptMs > 0).map((s) => s.keptMs)),
      },
      otherRequests: [...new Set(ok.flatMap((s) => s.others))],
      failures: failed.map((f) => f.failed).slice(0, 5),
      samples: list,
    };
  }
  return writeResult(`${name}-${tag}-part${PART}`, out);
}

const SEND = /rpc:control_send_seq|rpc:control_send_many/;

test('takes-a', async ({ page, browser }) => {
  await seedSettings(page);
  await fakeBridge(page);
  await opPage(page, NET);
  log('build');
  const fx = await buildFixture(page, FIXTURE);
  log('built', fx.graphics, fx.storedOutputBytes);
  await throttle(page, NET);
  const out = await openOutput(browser, await outputSlugOf(page, fx.showId));
  await outputReady(out, fx.graphics);
  const take = page.getByTestId('verb-take'), outBtn = page.getByTestId('verb-out');
  const samples: Record<string, Sample[]> = { graphic: [], folder: [], picture: [], server: [] };
  const plainLabels = await page.evaluate(async ({ id, cues }) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const s = loadShows().find((x) => x.id === id)!;
    return cues.map((c) => s.cues!.find((x) => x.id === c)!.label);
  }, { id: fx.showId, cues: fx.cues.plain });
  const labelOf = async (cue: string) => page.evaluate(async ({ id, cue }) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((x) => x.id === id)!.cues!.find((c) => c.id === cue)!.label;
  }, { id: fx.showId, cue });

  for (let i = 0; i < count('graphic'); i++) {
    await select(page, plainLabels[i % Math.min(5, plainLabels.length)]);
    await clearLpm(page);
    samples.graphic.push(await pressAndMeasure(page, take, 'verb-take', SEND));
    await settle(page);
    await outBtn.click();
    await settle(page);
  }
  const picture = await labelOf(fx.cues.picture);
  for (let i = 0; i < count('picture'); i++) {
    await select(page, picture);
    await clearLpm(page);
    samples.picture.push(await pressAndMeasure(page, take, 'verb-take', SEND));
    await settle(page);
    await outBtn.click();
    await settle(page);
  }
  const folderRow = page.locator('.pd-folder').filter({ hasText: 'LP2 Folder' });
  for (let i = 0; i < count('folder'); i++) {
    await folderRow.getByTestId('select-folder').click();
    await clearLpm(page);
    samples.folder.push(await pressAndMeasure(page, take, 'verb-take', SEND));
    await settle(page, 400);
    await outBtn.click();
    await settle(page, 400);
  }
  const server = await labelOf(fx.cues.server);
  if (count('server')) {
    await select(page, server);
    await expect(page.getByTestId('playout-cue-status')).toHaveAttribute('data-state', 'ok', { timeout: 20_000 });
  }
  for (let i = 0; i < count('server'); i++) {
    await select(page, server);
    await clearLpm(page);
    samples.server.push(await pressAndMeasure(page, take, 'verb-take', /8899\/act/));
    await settle(page);
    await outBtn.click();
    await settle(page);
  }
  report('takes-a', samples, { fixtureFacts: fx });
});

test('takes-b', async ({ page, browser }) => {
  await opPage(page, NET);
  log('build');
  const fx = await buildFixture(page, FIXTURE);
  log('built', fx.graphics, fx.storedOutputBytes);
  await throttle(page, NET);
  const out = await openOutput(browser, await outputSlugOf(page, fx.showId));
  await outputReady(out, fx.graphics);
  const take = page.getByTestId('verb-take'), outBtn = page.getByTestId('verb-out');
  const samples: Record<string, Sample[]> = { quick: [], quickSecondOfTwo: [], plusOne: [], plusOneSecondOfTwo: [] };

  // QUICK BUTTON and +1, on the House Score board on air.
  await select(page, 'LP2 Score');
  await take.click();
  await settle(page);
  const goal = page.getByTestId('cue-action-goalA');
  await expect(goal).toBeEnabled({ timeout: 20_000 });
  for (let i = 0; i < count('quick'); i++) {
    await clearLpm(page);
    samples.quick.push(await pressAndMeasure(page, goal, 'cue-action-goalA', SEND));
    await settle(page);
  }
  // TWO FAST PRESSES: the second Goal pressed as soon as the first is sent, so the kept wait for
  // the previous press (graphicVerbs.ts afterPress) and one send in flight per graphic show up.
  for (let i = 0; i < count('quickSecondOfTwo'); i++) {
    await clearLpm(page);
    samples.quickSecondOfTwo.push(await secondOfTwo(page, goal, 'cue-action-goalA', SEND));
    await settle(page);
  }
  const up = page.getByTestId('live-numbers').locator('[data-testid^="live-number-"][data-testid$="-up"]').first();
  await expect(up).toBeEnabled({ timeout: 20_000 });
  const upId = (await up.getAttribute('data-testid'))!;
  for (let i = 0; i < count('plusOne'); i++) {
    await clearLpm(page);
    samples.plusOne.push(await pressAndMeasure(page, up, upId, /rpc:control_send_seq|rpc:control_send_many|data\/patch/));
    await settle(page);
  }
  for (let i = 0; i < count('plusOneSecondOfTwo'); i++) {
    await clearLpm(page);
    samples.plusOneSecondOfTwo.push(await secondOfTwo(page, up, upId, /rpc:control_send_seq|rpc:control_send_many|data\/patch/));
    await settle(page);
  }
  await outBtn.click();
  await settle(page);
  report('takes-b', samples, { fixtureFacts: fx });
});

test('takes-c', async ({ page, browser }) => {
  await opPage(page, NET);
  log('build');
  const fx = await buildFixture(page, FIXTURE);
  log('built', fx.graphics, fx.storedOutputBytes);
  await throttle(page, NET);
  const out = await openOutput(browser, await outputSlugOf(page, fx.showId));
  await outputReady(out, fx.graphics);
  const take = page.getByTestId('verb-take'), outBtn = page.getByTestId('verb-out');
  const samples: Record<string, Sample[]> = { next: [], panel: [] };

  // NEXT on the stepped lower third: Take it, measure one Next, Out.
  const next = page.getByTestId('verb-next');
  for (let i = 0; i < count('next'); i++) {
    await select(page, 'LP2 Stepped');
    await take.click();
    await settle(page);
    await expect(next).toBeEnabled({ timeout: 10_000 });
    await clearLpm(page);
    samples.next.push(await pressAndMeasure(page, next, 'verb-next', SEND));
    await settle(page);
    await outBtn.click();
    await settle(page);
  }

  // A SCRIPTED HARDWARE-PANEL TAKE: the module's `panel_press`, relayed to the page. The press is
  // stamped on this machine as the module's request leaves; the page's own share starts when the
  // relayed press reaches the page (its Realtime frame, stamped on arrival by the init script).
  if (!count('panel')) { report('takes-c', samples, { fixtureFacts: fx }); return; }
  const deck = await pairPanel(page);
  await answerPanel(page);
  await page.keyboard.press('Escape');
  const rows = await deck.rows();
  const target = rows.find((r) => r.kind === 'cue' && /LP2 G/.test(r.label))!;
  for (let i = 0; i < count('panel'); i++) {
    await clearLpm(page);
    const seen = (await deck.state()).ver as number;
    // The relay takes ids shaped `name:number` (supabase/migrations/0110_panel_last_press.sql).
    const id = `lp2deck:${2 * i + 1}`;
    // This process and the page keep separate clocks. Read the page's clock between two of ours
    // and move the press onto the page's clock by the midpoint; half the bracket is the error,
    // kept with the sample.
    const before = sidsOf(await readLpm(page));
    const a0 = performance.timeOrigin + performance.now();
    const pageNow = await nowOn(page);
    const a1 = performance.timeOrigin + performance.now();
    const offset = pageNow - (a0 + a1) / 2;
    const press = performance.timeOrigin + performance.now() + offset;
    const r = await deck.press('take-cue', target.id, seen, id);
    const got = r.outcome === 'ran' ? await sentAfter(page, press, SEND, 15_000, before) : null;
    if (!got) samples.panel.push({ failed: `panel take ${r.outcome}` });
    else {
      const a = attribute(got.lpm, press, got.sent);
      const arrived = (got.lpm.frames ?? []).find((f) => f.data.includes(`"${id}"`));
      const reachedPage = arrived ? arrived.t : null;
      samples.panel.push({ ...a, own: reachedPage !== null ? got.sent.t - reachedPage - a.keptMs : NaN, clockError: (a1 - a0) / 2, others: [...a.others, reachedPage === null ? 'no-frame-stamp' : 'frame-stamped'] } as Sample);
    }
    await settle(page);
    const again = (await deck.state()).ver as number;
    await deck.press('take-cue', target.id, again, `lp2deck:${2 * i + 2}`);
    await settle(page);
  }
  await deck.close();
  report('takes-c', samples, { fixtureFacts: fx, panelNote: 'panel own = page receives the relayed press frame -> sent' });
});

test('render', async ({ page, browser }) => {
  await opPage(page, NET);
  log('build');
  const fx = await buildFixture(page, FIXTURE);
  log('built', fx.graphics, fx.storedOutputBytes);
  await throttle(page, NET);
  const out = await openOutput(browser, await outputSlugOf(page, fx.showId));
  await outputReady(out, fx.graphics);
  const cast = await screencast(out);
  const labels = await page.evaluate(async ({ id, cues }) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const s = loadShows().find((x) => x.id === id)!;
    return cues.map((c) => s.cues!.find((x) => x.id === c)!.label);
  }, { id: fx.showId, cues: fx.cues.plain.slice(0, 5) });
  const rows: { sentToPlay: number; sentToDispatch: number; sentToSeen: number; gapBefore: number; gapAfter: number }[] = [];
  const failures: string[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    await select(page, labels[i % labels.length]);
    // Quiet first: no screencast frame for 400 ms, so the frame before the press is the empty stage.
    const quietEnd = Date.now() + 10_000;
    while (Date.now() < quietEnd) {
      const last = cast.frames[cast.frames.length - 1];
      if (!last || Date.now() - last.t > 400) break;
      await page.waitForTimeout(50);
    }
    const baseline = cast.frames[cast.frames.length - 1]?.hash;
    await clearLpm(page);
    const before = await nowOn(page);
    await page.getByTestId('verb-take').click();
    const got = await sentAfter(page, before, SEND);
    if (!got) {
      failures.push('no send');
      // Take it off before the next sample, so a late Take cannot be read as that sample's.
      await page.getByTestId('verb-out').click();
      await settle(page);
      await page.waitForTimeout(1_200);
      continue;
    }
    const sent = got.sent.t;
    // Wait for the picture and the stamps.
    let seen: { t: number } | undefined, idx = -1;
    const end = Date.now() + 15_000;
    while (Date.now() < end) {
      idx = cast.frames.findIndex((f) => f.t > sent && f.hash !== baseline);
      if (idx >= 0) { seen = cast.frames[idx]; break; }
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(300);
    const plays = (await framePlays(out)).flatMap((f) => f.plays).filter((p) => p.playAt > sent).sort((a, b) => a.playAt - b.playAt)[0];
    if (!seen || !plays || plays.dispatchAt === null) failures.push(`missing ${!seen ? 'seen' : 'play stamp'}`);
    else rows.push({
      sentToPlay: plays.playAt - sent,
      sentToDispatch: plays.dispatchAt - sent,
      sentToSeen: seen.t - sent,
      gapBefore: idx > 0 ? seen.t - cast.frames[idx - 1].t : NaN,
      gapAfter: idx + 1 < cast.frames.length ? cast.frames[idx + 1].t - seen.t : NaN,
    });
    await page.getByTestId('verb-out').click();
    await settle(page);
    await page.waitForTimeout(1_200);
  }
  await cast.stop();
  // The capture's own resolution: the gap between consecutive frames while a graphic animates.
  const gaps = rows.map((r) => r.gapAfter).filter(Number.isFinite);
  writeResult(`render-${tag}-part${PART}`, {
    fixture: FIXTURE, net: NET, at: new Date().toISOString(), fixtureFacts: fx,
    sentToPlay: summary(rows.map((r) => r.sentToPlay), failures.length),
    sentToDispatch: summary(rows.map((r) => r.sentToDispatch), failures.length),
    sentToSeen: summary(rows.map((r) => r.sentToSeen), failures.length),
    captureGap: summary(gaps),
    failures: failures.slice(0, 5),
    rows,
    failureCount: failures.length,
  });
});

test('publish', async ({ page, browser }) => {
  await opPage(page, NET);
  log('build');
  const fx = await buildFixture(page, FIXTURE);
  log('built', fx.graphics, fx.storedOutputBytes);
  await throttle(page, NET);
  const out = await openOutput(browser, await outputSlugOf(page, fx.showId));
  await outputReady(out, fx.graphics);
  const labels = await page.evaluate(async ({ id, cues }) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const s = loadShows().find((x) => x.id === id)!;
    return cues.map((c) => s.cues!.find((x) => x.id === c)!.label);
  }, { id: fx.showId, cues: fx.cues.plain.slice(0, 5) });
  // A publish loop in the page: the same publication call the header's Publish changes ends in,
  // back to back, each window stamped.
  await page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const { publishControlShow } = await import('/src/control/hostedControl.ts');
    const w = window as unknown as { __lpPub: { on: boolean; windows: [number, number][]; errors: string[]; running: number | null } };
    w.__lpPub = { on: true, windows: [], errors: [], running: null };
    void (async () => {
      while (w.__lpPub.on) {
        const t0 = performance.timeOrigin + performance.now();
        w.__lpPub.running = t0;
        let ok = true;
        try { await publishControlShow(loadShows().find((s) => s.id === id)!); } catch (e) { ok = false; w.__lpPub.errors.push(String(e)); }
        w.__lpPub.running = null;
        // Only a publish that completed counts as one running.
        if (ok) w.__lpPub.windows.push([t0, performance.timeOrigin + performance.now()]);
        await new Promise((r) => setTimeout(r, 20));
      }
    })();
  }, fx.showId);
  const during: Sample[] = [];
  const outside: Sample[] = [];
  const deadline = Date.now() + Number(process.env.MEASURE_DEADLINE_S ?? 150) * 1000;
  let k = 0;
  while (during.length < SAMPLES && Date.now() < deadline) {
    await select(page, labels[k++ % labels.length]);
    await clearLpm(page);
    const s = await pressAndMeasure(page, page.getByTestId('verb-take'), 'verb-take', SEND);
    const lpm = await readLpm(page);
    const press = pressOf(lpm, 'verb-take');
    const { windows, running } = await page.evaluate(() => (window as unknown as { __lpPub: { windows: [number, number][]; running: number | null } }).__lpPub);
    // During a publish: inside a completed publish, or after the start of the one still running.
    // A press in the gap between two publishes is not.
    const inside = press !== null && (windows.some(([a, b]) => press >= a && press <= b) || (running !== null && press >= running));
    (inside ? during : outside).push(s);
    // The publish loop never goes quiet: wait for the Take's and the Out's own sends only.
    await settle(page, 150, 20_000, SEND);
    await page.getByTestId('verb-out').click();
    await settle(page, 150, 20_000, SEND);
  }
  const pub = await page.evaluate(() => { const w = window as unknown as { __lpPub: { on: boolean; windows: [number, number][]; errors: string[] } }; w.__lpPub.on = false; return w.__lpPub; });
  report('publish', { duringPublish: during, outsidePublish: outside }, {
    fixtureFacts: fx,
    publishes: { n: pub.windows.length, ms: summary(pub.windows.map(([a, b]) => b - a)), durations: pub.windows.map(([a, b]) => b - a), errors: pub.errors.slice(0, 3), errorCount: pub.errors.length },
  });
});

test('bytes', async ({ page, browser }) => {
  await opPage(page, NET);
  log('build');
  const fx = await buildFixture(page, FIXTURE);
  log('built', fx.graphics, fx.storedOutputBytes);
  await throttle(page, NET);
  const out = await openOutput(browser, await outputSlugOf(page, fx.showId));
  await outputReady(out, fx.graphics);
  const opMeter = await meterBytes(page);
  const outMeter = await meterBytes(out);
  // Each round: a cue edit, a graphic added, that graphic removed again, a design updated. The
  // production keeps its size from round to round.
  const kinds = ['cue-edit', 'graphic-add', 'graphic-remove', 'design-update'] as const;
  const rounds = Number(process.env.MEASURE_ROUNDS ?? 6);
  const rows: Record<string, unknown>[] = [];
  let lastPrepare = 0;
  for (let i = 0; i < rounds * kinds.length; i++) {
    const kind = kinds[i % kinds.length];
    const round = Math.floor(i / kinds.length);
    log(kind, round);
    // Stay clear of the output's 15 s preparation spacing (src/output/prepare.ts PREPARE_EVERY_MS),
    // so a sample measures the load, not the wait; the spacing is reported beside the numbers.
    const wait = lastPrepare + 15_500 - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    await settle(page, 4_000, 60_000);
    const before = (await readyOf(out))?.v?.n ?? 0;
    opMeter.reset();
    outMeter.reset();
    const t0 = await nowOn(page);
    const addLoads = await out.evaluate(() => document.querySelectorAll('iframe').length);
    if (kind === 'cue-edit') {
      await select(page, 'LP2 Stepped');
      const field = page.getByTestId('cue-field-f0');
      await field.fill(`Edited cue text ${i}`);
      await field.blur();
    } else if (kind === 'graphic-add') {
      await page.evaluate(async ({ id, i, share }) => {
        const { CATALOG } = await import('/src/templates/catalog.ts');
        const { initialDraft, mergeDraft, buildDraftTemplate } = await import('/src/components/wizard/draft.ts');
        const { formatTemplate } = await import('/src/format/formatCode.ts');
        const { addGraphicToShow } = await import('/src/model/shows.ts');
        const { commitDurableWrites } = await import('/src/model/durableStore.ts');
        const variant = Object.values(CATALOG).flat().find((v) => v.name === 'Hairline')!;
        const draft = mergeDraft(initialDraft(), { variantId: variant.id, lines: variant.suggestedLines.map((l) => ({ ...l })), zone: null, logoEnabled: null, animation: { presetId: null, outPresetId: null }, paletteId: null, customPalette: null, fontId: null });
        const t = await formatTemplate(buildDraftTemplate(variant, draft));
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = Math.max(1, Math.round(share / (256 * 3)));
        const ctx = canvas.getContext('2d')!;
        const img = ctx.createImageData(canvas.width, canvas.height);
        let seed = 0x1357 + i;
        for (let k = 0; k < img.data.length; k += 4) {
          for (let c = 0; c < 3; c++) img.data[k + c] = ((seed = (seed * 1664525 + 1013904223) >>> 0) >>> 24);
          img.data[k + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        const path = `assets/lp2-add-${i}.png`;
        const { error } = addGraphicToShow(id, { ...t, name: `LP2 Added`, assets: [...t.assets, { path, data: canvas.toDataURL('image/png') }], html: `${t.html}\n<img class="lp2-gen" src="${path}" alt="" style="position:absolute;left:0;top:0;width:8px;height:8px;opacity:0.02">` }, {});
        const failure = error ?? (await commitDurableWrites());
        if (failure) throw new Error(failure);
      }, { id: fx.showId, i, share: Math.floor(fx.imageFileBytes / fx.graphics) });
    } else if (kind === 'graphic-remove') {
      await page.evaluate(async (id) => {
        const { loadShows, removeShowGraphicChecked } = await import('/src/model/shows.ts');
        const { commitDurableWrites } = await import('/src/model/durableStore.ts');
        const g = loadShows().find((s) => s.id === id)!.graphics.find((x) => x.name === 'LP2 Added')!;
        const { error } = removeShowGraphicChecked(id, g.id);
        const failure = error ?? (await commitDurableWrites());
        if (failure) throw new Error(failure);
      }, fx.showId);
    } else {
      await page.evaluate(async ({ id, i }) => {
        const { loadShows, addGraphicToShow } = await import('/src/model/shows.ts');
        const { commitDurableWrites } = await import('/src/model/durableStore.ts');
        const g = loadShows().find((s) => s.id === id)!.graphics.find((x) => x.name === 'LP2 G03')!;
        const { error } = addGraphicToShow(id, { ...g.template, css: `${g.template.css}\n/* lp2 design update ${i} */ .lp2-gen { outline: 0; }` }, {});
        const failure = error ?? (await commitDurableWrites());
        if (failure) throw new Error(failure);
      }, { id: fx.showId, i });
    }
    // TODAY a cue's text needs no publish: its values ride with each Take, and the header offers
    // no Publish changes for it (src/components/home/usePublishDrift.ts). Its bytes are the save
    // alone. A graphic added or updated needs Publish changes, then the output prepares it.
    let tPress = NaN, tReady = NaN;
    if (kind !== 'cue-edit') {
      const publishBtn = page.getByTestId('production-publish-changes');
      await expect(publishBtn).toBeVisible({ timeout: 20_000 });
      tPress = await nowOn(page);
      await publishBtn.click();
      try {
        await expect.poll(async () => { const r = await readyOf(out); return (r?.v?.n ?? 0) > before && r!.n === r!.of; }, { timeout: 120_000, intervals: [50] }).toBe(true);
        tReady = await nowOn(out);
      } catch { /* recorded as a failure below */ }
      lastPrepare = Date.now();
    }
    // What the page sends behind it (the sync mirror, on a 2.5 s debounce) counts too: wait until
    // nothing has started for 4 s.
    await settle(page, 4_000, 60_000);
    const frames = await out.evaluate(() => document.querySelectorAll('iframe').length);
    // The graphic's own load on the output: its frame inserted to its document loaded.
    const loads = await out.evaluate((after) => ((window as unknown as { __lpFrames?: { add: number; load?: number }[] }).__lpFrames ?? [])
      .filter((f) => f.add >= after && f.load).map((f) => f.load! - f.add), tPress || 0);
    rows.push({
      kind,
      round,
      newFrameLoads: kind === 'cue-edit' ? [] : loads,
      editToPress: tPress - t0,
      pressToOutputPrepared: tReady - tPress,
      failed: kind !== 'cue-edit' && Number.isNaN(tReady),
      op: opMeter.total(),
      output: outMeter.total(),
      framesBefore: addLoads,
      framesAfter: frames,
    });
  }
  const by = (k: string) => rows.filter((r) => r.kind === k);
  const sum = (r: Record<string, unknown>) => {
    const op = r.op as { up: number; down: number }, o = r.output as { up: number; down: number };
    return op.up + op.down + o.up + o.down;
  };
  writeResult(`bytes-${tag}-part${PART}`, {
    fixture: FIXTURE, net: NET, at: new Date().toISOString(), fixtureFacts: fx,
    perKind: Object.fromEntries(kinds.map((k) => [k, {
      bytesTotal: summary(by(k).map(sum)),
      opUp: summary(by(k).map((r) => (r.op as { up: number }).up)),
      opDown: summary(by(k).map((r) => (r.op as { down: number }).down)),
      outputDown: summary(by(k).map((r) => (r.output as { down: number }).down)),
      pressToOutputPrepared: summary(by(k).map((r) => r.pressToOutputPrepared as number), by(k).filter((r) => r.failed).length),
      newFrameLoad: summary(by(k).flatMap((r) => r.newFrameLoads as number[])),
    }])),
    rows,
  });
});

test('boot', async ({ page, browser }) => {
  await opPage(page, NET);
  log('build');
  const fx = await buildFixture(page, FIXTURE);
  log('built', fx.graphics, fx.storedOutputBytes);
  await throttle(page, NET);
  const slug = await outputSlugOf(page, fx.showId);
  const rows: { ready: number; firstLoaded: number; frameLoad: number[]; bytes: number; dataBytes: number }[] = [];
  const failures: string[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    // A fresh browser context each time: a cold cache, as a playout box's first start.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(FRAME_LOADS);
    const out = await ctx.newPage();
    const cdp = await throttle(out, NET);
    const meter = await meterBytes(out, cdp);
    try {
      await out.goto(`/output?production=${encodeURIComponent(slug)}`);
      await outputReady(out, fx.graphics, 120_000);
      const t = await out.evaluate(() => ({ origin: performance.timeOrigin, now: performance.timeOrigin + performance.now(), frames: (window as unknown as { __lpFrames: { add: number; load?: number }[] }).__lpFrames }));
      const loads = t.frames.filter((f) => f.load).map((f) => f.load! - f.add);
      const total = meter.total();
      const data = Object.entries(total.byName).filter(([k]) => /^rpc:|^rest:|^storage/.test(k)).reduce((n, [, b]) => n + b.down, 0);
      rows.push({
        ready: t.now - t.origin,
        firstLoaded: Math.min(...t.frames.filter((f) => f.load).map((f) => f.load!)) - t.origin,
        frameLoad: loads,
        bytes: total.down + total.up,
        dataBytes: data,
      });
    } catch (e) {
      failures.push(String(e).slice(0, 200));
    }
    await ctx.close();
  }
  writeResult(`boot-${tag}-part${PART}`, {
    fixture: FIXTURE, net: NET, at: new Date().toISOString(), fixtureFacts: fx, cache: 'cold (a new browser context per start)',
    navigationToReady: summary(rows.map((r) => r.ready), failures.length),
    navigationToFirstGraphicLoaded: summary(rows.map((r) => r.firstLoaded)),
    singleGraphicLoad: summary(rows.flatMap((r) => r.frameLoad)),
    bytesAll: summary(rows.map((r) => r.bytes)),
    bytesProductionData: summary(rows.map((r) => r.dataBytes)),
    failures: failures.slice(0, 5),
    failureCount: failures.length,
    rows,
  });
});

