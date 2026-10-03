// guards: src/control/cueAuto.ts, src/model/shows.ts, src/control/cueArmWire.ts
//
// TIMED GRAPHIC CUES, the rules in Node (docs/RUNDOWN_AUTOMATION_PLAN.md §2.0 and §2.10): what each
// marker does to a lane, the on-air anchor and its fallback, hold and resume, the 5 s late limit,
// the chip's choice, the next graphic cue and the last-cue case. The browser half - that the
// production page wires them - is e2e/rundown-timing.spec.ts; the published wire against a real
// database is e2e/configured/rundown-timing-recovery.spec.ts and migration 0075's self-check.

import test from 'node:test';
import assert from 'node:assert/strict';

const auto = await import('../src/control/cueAuto.ts');
const {
  AIR_WAIT_MS,
  LATE_LIMIT_MS,
  aired,
  armedNext,
  chipLane,
  cleanAfter,
  countText,
  deadline,
  dropArm,
  dueLanes,
  hold,
  lengthWords,
  markMissed,
  markerEffect,
  nextGraphicCue,
  nextWake,
  readAuto,
  remaining,
  resume,
  settleWaiting,
} = auto;

const spec = (after, then, next = null) => ({ auto: { after, then }, next });

test('a length is seconds to one decimal, from half a second to a day', () => {
  assert.equal(cleanAfter(8), 8);
  assert.equal(cleanAfter(2.54), 2.5);
  assert.equal(cleanAfter(0.4), null);
  assert.equal(cleanAfter(86_401), null);
  assert.equal(cleanAfter(Number.NaN), null);
});

test('a record is read as timed only when it is a graphic cue with a length and a known end', () => {
  assert.deepEqual(readAuto({ auto: { after: 8, then: 'out' } }), { after: 8, then: 'out' });
  assert.equal(readAuto({}), null);
  assert.equal(readAuto({ source: 'playout', auto: { after: 8, then: 'out' } }), null, 'a server cue is never timed in build 1');
  assert.equal(readAuto({ auto: { after: 8, then: 'sideways' } }), null, 'an end a newer build wrote reads as manual');
  assert.equal(readAuto({ auto: { after: 'clip', then: 'out' } }), null);
});

test('Next cue takes the first graphic cue after this one, past server cues; the last has none', () => {
  const cues = [{ id: 'a' }, { id: 'clip', source: 'playout' }, { id: 'b' }, { id: 'c' }];
  assert.equal(nextGraphicCue(cues, 'a'), 'b');
  assert.equal(nextGraphicCue(cues, 'b'), 'c');
  assert.equal(nextGraphicCue(cues, 'c'), null);
  assert.equal(nextGraphicCue(cues, 'gone'), null);
});

test('a Take arms its lane waiting; an Out, a manual Take or All out replaces it; no marker no change', () => {
  let arms = markerEffect({}, 'Lower', 'a', spec(8, 'out-next', 'b'), 1000);
  assert.deepEqual(arms.Lower, { cue: 'a', then: 'out-next', next: 'b', takenAt: 1000, phase: 'waiting', ms: 8000 });
  assert.equal(remaining(arms.Lower, 99_999), 8000, 'nothing counts until it is on air');
  assert.equal(deadline(arms.Lower), null);
  // A re-take of the same cue arms it again with its full length.
  arms = aired(arms, 'Lower', 1100);
  arms = markerEffect(arms, 'Lower', 'a', spec(8, 'out-next', 'b'), 5000);
  assert.equal(arms.Lower.phase, 'waiting');
  assert.equal(arms.Lower.takenAt, 5000);
  // A Take of a manual cue on the layer, and an Out, replace it.
  assert.equal(markerEffect(arms, 'Lower', 'z', null, 6000).Lower, undefined);
  assert.equal(markerEffect(arms, 'Lower', null, null, 6000).Lower, undefined);
  // An Out on another layer leaves it alone, and returns the same object.
  assert.equal(markerEffect(arms, 'Bug', null, null, 6000), arms);
  // `Out` arms no next even when the rundown has one.
  assert.equal(markerEffect({}, 'Lower', 'a', spec(8, 'out', 'b'), 0).Lower.next, undefined);
});

test('the countdown starts when the output holds the cue, or from the Take when no output says so', () => {
  let arms = markerEffect({}, 'Lower', 'a', spec(8, 'out'), 1000);
  const airedAt = aired(arms, 'Lower', 1700);
  assert.equal(airedAt.Lower.phase, 'running');
  assert.equal(deadline(airedAt.Lower), 9700);
  assert.equal(remaining(airedAt.Lower, 5700), 4000);
  // A second report changes nothing: the anchor never moves.
  assert.equal(aired(airedAt, 'Lower', 2500), airedAt);
  // Nothing said so: the fallback is the Take, once AIR_WAIT_MS has passed, and not before.
  assert.equal(settleWaiting(arms, 1000 + AIR_WAIT_MS - 1), arms);
  arms = settleWaiting(arms, 1000 + AIR_WAIT_MS);
  assert.equal(deadline(arms.Lower), 9000);
  assert.equal(nextWake(markerEffect({}, 'L', 'a', spec(8, 'out'), 1000), 1000), AIR_WAIT_MS, 'a waiting arm wakes the page for its fallback');
});

test('hold freezes the remainder, resume counts it from now, and a held arm is never due', () => {
  let arms = aired(markerEffect({}, 'Lower', 'a', spec(4, 'out-next', 'b'), 0), 'Lower', 0);
  const held = hold(arms, 'Lower', 2000);
  assert.equal(held.Lower.phase, 'held');
  assert.equal(held.Lower.ms, 2000);
  assert.deepEqual(dueLanes(held, 60_000), { fire: [], missed: [] });
  assert.equal(nextWake(held, 3000), null);
  arms = resume(held, 'Lower', 12_000);
  assert.equal(deadline(arms.Lower), 14_000);
  assert.deepEqual(dueLanes(arms, 13_999).fire, []);
  assert.deepEqual(dueLanes(arms, 14_000).fire, ['Lower']);
  // A hold at or past the deadline is too late: the end action is on its way.
  assert.equal(hold(arms, 'Lower', 14_000), 'due');
  // A waiting arm holds with its full length.
  assert.equal(hold(markerEffect({}, 'L', 'a', spec(8, 'out'), 0), 'L', 10).L.ms, 8000);
  assert.equal(resume(arms, 'Lower', 0), null, 'only a held arm resumes');
});

test('an end action more than 5 s late is missed, stays missed, and never fires', () => {
  let arms = aired(markerEffect({}, 'Lower', 'a', spec(8, 'out'), 0), 'Lower', 0);
  assert.deepEqual(dueLanes(arms, 8000 + LATE_LIMIT_MS), { fire: ['Lower'], missed: [] });
  assert.deepEqual(dueLanes(arms, 8001 + LATE_LIMIT_MS), { fire: [], missed: ['Lower'] });
  arms = markMissed(arms, 'Lower');
  assert.deepEqual(arms.Lower, { cue: 'a', then: 'out', takenAt: 0, phase: 'missed', dueAt: 8000 });
  assert.deepEqual(dueLanes(arms, 20_000), { fire: [], missed: [] });
  assert.equal(nextWake(arms, 20_000), null);
  // Manual, or a new marker on the layer, clears it.
  assert.equal(dropArm(arms, 'Lower').Lower, undefined);
  assert.equal(markerEffect(arms, 'Lower', 'b', null, 30_000).Lower, undefined);
});

test('the chip shows the running countdown that fires soonest, then one waiting, then the latest held', () => {
  let arms = aired(markerEffect({}, 'A', 'a', spec(10, 'out'), 0), 'A', 0);
  arms = aired(markerEffect(arms, 'B', 'b', spec(5, 'out'), 0), 'B', 0);
  arms = markerEffect(arms, 'C', 'c', spec(1, 'out'), 0);
  assert.equal(chipLane(arms), 'B');
  arms = hold(arms, 'B', 1000);
  assert.equal(chipLane(arms), 'A');
  arms = hold(arms, 'A', 2000);
  assert.equal(chipLane(arms), 'C', 'a countdown waiting for air comes before a held one');
  arms = dropArm(arms, 'C');
  assert.equal(chipLane(arms), 'A', 'the one held most recently');
  assert.equal(chipLane({}), null);
});

test('the armed next cue is marked by every lane that will take it', () => {
  const arms = markerEffect(markerEffect({}, 'A', 'a', spec(4, 'next', 'b'), 0), 'C', 'c', spec(4, 'out', 'd'), 0);
  assert.deepEqual([...armedNext(arms).keys()], ['b']);
  assert.equal(armedNext(arms).get('b'), arms.A);
});

test('counts round up to whole seconds, and lengths keep their tenth', () => {
  assert.equal(countText(5000), '0:05');
  assert.equal(countText(4001), '0:05');
  assert.equal(countText(1), '0:01');
  assert.equal(countText(0), '0:00');
  assert.equal(countText(75_000), '1:15');
  assert.equal(lengthWords(8), '0:08');
  assert.equal(lengthWords(2.5), '0:02.5');
});

// ── The wire: a published production (phase 2, migration 0075) ─────────────────────────────────

const { armRowEffect, laneFromWire, markerAuto, readMarkerAuto, readWireArm } = auto;
const { createCueArmWire } = await import('../src/control/cueArmWire.ts');

test('a Take marker carries what it arms, and a marker this build cannot read arms nothing', () => {
  assert.deepEqual(markerAuto(spec(8, 'out-next', 'b')), { then: 'out-next', ms: 8000, next: 'b' });
  assert.deepEqual(markerAuto(spec(8, 'out', 'b')), { then: 'out', ms: 8000 }, 'Out takes no next cue');
  assert.deepEqual(readMarkerAuto({ then: 'next', ms: 4000, next: 'b' }), { then: 'next', ms: 4000, next: 'b' });
  assert.equal(readMarkerAuto({ then: 'sideways', ms: 4000 }), null);
  assert.equal(readMarkerAuto({ then: 'out', ms: 100 }), null, 'shorter than half a second');
  assert.equal(readMarkerAuto(null), null);
  assert.equal(readWireArm({ cue: 'a', then: 'out', ms: 1 }), null, 'an arm without its Take');
});

test('published, the rows move a lane: marker, anchor, hold, fire, Out', () => {
  const skew = 1000; // this page's clock is a second ahead of the server's
  const take = { t: 'cue', cue: 'a', auto: { then: 'out-next', ms: 4000, next: 'b' } };
  let arms = armRowEffect({}, 'A', take, { seq: 7, rowAt: 50_000 }, skew);
  assert.deepEqual(arms.A, { cue: 'a', then: 'out-next', next: 'b', takenAt: 51_000, phase: 'waiting', ms: 4000, take: 7 });
  const wire = { cue: 'a', then: 'out-next', ms: 4000, next: 'b', take: 7, take_at: 50_000 };
  arms = armRowEffect(arms, 'A', { t: 'cue', cue: 'a', arm: 'aired', auto: { ...wire, from: 50_800 } }, { seq: 9, rowAt: 50_900 }, skew);
  assert.equal(arms.A.phase, 'running');
  assert.equal(deadline(arms.A), 55_800, 'the server anchor, on this clock');
  arms = armRowEffect(arms, 'A', { t: 'cue', cue: 'a', arm: 'hold', auto: { ...wire, ms: 2500, held: true } }, { seq: 10, rowAt: 52_300 }, skew);
  assert.equal(arms.A.phase, 'held');
  assert.equal(remaining(arms.A, 99_999), 2500, 'a held count stays frozen');
  arms = armRowEffect(arms, 'A', { t: 'cue', cue: 'a', arm: 'fire', then: 'out-next' }, { seq: 11, rowAt: 56_000 }, skew);
  assert.equal(arms.A, undefined, 'a fire ends the arm');
  arms = armRowEffect(armRowEffect({}, 'A', take, { seq: 12, rowAt: 60_000 }, 0), 'A', { t: 'cue', cue: null }, { seq: 15, rowAt: 61_000 }, 0);
  assert.deepEqual(arms, {}, 'an Out replaces the countdown');
  const missed = laneFromWire({ ...wire, from: 50_000, due: 54_000 }, skew, 0);
  assert.equal(missed.phase, 'missed');
  assert.equal(missed.dueAt, 55_000);
});

/**
 * A stand-in for control_cue_arm with the migration's rules: an arm read off the latest marker,
 * `aired` from a covering report or 3 s, `fire` once in [deadline, deadline + 5 s], `late` after.
 * Every page shares it, which is what makes "exactly once" a question the test can ask.
 */
function fakeServer(clock) {
  let seq = 0;
  const rows = [];
  const arms = new Map();
  const write = (graphic, msg) => {
    seq += 1;
    rows.push({ id: seq, seq, graphic, msg, created_at: new Date(clock.now).toISOString() });
    return seq;
  };
  const wireOf = (a) =>
    a.ended
      ? null
      : {
          cue: a.cue,
          then: a.then,
          ms: a.held ?? a.ms,
          take: a.take,
          take_at: a.take_at,
          ...(a.next ? { next: a.next } : {}),
          ...(a.missed ? { due: a.from + a.ms } : a.held !== undefined ? { held: true } : a.from !== undefined ? { from: a.from } : {}),
        };
  return {
    rows,
    take(graphic, cue, autoSpec) {
      const at = write(graphic, { t: 'cue', cue, ...(autoSpec ? { auto: autoSpec } : {}) });
      if (autoSpec) arms.set(graphic, { cue, ...autoSpec, take: at, take_at: clock.now });
      else arms.delete(graphic);
      return at;
    },
    report(graphic) {
      write(graphic, { t: 'live' });
      const a = arms.get(graphic);
      if (a) a.reportAt = clock.now;
    },
    async arm(_slug, graphic, cue, op) {
      const a = arms.get(graphic);
      const ans = (ok, extra = {}) => ({ ok, rev: seq, at: clock.now, arm: a ? wireOf(a) : null, ...extra });
      if (!a || a.cue !== cue || a.ended) return { ok: false, reason: 'gone', rev: seq, at: clock.now, arm: null };
      const mark = (name) => {
        const msg = { t: 'cue', cue, arm: name, then: a.then };
        const w = wireOf(a);
        write(graphic, w ? { ...msg, auto: w } : msg);
        return ans(name !== 'late', { op: name, ...(name === 'late' ? { reason: 'late' } : {}) });
      };
      const phase = a.missed ? 'missed' : a.held !== undefined ? 'held' : a.from === undefined ? 'waiting' : 'running';
      if (op === 'aired') {
        if (phase !== 'waiting') return ans(true);
        if (a.reportAt !== undefined) a.from = a.reportAt;
        else if (clock.now >= a.take_at + 3000) a.from = a.take_at;
        else return ans(false, { reason: 'waiting', ms: a.take_at + 3000 - clock.now });
        return mark('aired');
      }
      if (op === 'hold') {
        if (phase !== 'running') return ans(phase === 'held', phase === 'held' ? {} : { reason: phase });
        if (a.from + a.ms - clock.now <= 0) return ans(false, { reason: 'due' });
        a.held = a.from + a.ms - clock.now;
        a.from = undefined;
        return mark('hold');
      }
      if (op === 'resume') {
        if (phase !== 'held') return ans(true);
        a.ms = a.held;
        a.held = undefined;
        a.from = clock.now;
        return mark('resume');
      }
      if (op === 'cancel') {
        a.ended = 'cancel';
        return mark('cancel');
      }
      if (phase !== 'running') return ans(false, { reason: phase });
      const due = a.from + a.ms;
      if (clock.now < due) return ans(false, { reason: 'early', ms: due - clock.now });
      if (clock.now > due + 5000) {
        a.missed = true;
        return mark('late');
      }
      a.ended = 'fire';
      return mark('fire');
    },
    async armsFor() {
      const out = {};
      for (const [g, a] of arms) if (wireOf(a)) out[g] = wireOf(a);
      return { ok: true, arms: out, rev: seq, at: clock.now };
    },
  };
}

/** A shared clock whose timers run in order as time is moved on. */
function fakeClock(start) {
  const timers = new Set();
  return {
    now: start,
    timer(fn, ms) {
      const t = { at: this.now + ms, fn };
      timers.add(t);
      return t;
    },
    cancel(t) {
      timers.delete(t);
    },
    async advance(ms, follow = () => {}) {
      const end = this.now + ms;
      for (;;) {
        await new Promise((r) => setImmediate(r));
        follow();
        const next = [...timers].filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        timers.delete(next);
        this.now = Math.max(this.now, next.at);
        next.fn();
      }
      this.now = end;
      await new Promise((r) => setImmediate(r));
      follow();
    },
  };
}

/** One page: its engine over the shared server, its timers on the shared clock. `offset` is how
 *  far its own clock is from the server's. */
function page(server, clock, fired, offset = 0) {
  let arms = {};
  let delivered = 0;
  const engine = createCueArmWire({
    slug: 's',
    get: () => arms,
    set: (a) => {
      arms = a;
    },
    fire: (lane, arm) => fired.push({ lane, cue: arm.cue }),
    now: () => clock.now + offset,
    rpc: { arm: server.arm, armsFor: server.armsFor },
    setTimer: (fn, ms) => clock.timer(fn, ms),
    clearTimer: (t) => clock.cancel(t),
    random: () => 0,
  });
  return {
    engine,
    arms: () => arms,
    /** Deliver every row this page has not seen, in order: the log follower's job. */
    follow() {
      for (; delivered < server.rows.length; delivered++) engine.row(server.rows[delivered]);
    },
  };
}

test('two pages race at zero and the end action runs exactly once', async () => {
  const clock = fakeClock(1_000_000);
  const server = fakeServer(clock);
  const fired = [];
  const desk = page(server, clock, fired);
  const phone = page(server, clock, fired);
  const followAll = () => {
    desk.follow();
    phone.follow();
  };
  await desk.engine.boot();
  await phone.engine.boot();
  server.take('A', 'a', { then: 'out-next', ms: 4000, next: 'b' });
  followAll();
  assert.equal(desk.arms().A.phase, 'waiting', 'armed, waiting for air');
  await clock.advance(800, followAll);
  server.report('A');
  await clock.advance(100, followAll);
  assert.equal(desk.arms().A.phase, 'running');
  assert.equal(deadline(desk.arms().A), deadline(phone.arms().A), 'both pages count the same second');
  await clock.advance(4_000, followAll);
  assert.deepEqual(fired, [{ lane: 'A', cue: 'a' }]);
  assert.equal(server.rows.filter((r) => r.msg.arm === 'fire').length, 1);
  assert.equal(desk.arms().A, undefined);
  assert.equal(phone.arms().A, undefined);
});

test('no output reports, and the Take is the anchor after 3 s', async () => {
  const clock = fakeClock(2_000_000);
  const server = fakeServer(clock);
  const fired = [];
  const desk = page(server, clock, fired);
  await desk.engine.boot();
  server.take('A', 'a', { then: 'out', ms: 5000 });
  desk.follow();
  await clock.advance(2_900, () => desk.follow());
  assert.equal(desk.arms().A.phase, 'waiting');
  await clock.advance(200, () => desk.follow());
  assert.equal(desk.arms().A.phase, 'running');
  assert.equal(deadline(desk.arms().A), 2_005_000, 'counted from the Take itself');
  assert.deepEqual(fired, [], 'still counting');
  await clock.advance(2_000, () => desk.follow());
  assert.deepEqual(fired, [{ lane: 'A', cue: 'a' }]);
});

test('a hold on one page freezes the count on the other; resume counts on from the remainder', async () => {
  const clock = fakeClock(3_000_000);
  const server = fakeServer(clock);
  const fired = [];
  const desk = page(server, clock, fired);
  const phone = page(server, clock, fired);
  const followAll = () => {
    desk.follow();
    phone.follow();
  };
  await desk.engine.boot();
  await phone.engine.boot();
  server.take('A', 'a', { then: 'out', ms: 4000 });
  server.report('A');
  await clock.advance(10, followAll);
  await clock.advance(2_000, followAll);
  phone.engine.toggleHold('A');
  await clock.advance(10, followAll);
  assert.equal(desk.arms().A.phase, 'held');
  await clock.advance(10_000, followAll);
  assert.deepEqual(fired, [], 'a held count never fires');
  desk.engine.toggleHold('A');
  await clock.advance(1_900, followAll);
  assert.deepEqual(fired, []);
  await clock.advance(200, followAll);
  assert.deepEqual(fired, [{ lane: 'A', cue: 'a' }]);
});

test('a page that opens after the deadline plus 5 s reads Missed, and nothing runs', async () => {
  const clock = fakeClock(4_000_000);
  const server = fakeServer(clock);
  const fired = [];
  server.take('A', 'a', { then: 'out', ms: 2000 });
  server.report('A');
  await server.arm('s', 'A', 'a', 'aired');
  clock.now += 9_000; // every page was closed
  const late = page(server, clock, fired);
  late.follow();
  await late.engine.boot();
  await clock.advance(50, () => late.follow());
  assert.deepEqual(fired, []);
  assert.equal(late.arms().A.phase, 'missed');
  assert.equal(server.rows.filter((r) => r.msg.arm === 'late').length, 1);
  late.engine.manual('A');
  await clock.advance(50, () => late.follow());
  assert.equal(late.arms().A, undefined, 'Manual clears it');
});

test('a page whose clock is ten seconds slow still fires on time', async () => {
  const clock = fakeClock(5_000_000);
  const server = fakeServer(clock);
  const fired = [];
  const slow = page(server, clock, fired, -10_000);
  await slow.engine.boot();
  server.take('A', 'a', { then: 'out', ms: 3000 });
  server.report('A');
  await clock.advance(20, () => slow.follow());
  assert.equal(slow.arms().A.phase, 'running');
  await clock.advance(3_000, () => slow.follow());
  assert.deepEqual(fired, [{ lane: 'A', cue: 'a' }], 'not missed, and not late');
});
