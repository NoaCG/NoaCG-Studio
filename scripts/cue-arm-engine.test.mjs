// guards: src/control/cueArmEngine.ts, src/control/playoutSession.ts
//
// THE UNPUBLISHED TIMED-CUE ENGINE, run in Node with the clock, the timers, the tab and the page
// faked (production-page refactor spec §2, AC-6): a timed cue's end fires once, at its deadline;
// one more than 5 s late is marked missed and never runs; a held one does not fire and resumes from
// its remainder; the window coming back catches up once; a stop or a restart leaves no timer or
// listener live, and a late callback writes nothing. Intervals and thresholds are pinned as numbers,
// never read from the module. The rules themselves are scripts/cue-auto.test.mjs; the browser half is
// e2e/rundown-timing.spec.ts, the published wire e2e/configured/rundown-timing-recovery.spec.ts.

import test from 'node:test';
import assert from 'node:assert/strict';

const { startCueArmEngine } = await import('../src/control/cueArmEngine.ts');
const { createPlayoutSession } = await import('../src/control/playoutSession.ts');

const OK = { ok: true, skipped: [], superseded: [], pressedAgain: [] };
const timed = (id, after, then) => ({ id, sourceId: `g-${id}`, label: id, values: { name: id }, auto: { after, then } });
const manual = (id) => ({ id, sourceId: `g-${id}`, label: id, values: { name: id } });
/** A Take of cue `id` on its own layer, as the page's sender hands it to PROGRAM. */
const take = (id) => [
  { graphic: id.toUpperCase(), msg: { t: 'update', data: {} } },
  { graphic: id.toUpperCase(), msg: { t: 'play' } },
  { graphic: id.toUpperCase(), msg: { t: 'cue', cue: id } },
];

/** An engine on a fresh session (or `session`), with every timer, listener, send and line kept. */
function rig({ cues = [timed('a', 4, 'out'), manual('b')], session = createPlayoutSession('prod-1'), published = false } = {}) {
  const clock = { now: 1_000_000 };
  const timers = new Map();
  let timerId = 0;
  const visibles = new Set();
  const sent = [];
  const logs = [];
  const notes = [];
  const wire = [];
  const took = [];
  let flushes = 0;
  let liveCue = {};
  const io = {
    wallClock: () => clock.now,
    setTimer: (run, ms) => {
      timerId += 1;
      timers.set(timerId, { run, ms, at: clock.now + ms });
      return timerId;
    },
    clearTimer: (id) => timers.delete(id),
    onVisible: (run) => {
      const entry = { run };
      visibles.add(entry);
      return () => visibles.delete(entry);
    },
  };
  const page = {
    published,
    timedOff: false,
    cues,
    send: async (batches, label) => {
      sent.push({ batches, label });
      return page.answer;
    },
    answer: OK,
    cueView: (cue) => ({ values: cue.values }),
    withBoundValues: (_graphic, values) => ({ ...values, bound: '1' }),
    graphicOf: (cue) => cue.id.toUpperCase(),
    liveCueOf: () => liveCue,
    setLiveCue: (fold) => (liveCue = fold(liveCue)),
    took: (cue) => took.push(cue.id),
    flush: () => (flushes += 1),
    log: (graphic, text) => logs.push(`${graphic}: ${text}`),
    note: (text) => notes.push(text),
    wire: () => ({ toggleHold: (g) => wire.push(`hold ${g}`), manual: (g) => wire.push(`manual ${g}`) }),
  };
  const engine = startCueArmEngine(session, io, () => page);
  engine.update({ published, timedCues: true });
  const live = () => [...timers.values()];
  return {
    clock,
    session,
    engine,
    page,
    sent,
    logs,
    notes,
    wire,
    took,
    flushes: () => flushes,
    timers: live,
    visibles,
    setLive: (map) => (liveCue = map),
    getLive: () => liveCue,
    arms: () => session.arms.get(),
    /** The one live timer: its length, as set. */
    wake: () => {
      const all = live();
      assert.equal(all.length, 1, `exactly one timer is live (${all.length})`);
      return all[0].ms;
    },
    /** Move the clock to `at` and run every timer due by then, as a browser would. */
    advance: async (ms) => {
      const until = clock.now + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, t]) => t.at <= until).sort((x, y) => x[1].at - y[1].at)[0];
        if (!next) break;
        clock.now = Math.max(clock.now, next[1].at);
        timers.delete(next[0]);
        next[1].run();
        await settle();
      }
      clock.now = until;
    },
    /** Run the live timers now, whatever the clock says (a browser may run one a moment early). */
    runNow: () => {
      for (const [id, t] of [...timers.entries()]) {
        timers.delete(id);
        t.run();
      }
    },
    /** The tab came back into view. */
    show: async () => {
      for (const v of [...visibles]) v.run();
      await settle();
    },
  };
}

const settle = async () => {
  for (let i = 0; i < 3; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

test('a timed cue arms on its Take and fires its Out once, at the deadline counted from PROGRAM\'s reply', async () => {
  const r = rig();
  assert.equal(r.timers().length, 0, 'nothing counts before a Take');
  r.engine.onMarker(take('a'));
  r.setLive({ A: 'a' });
  assert.equal(r.arms().A.phase, 'waiting');
  assert.equal(r.wake(), 3000, 'a waiting arm wakes at its 3 s air fallback');
  await r.advance(500);
  r.engine.onProgramState('A');
  assert.equal(r.arms().A.phase, 'running');
  assert.equal(r.wake(), 4000, 'the 4 s count runs from PROGRAM\'s reply');
  await r.advance(3999);
  assert.equal(r.sent.length, 0, 'not a millisecond early');
  await r.advance(1);
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0].label, 'Auto Out');
  assert.deepEqual(r.sent[0].batches, [[{ graphic: 'A', msg: { t: 'stop' } }, { graphic: 'A', msg: { t: 'cue', cue: null } }]]);
  assert.deepEqual(r.arms(), {}, 'the fired arm is gone');
  assert.deepEqual(r.getLive(), {}, 'the layer is off air');
  assert.deepEqual(r.logs, ['A: Auto Out sent']);
  assert.equal(r.timers().length, 0, 'nothing left to count, no timer');
  await r.advance(60_000);
  await r.show();
  assert.equal(r.sent.length, 1, 'fired exactly once');
  r.engine.stop();
});

test('with no reply from PROGRAM the count starts from the Take after 3 s', async () => {
  const r = rig();
  r.engine.onMarker(take('a'));
  r.setLive({ A: 'a' });
  await r.advance(2999);
  assert.equal(r.arms().A.phase, 'waiting');
  await r.advance(1);
  assert.equal(r.arms().A.phase, 'running');
  assert.equal(r.arms().A.from, 1_000_000, 'anchored at the Take, not at the fallback');
  assert.equal(r.wake(), 1000, 'four seconds from the Take');
  await r.advance(1000);
  assert.equal(r.sent.length, 1);
  r.engine.stop();
});

test('a timer that comes due early is set again, never shorter than 15 ms', async () => {
  const r = rig();
  r.engine.onMarker(take('a'));
  r.engine.onProgramState('A');
  r.setLive({ A: 'a' });
  // The browser runs the timer a moment early: the clock says 2 ms are left.
  r.clock.now += 3998;
  r.runNow();
  assert.equal(r.sent.length, 0);
  assert.equal(r.wake(), 15, 'set again, at the 15 ms floor');
  await r.advance(15);
  assert.equal(r.sent.length, 1);
  r.engine.stop();
});

test('an end more than 5 s late is marked missed and never sent; at 5 s it still fires', async () => {
  const late = rig();
  late.engine.onMarker(take('a'));
  late.engine.onProgramState('A');
  // A hidden window: the timer never ran, and the tab comes back 5001 ms after the deadline.
  late.clock.now += 4000 + 5001;
  await late.show();
  assert.equal(late.sent.length, 0, 'a missed end is never run late');
  assert.equal(late.arms().A.phase, 'missed');
  assert.equal(late.arms().A.dueAt, 1_004_000);
  assert.deepEqual(late.logs, ['A: Auto Out missed']);
  assert.equal(late.timers().length, 0, 'a missed lane sets no timer');
  await late.show();
  assert.deepEqual(late.logs, ['A: Auto Out missed'], 'reported once');
  late.engine.stop();

  const edge = rig();
  edge.engine.onMarker(take('a'));
  edge.engine.onProgramState('A');
  edge.setLive({ A: 'a' });
  edge.clock.now += 4000 + 5000;
  await edge.show();
  assert.equal(edge.sent.length, 1, 'exactly 5 s late still fires');
  edge.engine.stop();
});

test('the window coming back catches up exactly once', async () => {
  const r = rig();
  r.engine.onMarker(take('a'));
  r.engine.onProgramState('A');
  r.setLive({ A: 'a' });
  r.clock.now += 4200;
  await r.show();
  await r.show();
  // The throttled timer finally runs as well.
  await r.advance(0);
  assert.equal(r.sent.length, 1);
  assert.equal(r.visibles.size, 1, 'one listener, however often the arms moved');
  r.engine.stop();
});

test('a held count does not fire, and resumes from its remainder', async () => {
  const r = rig();
  r.engine.onMarker(take('a'));
  r.engine.onProgramState('A');
  r.setLive({ A: 'a' });
  await r.advance(1500);
  r.engine.hold('A');
  assert.equal(r.arms().A.phase, 'held');
  assert.equal(r.arms().A.ms, 2500);
  assert.equal(r.timers().length, 0, 'a held lane sets no timer');
  await r.advance(60_000);
  await r.show();
  assert.equal(r.sent.length, 0, 'held: nothing fires, however late');
  r.engine.hold('A');
  assert.equal(r.arms().A.phase, 'running');
  assert.equal(r.wake(), 2500);
  await r.advance(2499);
  assert.equal(r.sent.length, 0);
  await r.advance(1);
  assert.equal(r.sent.length, 1);
  assert.deepEqual(r.logs, ['A: Held at 0:03', 'A: Resumed at 0:03', 'A: Auto Out sent']);
  r.engine.stop();
});

test('hold at the deadline changes nothing: the end is already on its way', async () => {
  const r = rig();
  r.engine.onMarker(take('a'));
  r.engine.onProgramState('A');
  r.clock.now += 4000;
  r.engine.hold('A');
  assert.equal(r.arms().A.phase, 'running');
  assert.deepEqual(r.logs, []);
  r.engine.hold(null);
  r.engine.hold('Z');
  r.engine.stop();
});

test('Manual drops the timed end and says so; a missed lane is cleared without a line', async () => {
  const r = rig({ cues: [timed('a', 4, 'out'), timed('c', 2, 'out')] });
  r.engine.onMarker(take('a'));
  r.engine.onProgramState('A');
  r.engine.manual('A');
  assert.deepEqual(r.arms(), {});
  assert.deepEqual(r.logs, ['A: Manual: the timed end is off for this airing']);
  await r.advance(60_000);
  assert.equal(r.sent.length, 0);
  r.engine.onMarker(take('c'));
  r.engine.onProgramState('C');
  r.clock.now += 2000 + 5001;
  await r.show();
  r.engine.manual('C');
  assert.deepEqual(r.arms(), {});
  assert.deepEqual(r.logs, ['A: Manual: the timed end is off for this airing', 'C: Auto Out missed']);
  r.engine.stop();
});

test('Out and next cue: the Out, then the next cue\'s Take with its bound values, after a flush', async () => {
  const r = rig({ cues: [timed('a', 2, 'out-next'), { ...manual('srv'), source: 'playout' }, manual('b')] });
  r.engine.onMarker(take('a'));
  assert.equal(r.arms().A.next, 'b', 'the next graphic cue, past the server cue');
  r.setLive({ A: 'a' });
  r.engine.onProgramState('A');
  await r.advance(2000);
  assert.equal(r.flushes(), 1);
  assert.equal(r.sent[0].label, 'Auto Out and next cue');
  assert.deepEqual(r.sent[0].batches, [
    [{ graphic: 'A', msg: { t: 'stop' } }, { graphic: 'A', msg: { t: 'cue', cue: null } }],
    [
      { graphic: 'B', msg: { t: 'update', data: { name: 'b', bound: '1' } } },
      { graphic: 'B', msg: { t: 'play' } },
      { graphic: 'B', msg: { t: 'cue', cue: 'b' } },
    ],
  ]);
  assert.deepEqual(r.getLive(), { B: 'b' });
  assert.deepEqual(r.took, ['b']);
  r.engine.stop();
});

test('the next cue\'s Take carries its place and size, as every Take does (playout adjustments rule 2)', async () => {
  const r = rig({ cues: [timed('a', 2, 'out-next'), manual('b')] });
  const look = { v: 1, frame: { dx: 1200, dy: 0, s: 0.8, ox: 530, oy: 961 } };
  r.page.appearanceOf = (cue, graphic) => (cue.id === 'b' && graphic === 'B' ? look : undefined);
  r.engine.onMarker(take('a'));
  r.setLive({ A: 'a' });
  r.engine.onProgramState('A');
  await r.advance(2000);
  assert.deepEqual(r.sent[0].batches[1][0], { graphic: 'B', msg: { t: 'update', data: { name: 'b', bound: '1' }, appearance: look } });
  r.engine.stop();
});

test('a timed end that takes the next cue onto an imported OGraf package\'s layer takes what is up there off with it (E3.2a)', async () => {
  const r = rig({ cues: [timed('a', 2, 'out-next'), manual('b')] });
  // B shares its layer with a package P that is up, and with A, which this end takes off anyway.
  r.page.layerPeers = (graphic) => (graphic === 'B' ? ['A', 'P'] : []);
  r.engine.onMarker(take('a'));
  r.setLive({ A: 'a', P: 'p' });
  r.engine.onProgramState('A');
  await r.advance(2000);
  assert.deepEqual(r.sent[0].batches.map((b) => b.map((i) => `${i.graphic}:${i.msg.t}`).join('+')), ['A:stop+A:cue', 'P:stop+P:cue+B:update+B:play+B:cue']);
  r.engine.stop();
});

test('an Out whose layer no longer holds the cue sends nothing and says so', async () => {
  const r = rig();
  r.engine.onMarker(take('a'));
  r.engine.onProgramState('A');
  r.setLive({ A: 'other' });
  await r.advance(4000);
  assert.equal(r.sent.length, 0);
  assert.deepEqual(r.logs, ['A: Auto Out: nothing to send']);
});

test('a next cue that is gone takes nothing, and a send left alone is not written over', async () => {
  const gone = rig({ cues: [timed('a', 2, 'next'), manual('b')] });
  gone.engine.onMarker(take('a'));
  gone.page.cues = [timed('a', 2, 'next')];
  gone.engine.onProgramState('A');
  await gone.advance(2000);
  assert.equal(gone.sent.length, 0);
  assert.deepEqual(gone.notes, ['The cue armed to be taken next is gone, so nothing was taken.']);
  gone.engine.stop();

  const stood = rig({ cues: [timed('a', 2, 'out-next'), manual('b')] });
  stood.page.answer = { ...OK, pressedAgain: ['A'] };
  stood.setLive({ A: 'a' });
  stood.engine.onMarker(take('a'));
  stood.engine.onProgramState('A');
  await stood.advance(2000);
  assert.deepEqual(stood.getLive(), { A: 'a', B: 'b' }, 'the later press on A stands');
  stood.engine.stop();

  const refused = rig();
  refused.page.answer = { ok: false, note: 'Auto Out failed: offline' };
  refused.setLive({ A: 'a' });
  refused.engine.onMarker(take('a'));
  refused.engine.onProgramState('A');
  await refused.advance(4000);
  assert.deepEqual(refused.notes, ['Auto Out failed: offline']);
  assert.deepEqual(refused.getLive(), { A: 'a' });
  assert.deepEqual(refused.logs, []);
  refused.engine.stop();
});

test('a marker replaces its layer\'s countdown: a manual cue\'s Take and an Out drop it, a direct Take arms its own', () => {
  const r = rig();
  r.engine.onMarker(take('a'));
  r.engine.onMarker(take('b').map((item) => ({ ...item, graphic: 'A' })));
  assert.deepEqual(r.arms(), {}, 'a manual cue on the layer replaces the countdown');
  assert.equal(r.timers().length, 0);
  r.engine.onMarker(take('a'));
  r.engine.onMarker([{ graphic: 'A', msg: { t: 'cue', cue: null } }]);
  assert.deepEqual(r.arms(), {});
  r.engine.onMarker([{ graphic: 'A', msg: { t: 'cue', cue: 'b', direct: true, auto: { then: 'out', ms: 6000 } } }]);
  assert.equal(r.arms().A.ms, 6000);
  assert.equal(r.arms().A.next, undefined, 'a direct Take takes no next cue');
  r.engine.onMarker([{ graphic: 'B', msg: { t: 'update', data: {} } }]);
  assert.deepEqual(Object.keys(r.arms()), ['A'], 'an Update moves no countdown');
  assert.deepEqual(r.engine.specFor('a'), { auto: { after: 4, then: 'out' }, next: 'b' });
  assert.equal(r.engine.specFor('b'), null);
  r.page.timedOff = true;
  assert.equal(r.engine.specFor('a'), null, 'a server that keeps no arms times nothing');
  r.engine.stop();
});

test('stop leaves no timer or listener live, and a late callback writes nothing', async () => {
  const r = rig();
  r.engine.onMarker(take('a'));
  r.engine.onProgramState('A');
  const [timer] = r.timers();
  const [visible] = [...r.visibles];
  r.engine.stop();
  assert.equal(r.timers().length, 0, 'the timer is cleared');
  assert.equal(r.visibles.size, 0, 'the tab listener is gone');
  const before = r.arms();
  r.clock.now += 4000;
  timer.run();
  visible.run();
  r.engine.runDue();
  r.engine.onMarker(take('a'));
  r.engine.onProgramState('A');
  r.engine.hold('A');
  r.engine.manual('A');
  r.engine.update({ published: false, timedCues: false });
  await settle();
  assert.equal(r.sent.length, 0);
  assert.equal(r.arms(), before, 'the part is as the stop left it');
  assert.equal(r.timers().length, 0);
  assert.deepEqual(r.logs, []);
});

test('a restart on the same session (StrictMode\'s second mount) keeps the countdown and fires it once', async () => {
  const session = createPlayoutSession('prod-1');
  const first = rig({ session });
  first.engine.onMarker(take('a'));
  first.engine.onProgramState('A');
  first.engine.stop();
  const second = rig({ session });
  second.clock.now = first.clock.now;
  second.setLive({ A: 'a' });
  assert.equal(session.arms.get().A.phase, 'running', 'the part outlives the engine');
  assert.equal(second.wake(), 4000);
  assert.equal(first.timers().length, 0, 'the first engine left nothing live');
  await second.advance(4000);
  await first.advance(4000);
  assert.equal(first.sent.length + second.sent.length, 1, 'one fire, from the live engine');
  second.engine.stop();
});

test('the session\'s end stops the engine, and an engine on an ended session starts stopped', async () => {
  const r = rig();
  r.engine.onMarker(take('a'));
  r.session.dispose();
  assert.equal(r.timers().length, 0);
  assert.equal(r.visibles.size, 0);
  const late = rig({ session: r.session });
  late.engine.onMarker(take('a'));
  assert.equal(late.timers().length, 0);
  assert.equal(late.visibles.size, 0);
});

test('published, the timer stops, Hold and Manual go to the wire, and PROGRAM\'s reply anchors nothing', async () => {
  const r = rig();
  r.engine.onMarker(take('a'));
  r.page.published = true;
  r.engine.update({ published: true, timedCues: false });
  assert.deepEqual(r.arms(), {}, 'a server without arms: what this page held goes');
  assert.equal(r.timers().length, 0);
  assert.equal(r.visibles.size, 0);
  r.engine.update({ published: true, timedCues: true });
  // The wire keeps the arms now; a lane it set waits for the server's anchor.
  r.session.apply((parts) => ({ ...parts, arms: { A: { cue: 'a', then: 'out', takenAt: r.clock.now, phase: 'waiting', ms: 4000 } } }));
  assert.equal(r.timers().length, 0, 'published, this engine never times');
  r.engine.onProgramState('A');
  assert.equal(r.arms().A.phase, 'waiting');
  r.engine.hold('A');
  r.engine.manual('A');
  assert.deepEqual(r.wire, ['hold A', 'manual A']);
  assert.equal(r.arms().A.phase, 'waiting', 'the wire, not this page, moves a published arm');
  // The wire's fire: the server already checked the lane, so the Out goes without this page's view.
  await r.engine.fire('A', r.arms().A);
  assert.equal(r.sent.length, 1);
  assert.deepEqual(r.logs, [], 'the server\'s row says it on every page');
  r.engine.update({ published: true, timedCues: true });
  assert.equal(r.arms().A.phase, 'waiting', 'an update that changes nothing clears nothing');
  r.engine.stop();
});

test('the arms part is set after data and bridge, and heard only when it moves', () => {
  const session = createPlayoutSession('prod-1');
  const heard = [];
  session.data.subscribe(() => heard.push('data'));
  session.bridge.subscribe(() => heard.push('bridge'));
  session.arms.subscribe(() => heard.push('arms'));
  assert.deepEqual(session.arms.get(), {});
  session.apply((parts) => ({ data: { ...parts.data, dataKey: null }, bridge: { ...parts.bridge, learntFacts: 'x' }, arms: { A: {} } }));
  assert.deepEqual(heard, ['data', 'bridge', 'arms']);
  session.apply((parts) => parts);
  assert.deepEqual(heard, ['data', 'bridge', 'arms']);
});

test('a next cue that shows a live candidate is never taken by a timed end, whatever an older arm named (E7.1)', async () => {
  const r = rig({ cues: [timed('a', 2, 'next'), manual('b')] });
  r.engine.onMarker(take('a'));
  assert.equal(r.arms().A.next, 'b', 'armed before the cue had a selection');
  r.page.cues = [timed('a', 2, 'next'), { ...manual('b'), selection: { v: 1, recipe: 'cands', key: ['D1', 7] } }];
  r.engine.onProgramState('A');
  await r.advance(2000);
  assert.equal(r.sent.length, 0);
  assert.deepEqual(r.notes, ['b shows a live candidate, so a timed end does not take it.']);
  r.engine.stop();
});

test('nor one that carries typed OGraf data: its native strings are not its data (E1.2a)', async () => {
  const r = rig({ cues: [timed('a', 2, 'next'), manual('b')] });
  r.engine.onMarker(take('a'));
  assert.equal(r.arms().A.next, 'b', 'armed before the cue had typed data');
  r.page.cues = [timed('a', 2, 'next'), { ...manual('b'), typed: { v: 1, kind: 'values', standard: 'x', schema: 'y', values: {} } }];
  r.engine.onProgramState('A');
  await r.advance(2000);
  assert.equal(r.sent.length, 0);
  assert.deepEqual(r.notes, ['b has typed data, so a timed end does not take it.']);
  r.engine.stop();
});

test('a timed end\'s Out is a press on its layer too, settled by its answer, so no correction overtakes it (E7.1)', async () => {
  for (const [answer, outcome] of [
    [OK, ['landed']],
    [{ ok: false, note: 'no route', uncertain: true }, ['undo', true]],
  ]) {
    const r = rig({ cues: [timed('a', 2, 'out')] });
    const presses = [];
    r.page.selectionAired = (graphic, cueId, take, moves) => {
      presses.push(['press', graphic, cueId, take.status, moves]);
      return { landed: () => presses.push(['landed']), undo: (failed) => presses.push(['undo', failed?.uncertain === true]) };
    };
    r.page.answer = answer;
    r.engine.onMarker(take('a'));
    r.setLive({ A: 'a' });
    r.engine.onProgramState('A');
    await r.advance(2000);
    assert.deepEqual(presses, [['press', 'A', '', 'none', true], outcome], JSON.stringify(answer));
    r.engine.stop();
  }
});

test('a timed end\'s Take of the next cue is a press on that layer: a live candidate it follows waits for its answer (E7.1)', async () => {
  for (const [answer, outcome] of [
    [OK, 'landed'],
    [{ ok: false, note: 'no route' }, 'undo'],
    [{ ...OK, skipped: ['B'] }, 'undo'],
  ]) {
    const r = rig({ cues: [timed('a', 2, 'next'), manual('b')] });
    const presses = [];
    r.page.selectionAired = (graphic, cueId, take, moves) => {
      presses.push(['press', graphic, cueId, take.status, moves]);
      return { landed: () => presses.push(['landed']), undo: () => presses.push(['undo']) };
    };
    r.page.answer = answer;
    r.engine.onMarker(take('a'));
    r.setLive({ A: 'a' });
    r.engine.onProgramState('A');
    await r.advance(2000);
    assert.deepEqual(presses, [['press', 'B', 'b', 'none', true], [outcome]], JSON.stringify(answer));
    r.engine.stop();
  }
});
