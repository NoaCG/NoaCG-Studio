// guards: src/control/airState.ts, src/control/playoutSession.ts
//
// WHAT THE PAGE BELIEVES IS ON AIR (production-page refactor spec §2, §4.1, AC-4, AC-5): the one
// marker write and its count, a command applied once from any road, the resolve's seed and its
// moves guard, the boot replay, the clocks on the PROGRAM monitor (the productions.spec clock walks,
// now through `programItems`) and the rebuild of a fresh stage. Answers come late, reordered,
// duplicated and after the session's end; every expectation is the operator-visible fact.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  airAtRequest,
  claimAndApply,
  forgetBootReplay,
  logged,
  loggedHere,
  moveLiveCue,
  programItems,
  rememberAired,
  restoreItems,
  seedFromResolve,
  seedOffAirClocks,
  offAirClockGraphics,
  withReports,
} from '../src/control/airState.ts';
import { createAppliedOnce } from '../src/control/commandRoads.ts';
import { clockHeldBeforeRow, clockOriginOf, clockRowEffect, clockValueAfterUpdate, plainClockValue } from '../src/control/matchClockWire.ts';
import { monitorReplay, planOutputRecovery } from '../src/control/outputRecovery.ts';
import { withLiveCue } from '../src/control/liveCue.ts';
import { NO_AIR, NO_LOG, createPlayoutSession } from '../src/control/playoutSession.ts';

const T = 1_755_600_000_000;
const at = (mins) => new Date(T + mins * 60_000).toISOString();
const NO_CLOCKS = { clocks: new Map(), pairs: new Map() };
/** sb09's match clock: counts DOWN from 10:00 in field f5. */
const MATCH = { field: 'f5', countsDown: true, seed: '10:00', resetTo: '10:00' };
const CLOCKS = { clocks: new Map([['score', MATCH]]), pairs: new Map() };
const PAIR = { fieldA: 'fa', fieldB: 'fb', seedA: '05:00', seedB: '05:00', allowanceField: 'fl', allowanceSeed: '05:00', penaltyField: null, penaltySeed: '10' };
const DEBATE = { clocks: new Map(), pairs: new Map([['debate', PAIR]]) };
const play = (graphic, oid) => ({ graphic, msg: { t: 'play', ...(oid ? { oid } : {}) } });
const marker = (graphic, cue, oid) => ({ graphic, msg: { t: 'cue', cue, ...(oid ? { oid } : {}) } });
const update = (graphic, data, oid) => ({ graphic, msg: { t: 'update', data, ...(oid ? { oid } : {}) } });
const plays = (out) => out.filter((item) => item.msg.t === 'play').length;

// ── The marker ─────────────────────────────────────────────────────────────────────────────────

test('every marker write counts as a move, even one that moves nothing', () => {
  let air = moveLiveCue(NO_AIR, (m) => withLiveCue(m, 'lt', 'c1'));
  assert.deepEqual(air.liveCue, { lt: 'c1' });
  assert.equal(air.moves, 1);
  const same = moveLiveCue(air, (m) => withLiveCue(m, 'lt', 'c1'));
  assert.equal(same.liveCue, air.liveCue, 'the same map, so nothing draws again');
  assert.equal(same.moves, 2, 'but the write counts: a resolve in flight must not overwrite it');
  assert.deepEqual(moveLiveCue(same, {}).liveCue, {}, 'a whole map replaces (the first publish)');
  assert.equal(moveLiveCue(same, {}).moves, 3);
});

test('what was aired merges: a partial update keeps the other fields, an event payload counts, a stop forgets', () => {
  let air = rememberAired(NO_AIR, [update('lt', { f0: 'ANNA', f1: 'Host' })]);
  air = rememberAired(air, [update('lt', { f1: 'Guest' })]);
  assert.deepEqual(air.aired.lt, { f0: 'ANNA', f1: 'Guest' });
  air = rememberAired(air, [{ graphic: 'lt', msg: { t: 'event', event: 'goal', payload: { f2: '1' } } }]);
  assert.deepEqual(air.aired.lt, { f0: 'ANNA', f1: 'Guest', f2: '1' });
  const before = air;
  assert.equal(rememberAired(air, [play('lt')]), before, 'a play changes nothing aired, so the same part');
  air = rememberAired(air, [{ graphic: 'lt', msg: { t: 'stop' } }]);
  assert.equal('lt' in air.aired, false);
});

// ── Duplicate delivery on both roads ───────────────────────────────────────────────────────────

test('one press arrives three times - its own send, the broadcast, the durable row - and applies once', () => {
  const applied = createAppliedOnce();
  const press = [update('lt', { f0: 'ANNA' }, 'u1'), play('lt', 'p1'), marker('lt', 'c1', 'm1')];
  let air = NO_AIR;
  const outs = [];
  for (let road = 0; road < 3; road += 1) {
    const run = claimAndApply(air, press, applied, NO_CLOCKS, T);
    air = run.air;
    outs.push(run.out);
  }
  assert.equal(plays(outs[0]), 1, 'the first arrival plays');
  assert.deepEqual(outs[1], [], 'the broadcast is the echo');
  assert.deepEqual(outs[2], [], 'and so is the durable row');
  assert.deepEqual(air.liveCue, { lt: 'c1' });
  assert.equal(air.moves, 1, 'the marker moved once');
  assert.equal(air.commands, 2, 'two commands reached PROGRAM, once each');
  assert.deepEqual(air.aired.lt, { f0: 'ANNA' });
});

test('reordered roads: the row before the broadcast still applies once, and a later press is never mistaken for an echo', () => {
  const applied = createAppliedOnce();
  let air = NO_AIR;
  let run = claimAndApply(air, [play('lt', 'p1')], applied, NO_CLOCKS, T); // the durable row won
  air = run.air;
  assert.equal(plays(run.out), 1);
  run = claimAndApply(air, [play('lt', 'p1')], applied, NO_CLOCKS, T); // the broadcast, late
  assert.equal(plays(run.out), 0);
  run = claimAndApply(run.air, [play('lt', 'p2')], applied, NO_CLOCKS, T); // a new press
  assert.equal(plays(run.out), 1);
  // A command with no id (an old server's row) cannot be told from another: it always applies.
  run = claimAndApply(run.air, [play('lt')], applied, NO_CLOCKS, T);
  run = claimAndApply(run.air, [play('lt')], applied, NO_CLOCKS, T);
  assert.equal(plays(run.out), 1);
  assert.equal(run.air.commands, 4);
});

test('typing, a renderer report and a ping are not commands: nothing for PROGRAM, nothing aired, no move', () => {
  const applied = createAppliedOnce();
  const before = { ...NO_AIR, bootReplay: [play('lt')] };
  const run = claimAndApply(
    before,
    [
      { graphic: 'lt', msg: { t: 'staged', data: { f0: 'typing' } } },
      { graphic: 'lt', msg: { t: 'live', state: null } },
      { graphic: 'lt', msg: { t: 'ping', id: 'x' } },
    ],
    applied,
    NO_CLOCKS,
    T,
  );
  assert.deepEqual(run.out, []);
  assert.equal(run.air, before, 'the same part');
  assert.notEqual(run.air.bootReplay, null, 'the boot replay stands: PROGRAM has not moved past it');
});

test('a command moves PROGRAM past the boot replay; a marker alone does not', () => {
  const applied = createAppliedOnce();
  const booted = { ...NO_AIR, bootReplay: [play('lt')] };
  const onlyMarker = claimAndApply(booted, [marker('lt', 'c1', 'm1')], applied, NO_CLOCKS, T);
  assert.notEqual(onlyMarker.air.bootReplay, null);
  assert.equal(onlyMarker.air.commands, 0);
  const command = claimAndApply(onlyMarker.air, [play('lt', 'p1')], applied, NO_CLOCKS, T);
  assert.equal(command.air.bootReplay, null);
  assert.equal(command.air.commands, 1);
});

// ── The resolve's seed and the moves guard ─────────────────────────────────────────────────────

const RESOLVED = {
  liveCue: { lt: 'c1', score: 'c2' },
  live: { lt: { data: { f0: 'REPORTED' } } },
};
const CUES = [
  { id: 'c1', values: { f0: 'STORED' } },
  { id: 'c2', values: { f1: '0' } },
];

test('a resolve that nothing overtook seeds the marker, what air shows and the boot facts', () => {
  const asked = airAtRequest(NO_AIR);
  const replay = [update('lt', { f1: 'after the report' })];
  const air = seedFromResolve(withReports(NO_AIR, RESOLVED.live), RESOLVED, replay, asked, CUES, NO_CLOCKS);
  assert.deepEqual(air.liveCue, RESOLVED.liveCue);
  assert.equal(air.moves, 1, 'the seed is a write too');
  assert.deepEqual(air.bootLive, RESOLVED.liveCue, 'the boot recovery is keyed on the wire answer');
  // The report, then the rows after it; a layer nobody reported falls back to its cue's values.
  assert.deepEqual(air.aired.lt, { f0: 'REPORTED', f1: 'after the report' });
  assert.deepEqual(air.aired.score, { f1: '0' });
  assert.deepEqual(air.bootReplay, replay);
});

test('THE MOVES GUARD: a Take made while the resolve was in flight stands, and nothing of the stale answer lands', () => {
  const asked = airAtRequest(NO_AIR);
  // The operator takes c9 on the lower third while the read is out.
  const taken = moveLiveCue(NO_AIR, (m) => withLiveCue(m, 'lt', 'c9'));
  const air = seedFromResolve(taken, { liveCue: {}, live: {} }, [], asked, CUES, NO_CLOCKS);
  assert.equal(air, taken, 'the whole answer is skipped');
  assert.deepEqual(air.liveCue, { lt: 'c9' }, 'the chip still names the taken cue');
  assert.equal(air.bootLive, null, 'and no boot recovery replays the old picture over it');
});

test('a layer taken OFF while the resolve was in flight does not come back on air', () => {
  const start = moveLiveCue(NO_AIR, { lt: 'c1' });
  const asked = airAtRequest(start);
  const off = moveLiveCue(start, (m) => withLiveCue(m, 'lt', null));
  const air = seedFromResolve(off, RESOLVED, [], asked, CUES, NO_CLOCKS);
  assert.deepEqual(air.liveCue, {});
});

test('a marker from the wire meanwhile (another operator) also skips the seed: the row carries it in', () => {
  const asked = airAtRequest(NO_AIR);
  const run = claimAndApply(NO_AIR, [marker('score', 'c7', 'm7')], createAppliedOnce(), NO_CLOCKS, T);
  assert.deepEqual(seedFromResolve(run.air, RESOLVED, [], asked, CUES, NO_CLOCKS).liveCue, { score: 'c7' });
});

test('a late resolve over a newer one changes nothing', () => {
  const first = airAtRequest(NO_AIR); // the request that is overtaken
  const newer = seedFromResolve(NO_AIR, { liveCue: { lt: 'c2' }, live: {} }, [], airAtRequest(NO_AIR), CUES, NO_CLOCKS);
  const late = seedFromResolve(newer, { liveCue: { lt: 'c1' }, live: {} }, [], first, CUES, NO_CLOCKS);
  assert.equal(late, newer);
  assert.deepEqual(late.liveCue, { lt: 'c2' });
});

test('a command applied while the replay was read: the seed lands, the rows are not replayed (they are older), and the field the command moved keeps its figure', () => {
  const asked = airAtRequest(NO_AIR);
  const commanded = claimAndApply(NO_AIR, [update('lt', { f0: 'NEWER' }, 'u1')], createAppliedOnce(), NO_CLOCKS, T).air;
  const air = seedFromResolve(commanded, RESOLVED, [update('lt', { f0: 'OLDER ROW' })], asked, CUES, NO_CLOCKS);
  assert.deepEqual(air.liveCue, RESOLVED.liveCue, 'the marker did not move, so it seeds');
  assert.deepEqual(air.bootReplay, []);
  // Heard after the read was asked, the command is at least as new as the report (issue #2088).
  assert.deepEqual(air.aired.lt, { f0: 'NEWER' }, 'the command\'s figure, neither the report nor the older row');
});

test('a +1 heard while the read was out is not put back by the report; the fields it did not move take the report', () => {
  const before = rememberAired(NO_AIR, [{ graphic: 'lt', msg: { t: 'update', data: { f0: 'REPORTED' } } }]);
  const asked = airAtRequest(before);
  const heard = claimAndApply(before, [update('lt', { f0: 'PLUS ONE' }, 'u2')], createAppliedOnce(), NO_CLOCKS, T).air;
  const reported = { liveCue: RESOLVED.liveCue, live: { lt: { data: { f0: 'REPORTED', f1: 'ALSO REPORTED' } } } };
  const air = seedFromResolve(heard, reported, [], asked, CUES, NO_CLOCKS);
  assert.deepEqual(air.aired.lt, { f0: 'PLUS ONE', f1: 'ALSO REPORTED' });
  // With nothing applied meanwhile the report still stands over what the page held.
  assert.deepEqual(seedFromResolve(before, reported, [], asked, CUES, NO_CLOCKS).aired.lt, { f0: 'REPORTED', f1: 'ALSO REPORTED' });
});

test('a clock a command moved while the read was out keeps this page\'s memory and figure, not the older report\'s', () => {
  const asked = airAtRequest(NO_AIR);
  const heard = claimAndApply(NO_AIR, [update('score', { f5: `09:00@${T}` }, 'u3')], createAppliedOnce(), CLOCKS, T).air;
  assert.notEqual(heard.clocks.score, undefined, 'the command set the clock memory');
  const air = seedFromResolve(heard, { liveCue: { score: 'c2' }, live: { score: { data: { f5: `10:00@${T}` } } } }, [], asked, CUES, CLOCKS);
  assert.equal(air.clocks.score, heard.clocks.score);
  assert.equal(air.aired.score.f5, heard.aired.score.f5);
});

test('a speaking pair a command moved while the read was out keeps this page\'s memory, not the older report\'s', () => {
  const asked = airAtRequest(NO_AIR);
  const heard = claimAndApply(NO_AIR, [update('debate', { fa: `04:00@${T}`, fb: '05:00' }, 'u4')], createAppliedOnce(), DEBATE, T).air;
  assert.notEqual(heard.speaking.debate, undefined, 'the command set the pair\'s memory');
  const air = seedFromResolve(heard, { liveCue: { debate: 'c3' }, live: { debate: { data: { fa: `05:00@${T}`, fb: '05:00' } } } }, [], asked, CUES, DEBATE);
  assert.deepEqual(air.speaking.debate, heard.speaking.debate);
});

test('a speaking pair with one field moved while the read was out: that field keeps this page\'s memory, the other takes the report\'s', () => {
  const before = claimAndApply(NO_AIR, [update('debate', { fa: '05:00', fb: '05:00' }, 'u5')], createAppliedOnce(), DEBATE, T).air;
  const asked = airAtRequest(before);
  const heard = claimAndApply(before, [update('debate', { fa: `04:00@${T}` }, 'u6')], createAppliedOnce(), DEBATE, T).air;
  const air = seedFromResolve(heard, { liveCue: { debate: 'c3' }, live: { debate: { data: { fa: `05:00@${T}`, fb: `04:30@${T}` } } } }, [], asked, CUES, DEBATE);
  assert.equal(air.speaking.debate.fa, heard.speaking.debate.fa, 'the moved field keeps the page\'s memory');
  assert.equal(air.speaking.debate.fb, `04:30@${T}`, 'the other takes the report\'s stamped value');
  assert.equal(air.aired.debate.fb, '04:30', 'and its baseline is plain');
  assert.equal(air.aired.debate.fa, heard.aired.debate.fa);
});

test('a field a command set during the read counts as moved even when it set the figure the page already held', () => {
  // The page holds 5 (a row was missed on a reconnect); the screen and the report say 8; a
  // command heard during the read sets 5 again, and that command is what the screen shows now.
  const before = rememberAired(NO_AIR, [{ graphic: 'lt', msg: { t: 'update', data: { f0: '5' } } }]);
  const asked = airAtRequest(before);
  const heard = claimAndApply(before, [update('lt', { f0: '5' }, 'u7')], createAppliedOnce(), NO_CLOCKS, T).air;
  const reported = { liveCue: RESOLVED.liveCue, live: { lt: { data: { f0: '8' } } } };
  assert.deepEqual(seedFromResolve(heard, reported, [], asked, CUES, NO_CLOCKS).aired.lt, { f0: '5' });
  // +1 then -1 during the read: both commands moved it, and the last stands.
  const twice = claimAndApply(before, [update('lt', { f0: '6' }, 'u8'), update('lt', { f0: '5' }, 'u9')], createAppliedOnce(), NO_CLOCKS, T).air;
  assert.deepEqual(seedFromResolve(twice, reported, [], asked, CUES, NO_CLOCKS).aired.lt, { f0: '5' });
});

test('a live graphic with nothing to seed from keeps its whole record when a +1 is heard during the read', () => {
  const before = rememberAired(NO_AIR, [{ graphic: 'lt', msg: { t: 'update', data: { f0: '5', f1: 'NAME' } } }]);
  const asked = airAtRequest(before);
  const heard = claimAndApply(before, [update('lt', { f0: '6' }, 'u10')], createAppliedOnce(), NO_CLOCKS, T).air;
  // Live on a cue this page has no values for, and no renderer report yet.
  const air = seedFromResolve(heard, { liveCue: { lt: 'gone' }, live: {} }, [], asked, CUES, NO_CLOCKS);
  assert.deepEqual(air.aired.lt, { f0: '6', f1: 'NAME' });
});

test('a field kept over the report still takes another screen\'s later row once it is heard', () => {
  // After a reconnect the report already holds another screen's 9; this page's +1 (8) is heard
  // during the read, so the seed keeps 8; the other screen's row, heard next, puts 9.
  const before = rememberAired(NO_AIR, [{ graphic: 'lt', msg: { t: 'update', data: { f0: '7' } } }]);
  const asked = airAtRequest(before);
  const applied = createAppliedOnce();
  const heard = claimAndApply(before, [update('lt', { f0: '8' }, 'mine')], applied, NO_CLOCKS, T).air;
  const seeded = seedFromResolve(heard, { liveCue: RESOLVED.liveCue, live: { lt: { data: { f0: '9' } } } }, [], asked, CUES, NO_CLOCKS);
  assert.equal(seeded.aired.lt.f0, '8');
  const caught = claimAndApply(seeded, [update('lt', { f0: '9' }, 'theirs')], applied, NO_CLOCKS, T).air;
  assert.equal(caught.aired.lt.f0, '9');
});

test('a reported clock keeps its origin stamp in the monitor memory and the plain time in the baseline', () => {
  const live = { score: { data: { f5: `10:00@${T}` } } };
  const air = seedFromResolve(NO_AIR, { liveCue: { score: 'c2' }, live }, [], airAtRequest(NO_AIR), CUES, CLOCKS);
  assert.equal(air.clocks.score, `10:00@${T}`);
  assert.equal(air.aired.score.f5, '10:00', 'a stamped value would read as "not on air yet" forever');
});

// ── A clock verb heard while the read was out (#2099): replayed over the report ─────────────────

const verb = (graphic, event, oid) => ({ graphic, msg: { t: 'event', event, oid } });
const SECOND = 1_000;
const MINUTE = 60 * SECOND;
/** The score graphic live on c2, its renderer reporting this clock value. */
const reportedClock = (f5) => ({ liveCue: { score: 'c2' }, live: { score: { data: { f5 } } } });
/** The debate board live on c3, its renderer reporting these two clocks. */
const reportedPair = (fa, fb, more = {}) => ({ liveCue: { debate: 'c3' }, live: { debate: { data: { fa, fb, ...more } } } });
/** The read is asked, on this air. */
const asking = (air) => ({ listening: air, asked: airAtRequest(air) });
const assertClock = (raw, time, origin, label) => {
  assert.equal(plainClockValue(raw), time, label);
  assert.equal(clockOriginOf(raw), origin, label);
};

test('a fresh page loses no start: the clock runs from the reported time at the instant it was heard, and PROGRAM rebuilds it so (#2099)', () => {
  const { listening, asked } = asking(NO_AIR);
  const heard = claimAndApply(listening, [verb('score', 'clockStart', 's1')], createAppliedOnce(), CLOCKS, T + 3 * MINUTE).air;
  const report = reportedClock('07:00');
  const air = seedFromResolve(withReports(heard, report.live), report, [], asked, CUES, CLOCKS);
  assertClock(air.clocks.score, '7:00', T + 3 * MINUTE, 'running from 07:00 at T+3 min');
  assert.equal(air.aired.score.f5, '7:00', 'the baseline is its plain time');
  // The stage comes up from the report and takes the verb itself, with its origin written before it.
  const rebuilt = restoreItems(air, {}, CLOCKS);
  const out = programItems(rebuilt.air, rebuilt.items, CLOCKS, T + 4 * MINUTE).out;
  const start = out.findIndex((item) => item.msg.t === 'event');
  assert.equal(out[start].msg.event, 'clockStart', 'the machine moves with the clock');
  assertClock(out[start - 1].msg.data.f5, '7:00', T + 3 * MINUTE, 'the monitor is handed the running clock');
});

test('a fresh page loses no reset: back to the reset time, stopped, over a running report (#2099)', () => {
  const { listening, asked } = asking(NO_AIR);
  const heard = claimAndApply(listening, [verb('score', 'clockReset', 'r1')], createAppliedOnce(), CLOCKS, T + MINUTE).air;
  const air = seedFromResolve(heard, reportedClock(`07:00@${T}`), [], asked, CUES, CLOCKS);
  assertClock(air.clocks.score, MATCH.resetTo, null, 'resetTo, stopped');
  assert.equal(air.aired.score.f5, MATCH.resetTo);
});

test('a stale stop acts on the report, never on the stale stamp this page held (#2099)', () => {
  // The page held 10:00 running since T; it missed the rows that reset the clock on the output.
  const { listening, asked } = asking({ ...NO_AIR, clocks: { score: `10:00@${T}` } });
  const heard = claimAndApply(listening, [verb('score', 'clockStop', 'h1')], createAppliedOnce(), CLOCKS, T + 5 * MINUTE).air;
  assert.equal(plainClockValue(heard.clocks.score), '5:00', 'worked out from the stale stamp');
  const air = seedFromResolve(heard, reportedClock('10:00'), [], asked, CUES, CLOCKS);
  assertClock(air.clocks.score, '10:00', null, '10:00 stopped, not 5:00');
  assert.equal(air.aired.score.f5, '10:00');
  // The same stop over a report that runs on a stamp of its own banks the report's time.
  const running = seedFromResolve(heard, reportedClock(`10:00@${T + 4 * MINUTE}`), [], asked, CUES, CLOCKS);
  assertClock(running.clocks.score, '9:00', null, 'stopped where the report had it at T+5 min');
});

test('a switch over a running report: the one speaking stops where it stood, the other runs from that instant (#2099)', () => {
  const { listening, asked } = asking({ ...NO_AIR, speaking: { debate: { fa: '05:00', fb: '05:00' } } });
  const heard = claimAndApply(listening, [verb('debate', 'switch', 'w1')], createAppliedOnce(), DEBATE, T + 30 * SECOND).air;
  const air = seedFromResolve(heard, reportedPair('05:00', `05:00@${T}`), [], asked, CUES, DEBATE);
  assertClock(air.speaking.debate.fb, '04:30', null, 'fb stopped where it stood at T+30 s');
  assertClock(air.speaking.debate.fa, '05:00', T + 30 * SECOND, 'fa running from that instant');
  assert.equal(air.aired.debate.fa, '05:00');
  assert.equal(air.aired.debate.fb, '04:30');
});

test('no clock verb heard: the report seeds the clocks exactly as it always did (#2099)', () => {
  const specs = { clocks: CLOCKS.clocks, pairs: DEBATE.pairs };
  const { listening, asked } = asking(NO_AIR);
  const reported = { liveCue: { score: 'c2', debate: 'c3' }, live: { score: { data: { f5: `07:00@${T}`, f1: '3' } }, debate: { data: { fa: `04:00@${T}`, fb: '03:30' } } } };
  // A goal and a +1 are commands, and no clock's: neither touches the clock memory.
  const heard = claimAndApply(listening, [verb('score', 'goal', 'g1'), update('score', { f1: '4' }, 'u1'), verb('debate', 'nextTopic', 'n1')], createAppliedOnce(), specs, T + MINUTE).air;
  for (const air of [seedFromResolve(NO_AIR, reported, [], asked, CUES, specs), seedFromResolve(heard, reported, [], asked, CUES, specs)]) {
    assert.equal(air.clocks.score, `07:00@${T}`);
    assert.equal(air.aired.score.f5, '07:00');
    assert.deepEqual(air.speaking.debate, { fa: `04:00@${T}`, fb: '03:30' });
    assert.equal(air.aired.debate.fa, '04:00');
  }
});

test('this page\'s own Update during the read is a resend over the report, not a stopped clock: a fresh page and a stale one (#2099)', () => {
  const running = `10:00@${T}/10:00/10:00`;
  const fresh = asking(NO_AIR);
  // ✎ Update resends the cue's whole value set, the clock's time with it.
  const resend = claimAndApply(fresh.listening, [update('score', { f1: '4', f5: '10:00' }, 'u1')], createAppliedOnce(), CLOCKS, T + 3 * MINUTE).air;
  assert.equal(resend.clocks.score, '10:00', 'all a fresh page knows is the plain time');
  const air = seedFromResolve(resend, reportedClock(running), [], fresh.asked, CUES, CLOCKS);
  assert.equal(air.clocks.score, running, 'the report\'s running clock stands');
  assert.equal(air.aired.score.f1, '4');
  assert.equal(air.aired.score.f5, '10:00', 'and the field\'s figure stays the command\'s');
  const stop = claimAndApply(air, [verb('score', 'clockStop', 'h1')], createAppliedOnce(), CLOCKS, T + 4 * MINUTE).air;
  assert.equal(plainClockValue(stop.clocks.score), '6:00', 'so the next Stop banks what air banks');

  // A correction in that Update still corrects, from the instant it was heard.
  const typed = claimAndApply(fresh.listening, [update('score', { f5: '8:00' }, 'u2')], createAppliedOnce(), CLOCKS, T + 3 * MINUTE).air;
  assertClock(seedFromResolve(typed, reportedClock(running), [], fresh.asked, CUES, CLOCKS).clocks.score, '8:00', T + 3 * MINUTE, 'running on from the typed time');

  // A stale stamp this page held is no better than none.
  const stale = asking({ ...NO_AIR, clocks: { score: `10:00@${T - 9 * MINUTE}` } });
  const again = claimAndApply(stale.listening, [update('score', { f5: '10:00' }, 'u3')], createAppliedOnce(), CLOCKS, T + 3 * MINUTE).air;
  assert.equal(seedFromResolve(again, reportedClock(running), [], stale.asked, CUES, CLOCKS).clocks.score, running);

  // A board's two clocks: the running speaker stays the report's, one of them.
  const board = asking(NO_AIR);
  const resent = claimAndApply(board.listening, [update('debate', { fa: '05:00', fb: '05:00', f0: 'ROUND' }, 'u4')], createAppliedOnce(), DEBATE, T + MINUTE).air;
  const seeded = seedFromResolve(resent, reportedPair(`05:00@${T}`, '05:00'), [], board.asked, CUES, DEBATE);
  assertClock(seeded.speaking.debate.fa, '05:00', T, 'still speaking');
  assertClock(seeded.speaking.debate.fb, '05:00', null);
  assert.equal(seeded.aired.debate.f0, 'ROUND');
});

test('a report whose clock value is not text does not stop the seed (#2099)', () => {
  const { listening, asked } = asking(NO_AIR);
  const heard = claimAndApply(listening, [update('score', { f5: '8:00' }, 'u1')], createAppliedOnce(), CLOCKS, T).air;
  const air = seedFromResolve(heard, reportedClock(90), [], asked, CUES, CLOCKS);
  assert.equal(air.clocks.score, '8:00');
});

test('over a bare reported time an Update stays the field rule\'s: this page\'s memory, for a match clock and a pair (#2099)', () => {
  const held = asking({ ...NO_AIR, clocks: { score: `8:00@${T}/10:00/10:00` } });
  const resend = claimAndApply(held.listening, [update('score', { f5: '10:00' }, 'u1')], createAppliedOnce(), CLOCKS, T + MINUTE).air;
  // A host's painted text: no stamp, no baseline, and nothing to tell a resend by.
  const air = seedFromResolve(resend, reportedClock('6:12'), [], held.asked, CUES, CLOCKS);
  assert.equal(air.clocks.score, `8:00@${T}/10:00/10:00`);
  assert.equal(air.aired.score.f5, '10:00');
  assert.deepEqual(air.bootReplay, []);

  const board = asking({ ...NO_AIR, speaking: { debate: { fa: `04:00@${T}`, fb: '05:00' } } });
  const resent = claimAndApply(board.listening, [update('debate', { fa: '05:00' }, 'u2')], createAppliedOnce(), DEBATE, T + MINUTE).air;
  const pair = seedFromResolve(resent, reportedPair('03:10', '05:00'), [], board.asked, CUES, DEBATE);
  assert.equal(pair.speaking.debate.fa, resent.speaking.debate.fa);
  assert.equal(pair.speaking.debate.fb, '05:00');
});

test('verbs replay in order, each at the instant it was heard (#2099)', () => {
  const applied = createAppliedOnce();
  const { listening, asked } = asking(NO_AIR);
  let air = listening;
  const hear = (event, oid, mins) => {
    air = claimAndApply(air, [verb('score', event, oid)], applied, CLOCKS, T + mins * MINUTE).air;
  };
  hear('clockStart', 's1', 1);
  hear('clockStop', 'h1', 2);
  hear('clockStart', 's2', 4);
  const seeded = seedFromResolve(air, reportedClock('07:00'), [], asked, CUES, CLOCKS);
  // Counts down from 7:00 for the minute it ran, then on from 6:00 at T+4.
  assertClock(seeded.clocks.score, '6:00', T + 4 * MINUTE, 'each verb at its own instant');
  assert.equal(seeded.aired.score.f5, '6:00');
});

test('an imported clock\'s verbs replay by its own event names; a target time has none, and keeps its stamped start (#2099)', () => {
  const imported = { field: 'f5', countsDown: false, seed: '0:00', resetTo: '0:00', events: { start: 'clock_start', stop: 'clock_pause', reset: 'clock_reset' } };
  const specs = { clocks: new Map([['score', imported]]), pairs: new Map() };
  const { listening, asked } = asking(NO_AIR);
  const heard = claimAndApply(listening, [verb('score', 'clock_start', 'i1')], createAppliedOnce(), specs, T + MINUTE).air;
  assertClock(seedFromResolve(heard, reportedClock('2:00'), [], asked, CUES, specs).clocks.score, '2:00', T + MINUTE, 'clock_start runs it');
  // Its native names mean nothing on it, and the report stands.
  const foreign = claimAndApply(listening, [verb('score', 'clockStart', 'i2')], createAppliedOnce(), specs, T + MINUTE).air;
  assert.equal(seedFromResolve(foreign, reportedClock('2:00'), [], asked, CUES, specs).clocks.score, '2:00');

  const stamped = `0:10@${T}/0:10/0:10`;
  const target = { field: 'f5', countsDown: true, seed: stamped, resetTo: stamped, events: imported.events, fixedInstant: true };
  const targetSpecs = { clocks: new Map([['score', target]]), pairs: new Map() };
  const onTarget = claimAndApply(listening, [verb('score', 'clock_pause', 't1')], createAppliedOnce(), targetSpecs, T + MINUTE).air;
  assert.equal(seedFromResolve(onTarget, reportedClock('3:39:30'), [], asked, CUES, targetSpecs).clocks.score, stamped);
});

test('a penalty and a reset replay over the report with the penalty size and allowance it holds (#2099)', () => {
  const docking = { ...PAIR, penaltyField: 'fp', penaltySeed: '10' };
  const specs = { clocks: new Map(), pairs: new Map([['debate', docking]]) };
  const report = reportedPair(`05:00@${T}`, '03:00', { fp: '20', fl: '06:00' });
  const { listening, asked } = asking(NO_AIR);
  const docked = claimAndApply(listening, [verb('debate', 'penalty', 'p1')], createAppliedOnce(), specs, T + 30 * SECOND).air;
  const air = seedFromResolve(docked, report, [], asked, CUES, specs);
  assertClock(air.speaking.debate.fa, '04:10', T + 30 * SECOND, 'docked by the reported 20 s, still running');
  assert.equal(air.speaking.debate.fb, '03:00');
  // With nobody running on this page a penalty still counts as a verb: the report may have a speaker.
  assert.equal(docked.heardClock.debate.length, 1);

  const reset = claimAndApply(listening, [verb('debate', 'reset', 'r1')], createAppliedOnce(), specs, T + 30 * SECOND).air;
  const back = seedFromResolve(reset, report, [], asked, CUES, specs);
  assert.equal(back.speaking.debate.fa, '06:00', 'both back to the reported allowance, neither running');
  assert.equal(back.speaking.debate.fb, '06:00');
  assert.equal(back.aired.debate.fa, '06:00');
});

test('only commands are noted, and only those past the request count: a stage rebuilt, an unpublished apply or a verb before it do not replay (#2099)', () => {
  const start = verb('score', 'clockStart', 's1');
  const { listening } = asking({ ...NO_AIR, liveCue: { score: 'c2' } });
  const applied = programItems(rememberAired(listening, [start]), [start], CLOCKS, T).air;
  assert.equal(applied.heardClock, undefined, 'an unpublished apply');
  const rebuilt = restoreItems({ ...listening, bootReplay: [start], reports: { score: { data: { f5: '10:00' } } } }, {}, CLOCKS);
  assert.equal(programItems(rebuilt.air, rebuilt.items, CLOCKS, T).air.heardClock, undefined, 'a stage rebuilt');

  const during = claimAndApply(NO_AIR, [start], createAppliedOnce(), CLOCKS, T).air;
  assert.equal(during.heardClock.score.length, 1);
  const retried = asking(during);
  const plusOne = claimAndApply(retried.listening, [update('score', { f1: '4' }, 'u1')], createAppliedOnce(), CLOCKS, T + MINUTE).air;
  assert.equal(seedFromResolve(plusOne, reportedClock('07:00'), [], retried.asked, CUES, CLOCKS).clocks.score, '07:00', 'the report answers for what came before it was asked');
});

test('the moves guard still skips the whole answer with a verb heard: the page\'s memory stands (#2099)', () => {
  const { listening, asked } = asking(NO_AIR);
  const heard = claimAndApply(listening, [verb('score', 'clockStart', 's1')], createAppliedOnce(), CLOCKS, T).air;
  const taken = moveLiveCue(heard, (m) => withLiveCue(m, 'score', 'c9'));
  assert.equal(seedFromResolve(taken, reportedClock('07:00'), [], asked, CUES, CLOCKS), taken);
});

test('the note cannot grow if a read never answers: it holds the newest verbs of each graphic (#2099)', () => {
  const applied = createAppliedOnce();
  let air = asking(NO_AIR).listening;
  for (let i = 0; i < 200; i += 1) air = claimAndApply(air, [verb('score', i % 2 ? 'clockStop' : 'clockStart', `v${i}`)], applied, CLOCKS, T + i * SECOND).air;
  assert.equal(air.heardClock.score.length, 128);
  assert.equal(Date.parse(air.heardClock.score.at(-1).created_at), T + 199 * SECOND);
  assert.equal(Date.parse(air.heardClock.score[0].created_at), T + 72 * SECOND);
});

test('a verb in the rows after the report still counts when this page applied a command during the read: those rows replay, with that command on top (#2099)', () => {
  // The follow opens after the seed, so this is the road a clock verb takes during the read: its row
  // is read back after the report, while this page's own +1 rides the fast road and is heard.
  const start = { ...verb('score', 'clockStart', 's1'), created_at: at(1) };
  const { listening, asked } = asking(NO_AIR);
  const plusOne = claimAndApply(listening, [update('score', { f1: '4' }, 'u1')], createAppliedOnce(), CLOCKS, T + 2 * MINUTE).air;
  const withBaseline = { liveCue: { score: 'c2' }, live: { score: { data: { f5: '07:00' }, event: 40 } } };
  const older = update('score', { f1: 'OLDER ROW', f2: 'THEIRS' });
  const air = seedFromResolve(plusOne, withBaseline, [start, older, { graphic: 'other', msg: { t: 'play' } }], asked, CUES, CLOCKS);
  assert.deepEqual(air.bootReplay.map((item) => item.msg.oid ?? item.msg.data?.f1), ['s1', 'OLDER ROW', 'u1'], 'a stage takes its rows as on a quiet read, then what this page applied');
  assert.equal(air.aired.score.f1, '4');
  assert.equal(air.aired.score.f2, 'THEIRS');
  assertClock(air.clocks.score, '7:00', T + MINUTE, 'but the clock runs from the row\'s instant');
  // With nothing heard the rows replay as they always did, and the seed stays the report's.
  const quiet = seedFromResolve(listening, withBaseline, [start], asked, CUES, CLOCKS);
  assert.deepEqual(quiet.bootReplay, [start]);
  assert.equal(quiet.clocks.score, '07:00');
  // A report with no baseline, or no report at all: those rows may be from before it, so they stay out.
  assert.equal(seedFromResolve(plusOne, reportedClock('07:00'), [start], asked, CUES, CLOCKS).clocks.score, '07:00');
  const unreported = seedFromResolve(plusOne, { liveCue: { score: 'c2' }, live: {} }, [start], asked, [{ id: 'c2', values: { f5: '45:00' } }], CLOCKS);
  assert.equal(unreported.clocks.score, '45:00', 'the rundown time, not old rows over it');

  const pairRead = asking(NO_AIR);
  const pairBaseline = { liveCue: { debate: 'c3' }, live: { debate: { data: { fa: '05:00', fb: '05:00' }, event: 40 } } };
  // One heard here and read back in the rows too acts once, at the row's instant.
  const row = { ...verb('debate', 'switch', 'w1'), created_at: at(1) };
  const twice = claimAndApply(pairRead.listening, [{ graphic: row.graphic, msg: row.msg }], createAppliedOnce(), DEBATE, T + 90 * SECOND).air;
  const once = seedFromResolve(twice, pairBaseline, [row], pairRead.asked, CUES, DEBATE);
  assertClock(once.speaking.debate.fa, '05:00', T + MINUTE, 'fa opens once');
  assertClock(once.speaking.debate.fb, '05:00', null, 'and the floor is not handed on');
  // A slow laptop clock never reorders: this page's own update reads T+30 s, the Reset's row T+60 s,
  // and the renderer took the Reset first, so the update still comes after it.
  const clockRead = asking(NO_AIR);
  const typed = claimAndApply(clockRead.listening, [update('score', { f5: '8:00' }, 'u2')], createAppliedOnce(), CLOCKS, T + 30 * SECOND).air;
  const reset = { ...verb('score', 'clockReset', 'r2'), created_at: at(1) };
  assert.equal(plainClockValue(seedFromResolve(typed, withBaseline, [reset], clockRead.asked, CUES, CLOCKS).clocks.score), '8:00', 'the typed time stands, not the reset');
  // Nor is it dropped as older than a stamp on the report, which is the server's clock.
  const stampedReport = { liveCue: { score: 'c2' }, live: { score: { data: { f5: `10:00@${T + MINUTE}` }, event: 40 } } };
  assert.equal(plainClockValue(seedFromResolve(typed, stampedReport, [reset], clockRead.asked, CUES, CLOCKS).clocks.score), '8:00');
  // A correction in the rows moved the clock past the report as a verb does.
  const correction = { ...update('score', { f5: '8:00' }), created_at: at(1) };
  const corrected = seedFromResolve(plusOne, withBaseline, [correction], asked, CUES, CLOCKS);
  assert.equal(plainClockValue(corrected.clocks.score), '8:00');
  assert.equal(corrected.aired.score.f5, '8:00');
  assert.equal(corrected.bootReplay[0], correction);
  // Rows that move no clock are older than the command, as ever: nothing of them replays.
  const quietRows = seedFromResolve(plusOne, withBaseline, [older], asked, CUES, CLOCKS);
  assert.deepEqual(quietRows.bootReplay, []);
  assert.equal(quietRows.clocks.score, '07:00');
  assert.equal(quietRows.aired.score.f2, undefined);
  // Whatever this page applied goes on a rebuilt stage, an appearance with no field too.
  const look = { x: 10, y: 20, scale: 1 };
  const looked = claimAndApply(listening, [{ graphic: 'score', msg: { t: 'update', data: {}, appearance: look, oid: 'l1' } }], createAppliedOnce(), CLOCKS, T + MINUTE).air;
  const seededLook = seedFromResolve(withReports(looked, withBaseline.live), withBaseline, [start], asked, CUES, CLOCKS);
  const rebuilt = restoreItems(seededLook, {}, CLOCKS).items;
  assert.equal(rebuilt.at(-1).msg.oid, 'l1');
  assert.deepEqual(rebuilt.at(-1).msg.appearance, look);
});

test('a report with no data, and this page\'s Update during the read: the clock takes the cue\'s values, and a stage is rebuilt from what was aired (#2099)', () => {
  const { listening, asked } = asking(NO_AIR);
  const typed = claimAndApply(listening, [update('score', { f0: 'HOME', f1: '4', f5: '8:00' }, 'u1'), verb('score', 'clockStop', 'h1')], createAppliedOnce(), CLOCKS, T + MINUTE).air;
  const report = { liveCue: { score: 'c2' }, live: { score: { data: {}, event: 40 } } };
  const air = seedFromResolve(withReports(typed, report.live), report, [], asked, [{ id: 'c2', values: { f0: 'HOME', f1: '3', f2: 'AWAY', f5: '10:00' } }], CLOCKS);
  assert.equal(plainClockValue(air.clocks.score), '8:00');
  assert.deepEqual(air.bootReplay, []);
  const first = restoreItems(air, {}, CLOCKS).items[0];
  assert.deepEqual({ f0: first.msg.data.f0, f1: first.msg.data.f1, f2: first.msg.data.f2 }, { f0: 'HOME', f1: '4', f2: 'AWAY' }, 'every field reaches the monitor');
});

test('place and size follow what a stage replays: the report\'s, the rows\', then what was heard, on that graphic alone (#2099)', () => {
  const look = (dx) => ({ v: 1, frame: { dx, dy: 0, s: 1, ox: 0, oy: 0 } });
  const { listening, asked } = asking({ ...NO_AIR, looks: { score: look(1), other: look(2) } });
  const start = { ...verb('score', 'clockStart', 's1'), created_at: at(1) };
  const report = (more) => ({ liveCue: { score: 'c2', other: 'c1' }, live: { score: { data: { f5: '07:00' }, event: 40, state: { appearance: look(10) } }, other: { data: { f0: 'A' }, event: 40, state: { appearance: look(20) } } } , ...more });
  const plusOne = claimAndApply(listening, [update('score', { f1: '4' }, 'u1')], createAppliedOnce(), CLOCKS, T + 2 * MINUTE).air;
  const moved = { ...update('score', { f1: '3' }), msg: { t: 'update', data: { f1: '3' }, appearance: look(30) } };
  const fromRows = seedFromResolve(plusOne, report(), [start, moved], asked, CUES, CLOCKS);
  assert.deepEqual(fromRows.looks.score, look(30), 'the row after the report');
  assert.deepEqual(fromRows.looks.other, look(2), 'a graphic not replayed keeps what this page held, as before');
  assert.deepEqual(seedFromResolve(plusOne, report(), [start], asked, CUES, CLOCKS).looks.score, look(10), 'the report\'s, with no row to move it');
  const own = claimAndApply(listening, [{ graphic: 'score', msg: { t: 'update', data: {}, appearance: look(40), oid: 'l1' } }], createAppliedOnce(), CLOCKS, T + 2 * MINUTE).air;
  assert.deepEqual(seedFromResolve(own, report(), [start, moved], asked, CUES, CLOCKS).looks.score, look(40), 'what this page applied stands over both');
});

test('a press whose row came back stands where its row does: a later row from another screen wins the field (#2099)', () => {
  const { listening, asked } = asking(NO_AIR);
  const mine = update('score', { f1: '4' }, 'u1');
  const heard = claimAndApply(listening, [mine], createAppliedOnce(), CLOCKS, T + MINUTE).air;
  const report = { liveCue: { score: 'c2' }, live: { score: { data: { f5: '07:00' }, event: 40 } } };
  const rows = [{ ...verb('score', 'clockStart', 's1'), created_at: at(1) }, { ...mine, created_at: at(1) }, { ...update('score', { f1: '9' }, 'u2'), created_at: at(2) }];
  const air = seedFromResolve(heard, report, rows, asked, CUES, CLOCKS);
  assert.equal(air.aired.score.f1, '9');
  assert.equal(air.bootReplay.length, 3, 'and it replays once');
});

test('a setting changed in the rows after a penalty does not reach back to it (#2099)', () => {
  const specs = { clocks: new Map(), pairs: new Map([['debate', { ...PAIR, penaltyField: 'fp' }]]) };
  const { listening, asked } = asking(NO_AIR);
  const plusOne = claimAndApply(listening, [update('debate', { fx: '1' }, 'u1')], createAppliedOnce(), specs, T + MINUTE).air;
  const report = { liveCue: { debate: 'c3' }, live: { debate: { data: { fa: `05:00@${T}`, fb: '05:00', fp: '10' }, event: 40 } } };
  const rows = [{ ...verb('debate', 'penalty', 'p1'), created_at: new Date(T + 10 * SECOND).toISOString() }, { ...update('debate', { fp: '20' }, 'u2'), created_at: new Date(T + 20 * SECOND).toISOString() }];
  const air = seedFromResolve(plusOne, report, rows, asked, CUES, specs);
  assertClock(air.speaking.debate.fa, '04:40', T + 10 * SECOND, 'docked by the size it was then');
  assert.equal(air.aired.debate.fa, '04:40');
  assert.equal(air.aired.debate.fp, '20');
});

test('a Take that starts a duration and an Out that banks a speaker count as the verbs do; a native clock\'s Take does not (#2099)', () => {
  const duration = { field: 'f5', countsDown: true, seed: '0:30', resetTo: '0:30', events: { start: 'clock_start', stop: 'clock_pause', reset: 'clock_reset' }, startsOnTake: true };
  const specs = { clocks: new Map([['score', duration]]), pairs: DEBATE.pairs };
  const { listening, asked } = asking(NO_AIR);
  const plusOne = claimAndApply(listening, [update('score', { f1: '4' }, 'u1'), update('debate', { fx: '1' }, 'u2')], createAppliedOnce(), specs, T + 2 * MINUTE).air;
  const takeRow = { graphic: 'score', msg: { t: 'play' }, created_at: at(1) };
  const taken = seedFromResolve(plusOne, { liveCue: { score: 'c2' }, live: { score: { data: { f5: '0:30@out/0:30/0:30' }, event: 40 } } }, [takeRow], asked, CUES, specs);
  assertClock(taken.clocks.score, '0:30', T + MINUTE, 'counting from the Take');

  const outRow = { graphic: 'debate', msg: { t: 'stop' }, created_at: new Date(T + 30 * SECOND).toISOString() };
  const stage = { graphic: 'debate', msg: { t: 'play' }, created_at: at(1) };
  const out = seedFromResolve(plusOne, { liveCue: { debate: 'c3' }, live: { debate: { data: { fa: `05:00@${T}`, fb: '05:00' }, event: 40 } } }, [outRow, stage], asked, CUES, specs);
  assertClock(out.speaking.debate.fa, '04:30', null, 'banked by the Out');

  const native = seedFromResolve(plusOne, { liveCue: { score: 'c2' }, live: { score: { data: { f5: '07:00' }, event: 40 } } }, [takeRow], asked, CUES, CLOCKS);
  assert.equal(native.clocks.score, '07:00', 'nothing moved it');
  assert.equal(claimAndApply(NO_AIR, [play('lt', 'p1')], createAppliedOnce(), CLOCKS, T).air.heardClock, undefined, 'a graphic with no clock notes nothing');
});

test('a command that moved the clock replays in its place between the verbs, over the report; a pair ends with one clock running (#2099)', () => {
  const { listening, asked } = asking(NO_AIR);
  const typed = claimAndApply(listening, [update('score', { f5: '8:00' }, 'u1'), verb('score', 'clockStart', 's1')], createAppliedOnce(), CLOCKS, T + MINUTE).air;
  const match = seedFromResolve(typed, reportedClock(`07:00@${T}`), [], asked, CUES, CLOCKS);
  assertClock(match.clocks.score, '8:00', T + MINUTE, 'the typed time, then the start');
  assert.equal(match.aired.score.f5, '8:00', 'the field rule: the command\'s figure');

  const before = claimAndApply(NO_AIR, [update('debate', { fa: '05:00', fb: '05:00' }, 'u5')], createAppliedOnce(), DEBATE, T).air;
  const pairRead = asking(before);
  const both = claimAndApply(pairRead.listening, [update('debate', { fa: '04:00' }, 'u6'), verb('debate', 'switch', 'w1')], createAppliedOnce(), DEBATE, T + MINUTE).air;
  const pair = seedFromResolve(both, reportedPair('05:00', `05:00@${T}`), [], pairRead.asked, CUES, DEBATE);
  assertClock(pair.speaking.debate.fa, '04:00', T + MINUTE, 'the typed time, then the floor');
  assertClock(pair.speaking.debate.fb, '04:00', null, 'stopped where the report had it at T+1 min, not what this page held');
  assert.equal(pair.aired.debate.fa, '04:00');
  assert.equal(pair.aired.debate.fb, '04:00');

  // Editing one clock leaves the other the report's, running.
  const other = asking({ ...NO_AIR, speaking: { debate: { fa: '05:00', fb: '05:00' } } });
  const specs = { clocks: new Map(), pairs: new Map([['debate', { ...PAIR, penaltyField: 'fp' }]]) };
  const edited = claimAndApply(other.listening, [update('debate', { fb: '04:00' }, 'u7'), verb('debate', 'penalty', 'p1')], createAppliedOnce(), specs, T + 10 * SECOND).air;
  const onReport = seedFromResolve(edited, reportedPair(`05:00@${T}`, '05:00'), [], other.asked, CUES, specs);
  assertClock(onReport.speaking.debate.fa, '04:40', T + 10 * SECOND, 'still running, docked 10 s from where it stood');
  assertClock(onReport.speaking.debate.fb, '04:00', null);

  // A penalty size retyped after a penalty does not reach back to it; one before it counts.
  const size = asking(NO_AIR);
  const running = reportedPair(`05:00@${T}`, '05:00', { fp: '10' });
  const later = claimAndApply(size.listening, [verb('debate', 'penalty', 'p2'), update('debate', { fp: '20' }, 'u8')], createAppliedOnce(), specs, T + 10 * SECOND).air;
  assertClock(seedFromResolve(later, running, [], size.asked, CUES, specs).speaking.debate.fa, '04:40', T + 10 * SECOND, 'the size at the time');
  const earlier = claimAndApply(size.listening, [update('debate', { fp: '20' }, 'u9'), verb('debate', 'penalty', 'p3')], createAppliedOnce(), specs, T + 10 * SECOND).air;
  assertClock(seedFromResolve(earlier, running, [], size.asked, CUES, specs).speaking.debate.fa, '04:30', T + 10 * SECOND, 'the new size');

  // A verb in the rows replays over the report with a field moved here too, and a correction in the rows counts.
  const rowsRead = asking(NO_AIR);
  const moved = claimAndApply(rowsRead.listening, [update('debate', { fb: '04:00' }, 'u10')], createAppliedOnce(), DEBATE, T + 2 * MINUTE).air;
  const withBaseline = { liveCue: { debate: 'c3' }, live: { debate: { data: { fa: `05:00@${T}`, fb: '05:00' }, event: 40 } } };
  const overRows = seedFromResolve(moved, withBaseline, [{ ...verb('debate', 'switch', 'w2'), created_at: at(1) }], rowsRead.asked, CUES, DEBATE);
  assertClock(overRows.speaking.debate.fa, '04:00', null, 'the switch in the rows stopped it');
  assertClock(overRows.speaking.debate.fb, '04:00', null, 'and the typed time, after it, replaced the running clock\'s value');
  const clockRows = asking(NO_AIR);
  const plusOne = claimAndApply(clockRows.listening, [update('score', { f1: '4' }, 'u11')], createAppliedOnce(), CLOCKS, T + 2 * MINUTE).air;
  const reportHeld = { liveCue: { score: 'c2' }, live: { score: { data: { f5: '07:00' }, event: 40 } } };
  const corrected = seedFromResolve(plusOne, reportHeld, [{ ...update('score', { f5: '8:00' }), created_at: at(0.5) }, { ...verb('score', 'clockStart', 's3'), created_at: at(1) }], clockRows.asked, CUES, CLOCKS);
  assertClock(corrected.clocks.score, '8:00', T + MINUTE, 'the correction in the rows, then the start');
});

test('after the session ends, a resolve that lands writes nothing', () => {
  const session = createPlayoutSession('prod-1');
  const asked = airAtRequest(session.air.get());
  session.dispose();
  session.apply((parts) => ({ ...parts, air: seedFromResolve(parts.air, RESOLVED, [], asked, CUES, NO_CLOCKS) }));
  assert.equal(session.air.get(), NO_AIR);
});

// ── The clocks on PROGRAM (productions.spec's clock walks, through programItems) ───────────────

test('a whole match through the monitor: the start stamps BEFORE, a plain resend keeps the origin, half time banks AFTER', () => {
  let air = NO_AIR;
  const step = (item) => {
    const run = programItems(air, [item], CLOCKS, T);
    air = run.air;
    return run.out;
  };
  step({ graphic: 'score', msg: { t: 'update', data: { f0: 'HOME', f5: '10:00' } }, created_at: at(0) });
  assert.equal(air.clocks.score, '10:00');
  const start = step({ graphic: 'score', msg: { t: 'event', event: 'clockStart' }, created_at: at(0) });
  assert.deepEqual(start.map((i) => i.msg.t), ['update', 'event'], 'the origin is in the document before the start');
  // A native value carries its length (the reset time) and what the cue last sent (#1889).
  assert.equal(start[0].msg.data.f5, `10:00@${T}/10:00/10:00`);
  // A goal re-sends the cue's whole value set, its plain 10:00 included: the origin survives.
  const goal = step({ graphic: 'score', msg: { t: 'update', data: { f1: '1', f5: '10:00' } }, created_at: at(5) });
  assert.equal(goal.length, 1);
  assert.equal(air.clocks.score, `10:00@${T}/10:00/10:00`);
  assert.equal(goal[0].msg.data.f5, air.clocks.score, 'PROGRAM is sent the clock it holds, not the cue\'s time');
  const half = step({ graphic: 'score', msg: { t: 'event', event: 'clockStop' }, created_at: at(5) });
  assert.deepEqual(half.map((i) => i.msg.t), ['event', 'update'], 'the banked time follows the stop');
  assert.equal(half[1].msg.data.f5, '5:00@/10:00/10:00', 'half time banks the five minutes run, not the seed');
  // #1889: a score Update after the Pause resends the cue's 10:00, which is a resend, not a correction.
  const score = step({ graphic: 'score', msg: { t: 'update', data: { f1: '2', f5: '10:00' } }, created_at: at(6) });
  assert.equal(air.clocks.score, '5:00@/10:00/10:00', 'a paused clock stays where it was paused');
  assert.equal(score[0].msg.data.f5, '5:00@/10:00/10:00');
  // …while a time the operator types is still a correction.
  step({ graphic: 'score', msg: { t: 'update', data: { f5: '4:30' } }, created_at: at(6) });
  assert.equal(air.clocks.score, '4:30@/10:00/4:30');
  const reset = step({ graphic: 'score', msg: { t: 'event', event: 'clockReset' }, created_at: at(6) });
  assert.equal(reset[1].msg.data.f5, '10:00@/10:00/4:30');
  step({ graphic: 'score', msg: { t: 'stop' } });
  assert.equal(air.clocks.score, '10:00@/10:00/4:30', 'off air keeps the clock, as the renderer does (#1889)');
});

/** An imported duration (jev-svg-import row 9): its own verbs, started by the Take. */
const DURATION = {
  field: 'f2', countsDown: true, seed: '12:08', resetTo: '12:08',
  events: { start: 'clock_start', stop: 'clock_pause', reset: 'clock_reset' }, startsOnTake: true,
};
const DURATIONS = { clocks: new Map([['bug', DURATION]]), pairs: new Map() };

test('an imported duration on the monitor holds the value air holds, through an Out and the next Take', () => {
  // Air's own decision, row by row, in output/main.ts order: the merge, then the row's clock effect.
  const air = (rows) => rows.reduce((state, row) => {
    // A duration air holds nothing for and does not show has never been taken (#1903).
    const held = clockHeldBeforeRow(DURATION, state.held, state.on);
    const merged = row.msg.t === 'update' ? clockValueAfterUpdate(held, row.msg.data.f2) : held;
    const on = row.msg.t === 'play' ? true : row.msg.t === 'stop' ? false : state.on;
    return { held: clockRowEffect(row, DURATION, merged, T)?.value ?? merged, on };
  }, { held: undefined, on: false }).held;
  const monitor = (rows) => rows.reduce((part, row) => programItems(part, [{ graphic: 'bug', ...row }], DURATIONS, T).air, NO_AIR).clocks.bug;
  const row = (mins, msg) => ({ msg, created_at: at(mins) });
  const take = (mins, f2) => [row(mins, { t: 'update', data: { f2 } }), row(mins, { t: 'play' })];
  const walks = {
    'corrected on air, out, taken again': [...take(0, '0:30'), row(0.1, { t: 'update', data: { f2: '0:20' } }), row(0.2, { t: 'stop' }), ...take(0.3, '0:20')],
    'a new length typed off air, reset, taken': [...take(0, '0:30'), row(0.1, { t: 'stop' }), row(0.2, { t: 'update', data: { f2: '0:45' } }), row(0.3, { t: 'event', event: 'clock_reset' }), ...take(0.4, '0:45')],
    // #1903: never taken is off air, so a Reset or Pause before the first Take keeps it so.
    'never taken: typed, reset, typed again, taken': [row(0, { t: 'update', data: { f2: '0:45' } }), row(0.1, { t: 'event', event: 'clock_reset' }), row(0.2, { t: 'update', data: { f2: '0:50' } }), ...take(0.3, '0:50')],
    'never taken: typed, paused, typed again, taken': [row(0, { t: 'update', data: { f2: '0:45' } }), row(0.1, { t: 'event', event: 'clock_pause' }), row(0.2, { t: 'update', data: { f2: '0:50' } }), ...take(0.3, '0:50')],
    'never taken: reset with nothing sent, typed, taken': [row(0, { t: 'event', event: 'clock_reset' }), row(0.1, { t: 'update', data: { f2: '0:50' } }), ...take(0.2, '0:50')],
  };
  for (const [name, rows] of Object.entries(walks)) {
    for (let n = 1; n <= rows.length; n += 1) {
      assert.equal(monitor(rows.slice(0, n)), air(rows.slice(0, n)), `${name}, after row ${n}: the monitor holds what air holds`);
    }
  }
  assert.match(air(walks['corrected on air, out, taken again']), /^0:20@\d+\/0:20\/0:20$/, 'after Out, the next Take counts the field even when it repeats the on-air correction (#1884)');
  assert.match(air(walks['a new length typed off air, reset, taken']), /^0:45@\d+\/0:45\/0:45$/, 'a time typed off air is the length');
  for (const name of ['never taken: typed, reset, typed again, taken', 'never taken: typed, paused, typed again, taken', 'never taken: reset with nothing sent, typed, taken']) {
    assert.match(air(walks[name]), /^0:50@\d+\/0:50\/0:50$/, `${name}: the first Take counts the time in the field (#1903)`);
  }
});

test('the monitor is sent the imported clock it holds, so a resend never resets a paused clock on PROGRAM', () => {
  let part = NO_AIR;
  const step = (row) => {
    const run = programItems(part, [{ graphic: 'bug', ...row }], DURATIONS, T);
    part = run.air;
    return run.out;
  };
  step({ msg: { t: 'update', data: { f2: '0:30' } }, created_at: at(0) });
  step({ msg: { t: 'play' }, created_at: at(0) });
  step({ msg: { t: 'event', event: 'clock_pause' }, created_at: at(0.15) });
  const held = part.clocks.bug;
  assert.match(held, /^0:21@\/0:30\/0:30$/);
  const resend = step({ msg: { t: 'update', data: { f0: 'HOME', f2: '0:30' } }, created_at: at(0.2) });
  assert.equal(part.clocks.bug, held, 'the resend is a resend');
  assert.deepEqual(resend.map((i) => i.msg.data), [{ f0: 'HOME', f2: held }], 'and PROGRAM is sent the held value, not the cue\'s');
});

test('a row with no server time is stamped with the monitor\'s own receive instant', () => {
  const run = programItems(NO_AIR, [{ graphic: 'score', msg: { t: 'event', event: 'clockStart' } }], CLOCKS, T + 42);
  assert.equal(run.out[0].msg.data.f5, `10:00@${T + 42}/10:00/10:00`, 'from the seed, at now');
});

test('a graphic with no clock passes through untouched, and the part stays the same', () => {
  const items = [play('lt'), update('lt', { f0: 'A' })];
  const run = programItems(NO_AIR, items, CLOCKS, T);
  assert.deepEqual(run.out, items);
  assert.equal(run.air, NO_AIR);
});

test('a debate board: switch stamps the incoming clock before the event; an update forwards the held stamp, not the plain resend', () => {
  let air = NO_AIR;
  let run = programItems(air, [{ graphic: 'debate', msg: { t: 'event', event: 'switch' }, created_at: at(0) }], DEBATE, T);
  air = run.air;
  assert.deepEqual(run.out.map((i) => i.msg.t), ['update', 'event']);
  assert.equal(run.out[0].msg.data.fa, `05:00@${T}`);
  run = programItems(air, [{ graphic: 'debate', msg: { t: 'update', data: { fa: '05:00', fl: '04:00' } }, created_at: at(1) }], DEBATE, T);
  assert.equal(run.out[0].msg.data.fa, `05:00@${T}`, 'the stamp is forwarded over the cue\'s plain time');
  assert.equal(run.air.speaking.debate.fl, '04:00', 'the allowance rides plain');
  run = programItems(run.air, [{ graphic: 'debate', msg: { t: 'stop' }, created_at: at(2) }], DEBATE, T);
  assert.deepEqual(run.out.map((i) => i.msg.t), ['stop', 'update'], 'off air banks the running clock after the stop');
  assert.equal(run.out[1].msg.data.fa, '03:00');
});

test('claimAndApply runs the clock fold over what it applies, once', () => {
  const applied = createAppliedOnce();
  const start = { graphic: 'score', msg: { t: 'event', event: 'clockStart', oid: 's1' } };
  const first = claimAndApply(NO_AIR, [start], applied, CLOCKS, T);
  assert.equal(first.out.length, 2);
  const echo = claimAndApply(first.air, [start], applied, CLOCKS, T + 5_000);
  assert.deepEqual(echo.out, []);
  assert.equal(echo.air.clocks.score, `10:00@${T}/10:00/10:00`, 'the echo does not restamp the origin');
});

// ── Rebuilding a fresh PROGRAM stage ───────────────────────────────────────────────────────────

test('at boot a layer is rebuilt from its report and the rows after it, the clocks from the report', () => {
  const air = {
    ...NO_AIR,
    liveCue: { score: 'c2', gone: '' },
    reports: { score: { data: { f5: `10:00@${T}`, f1: '0' }, state: { groups: { main: 'on' } } } },
    bootReplay: [{ graphic: 'score', msg: { t: 'update', data: { f1: '1' } }, created_at: at(3) }, { graphic: 'other', msg: { t: 'play' } }],
    clocks: { score: 'stale' },
    aired: { score: { f1: 'aired, not used at boot' } },
  };
  const { air: next, items } = restoreItems(air, {}, CLOCKS);
  assert.deepEqual(
    items.map((i) => i.msg.t),
    ['update', 'snap', 'update', 'update'],
    'data, snap to the reported state, data again, then the rows: never a bare play',
  );
  assert.deepEqual(items[0].msg.data, { f5: `10:00@${T}`, f1: '0' });
  assert.deepEqual(items[1].msg.snap, { main: 'on' });
  assert.equal(items[3].created_at, at(3), 'the rows keep their server time');
  assert.equal('score' in next.clocks, false, 'the clock moves on from the report, not from memory');
});

test('after this page applied a command, a stage is rebuilt from what was aired with the clock stamp over it', () => {
  const air = {
    ...NO_AIR,
    liveCue: { score: 'c2', lt: 'c1' },
    reports: { score: { data: { f5: '10:00' } } },
    bootReplay: null,
    aired: { score: { f5: '10:00', f1: '2' }, lt: { f0: 'ANNA' } },
    clocks: { score: `10:00@${T}` },
  };
  const { items } = restoreItems(air, { lt: { groups: { main: 'in' } } }, CLOCKS);
  const score = items.filter((i) => i.graphic === 'score');
  assert.deepEqual(score.map((i) => i.msg.t), ['update', 'play', 'update'], 'no known state: it plays in');
  assert.deepEqual(score[0].msg.data, { f5: `10:00@${T}`, f1: '2' });
  const lt = items.filter((i) => i.graphic === 'lt');
  assert.deepEqual(lt.map((i) => i.msg.t), ['update', 'snap', 'update'], 'a known state is snapped to');
});

test('a boot replay that carries the entrance needs no play of its own; off-air layers are not rebuilt', () => {
  const air = { ...NO_AIR, liveCue: { lt: 'c1' }, reports: { lt: { data: { f0: 'A' } } }, bootReplay: [play('lt')] };
  assert.deepEqual(restoreItems(air, {}, NO_CLOCKS).items.map((i) => i.msg.t), ['update', 'update', 'play']);
  assert.deepEqual(restoreItems({ ...NO_AIR, aired: { lt: { f0: 'A' } } }, {}, NO_CLOCKS).items, []);
});

test('a newer report forgets the boot replay; forgetting twice is the same part', () => {
  const air = forgetBootReplay({ ...NO_AIR, bootReplay: [] });
  assert.equal(air.bootReplay, null);
  assert.equal(forgetBootReplay(air), air);
});

// ── The log part ──────────────────────────────────────────────────────────────────────────────

const append = (current, incoming) => [...[...incoming].reverse(), ...current];

test('lines written here take local ids counting down from -1, a line that says nothing still spends its id', () => {
  let log = loggedHere(NO_LOG, [(id) => ({ id, text: 'a' }), () => null, (id) => ({ id, text: 'c' })], append);
  assert.deepEqual(log.entries.map((e) => e.id), [-3, -1]);
  log = loggedHere(log, [(id) => ({ id, text: 'd' })], append);
  assert.equal(log.entries[0].id, -4);
  log = logged(log, [{ id: 7, text: 'row' }], append);
  assert.equal(log.entries[0].id, 7);
  assert.equal(log.localId, -4, 'a row from the wire spends no local id');
});

test('a host that reports a target\'s painted text never moves the monitor off its stamped start (row 11 /so)', () => {
  // A target time: its own stamped start is the truth (phase-10 T6/T7), whatever text was painted.
  const TARGET = { field: 'f2', countsDown: true, seed: '219:30@1000', resetTo: '219:30@1000', events: DURATION.events, fixedInstant: true };
  const targets = { clocks: new Map([['bug', TARGET]]), pairs: new Map() };
  const seeded = seedFromResolve(NO_AIR, { liveCue: { bug: 'c1' }, live: { bug: { data: { f2: '3:39:30' } } } }, [], airAtRequest(NO_AIR), [{ id: 'c1', values: { f2: '219:30@1000' } }], targets);
  assert.equal(seeded.clocks.bug, '219:30@1000');
});

// ── #1906: the monitor rebuilds an OFF-AIR clock on reload from its report AND the rows after it ──
//
// Air (a renderer, src/output/main.ts's order) applies every row to its clock and reports it now
// and then, so the report can be older than an Out and an off-air edit. A page reloaded after that
// reseeds its PROGRAM memory from the report folded through the rows after it (phase-11 M1), and
// its next Take then counts exactly what air counts. Walked for the imported duration of the issue
// and for a native clock, which the monitor now keeps through an Out too (#1889).

test('a reloaded monitor counts what air counts on the next Take of an off-air clock, with commands after the report (#1906)', () => {
  const NATIVE = { field: 'f2', countsDown: false, seed: '0:00', resetTo: '0:00' };
  const row = (id, mins, msg) => ({ id, graphic: 'bug', msg, created_at: at(mins) });
  const take = (id, mins, f2) => [row(id, mins, { t: 'update', data: { f2 } }), row(id + 1, mins, { t: 'play' })];
  const cases = {
    // The issue's own example: the report holds the running 0:45; an Out and an off-air 0:20 follow.
    duration: {
      clock: DURATION,
      before: [...take(1, 0, '0:45'), row(3, 0.05, { t: 'update', data: { f1: 'HOME' } })],
      reportAfter: 3,
      after: [row(4, 0.2, { t: 'stop' }), row(5, 0.3, { t: 'update', data: { f2: '0:20' } })],
      next: take(6, 0.5, '0:20'),
    },
    // A correction on air (sent 0:30, length 0:45), out: the next Take resends 0:30 and counts the length.
    'duration, corrected then out': {
      clock: DURATION,
      before: [...take(1, 0, '0:45'), row(3, 0.1, { t: 'update', data: { f2: '0:30' } })],
      reportAfter: 3,
      after: [row(4, 0.2, { t: 'stop' })],
      next: take(5, 0.5, '0:30'),
    },
    // #1889 on a reload: a native clock paused and taken out; the next Take resends the cue's time.
    native: {
      clock: NATIVE,
      before: [...take(1, 0, '0:00'), row(3, 0, { t: 'event', event: 'clockStart' })],
      reportAfter: 3,
      after: [row(4, 10, { t: 'event', event: 'clockStop' }), row(5, 10.5, { t: 'stop' })],
      next: take(6, 11, '0:00'),
    },
  };
  for (const [name, c] of Object.entries(cases)) {
    const specs = { clocks: new Map([['bug', c.clock]]), pairs: new Map() };
    // AIR: every row, in order.
    const airAfter = (rows, held) => rows.reduce((value, r) => {
      const merged = r.msg.t === 'update' && r.msg.data.f2 !== undefined ? clockValueAfterUpdate(value, r.msg.data.f2) : value;
      return clockRowEffect(r, c.clock, merged, T)?.value ?? merged;
    }, held);
    const reported = airAfter(c.before);
    const onAir = airAfter([...c.after, ...c.next], reported);
    // THE PAGE, reloaded after `after`: the resolve's report (baseline id `reportAfter`), the rows
    // the off-air read answers (outputRecovery's own filter), the seed, then the next Take.
    const resolved = { liveCue: { bug: '' }, live: { bug: { event: c.reportAfter, data: { f1: 'HOME', f2: reported } } } };
    const graphics = offAirClockGraphics(resolved, specs);
    assert.deepEqual(graphics, ['bug'], `${name}: an off-air clock with a report is rebuilt`);
    const { snapshotAt } = planOutputRecovery(graphics, resolved.live);
    const log = [...c.before, ...c.after];
    const rows = monitorReplay(graphics, snapshotAt, log);
    assert.equal(rows.length, c.after.length, `${name}: only the rows after the report`);
    const seeded = seedOffAirClocks(NO_AIR, resolved, { graphics, rows }, airAtRequest(NO_AIR), specs, T);
    const monitor = programItems(seeded, c.next, specs, T).air.clocks.bug;
    assert.equal(monitor, onAir, `${name}: the monitor's next Take counts what air counts`);
    // Without the rows after the report (the withdrawn row 11 fix), or without any reseed (before),
    // the monitor would count something else: the case reaches the fault.
    const reportOnly = programItems(seedOffAirClocks(NO_AIR, resolved, { graphics, rows: [] }, airAtRequest(NO_AIR), specs, T), c.next, specs, T).air.clocks.bug;
    const unseeded = programItems(NO_AIR, c.next, specs, T).air.clocks.bug;
    assert.ok(reportOnly !== onAir || unseeded !== onAir, `${name}: the case tells the fix from the faults (${reportOnly}, ${unseeded} vs ${onAir})`);
  }
});

test('an off-air clock is not rebuilt over a command applied while the resolve was out, nor with no report or a read that failed (#1906 M2, M3)', () => {
  const resolved = { liveCue: { bug: '' }, live: { bug: { event: 3, data: { f2: '0:45@out/0:45/0:45' } } } };
  const specs = { clocks: new Map([['bug', DURATION]]), pairs: new Map() };
  const graphics = offAirClockGraphics(resolved, specs);
  const asked = airAtRequest(NO_AIR);
  // A command applied meanwhile is newer than the rows: the page keeps its own memory.
  const moved = programItems({ ...NO_AIR, commands: 1 }, [{ graphic: 'bug', msg: { t: 'update', data: { f2: '0:50' } } }], specs, T).air;
  assert.equal(seedOffAirClocks(moved, resolved, { graphics, rows: [] }, asked, specs, T).clocks.bug, moved.clocks.bug);
  // No report: nothing to rebuild from.
  assert.deepEqual(offAirClockGraphics({ liveCue: {}, live: {} }, specs), []);
  // The read did not answer for it (not read to the head): no reseed from a report the rows may contradict.
  assert.equal('bug' in seedOffAirClocks(NO_AIR, resolved, { graphics: [], rows: [] }, asked, specs, T).clocks, false);
  // A clock on air is the on-air seed's, not this one's.
  assert.deepEqual(offAirClockGraphics({ liveCue: { bug: 'c1' }, live: resolved.live }, specs), []);
});

test('only a duration held nowhere and off air there is never taken; on air or reported, it reads as before (#1903 N1, N2)', () => {
  assert.equal(clockHeldBeforeRow(DURATION, undefined, false), '12:08@out/12:08/12:08', 'never sent, off air: the start time, off air');
  assert.equal(clockHeldBeforeRow(DURATION, undefined, true), undefined, 'on air with nothing held (a lost report): unknown, as before');
  assert.equal(clockHeldBeforeRow(DURATION, '0:18', false), '0:18', 'a bare value (a host\'s painted report) is not absent');
  assert.equal(clockHeldBeforeRow(MATCH, undefined, false), undefined, 'a clock the operator starts has no Take to wait for');
  // The monitor: a duration on air that it holds nothing for, corrected, stays a correction on air.
  const live = { ...NO_AIR, liveCue: { bug: 'c1' } };
  assert.equal(programItems(live, [{ graphic: 'bug', msg: { t: 'update', data: { f2: '0:20' } } }], DURATIONS, T).air.clocks.bug, '0:20');
  // …and off air it is the length.
  assert.equal(programItems(NO_AIR, [{ graphic: 'bug', msg: { t: 'update', data: { f2: '0:20' } } }], DURATIONS, T).air.clocks.bug, '0:20@out/0:20/0:20');
});
