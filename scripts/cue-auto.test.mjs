// guards: src/control/cueAuto.ts, src/model/shows.ts
//
// TIMED GRAPHIC CUES, the rules in Node (docs/RUNDOWN_AUTOMATION_PLAN.md §2.0 and §2.10): what each
// marker does to a lane, the on-air anchor and its fallback, hold and resume, the 5 s late limit,
// the chip's choice, the next graphic cue and the last-cue case. The browser half - that the
// production page wires them - is e2e/rundown-timing.spec.ts.

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
  assert.deepEqual([...armedNext(arms)], [['b', 'A']]);
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
