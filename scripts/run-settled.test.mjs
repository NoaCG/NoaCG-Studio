// guards: src/control/runTrack.ts, src/control/runConfirm.ts, src/output/settled.ts, src/control/runReport.ts
//
// ONE SETTLED FACT PER OUTPUT (live-publishing G2 section 4a, #2608, M1 to M8). The output says
// whether it is settled (`w`, `k`, `wa`) under a boot mark and counter (`b`, `n`); the page keeps
// the report of the boot its one Presence entry carries, highest `n` first, and the light follows.
// The transitions are checked against a small reference model written from the rules' words, not
// from the modules: random reloads, Presence entries, rows, waits, settles, the page's own link and
// owed positions.

import test from 'node:test';
import assert from 'node:assert/strict';

const { confirmLines } = await import('../src/control/runConfirm.ts');
const { keptReport, noteRun, noteMark } = await import('../src/control/runTrack.ts');
const { withSettled, settledStart, worstOf } = await import('../src/output/settled.ts');
const { listed, readRun } = await import('../src/control/runReport.ts');

const EP = 'ep1';
const report = (b, n, w, extra = {}) => ({ o: 'out-a', p: 10, h: {}, e: EP, b, n, w, ...extra });
const owed = (at, graphic, learnedAt = 0) => ({ at, graphic, learnedAt });

/** The page's side for one output, as ProductionPage wires it. */
function judge({ track, entries, owe, now, link = { status: 'joined', since: 0 }, epochSince = 0, goneSince, epoch = EP, retired = new Set() }) {
  let out;
  if (entries.length === 0) out = { id: 'out-a', name: 'A', run: null, present: false, speaks: false, goneSince };
  else {
    const kept = keptReport(track, entries, epoch, retired);
    const seen = track?.seen[kept.b] ?? now;
    out = {
      id: 'out-a',
      name: 'A',
      run: kept.kind === 'kept' ? kept.run : null,
      present: true,
      speaks: true,
      mark: {
        since: Math.max(seen, epochSince),
        ...(kept.kind === 'none' ? { none: kept.why } : {}),
        ...(track?.waits[kept.b] ? { wait: track.waits[kept.b].since } : {}),
        ...(track?.settled[kept.b] !== undefined ? { settled: track.settled[kept.b] } : {}),
      },
    };
  }
  const lines = confirmLines({ now, owed: owe, outputs: [out], presenceJoined: link.status === 'joined', link });
  return lines.length ? lines[0].tone : 'ok';
}

test('the output: settled is w 0; a wait draws a tag once; leaving failed draws a new one; n rises only on change (M2)', () => {
  let tags = 0;
  const draw = () => `t${++tags}`;
  const boot = { read: true, overdue: false };
  let s = settledStart();
  let r = withSettled(s, { o: 'o', p: 5, h: {}, e: EP }, boot, 'B', 0, draw);
  assert.equal(r.run.w, 0);
  assert.equal(r.run.k, undefined);
  const n0 = r.run.n;
  s = r.state;
  r = withSettled(s, { o: 'o', p: 5, h: {}, e: EP }, boot, 'B', 10, draw);
  assert.equal(r.run.n, n0, 'nothing changed: the same n');
  s = r.state;
  r = withSettled(s, { o: 'o', p: 6, h: { G: [6, 'placing'] }, e: EP }, boot, 'B', 100, draw);
  assert.equal(r.run.w, 't1');
  assert.equal(r.run.k, 'placing');
  assert.equal(r.run.wa, 0);
  assert.ok(r.run.n > n0);
  s = r.state;
  r = withSettled(s, { o: 'o', p: 6, h: { G: [6, 'placing'] }, e: EP }, boot, 'B', 3_100, draw);
  assert.equal(r.run.w, 't1', 'the same wait keeps its tag');
  assert.equal(r.run.wa, 0, 'an unchanged report keeps the age it was built with: no Presence call');
  assert.equal(r.run.n, s.n, '`wa` alone does not raise n');
  s = r.state;
  r = withSettled(s, { o: 'o', p: 6, h: { G: [6, 'placing'] }, e: EP }, boot, 'B', 5_200, draw);
  assert.equal(r.run.wa, 5_100, 'once more as the wait passes 5 s (M4)');
  s = r.state;
  r = withSettled(s, { o: 'o', p: 6, h: { G: [6, 'placing'] }, e: EP }, boot, 'B', 9_000, draw);
  assert.equal(r.run.wa, 5_100, 'and then not again');
  s = r.state;
  r = withSettled(s, { o: 'o', p: 6, h: { G: [6, 'loading'] }, e: EP }, boot, 'B', 9_500, draw);
  assert.equal(r.run.wa, 9_400, 'a change says the age it has then');
  s = r.state;
  r = withSettled(s, { o: 'o', p: 6, h: { G: [6, 'failed', 'load'] }, e: EP }, boot, 'B', 20_000, draw);
  assert.equal(r.run.w, 't1');
  assert.equal(r.run.k, 'failed');
  assert.equal(r.run.y, 'load');
  s = r.state;
  r = withSettled(s, { o: 'o', p: 7, h: { G: [7, 'placing'] }, e: EP }, boot, 'B', 60_000, draw);
  assert.equal(r.run.w, 't2', 'leaving failed draws a new tag: a fresh wait starts young');
  assert.equal(r.run.wa, 0);
});

test('the boot is unsettled until it reads, placing, then failed boot at 60 s (M2, M5)', () => {
  assert.deepEqual(worstOf({}, { read: false, overdue: false }), { k: 'placing' });
  assert.deepEqual(worstOf({}, { read: false, overdue: true }), { k: 'failed', y: 'boot' });
  assert.deepEqual(worstOf({ G: [1, 'loading'] }, { read: false, overdue: false }), { k: 'loading' });
  assert.deepEqual(worstOf({}, { read: true, overdue: false }), {});
  const r = withSettled(settledStart(), { o: 'o', p: 0, h: {}, e: EP }, { read: false, overdue: true }, 'B', 61_000, () => 'x');
  assert.equal(r.run.k, 'failed');
  assert.equal(r.run.y, 'boot');
  assert.equal(judge({ track: noteRun(undefined, r.run, 61_000), entries: [{ b: 'B', run: r.run }], owe: [], now: 61_000 }), 'bad');
});

test('the wire and the Presence list keep the settled fact; an old reader keeps a lowered cursor (M8)', () => {
  const r = { o: 'o', p: 40, h: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`G${i}`, [1 + i, 'placing']])), e: EP, b: 'B', n: 3, w: 't', k: 'placing', wa: 7 };
  const l = listed(r);
  assert.equal(Object.keys(l.h).length, 12);
  assert.equal(l.p, 12, 'the unlisted graphic lowers p for pages built before #2608');
  assert.equal(l.b, 'B');
  assert.equal(l.w, 't');
  assert.equal(l.n, 3);
  const back = readRun(JSON.parse(JSON.stringify(l)));
  assert.equal(back.b, 'B');
  assert.equal(back.w, 't');
  assert.equal(back.k, 'placing');
  assert.equal(back.wa, 7);
  assert.equal(readRun({ o: 'o', p: 1, h: {}, e: EP, w: 0 }).w, 0);
  assert.equal(readRun({ o: 'o', p: 1, h: {}, e: EP, k: 'bogus' }).k, undefined);
});

test('which report counts: the boot in Presence, highest n; a late row of the old boot never counts; two marks keep none (M1)', () => {
  let t = noteRun(undefined, report('A', 5, 0), 0);
  t = noteRun(t, report('B', 1, 'w1', { k: 'placing', wa: 0 }), 100);
  // The old boot's late row arrives after the reload.
  t = noteRun(t, report('A', 9, 0), 200);
  const kept = keptReport(t, [{ b: 'B', run: null }], EP);
  assert.equal(kept.kind, 'kept');
  assert.equal(kept.run.b, 'B');
  assert.equal(kept.run.w, 'w1');
  assert.equal(keptReport(t, [{ b: 'A', run: null }, { b: 'B', run: null }], EP).why, 'two');
  assert.equal(keptReport(t, [{ b: 'C', run: null }], EP).why, 'none');
  assert.equal(keptReport(t, [{ b: 'B', run: null }], 'ep2').why, 'epoch');
  assert.equal(keptReport(t, [{ run: null }], EP).kind, 'legacy');
  // The highest n wins, wherever it came from; a cursor never orders.
  const lowP = report('B', 4, 0, { p: 1 });
  assert.equal(keptReport(t, [{ b: 'B', run: lowP }], EP).run.n, 4);
});

test('a row of the same boot arriving out of order never replaces a newer report (M1)', () => {
  let t = noteRun(undefined, report('B', 5, 0), 0);
  t = noteRun(t, report('B', 3, 'w1', { k: 'placing', wa: 0 }), 100);
  const kept = keptReport(t, [{ b: 'B', run: null }], EP);
  assert.equal(kept.run.n, 5);
  assert.equal(kept.run.w, 0);
  assert.equal(t.waits.B, undefined, 'an older wait never starts the clock');
});

test('a late row of the boot before never moves the current boot\'s wait clock (M4)', () => {
  let t = noteRun(undefined, report('B', 1, 'w1', { k: 'placing', wa: 0 }), 0);
  t = noteRun(t, report('A', 50, 'old', { k: 'placing', wa: 0 }), 1_000);
  const r = report('B', 1, 'w1', { k: 'placing', wa: 0 });
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: r }], owe: [], now: 5_500 }), 'warn');
});

test('the same wait told again with a higher age moves its start earlier (M4)', () => {
  // The page first hears the wait 3 s after it began, from a report built at its start (wa 0).
  let t = noteRun(undefined, report('B', 2, 'w1', { k: 'placing', wa: 0 }), 3_000);
  const told = report('B', 2, 'w1', { k: 'placing', wa: 5_000 });
  t = noteRun(t, told, 5_000);
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: told }], owe: [], now: 5_000 }), 'warn');
  // And never later: an older age told late does not make it younger.
  const stale = noteRun(t, report('B', 2, 'w1', { k: 'placing', wa: 0 }), 9_000);
  assert.equal(stale.waits.B.since, 0);
});

test('a restart with nothing pressed is never green before the boot settles (decision a)', () => {
  // Boot A was settled and green; the output reloads as boot B.
  let t = noteRun(undefined, report('A', 5, 0), 0);
  assert.equal(judge({ track: t, entries: [{ b: 'A', run: report('A', 5, 0) }], owe: [owed(10, null)], now: 1 }), 'ok');
  // B joins: a mark, no run yet.
  t = noteMark(t, 'B', 1_000);
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: null }], owe: [owed(10, null)], now: 1_100 }), 'idle');
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: null }], owe: [], now: 6_100 }), 'warn');
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: null }], owe: [], now: 71_100 }), 'bad');
  // B reports its wait with a lowered p (catch-up): the wait decides, never red by age.
  const waiting = report('B', 1, 'w1', { p: 0, k: 'placing', wa: 0 });
  t = noteRun(t, waiting, 2_000);
  const longAgo = [owed(10, 'G', -120_000), owed(10, null, -120_000)];
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: waiting }], owe: longAgo, now: 3_000 }), 'idle');
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: waiting }], owe: longAgo, now: 40_000 }), 'warn');
  // Settled: green only now.
  const done = report('B', 2, 0);
  t = noteRun(t, done, 41_000);
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: done }], owe: longAgo, now: 41_000 }), 'ok');
});

test('a page opened mid-wait reads the wait\'s true age (M4)', () => {
  const r = report('B', 3, 'w1', { k: 'placing', wa: 4_000 });
  const t = noteRun(undefined, r, 10_000);
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: r }], owe: [], now: 10_500 }), 'idle');
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: r }], owe: [], now: 11_100 }), 'warn');
});

test('loading and late read amber at once, failed red, placing grey then amber (M4, P5)', () => {
  for (const [k, tone] of [['loading', 'warn'], ['late', 'warn'], ['failed', 'bad'], ['placing', 'idle']]) {
    const r = report('B', 1, 'w', { k, ...(k === 'failed' ? { y: 'load' } : {}), wa: 0, h: { G: [11, k] } });
    const t = noteRun(undefined, r, 0);
    assert.equal(judge({ track: t, entries: [{ b: 'B', run: r }], owe: [], now: 100 }), tone, k);
  }
});

test('the page\'s own link: grey while first joining, amber "cannot confirm" once down, never green (M6, P4)', () => {
  const r = report('B', 1, 0);
  const t = noteRun(undefined, r, 0);
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: r }], owe: [], now: 100, link: { status: 'joining', since: 0 } }), 'idle');
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: r }], owe: [], now: 5_100, link: { status: 'joining', since: 0 } }), 'warn');
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: r }], owe: [], now: 100, link: { status: 'down', since: 0 } }), 'warn');
  // An old build too.
  const old = confirmLines({ now: 100, owed: [], outputs: [{ id: 'o', name: 'Old', run: { o: 'o', p: 9, h: {}, e: EP }, present: true, speaks: true }], presenceJoined: false, link: { status: 'down', since: 0 } });
  assert.equal(old[0].tone, 'warn');
});

test('an absent output reads grey, then red from 15 s, whatever it reported (M6)', () => {
  assert.equal(judge({ track: undefined, entries: [], owe: [], now: 1_000, goneSince: 0 }), 'idle');
  assert.equal(judge({ track: undefined, entries: [], owe: [], now: 15_000, goneSince: 0 }), 'bad');
});

test('a settled output ages a position it has not received from its settle, not from long ago (M7)', () => {
  let t = noteRun(undefined, report('B', 1, 'w', { k: 'placing', wa: 0 }), 0);
  t = noteRun(t, report('B', 2, 0, { p: 5 }), 30_000);
  const r = report('B', 2, 0, { p: 5 });
  // Learned long before; settled at 30 s: grey for 5 s from the settle, amber, then red at 15 s.
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: r }], owe: [owed(9, 'G', -100_000)], now: 31_000 }), 'idle');
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: r }], owe: [owed(9, 'G', -100_000)], now: 36_000 }), 'warn');
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: r }], owe: [owed(9, 'G', -100_000)], now: 45_000 }), 'bad');
});

test('each unreceived position ages on its own clock: the seed never hides a graphic owed as long (M7)', () => {
  const r = report('B', 1, 0, { p: 7 });
  const t = noteRun(noteMark(undefined, 'B', 60_000), r, 60_000);
  // Both start ageing at the boot's first sight; the graphic's 5 s amber decides, not the seed's 15 s.
  const owe = [owed(9, null, -50_000), owed(9, 'G', -10_000)];
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: r }], owe, now: 65_500 }), 'warn');
});

test('a stale entry of a boot whose reports were dropped keeps ageing from its first sight', () => {
  let t = noteMark(undefined, 'B0', 0);
  for (let i = 1; i <= 4; i += 1) t = noteRun(t, report(`B${i}`, 1, 0), i * 1_000);
  assert.equal(t.best.B0, undefined);
  assert.equal(t.seen.B0, 0, 'its first sight outlives its reports');
  assert.equal(judge({ track: t, entries: [{ b: 'B0', run: null }], owe: [], now: 10_000 }), 'warn');
  assert.equal(judge({ track: t, entries: [{ b: 'B0', run: null }], owe: [], now: 70_000 }), 'bad');
});

test('a reload whose old connection lingers reads from the new boot, never the old one\'s age (M6)', () => {
  let t = noteRun(undefined, report('A', 4, 0), 0);
  t = noteMark(t, 'B', 600_000);
  const both = [{ b: 'A', run: report('A', 4, 0) }, { b: 'B', run: null }];
  assert.equal(judge({ track: t, entries: both, owe: [], now: 601_000 }), 'idle');
  assert.equal(judge({ track: t, entries: both, owe: [], now: 606_000 }), 'warn');
  assert.equal(judge({ track: t, entries: both, owe: [], now: 670_000 }), 'bad', 'a ghost that stays still goes red');
});

test('a republish: a report of the retired epoch never counts, also before the page learns the new one (M1, M3)', () => {
  // Settled and green in epoch ep1; the production is republished.
  const old = report('B', 4, 0, { e: 'ep1', p: 50 });
  const t = noteRun(undefined, old, 0);
  const retired = new Set(['ep1']);
  const seed = [owed(0, null, 10_000)];
  // The page has not learned the new epoch: the output still on ep1 keeps no report.
  assert.equal(keptReport(t, [{ b: 'B', run: old }], null, retired).why, 'epoch');
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: old }], owe: seed, now: 10_100, epoch: null, retired, epochSince: 10_000 }), 'idle');
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: old }], owe: seed, now: 16_000, epoch: null, retired, epochSince: 10_000 }), 'warn');
  assert.equal(judge({ track: t, entries: [{ b: 'B', run: old }], owe: seed, now: 80_000, epoch: null, retired, epochSince: 10_000 }), 'bad', 'an output that never follows goes red');
  // It follows: its new report counts.
  const now = report('B', 5, 0, { e: 'ep2', p: 0 });
  assert.equal(judge({ track: noteRun(t, now, 12_000), entries: [{ b: 'B', run: now }], owe: seed, now: 12_000, epoch: null, retired, epochSince: 10_000 }), 'ok');
});

// ── The reference model: the light for one output, written from M1 to M8's words. ──────────────
// `world` is what happened, as plain history: every report the page received (with the page's
// epoch at that moment), its first sight of each boot, its epoch and the epochs it retired.
const RANK = { ok: 0, idle: 1, warn: 2, bad: 3 };
function model(world, now) {
  const { link, entries, owe, epochSince, retired, epoch } = world;
  // M6: the page's own link decides first.
  if (link.status !== 'joined') return link.status === 'joining' && now - link.since < 5_000 ? 'idle' : 'warn';
  // M6: absent, from its leave as the page saw it, or the page's (re)join that finds it absent.
  if (entries.length === 0) return now - Math.max(world.leftAt, link.since) >= 15_000 ? 'bad' : 'idle';
  const firstSight = (b) => Math.min(...world.sights.filter((x) => x.b === b).map((x) => x.at));
  const noReport = (b) => {
    const age = now - Math.max(firstSight(b), epochSince);
    return age >= 70_000 ? 'bad' : age >= 5_000 ? 'warn' : 'idle';
  };
  // M1: two marks keep no report; M6 counts from the newest of them.
  const marks = [...new Set(entries.map((e) => e.b))];
  if (marks.length > 1) return noReport(marks.reduce((x, y) => (firstSight(y) > firstSight(x) ? y : x)));
  const b = marks[0];
  // M1: every report of that boot the page heard (a row only while it was of the page's epoch,
  // section 6), and the entry itself; a retired epoch's never counts. Highest n.
  const heard = world.got.filter((d) => d.run.b === b && (d.via === 'entry' || d.epochThen === null || d.epochThen === d.run.e));
  const live = heard.filter((d) => !retired.has(d.run.e)).map((d) => d.run);
  for (const e of entries) if (e.run && e.run.b === b && !retired.has(e.run.e)) live.push(e.run);
  const run = live.reduce((x, r) => (!x || r.n > x.n ? r : x), null);
  if (!run || (epoch !== null && run.e !== epoch)) return noReport(b);
  if (run.w !== 0) {
    if (run.k === 'failed') return 'bad';
    if (run.k === 'loading' || run.k === 'late') return 'warn';
    // M4: `wa` plus the time since the page received that report, kept per (output, b, w): the
    // earliest start any report of that wait gives.
    const starts = heard.filter((d) => d.run.w === run.w).map((d) => d.at - d.run.wa);
    const age = starts.length ? now - Math.min(...starts) : run.wa;
    return age >= 5_000 ? 'warn' : 'idle';
  }
  // M7: settled; a position past p ages from the latest of when the page learned of it, its first
  // sight of the boot (or its taking the epoch), and the first settled report after a wait.
  const order = heard.slice().sort((x, y) => x.at - y.at);
  let settleAt = 0;
  let waiting = false;
  for (const d of order) {
    if (d.run.w !== 0) waiting = true;
    else if (waiting) {
      settleAt = d.at;
      waiting = false;
    }
  }
  let tone = 'ok';
  for (const o of owe) {
    if (run.p >= o.at) continue;
    const age = now - Math.max(o.learnedAt, firstSight(b), epochSince, settleAt);
    const seed = o.graphic === null;
    const t = age >= (seed ? 30_000 : 15_000) ? 'bad' : age >= (seed ? 15_000 : 5_000) ? 'warn' : 'idle';
    if (RANK[t] > RANK[tone]) tone = t;
  }
  return tone;
}

/** The page, as ProductionPage feeds runTrack: rows, Presence entries, its epoch and republishes. */
function pageOf() {
  const page = { epoch: 'E0', retired: new Set(), epochSince: 0, track: undefined };
  return Object.assign(page, {
    row(run, now) {
      if (page.retired.has(run.e)) return;
      if (page.epoch === null) {
        page.epoch = run.e;
        page.epochSince = now;
      }
      if (run.e !== page.epoch) return;
      page.track = noteRun(page.track, run, now);
    },
    entries(list, now) {
      for (const e of list) {
        const ok = !!e.run && !page.retired.has(e.run.e) && e.run.e === (page.epoch ?? e.run.e);
        page.track = ok ? noteRun(page.track, e.run, now) : noteMark(page.track, e.b, now);
      }
    },
    republish(now) {
      if (page.epoch !== null) page.retired.add(page.epoch);
      page.epoch = null;
      page.epochSince = now;
    },
  });
}

test('random worlds: the page agrees with the reference model at every step', () => {
  let seed = Number(process.env.SETTLED_SEED ?? 11);
  const trials = Number(process.env.SETTLED_TRIALS ?? 400);
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);
  for (let trial = 0; trial < trials; trial += 1) {
    let now = 0;
    let bootNo = 0;
    let boot = 'B0';
    let oldBoot = null;
    let n = 0;
    let tag = 0;
    let w = 0;
    let wa0 = 0;
    let serverEpoch = 0;
    let outEpoch = 0;
    const page = pageOf();
    const world = { link: { status: 'joined', since: 0 }, entries: [{ b: boot, run: null }], got: [], owe: [owed(0, null, 0)], sights: [{ b: boot, at: 0 }], leftAt: 0, retired: page.retired };
    page.entries(world.entries, 0);
    const sight = (b) => {
      if (!world.sights.some((x) => x.b === b)) world.sights.push({ b, at: now });
    };
    const setEntries = (list) => {
      world.entries = list;
      for (const e of list) sight(e.b);
      for (const e of list) if (e.run) world.got.push({ run: e.run, at: now, via: 'entry', epochThen: page.epoch });
      page.entries(list, now);
    };
    const build = () => {
      const k = ['settled', 'placing', 'loading', 'failed'][rand(4)];
      if (k === 'settled') w = 0;
      else if (w === 0) {
        tag += 1;
        w = `w${tag}`;
        wa0 = now;
      }
      n += 1;
      return { o: 'out-a', p: rand(12), h: {}, e: `E${outEpoch}`, b: boot, n, w, ...(w !== 0 ? { k, wa: now - wa0, ...(k === 'failed' ? { y: 'load' } : {}) } : {}) };
    };
    const send = (r) => {
      const how = rand(3);
      if (how !== 1) {
        world.got.push({ run: r, at: now, via: 'row', epochThen: page.epoch });
        page.row(r, now);
      }
      if (how !== 0 && world.entries.length) setEntries(world.entries.map((e) => (e.b === boot ? { ...e, run: r } : e)));
    };
    for (let step = 0; step < 30; step += 1) {
      now += rand(4_000);
      const what = rand(15);
      if (what === 0) {
        // Reload: a new boot joins, sometimes before the old entry leaves.
        oldBoot = boot;
        bootNo += 1;
        boot = `B${bootNo}`;
        n = 0;
        w = 0;
        setEntries(rand(3) === 0 && world.entries.length ? [world.entries[0], { b: boot, run: null }] : [{ b: boot, run: null }]);
      } else if (what === 1 && world.entries.length > 1) {
        setEntries([world.entries[world.entries.length - 1]]);
      } else if (what <= 5) {
        send(build());
      } else if (what === 6) {
        world.owe.push(owed(rand(12), rand(3) === 0 ? null : 'G', now - rand(60_000)));
      } else if (what === 7) {
        const st = ['joined', 'joined', 'joining', 'down'][rand(4)];
        if (st !== world.link.status) world.link = { status: st, since: now };
      } else if (what === 8) {
        // A republish: the server's epoch moves; the page learns it now or later.
        serverEpoch += 1;
        if (rand(2) === 0) {
          page.republish(now);
          world.owe = [owed(0, null, now)];
        }
      } else if (what === 9 && outEpoch < serverEpoch) {
        // The output follows the republish.
        outEpoch = serverEpoch;
        send(build());
      } else if (what === 10 && page.epoch !== null && page.epoch !== `E${serverEpoch}` && !page.retired.has(`E${serverEpoch}`)) {
        page.republish(now);
        world.owe = [owed(0, null, now)];
      } else if (what === 11 && oldBoot) {
        // A late row of the boot before.
        const r = { o: 'out-a', p: 11, h: {}, e: `E${outEpoch}`, b: oldBoot, n: 99 + step, ...(rand(2) ? { w: 0 } : { w: `old${step}`, k: 'placing', wa: 0 }) };
        world.got.push({ run: r, at: now, via: 'row', epochThen: page.epoch });
        page.row(r, now);
      } else if (what === 14 && w !== 0 && world.entries.some((e) => e.b === boot && e.run && e.run.n === n)) {
        // The output tells the same report again with only its age raised (its 5 s touch).
        const cur = world.entries.find((e) => e.b === boot).run;
        setEntries(world.entries.map((e) => (e.b === boot ? { ...e, run: { ...cur, wa: now - wa0 } } : e)));
      } else if (what === 12 && world.entries.length) {
        // The output leaves Presence; later a new boot joins.
        world.leftAt = now;
        setEntries([]);
      } else if (what === 13 && world.entries.length === 0) {
        oldBoot = boot;
        bootNo += 1;
        boot = `B${bootNo}`;
        n = 0;
        w = 0;
        setEntries([{ b: boot, run: null }]);
      }
      world.epoch = page.epoch;
      world.epochSince = page.epochSince;
      const got = judge({
        track: page.track,
        entries: world.entries,
        owe: world.owe,
        now,
        link: world.link,
        epochSince: page.epochSince,
        goneSince: Math.max(world.leftAt, world.link.since),
        epoch: page.epoch,
        retired: page.retired,
      });
      const want = model(world, now);
      assert.equal(got, want, JSON.stringify({ trial, step, now, epoch: page.epoch, retired: [...page.retired], entries: world.entries.map((e) => [e.b, e.run && [e.run.n, e.run.w, e.run.k, e.run.e, e.run.p]]), link: world.link, track: page.track, owe: world.owe }));
    }
  }
});
