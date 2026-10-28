// guards: src/control/sessionWire.ts, src/control/airState.ts, src/control/playoutSession.ts, src/control/seqFollow.ts, src/control/prepareLive.ts
//
// A PUBLISHED PRODUCTION'S WIRE, driven with a scripted backend (production-page refactor spec §3,
// AC-4, AC-6): resolve, seed, follow and stop, in order; a resolve that fails and is asked again; a
// Take while the resolve is out (THE MOVES GUARD through the whole lifetime); a production switch
// mid-flight; every answer that lands after the stop, which must change nothing; and the hand-over
// ping that brings an output a frame it lost while the page reloaded (#1797).

import test from 'node:test';
import assert from 'node:assert/strict';
import { moveLiveCue } from '../src/control/airState.ts';
import { withLiveCue } from '../src/control/liveCue.ts';
import { NO_AIR, createPlayoutSession } from '../src/control/playoutSession.ts';
import { HANDOVER_CONFIRM_MS, HANDOVER_RETRIES, HANDOVER_RETRY_MS, LOG_HISTORY_SPAN, SEEN_EVERY_MS, startSessionWire } from '../src/control/sessionWire.ts';
import { createSeqFollower } from '../src/control/seqFollow.ts';
import { answersPing } from '../src/control/prepareLive.ts';
import { REORDER_WINDOW_MS } from '../src/control/logFollow.ts';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

const RESOLVED = {
  id: 'prod-1',
  liveCue: { lt: 'c1' },
  live: { lt: { data: { f0: 'REPORTED' }, state: { groups: { main: 'on' } } } },
  lastEventId: 1000,
  output: null,
  outputSeenAt: '2026-10-23T10:00:00Z',
};

/** A backend whose every answer the test gives, in its own time. */
function scriptedWire() {
  const calls = [];
  const resolves = [];
  const replays = [];
  const tails = [];
  const follows = [];
  const seen = [];
  const arms = [];
  const pings = [];
  const timers = new Map();
  let timerId = 0;
  const io = {
    controlShowBySlug: (slug) => {
      calls.push(`resolve ${slug}`);
      const d = deferred();
      resolves.push(d);
      return d.promise;
    },
    // The renderer's backoff without the wait: ask again until it answers or is told to stop.
    untilAnswered: async (attempt, opts) => {
      for (;;) {
        const answer = await attempt();
        if (answer.ok || opts.stop?.()) return answer;
        opts.onRetry?.();
        if (opts.stop?.()) return answer;
      }
    },
    bootMonitorReplay: (slug) => {
      calls.push(`replay ${slug}`);
      const d = deferred();
      replays.push(d);
      return d.promise;
    },
    hostedControlTail: (slug, after) => {
      calls.push(`tail ${slug} ${after}`);
      const d = deferred();
      tails.push(d);
      return d.promise;
    },
    followControlLog: (opts) => {
      calls.push(`follow ${opts.showId} ${opts.from}`);
      const d = deferred();
      const follow = { opts, answer: d, unsubscribed: 0 };
      follows.push(follow);
      return d.promise;
    },
    controlOutputSeenAt: (showId) => {
      calls.push(`seen ${showId}`);
      const d = deferred();
      seen.push(d);
      return d.promise;
    },
    controlPingSeq: async (slug, id) => {
      calls.push(`ping ${slug}`);
      pings.push(id);
      return wire.onPing?.(id) ?? { ok: true, at: 0 };
    },
    createCueArmWire: (options) => {
      const wire = { options, rows: [], resets: 0, stops: 0, onState: null };
      arms.push(wire);
      return {
        start: (onState) => (wire.onState = onState),
        row: (row) => wire.rows.push(row),
        reset: () => (wire.resets += 1),
        stop: () => (wire.stops += 1),
      };
    },
    appendLog: (current, incoming) => [...[...incoming].reverse(), ...current],
    armRpc: { arm: async () => null, armsFor: async () => ({ ok: true, arms: [] }) },
    setInterval: (run, ms) => {
      timerId += 1;
      timers.set(timerId, { run, ms });
      return timerId;
    },
    clearInterval: (id) => timers.delete(id),
    setTimeout: (run, ms) => {
      timerId += 1;
      timers.set(timerId, { run, ms, once: true });
      return timerId;
    },
  };
  const wire = { io, calls, resolves, replays, tails, follows, seen, arms, pings, timers, onPing: null };
  return wire;
}

/** The page as the wire sees it: every call recorded, `hear` applying nothing by itself. */
function fakePage(extra = {}) {
  const said = [];
  const page = {
    said,
    resolveWaiting: (w) => said.push(`waiting ${w}`),
    starting: () => said.push('starting'),
    resolved: (r) => said.push(`resolved ${r.id}`),
    recovered: (r) => said.push(`recovered ${Object.keys(r.live).join(',')}`),
    cues: () => [{ id: 'c1', values: { f0: 'STORED' } }],
    clocks: () => ({ clocks: new Map(), pairs: new Map() }),
    armWire: (w) => said.push(`armWire ${w ? 'set' : 'null'}`),
    armsServer: (s) => said.push(`arms ${s}`),
    fire: (g) => said.push(`fire ${g}`),
    note: (t) => said.push(`note ${t}`),
    follow: (s) => said.push(`follow ${s.status}`),
    commandStatus: (s) => said.push(`command ${s}`),
    hear: (items) => said.push(`hear ${items.map((i) => `${i.graphic}:${i.msg.t}`).join(',')}`),
    machineState: (g, s) => said.push(`state ${g} ${JSON.stringify(s)}`),
    refreshData: () => said.push('refresh'),
    describe: (row) => (row.msg.t === 'staged' ? null : { id: row.id, text: `${row.graphic} ${row.msg.t}` }),
    seenAt: (at) => said.push(`seenAt ${at}`),
    tick: () => said.push('tick'),
    ...extra,
  };
  return page;
}

function start(wire, page, session = createPlayoutSession('prod-1')) {
  const stop = startSessionWire(session, wire.io, { slug: 'ctl-1', showId: 'prod-1', page: () => page });
  return { session, stop };
}

/** Walk the boot to the follow: resolve, replay, history. */
async function boot(wire, resolved = RESOLVED, replay = []) {
  await flush();
  wire.resolves.at(-1).resolve({ ok: true, value: resolved });
  await flush();
  wire.replays.at(-1).resolve(replay);
  await flush();
  wire.tails.at(-1).resolve([{ id: 990, graphic: 'lt', msg: { t: 'play' } }]);
  await flush();
}

test('the lifetime in order: resolve, reports, replay, seed, history, then the follow from the resolve\'s head', async () => {
  const wire = scriptedWire();
  const page = fakePage();
  const { session, stop } = start(wire, page);
  assert.deepEqual(page.said, ['starting'], 'the previous answer\'s road is forgotten before the first request');
  await boot(wire, RESOLVED, [{ graphic: 'lt', msg: { t: 'update', data: { f1: 'row' } } }]);
  assert.deepEqual(wire.calls, ['resolve ctl-1', 'replay ctl-1', `tail ctl-1 ${1000 - LOG_HISTORY_SPAN}`, 'follow prod-1 1000']);
  assert.deepEqual(page.said, ['starting', 'waiting false', 'resolved prod-1', 'recovered lt', 'arms missing']);
  const air = session.air.get();
  assert.deepEqual(air.liveCue, { lt: 'c1' });
  assert.deepEqual(air.bootLive, { lt: 'c1' });
  assert.equal(air.reports, RESOLVED.live);
  assert.deepEqual(air.aired.lt, { f0: 'REPORTED', f1: 'row' });
  assert.deepEqual(session.log.get().entries.map((e) => e.id), [990], 'the history is in the log');
  stop();
});

test('a resolve that fails is asked again, and the header says so until it answers', async () => {
  const wire = scriptedWire();
  const page = fakePage();
  const { stop } = start(wire, page);
  await flush();
  wire.resolves[0].resolve({ ok: false, error: 'outage' });
  await flush();
  assert.deepEqual(page.said, ['starting', 'waiting true']);
  assert.equal(wire.resolves.length, 2, 'asked again');
  wire.resolves[1].resolve({ ok: true, value: RESOLVED });
  await flush();
  assert.equal(page.said.at(-2), 'waiting false');
  stop();
});

test('a production that is no longer published (a null answer) seeds nothing and follows nothing', async () => {
  const wire = scriptedWire();
  const page = fakePage();
  const { session, stop } = start(wire, page);
  await flush();
  wire.resolves[0].resolve({ ok: true, value: null });
  await flush();
  assert.deepEqual(wire.calls, ['resolve ctl-1']);
  assert.equal(session.air.get().bootLive, null);
  stop();
});

test('THE MOVES GUARD through the lifetime: a Take while the resolve or its replay is out stands', async () => {
  for (const when of ['resolve', 'replay']) {
    const wire = scriptedWire();
    const page = fakePage();
    const { session, stop } = start(wire, page);
    await flush();
    const take = () => session.apply((parts) => ({ ...parts, air: moveLiveCue(parts.air, (m) => withLiveCue(m, 'lt', 'c9')) }));
    if (when === 'resolve') take();
    wire.resolves[0].resolve({ ok: true, value: { ...RESOLVED, liveCue: {} } });
    await flush();
    if (when === 'replay') take();
    wire.replays[0].resolve([]);
    await flush();
    assert.deepEqual(session.air.get().liveCue, { lt: 'c9' }, `a Take during the ${when} is not overwritten`);
    assert.equal(session.air.get().bootLive, null, 'and no boot recovery is keyed');
    assert.ok(page.said.includes('recovered lt'), 'what air holds is still known: the follow carries the rest');
    stop();
  }
});

test('the request read is the attempt that ANSWERS: a move before a failed attempt does not skip the seed', async () => {
  const wire = scriptedWire();
  const page = fakePage();
  const { session, stop } = start(wire, page);
  await flush();
  session.apply((parts) => ({ ...parts, air: moveLiveCue(parts.air, (m) => withLiveCue(m, 'score', 'c5')) }));
  wire.resolves[0].resolve({ ok: false, error: 'outage' });
  await flush();
  wire.resolves[1].resolve({ ok: true, value: RESOLVED });
  await flush();
  wire.replays[0].resolve([]);
  await flush();
  assert.deepEqual(session.air.get().liveCue, { lt: 'c1' }, 'the answer is newer than that move, so it seeds');
  stop();
});

test('the follow: commands and rows reach `hear`, rows the log, reports the machine state, a src row the tree', async () => {
  const wire = scriptedWire();
  const page = fakePage();
  const { session, stop } = start(wire, page);
  await boot(wire);
  const follow = wire.follows[0];
  follow.answer.resolve(() => (follow.unsubscribed += 1));
  await flush();
  page.said.length = 0;
  follow.opts.onCommand([{ graphic: 'lt', msg: { t: 'play', oid: 'p1' } }]);
  follow.opts.onRow({ id: 1001, graphic: 'lt', msg: { t: 'play', oid: 'p1' } });
  follow.opts.onRow({ id: 1002, graphic: 'lt', msg: { t: 'live', state: { groups: { main: 'out' } } } });
  follow.opts.onRow({ id: 1003, graphic: 'sb', msg: { t: 'update', data: { f1: '2' }, src: 'api' } });
  follow.opts.onRow({ id: 1004, graphic: 'sb', msg: { t: 'staged', data: {}, src: 'operator' } });
  follow.opts.onStatus({ status: 'SUBSCRIBED', everJoined: true });
  follow.opts.onCommandStatus('SUBSCRIBED');
  assert.deepEqual(page.said, [
    'hear lt:play',
    'hear lt:play',
    'hear lt:live',
    'state lt {"groups":{"main":"out"}}',
    'hear sb:update',
    'refresh',
    'hear sb:staged',
    'follow SUBSCRIBED',
    'command SUBSCRIBED',
  ]);
  assert.deepEqual(session.log.get().entries.map((e) => e.id), [1003, 1002, 1001, 990], 'one line per row; typing has none');
  stop();
  assert.equal(follow.unsubscribed, 1);
});

test('a newer report forgets the boot replay, so a rebuilt stage reads what was seen since', async () => {
  const wire = scriptedWire();
  const page = fakePage();
  const { session, stop } = start(wire, page);
  await boot(wire, RESOLVED, [{ graphic: 'lt', msg: { t: 'update', data: { f1: 'row' } } }]);
  assert.notEqual(session.air.get().bootReplay, null);
  wire.follows[0].answer.resolve(() => {});
  await flush();
  wire.follows[0].opts.onRow({ id: 1001, graphic: 'lt', msg: { t: 'live', state: null } });
  assert.equal(session.air.get().bootReplay, null);
  stop();
});

test('timed cues on the numbered log: the arm wire follows the rows, resets with the epoch, and stands down when the server keeps none', async () => {
  const wire = scriptedWire();
  const page = fakePage();
  const { stop } = start(wire, page);
  await boot(wire, { ...RESOLVED, seq: { epoch: 'e1', from: 7 } });
  assert.equal(wire.arms.length, 1);
  assert.equal(wire.arms[0].options.slug, 'ctl-1');
  assert.ok(page.said.includes('armWire set'));
  const follow = wire.follows[0];
  assert.equal(follow.opts.seq.epoch, 'e1', 'the follow takes the numbered log');
  follow.answer.resolve(() => {});
  await flush();
  follow.opts.onRow({ id: 1001, graphic: 'lt', msg: { t: 'cue', cue: 'c1' } });
  follow.opts.onEpochReset();
  assert.equal(wire.arms[0].rows.length, 1);
  assert.equal(wire.arms[0].resets, 1);
  wire.arms[0].onState('missing');
  assert.equal(wire.arms[0].stops, 1);
  assert.deepEqual(page.said.slice(-2), ['armWire null', 'arms missing']);
  follow.opts.onRow({ id: 1002, graphic: 'lt', msg: { t: 'cue', cue: null } });
  assert.equal(wire.arms[0].rows.length, 1, 'a stood-down arm wire hears no more rows');
  stop();
  assert.equal(wire.arms[0].stops, 1, 'and is not stopped twice');
});

test('the heartbeat: every 30 s the clock ticks and the output\'s last heartbeat is asked; no answer is not an answer', async () => {
  const wire = scriptedWire();
  const page = fakePage();
  const { stop } = start(wire, page);
  const [timer] = [...wire.timers.values()];
  assert.equal(timer.ms, SEEN_EVERY_MS);
  timer.run();
  wire.seen[0].resolve('2026-10-23T10:01:00Z');
  await flush();
  timer.run();
  wire.seen[1].resolve(null);
  await flush();
  assert.deepEqual(page.said.filter((s) => s.startsWith('tick') || s.startsWith('seenAt')), ['tick', 'seenAt 2026-10-23T10:01:00Z', 'tick']);
  timer.run();
  stop();
  wire.seen[2].resolve('late');
  await flush();
  assert.equal(page.said.includes('seenAt late'), false, 'an answer after the stop is dropped');
  assert.equal(wire.timers.size, 0, 'the timer is cleared');
});

test('the stop: the follow, the timer and the arm wire end once, and the page hears pending again', async () => {
  const wire = scriptedWire();
  const page = fakePage();
  const { stop } = start(wire, page);
  await boot(wire, { ...RESOLVED, seq: { epoch: 'e1', from: 7 } });
  const follow = wire.follows[0];
  follow.answer.resolve(() => (follow.unsubscribed += 1));
  await flush();
  page.said.length = 0;
  stop();
  stop();
  assert.equal(follow.unsubscribed, 1);
  assert.equal(wire.arms[0].stops, 1);
  assert.equal(wire.timers.size, 0);
  assert.deepEqual(page.said, ['waiting false', 'armWire null', 'arms pending']);
  follow.opts.onRow({ id: 2000, graphic: 'lt', msg: { t: 'play' } });
  follow.opts.onCommand([{ graphic: 'lt', msg: { t: 'play' } }]);
  follow.opts.onStatus({ status: 'CLOSED', everJoined: true });
  assert.deepEqual(page.said, ['waiting false', 'armWire null', 'arms pending'], 'nothing after the stop reaches the page');
});

test('late answers after the stop change nothing, at every await', async () => {
  for (const stage of ['resolve', 'replay', 'tail', 'follow']) {
    const wire = scriptedWire();
    const page = fakePage();
    const { session, stop } = start(wire, page);
    await flush();
    const at = (s) => s === stage;
    if (at('resolve')) stop();
    wire.resolves[0].resolve({ ok: true, value: RESOLVED });
    await flush();
    if (at('replay')) stop();
    wire.replays[0]?.resolve([]);
    await flush();
    if (at('tail')) stop();
    wire.tails[0]?.resolve([{ id: 990, graphic: 'lt', msg: { t: 'play' } }]);
    await flush();
    if (at('follow')) stop();
    let unsubscribed = 0;
    wire.follows[0]?.answer.resolve(() => (unsubscribed += 1));
    await flush();
    if (stage === 'resolve') {
      assert.equal(session.air.get().reports, null, 'stopped during the resolve: nothing of its answer lands');
      assert.equal(page.said.includes('resolved prod-1'), false);
    }
    if (stage === 'resolve' || stage === 'replay') assert.equal(session.air.get().bootLive, null, `stopped during the ${stage}: no seed`);
    if (stage !== 'follow') assert.equal(wire.follows.length, 0, `stopped during the ${stage}: no follow`);
    if (stage === 'resolve' || stage === 'replay' || stage === 'tail') assert.deepEqual(session.log.get().entries, [], 'no history');
    if (stage === 'follow') assert.equal(unsubscribed, 1, 'a follow that answers after the stop is ended at once');
  }
});

test('a production switch mid-flight: the first session\'s late answers write nothing, the next session seeds its own', async () => {
  const wire = scriptedWire();
  const pageA = fakePage();
  const a = start(wire, pageA, createPlayoutSession('prod-a'));
  await flush();
  // The operator opens another production: the first session ends (its wire stops with it).
  a.session.dispose();
  const pageB = fakePage();
  const b = start(wire, pageB, createPlayoutSession('prod-b'));
  await flush();
  assert.equal(wire.resolves.length, 2);
  // The first production's answer lands late, after the second's has been asked.
  wire.resolves[0].resolve({ ok: true, value: { ...RESOLVED, liveCue: { lt: 'a-cue' } } });
  await flush();
  assert.equal(wire.replays.length, 0, 'the ended session asks nothing more');
  assert.equal(pageA.said.includes('resolved prod-1'), false);
  assert.equal(a.session.air.get(), NO_AIR);
  wire.resolves[1].resolve({ ok: true, value: { ...RESOLVED, liveCue: { lt: 'b-cue' } } });
  await flush();
  wire.replays[0].resolve([]);
  await flush();
  assert.deepEqual(b.session.air.get().liveCue, { lt: 'b-cue' });
  assert.deepEqual(pageA.said.at(-1), 'arms pending', 'the first page heard only its stop');
  b.stop();
  a.stop();
});

test('a session that had already ended asks nothing', async () => {
  const wire = scriptedWire();
  const page = fakePage();
  const session = createPlayoutSession('prod-1');
  session.dispose();
  start(wire, page, session);
  await flush();
  assert.deepEqual(wire.calls, []);
  assert.equal(wire.timers.size, 0);
});

test('a restarted wire (unpublish, publish again) forgets the old boot replay, even when the guard skips the new seed', async () => {
  const wire = scriptedWire();
  const page = fakePage();
  const session = createPlayoutSession('prod-1');
  const first = start(wire, page, session);
  await boot(wire, RESOLVED, [{ graphic: 'lt', msg: { t: 'update', data: { f1: 'old row' } } }]);
  assert.notEqual(session.air.get().bootReplay, null);
  first.stop();
  const second = start(wire, page, session);
  assert.equal(session.air.get().bootReplay, null, 'the old rows are not what air holds any more');
  await flush();
  // A Take while the new resolve is out: the seed is skipped, and the old rows must not survive it.
  session.apply((parts) => ({ ...parts, air: moveLiveCue(parts.air, (m) => withLiveCue(m, 'lt', 'c9')) }));
  wire.resolves.at(-1).resolve({ ok: true, value: RESOLVED });
  await flush();
  wire.replays.at(-1).resolve([{ graphic: 'lt', msg: { t: 'update', data: { f1: 'new row' } } }]);
  await flush();
  assert.equal(session.air.get().bootReplay, null);
  second.stop();
});

test('THE HAND-OVER (#1797): a value applied while the page reloaded, whose frame the output lost, airs at the page\'s first join with no further update', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // The production's numbered log, and an output following it as src/output/main.ts does.
  const log = [1, 2, 3].map((seq) => ({ id: 100 + seq, seq, graphic: 'Party totals', msg: { t: 'update', data: { f8: `277,${seq}00` }, src: 'api' } }));
  const aired = [];
  const output = createSeqFollower({
    from: 3,
    epoch: 'e1',
    tail: async (after) => ({ epoch: 'e1', rows: log.filter((r) => r.seq > after) }),
    onRows: (rows) => aired.push(...rows.map((r) => r.seq)),
  });
  const write = (msg, graphic = 'Party totals') => {
    const row = { id: 100 + log.length + 1, seq: log.length + 1, graphic, msg };
    log.push(row);
    return row;
  };
  // Mid-reload the feed applies 277,600, and Realtime drops its frame: the output never hears it.
  write({ t: 'update', data: { f8: '277,600' }, src: 'api' });
  const wire = scriptedWire();
  // The ping is a numbered row like any other; its frame reaches the output, and this page.
  wire.onPing = (id) => {
    const row = write({ t: 'ping', id, at: 0 }, '');
    output.offer({ epoch: 'e1', rows: [row] });
    wire.follows[0].opts.onRow(row);
    return { ok: true, at: 0 };
  };
  const page = fakePage();
  const { stop } = start(wire, page);
  await boot(wire, { ...RESOLVED, seq: { epoch: 'e1', from: 4 } });
  const follow = wire.follows[0];
  follow.answer.resolve(() => {});
  await flush();
  assert.deepEqual(wire.pings, [], 'nothing before the page\'s own road is up');
  t.mock.timers.tick(10_000);
  await flush();
  assert.deepEqual(aired, [], 'with no further update nothing tells the output it is behind: no frame, so no gap');
  follow.opts.onStatus({ status: 'CHANNEL_ERROR', everJoined: false });
  assert.deepEqual(wire.pings, [], 'nor on a join that failed');
  follow.opts.onStatus({ status: 'SUBSCRIBED', everJoined: true });
  await flush();
  assert.equal(wire.pings.length, 1, 'one ping at the first join');
  assert.match(wire.pings[0], /^[a-z0-9]{8,40}$/, 'an id control_ping_seq takes');
  assert.equal(answersPing(wire.pings[0]), false, 'and one no output answers in place of a Prepare for Live press');
  // The ping's frame has a gap in front of it: the reorder window, then one tail read.
  t.mock.timers.tick(REORDER_WINDOW_MS);
  for (let i = 0; i < 5; i += 1) await flush();
  assert.deepEqual(aired, [4, 5], 'the lost value reached the output, once, before the ping and in order');
  // A rejoin and every poll tick report SUBSCRIBED again: still the one ping.
  follow.opts.onStatus({ status: 'SUBSCRIBED', everJoined: true });
  follow.opts.onStatus({ status: 'SUBSCRIBED', everJoined: true });
  await flush();
  assert.equal(wire.pings.length, 1, 'never a ping per status or per poll');
  const confirm = [...wire.timers.values()].find((timer) => timer.once);
  assert.equal(confirm?.ms, HANDOVER_CONFIRM_MS, 'the page waits for its ping to come back');
  confirm.run();
  await flush();
  assert.equal(wire.pings.length, 1, 'a ping that came back live is not sent again');
  stop();
  output.stop();
});

test('THE HAND-OVER SURVIVES A LOST PING (#1797): a ping whose frame never comes back is sent again, and the lost value airs', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const log = [1, 2, 3].map((seq) => ({ id: 100 + seq, seq, graphic: 'Party totals', msg: { t: 'update', data: { f8: `277,${seq}00` }, src: 'api' } }));
  const aired = [];
  const output = createSeqFollower({
    from: 3,
    epoch: 'e1',
    tail: async (after) => ({ epoch: 'e1', rows: log.filter((r) => r.seq > after) }),
    onRows: (rows) => aired.push(...rows.map((r) => r.seq)),
  });
  const write = (msg, graphic = 'Party totals') => {
    const row = { id: 100 + log.length + 1, seq: log.length + 1, graphic, msg };
    log.push(row);
    return row;
  };
  // The value's frame is lost mid-reload, and so is the first ping's: the road is still dropping.
  write({ t: 'update', data: { f8: '277,600' }, src: 'api' });
  const wire = scriptedWire();
  wire.onPing = (id) => {
    const row = write({ t: 'ping', id, at: 0 }, '');
    if (wire.pings.length > 1) {
      output.offer({ epoch: 'e1', rows: [row] });
      wire.follows[0].opts.onRow(row);
    }
    return { ok: true, at: 0 };
  };
  const page = fakePage();
  const { stop } = start(wire, page);
  await boot(wire, { ...RESOLVED, seq: { epoch: 'e1', from: 4 } });
  const follow = wire.follows[0];
  follow.answer.resolve(() => {});
  await flush();
  follow.opts.onStatus({ status: 'SUBSCRIBED', everJoined: true });
  await flush();
  t.mock.timers.tick(10_000);
  for (let i = 0; i < 5; i += 1) await flush();
  assert.equal(wire.pings.length, 1);
  assert.deepEqual(aired, [], 'the first ping\'s frame was lost too: the output still knows nothing');
  const runOnce = async () => {
    const entry = [...wire.timers].find(([, timer]) => timer.once);
    if (!entry) return null;
    wire.timers.delete(entry[0]);
    entry[1].run();
    await flush();
    return entry[1].ms;
  };
  assert.equal(await runOnce(), HANDOVER_CONFIRM_MS, 'the page waited for its ping to come back');
  assert.equal(wire.pings.length, 2, 'and, not seeing it, sent another');
  t.mock.timers.tick(REORDER_WINDOW_MS);
  for (let i = 0; i < 5; i += 1) await flush();
  assert.deepEqual(aired, [4, 5, 6], 'the lost value reached the output, once and in order, with the lost ping');
  await runOnce();
  assert.equal(wire.pings.length, 2, 'the second came back live: no third');
  stop();
  output.stop();
});

test('a hand-over ping seen only through a tail read is sent again; the retries are bounded', async () => {
  const wire = scriptedWire();
  wire.onPing = (id) => {
    const follow = wire.follows[0];
    follow.opts.onReplay(true);
    follow.opts.onRow({ id: 900 + wire.pings.length, seq: 50 + wire.pings.length, graphic: '', msg: { t: 'ping', id, at: 0 } });
    follow.opts.onReplay(false);
    return { ok: true, at: 0 };
  };
  const page = fakePage();
  const { stop } = start(wire, page);
  await boot(wire, { ...RESOLVED, seq: { epoch: 'e1', from: 7 } });
  wire.follows[0].answer.resolve(() => {});
  await flush();
  wire.follows[0].opts.onStatus({ status: 'SUBSCRIBED', everJoined: true });
  for (let i = 0; i < 6; i += 1) {
    await flush();
    const entry = [...wire.timers].find(([, timer]) => timer.once);
    if (!entry) continue;
    wire.timers.delete(entry[0]);
    entry[1].run();
  }
  await flush();
  assert.equal(wire.pings.length, 1 + HANDOVER_RETRIES);
  stop();
});

test('the hand-over is the numbered log\'s only: a production on row ids sends no ping', async () => {
  const wire = scriptedWire();
  const page = fakePage();
  const { stop } = start(wire, page);
  await boot(wire);
  wire.follows[0].answer.resolve(() => {});
  await flush();
  wire.follows[0].opts.onStatus({ status: 'SUBSCRIBED', everJoined: true });
  await flush();
  assert.deepEqual(wire.pings, []);
  stop();
});

test('a hand-over ping refused for a moment is asked again a second later, at most twice; a lasting refusal is not', async () => {
  for (const [answer, expected] of [
    [{ ok: false, unavailable: false, detail: 'too many commands, slow down', passing: true }, 1 + HANDOVER_RETRIES],
    [{ ok: false, unavailable: false, detail: 'hosted control is switched off for this page', passing: false }, 1],
    [{ ok: false, unavailable: true, detail: 'PGRST202', passing: false }, 1],
  ]) {
    const wire = scriptedWire();
    wire.onPing = () => answer;
    const page = fakePage();
    const { stop } = start(wire, page);
    await boot(wire, { ...RESOLVED, seq: { epoch: 'e1', from: 7 } });
    wire.follows[0].answer.resolve(() => {});
    await flush();
    wire.follows[0].opts.onStatus({ status: 'SUBSCRIBED', everJoined: true });
    for (let i = 0; i < 4; i += 1) {
      await flush();
      const retry = [...wire.timers].find(([, timer]) => timer.once);
      if (!retry) continue;
      assert.equal(retry[1].ms, HANDOVER_RETRY_MS);
      wire.timers.delete(retry[0]);
      retry[1].run();
    }
    await flush();
    assert.equal(wire.pings.length, expected, answer.detail);
    assert.equal(new Set(wire.pings).size, expected, 'each a fresh id');
    stop();
  }
});

test('a hand-over retry due after the stop asks nothing', async () => {
  const wire = scriptedWire();
  wire.onPing = () => ({ ok: false, unavailable: false, detail: 'lock', passing: true });
  const page = fakePage();
  const { stop } = start(wire, page);
  await boot(wire, { ...RESOLVED, seq: { epoch: 'e1', from: 7 } });
  wire.follows[0].answer.resolve(() => {});
  await flush();
  wire.follows[0].opts.onStatus({ status: 'SUBSCRIBED', everJoined: true });
  await flush();
  const retry = [...wire.timers.values()].find((timer) => timer.once);
  stop();
  retry.run();
  await flush();
  assert.equal(wire.pings.length, 1);
});

test('a hand-over ping whose call threw is sent again a second later, within the same bound', async () => {
  const wire = scriptedWire();
  wire.onPing = () => {
    throw new Error('the client failed to load');
  };
  const page = fakePage();
  const { stop } = start(wire, page);
  await boot(wire, { ...RESOLVED, seq: { epoch: 'e1', from: 7 } });
  wire.follows[0].answer.resolve(() => {});
  await flush();
  wire.follows[0].opts.onStatus({ status: 'SUBSCRIBED', everJoined: true });
  for (let i = 0; i < 6; i += 1) {
    await flush();
    const entry = [...wire.timers].find(([, timer]) => timer.once);
    if (!entry) continue;
    assert.equal(entry[1].ms, HANDOVER_RETRY_MS);
    wire.timers.delete(entry[0]);
    entry[1].run();
  }
  await flush();
  assert.equal(wire.pings.length, 1 + HANDOVER_RETRIES);
  stop();
});

test('a hand-over ping answered first and back live inside the confirm window is not sent again', async () => {
  const wire = scriptedWire();
  const page = fakePage();
  const { stop } = start(wire, page);
  await boot(wire, { ...RESOLVED, seq: { epoch: 'e1', from: 7 } });
  const follow = wire.follows[0];
  follow.answer.resolve(() => {});
  await flush();
  follow.opts.onStatus({ status: 'SUBSCRIBED', everJoined: true });
  await flush();
  const confirm = [...wire.timers.values()].find((timer) => timer.once);
  assert.equal(confirm?.ms, HANDOVER_CONFIRM_MS, 'the answer came first: the page is waiting for the row');
  follow.opts.onRow({ id: 901, seq: 51, graphic: '', msg: { t: 'ping', id: wire.pings[0], at: 0 } });
  confirm.run();
  await flush();
  assert.equal(wire.pings.length, 1, 'the row came back live before the window ran out');
  stop();
});
