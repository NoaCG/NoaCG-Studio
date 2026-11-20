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
function judge({ track, entries, owe, now, link = { status: 'joined', since: 0 }, epochSince = 0, goneSince }) {
  let out;
  if (entries.length === 0) out = { id: 'out-a', name: 'A', run: null, present: false, speaks: false, goneSince };
  else {
    const kept = keptReport(track, entries, EP);
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
        ...(track?.wait && track.wait.b === kept.b ? { wait: track.wait.since } : {}),
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
  assert.equal(r.run.wa, 3_000);
  const n1 = r.run.n;
  assert.equal(n1, s.n, '`wa` alone does not raise n');
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
  assert.equal(t.wait, undefined, 'an older wait never starts the clock');
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
  assert.equal(judge({ track: t, entries: [{ b: 'B0', run: null }, { b: 'B4', run: null }], owe: [], now: 10_000 }), 'warn');
});

// ── The reference model: the light for one output, written from M1 to M8's words. ──────────────
function model(world, now) {
  const { link, entries, reports, owe, epochSince, goneSince } = world;
  // M6: the page's own link.
  if (link.status !== 'joined') return link.status === 'joining' && now - link.since < 5_000 ? 'idle' : 'warn';
  // M6: absent.
  if (entries.length === 0) return now - goneSince >= 15_000 ? 'bad' : 'idle';
  // M1: the boot its one entry carries; highest n among every report of that boot.
  const marks = [...new Set(entries.map((e) => e.b))];
  const b = marks[0];
  const firstSight = Math.min(...world.sights.filter((x) => x.b === b).map((x) => x.at));
  const since = Math.max(firstSight, epochSince);
  let kept = null;
  if (marks.length === 1) {
    for (const r of reports.filter((x) => x.run.b === b)) if (!kept || r.run.n > kept.run.n) kept = r;
    for (const e of entries) if (e.run && e.run.b === b && (!kept || e.run.n > kept.run.n)) kept = { run: e.run, at: now };
  }
  if (!kept) {
    const age = now - since;
    return age >= 70_000 ? 'bad' : age >= 5_000 ? 'warn' : 'idle';
  }
  const run = kept.run;
  if (run.w !== 0) {
    if (run.k === 'failed') return 'bad';
    if (run.k === 'loading' || run.k === 'late') return 'warn';
    // The wait's age: wa plus the time since the page first received that tag.
    const first = reports.filter((x) => x.run.b === b && x.run.w === run.w).sort((x, y) => x.at - y.at)[0];
    const age = first ? first.run.wa + (now - first.at) : run.wa;
    return age >= 5_000 ? 'warn' : 'idle';
  }
  // Settled: positions past p age from the latest of learned, the boot's first sight and the settle.
  const waits = reports.filter((x) => x.run.b === b && x.run.w !== 0);
  const settleAt = waits.length
    ? Math.min(...reports.filter((x) => x.run.b === b && x.run.w === 0 && x.at >= Math.max(...waits.map((w) => w.at))).map((x) => x.at))
    : 0;
  let tone = 'ok';
  const rank = { ok: 0, idle: 1, warn: 2, bad: 3 };
  for (const o of owe) {
    if (run.p >= o.at) continue;
    const age = now - Math.max(o.learnedAt, since, isFinite(settleAt) ? settleAt : 0);
    const seed = o.graphic === null;
    const t = age >= (seed ? 30_000 : 15_000) ? 'bad' : age >= (seed ? 15_000 : 5_000) ? 'warn' : 'idle';
    if (rank[t] > rank[tone]) tone = t;
  }
  return tone;
}

test('random worlds: the page agrees with the reference model at every step', () => {
  let seed = 11;
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);
  for (let trial = 0; trial < 400; trial += 1) {
    let now = 0;
    let boot = 'B0';
    let bootNo = 0;
    let n = 0;
    let tag = 0;
    let w = 0;
    let wa0 = 0;
    const world = { link: { status: 'joined', since: 0 }, entries: [{ b: boot, run: null }], reports: [], owe: [], epochSince: 0, goneSince: 0, sights: [{ b: boot, at: 0 }] };
    let track = noteMark(undefined, boot, 0);
    for (let step = 0; step < 25; step += 1) {
      now += rand(4_000);
      const what = rand(9);
      if (what === 0) {
        // Reload: a new boot joins (sometimes before the old entry leaves).
        bootNo += 1;
        boot = `B${bootNo}`;
        n = 0;
        w = 0;
        world.entries = rand(3) === 0 ? [world.entries[0], { b: boot, run: null }] : [{ b: boot, run: null }];
        world.sights.push({ b: boot, at: now });
        track = noteMark(track, boot, now);
      } else if (what === 1 && world.entries.length > 1) {
        world.entries = [world.entries[world.entries.length - 1]];
      } else if (what <= 5) {
        // The output builds a report: settled, or a wait of some kind.
        const kinds = ['settled', 'placing', 'loading', 'failed'];
        const k = kinds[rand(4)];
        if (k === 'settled') w = 0;
        else if (w === 0) {
          tag += 1;
          w = `w${tag}`;
          wa0 = now;
        }
        n += 1;
        const r = { o: 'out-a', p: 5 + rand(10), h: {}, e: EP, b: boot, n, w, ...(w !== 0 ? { k, wa: now - wa0, ...(k === 'failed' ? { y: 'load' } : {}) } : {}) };
        const viaRow = rand(2) === 0;
        world.reports.push({ run: r, at: now });
        track = noteRun(track, r, now);
        if (!viaRow) world.entries = world.entries.map((e) => (e.b === boot ? { ...e, run: r } : e));
      } else if (what === 6) {
        world.owe.push(owed(1 + rand(20), rand(3) === 0 ? null : 'G', now - rand(60_000)));
      } else if (what === 7) {
        const s = ['joined', 'joined', 'joining', 'down'][rand(4)];
        if (s !== world.link.status) world.link = { status: s, since: now };
      }
      const got = judge({ track, entries: world.entries, owe: world.owe, now, link: world.link, epochSince: world.epochSince, goneSince: world.goneSince });
      const want = model(world, now);
      assert.equal(got, want, JSON.stringify({ trial, step, now, entries: world.entries.map((e) => [e.b, e.run && [e.run.n, e.run.w, e.run.k]]), link: world.link, seen: track.seen, sights: world.sights, best: Object.keys(track.best), reports: world.reports.filter((x) => x.run.b === boot), wait: track.wait, settled: track.settled, owe: world.owe }));
    }
  }
});
