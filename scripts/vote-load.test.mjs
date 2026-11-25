// THE VOTE LOAD SCRIPT (scripts/vote-load.mjs), without a network: a room of phones against an
// in-memory stand-in for the four functions a vote touches, with the rules 0127 enforces (an open
// round, its revision, the upsert per device). Pinned: every vote a phone was told went in is
// counted once and the four counts agree; a phone that sees "Not sent" presses Vote again and is
// counted; the late phones and the changers are in the count; the phone's refusal words match
// src/audience/audienceTypes.ts; and the script refuses production.

import assert from 'node:assert/strict';
import test from 'node:test';

import { WORDS, assertTarget, countsOf, createRoom, cueCounts, hostTotals, hostWindow, operatorReads, phoneOutcome, sampleHost, scriptCounts, slowTimeline, summarise } from './vote-load.mjs';

const { NOT_SENT, QUESTION_CLOSED, TOO_MANY_VOTES, VOTE_FINAL } = await import('../src/audience/audienceTypes.ts');

const URL = 'http://127.0.0.1:54321';

/** The database's side of a vote, as 0127 has it, behind a fetch. `fail(fn)` may fail a request. */
function standIn({ fail = () => null } = {}) {
  const round = { id: 'r1', revision: 1, options: ['Red', 'Blue', 'Green'], open: false };
  const votes = new Map();
  const reply = (status, body) => ({ status, ok: status < 300, text: async () => JSON.stringify(body) });
  const fetchImpl = async (url, init) => {
    const fn = url.split('/').pop();
    const a = JSON.parse(init.body);
    const failure = fail(fn);
    if (failure === 'network') throw new TypeError('fetch failed');
    if (failure) return reply(failure, { message: 'upstream' });
    if (fn === 'audience_join_by_slug') {
      const live = round.open ? { id: round.id, kind: 'poll', options: round.options, revision: round.revision } : null;
      return reply(200, [{ state: { open: round.open, round: live }, my_vote: live ? votes.get(a.p_device)?.option ?? null : null }]);
    }
    if (fn === 'audience_vote') {
      if (!round.open || a.p_round !== round.id || a.p_revision !== round.revision) return reply(400, { message: 'that question has closed' });
      votes.set(a.p_device, { option: a.p_option, at: new Date().toISOString() });
      return reply(204, null);
    }
    if (fn === 'audience_tally') {
      const counts = countsOf(round.options.length, [...votes.values()]);
      return reply(200, [{ round_id: round.id, counts, total: votes.size }]);
    }
    if (fn === 'audience_votes_export') {
      return reply(200, { votes: [...votes].map(([device, v]) => ({ at: v.at, option: v.option, source: 'phone', voter: device.slice(0, 10) })) });
    }
    return reply(404, { message: 'no such function' });
  };
  return { round, votes, fetchImpl };
}

const quick = { pollMs: 40, retryMs: 20 };
const runOf = { windowMs: 60, changeMs: [10, 60], lateMs: [30, 120], timeoutMs: 5_000 };

test('a room votes, changes and arrives late, and the script, the tally and the export agree vote for vote', async () => {
  const db = standIn();
  const room = createRoom({ url: URL, key: 'k', join: 'j', fetchImpl: db.fetchImpl, ...quick });
  await room.arrive(100);
  db.round.open = true;
  const outcomes = await room.run({ options: 3, changers: 20, late: 10, ...runOf });
  const shown = await room.readBack('r1');
  room.leave();
  assert.equal(room.phones.length, 110);
  assert.deepEqual(outcomes.filter((o) => o.shown), []);
  assert.equal(outcomes.filter((o) => o.kind === 'change').length, 20);
  const script = scriptCounts(room.phones, 'r1', 3);
  const reads = await operatorReads(room, 'c', 'r1', 3);
  assert.equal(script.reduce((a, b) => a + b, 0), 110);
  assert.deepEqual(reads.tally.counts, script);
  assert.deepEqual(reads.export.counts, script);
  assert.equal(reads.export.voters, 110);
  // Every phone reads back the vote the script recorded for it.
  assert.deepEqual(shown, room.phones.map((p) => p.sent.get('r1')));
});

test('a phone that sees "Not sent" presses Vote again and is counted; one that never gets through is not, and says so', async () => {
  let votesSeen = 0;
  const db = standIn({
    fail: (fn) => {
      if (fn !== 'audience_vote') return null;
      votesSeen += 1;
      // The first ten sends fail, half on the network and half as a 503; then one phone forever.
      if (votesSeen <= 10) return votesSeen % 2 ? 'network' : 503;
      return null;
    },
  });
  const room = createRoom({ url: URL, key: 'k', join: 'j', fetchImpl: db.fetchImpl, ...quick });
  await room.arrive(30);
  db.round.open = true;
  const outcomes = await room.run({ options: 3, changers: 0, ...runOf });
  room.leave();
  assert.deepEqual(outcomes.filter((o) => o.shown), []);
  assert.equal(room.phones.flatMap((p) => p.sends).filter((s) => s.shown === WORDS.notSent).length, 10);
  const reads = await operatorReads(room, 'c', 'r1', 3);
  assert.deepEqual(reads.tally.counts, scriptCounts(room.phones, 'r1', 3));
  assert.equal(reads.tally.total, 30);
  const failures = summarise(room.requests).vote.failures;
  assert.deepEqual(failures, { network: 5, '503 upstream': 5 });
});

test('a vote that never gets through is left out of the script count and reported', async () => {
  const db = standIn({ fail: (fn) => (fn === 'audience_vote' ? 503 : null) });
  const room = createRoom({ url: URL, key: 'k', join: 'j', fetchImpl: db.fetchImpl, ...quick });
  await room.arrive(3);
  db.round.open = true;
  const outcomes = await room.run({ options: 3, changers: 0, ...runOf });
  room.leave();
  assert.deepEqual(outcomes.map((o) => o.shown), [WORDS.notSent, WORDS.notSent, WORDS.notSent]);
  assert.equal(room.phones[0].sends.length, 3, 'one press and two more');
  assert.deepEqual(scriptCounts(room.phones, 'r1', 3), [0, 0, 0]);
});

test('the refusal words are the phone page\'s own', () => {
  assert.equal(WORDS.notSent, NOT_SENT);
  assert.equal(WORDS.closed, QUESTION_CLOSED);
  assert.equal(WORDS.final, VOTE_FINAL);
  assert.equal(WORDS.tooMany, TOO_MANY_VOTES);
  assert.equal(phoneOutcome(0, ''), NOT_SENT);
  assert.equal(phoneOutcome(502, ''), NOT_SENT);
  assert.equal(phoneOutcome(204, ''), null);
  assert.equal(phoneOutcome(400, 'too many votes at once'), TOO_MANY_VOTES);
  assert.equal(phoneOutcome(400, 'that question has closed'), QUESTION_CLOSED);
  assert.equal(phoneOutcome(400, 'something else'), WORDS.refused);
});

test('a result cue\'s values read back as counts in option order, with its total', () => {
  const values = { f1: 'Who wins?', f2: 'Red | 40\nBlue | 35\nGreen | 25', f3: '100 votes · voting closed', f4: 'closed' };
  assert.deepEqual(cueCounts(values, ['Red', 'Blue', 'Green']), { counts: [40, 35, 25], total: 100 });
  assert.deepEqual(cueCounts({}, ['Red']), { counts: [null], total: null });
});

test('the CSV\'s option letters count like the export', () => {
  assert.deepEqual(countsOf(3, ['A', 'C', 'C', 'B']), [1, 1, 2]);
});

test('the host over a window: CPU and disk busy between its first and last scrape, peaks of the rest', () => {
  const scrape = (idle, user, disk, avail, load) =>
    [
      `node_cpu_seconds_total{cpu="0",mode="idle"} ${idle}`,
      `node_cpu_seconds_total{cpu="0",mode="user"} ${user}`,
      `node_disk_io_time_seconds_total{device="nvme0n1"} ${disk}`,
      'node_memory_MemTotal_bytes 1073741824',
      `node_memory_MemAvailable_bytes ${avail}`,
      `node_load1 ${load}`,
    ].join('\n');
  const readings = [
    { at: 0, ...hostTotals(scrape(100, 10, 50, 536870912, 0.5)) },
    // The endpoint refreshes its counters only every so often: an equal scrape changes nothing.
    { at: 5_000, ...hostTotals(scrape(100, 10, 50, 536870912, 0.5)) },
    { at: 10_000, error: 'HTTP 503' },
    { at: 20_000, ...hostTotals(scrape(115, 15, 55, 268435456, 2)) },
  ];
  assert.deepEqual(hostWindow(readings), {
    samples: 3,
    cpuBusy: 0.25,
    diskBusy: 0.25,
    memoryUsedMiBPeak: 768,
    memoryTotalMiB: 1024,
    load1Peak: 2,
    connectionsPeak: null,
    unread: 1,
  });
  assert.equal(hostWindow(readings, 1_000, 6_000).cpuBusy, null, 'one scrape is not a rate');
});

test('the host sampler stopped while a scrape is in flight scrapes no more', async () => {
  let calls = 0;
  let answer;
  const fetchImpl = () => {
    calls += 1;
    return new Promise((resolve) => (answer = resolve));
  };
  const host = sampleHost({ ref: 'r', serviceKey: 'k', everyMs: 5, fetchImpl });
  host.stop();
  answer({ ok: true, text: async () => '' });
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls, 1);
});

test('the slow timeline: the buckets with a slow request, each with the operator presses inside it', () => {
  const requests = [
    { at: 1_000, ms: 150 },
    { at: 4_100, ms: 9_000 },
    { at: 4_500, ms: 300 },
    { at: 9_000, ms: 2_500 },
  ];
  const marks = [{ at: 4_000, what: 'go live' }, { at: 12_000, what: 'stop' }];
  assert.deepEqual(slowTimeline(requests, marks), [
    { s: 4, started: 2, slow: 1, slowestMs: 9_000, marks: ['go live'] },
    { s: 8, started: 1, slow: 1, slowestMs: 2_500, marks: [] },
  ]);
});

test('it refuses production and any project but staging', () => {
  assert.throws(() => assertTarget('https://kprolrchuldgfrzspthy.supabase.co', {}), /staging project or a local stack only/);
  assert.throws(() => assertTarget('https://someoneelse.supabase.co', {}), /staging/);
  assert.throws(() => assertTarget('', {}), /staging/);
  assertTarget('https://garafohbzmsybtysxphb.supabase.co', {});
  assertTarget(URL, {});
});
