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
  withReports,
} from '../src/control/airState.ts';
import { createAppliedOnce } from '../src/control/commandRoads.ts';
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

test('a command applied while the replay was read: the seed lands, the rows are not replayed (they are older)', () => {
  const asked = airAtRequest(NO_AIR);
  const commanded = claimAndApply(NO_AIR, [update('lt', { f0: 'NEWER' }, 'u1')], createAppliedOnce(), NO_CLOCKS, T).air;
  const air = seedFromResolve(commanded, RESOLVED, [update('lt', { f0: 'OLDER ROW' })], asked, CUES, NO_CLOCKS);
  assert.deepEqual(air.liveCue, RESOLVED.liveCue, 'the marker did not move, so it seeds');
  assert.deepEqual(air.bootReplay, []);
  assert.deepEqual(air.aired.lt, { f0: 'REPORTED' }, 'the report, without the older row on it');
});

test('a reported clock keeps its origin stamp in the monitor memory and the plain time in the baseline', () => {
  const live = { score: { data: { f5: `10:00@${T}` } } };
  const air = seedFromResolve(NO_AIR, { liveCue: { score: 'c2' }, live }, [], airAtRequest(NO_AIR), CUES, CLOCKS);
  assert.equal(air.clocks.score, `10:00@${T}`);
  assert.equal(air.aired.score.f5, '10:00', 'a stamped value would read as "not on air yet" forever');
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
  assert.equal(start[0].msg.data.f5, `10:00@${T}`);
  // A goal re-sends the cue's whole value set, its plain 10:00 included: the origin survives.
  const goal = step({ graphic: 'score', msg: { t: 'update', data: { f1: '1', f5: '10:00' } }, created_at: at(5) });
  assert.equal(goal.length, 1);
  assert.equal(air.clocks.score, `10:00@${T}`);
  const half = step({ graphic: 'score', msg: { t: 'event', event: 'clockStop' }, created_at: at(5) });
  assert.deepEqual(half.map((i) => i.msg.t), ['event', 'update'], 'the banked time follows the stop');
  assert.equal(half[1].msg.data.f5, '5:00', 'half time banks the five minutes run, not the seed');
  const reset = step({ graphic: 'score', msg: { t: 'event', event: 'clockReset' }, created_at: at(6) });
  assert.equal(reset[1].msg.data.f5, '10:00');
  step({ graphic: 'score', msg: { t: 'stop' } });
  assert.equal('score' in air.clocks, false, 'off air forgets the clock');
});

test('a row with no server time is stamped with the monitor\'s own receive instant', () => {
  const run = programItems(NO_AIR, [{ graphic: 'score', msg: { t: 'event', event: 'clockStart' } }], CLOCKS, T + 42);
  assert.equal(run.out[0].msg.data.f5, `10:00@${T + 42}`, 'from the seed, at now');
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
  assert.equal(echo.air.clocks.score, `10:00@${T}`, 'the echo does not restamp the origin');
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
