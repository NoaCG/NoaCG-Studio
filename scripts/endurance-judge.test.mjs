// guards: scripts/endurance-judge.mjs, scripts/endurance-fixture.mjs, scripts/election-replay-server.mjs
//
// The endurance verdict (phase E8.1b) can fail. A healthy record of a 30-minute run passes every
// check, and each defect the envelope names turns its own check red: a wrong-person frame, a mixed
// record, a stale-owner write, a duplicate action, an unbounded queue, a leaked subscription, memory
// growth, an unhandled error, a Pause that leaks, a revision over the ingress limit. The fixture's
// shape and limits are pinned here too, so a change to them is a reviewed change.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { ACTION_MS, BODY_CAP_BYTES, CANDIDATES, CUE_SWITCH_MS, STEP_MS, candidates, enduranceTimeline, measureFixture, partyVotes, revisionAt, schedule, stepKind, votesAt } from './endurance-fixture.mjs';
import { judge } from './endurance-judge.mjs';
import { startReplayServer } from './election-replay-server.mjs';

const MIN = 30;
const T0 = 1_800_000_000_000;
const people = candidates();
const key = (d, c) => people.find((p) => p.district === d && p.candidate === c);
const CUES = [key('02', 101), key('01', 101), key('02', 103)];
const fmt = (n) => n.toLocaleString('en-GB');
const MIB = 1024 * 1024;

/** A healthy record of a run, built as the driver writes one. */
function healthy() {
  const plan = schedule(MIN);
  const iso = (t) => new Date(t).toISOString();
  const r = { minutes: MIN, schedule: plan, t0: T0, end: T0 + plan.totalMs + 2_000, errors: [], takes: [], actions: [], faults: [], samples: [], frames: [], snapshots: [], provider: [], reads: [], agents: [], rows: [], credentialLeaked: false };
  r.fixture = { candidates: CANDIDATES, bodyBytes: 150_710, jsonbBytes: 164_408, capBytes: BODY_CAP_BYTES };
  const paused = [];
  let epoch = 1;
  for (const e of plan.events) {
    const at = T0 + e.at;
    if (e.kind === 'pause') {
      const f = { kind: 'pause', at, paused: at + 200, resuming: at + 200 + e.ms, end: at + 400 + e.ms, answer: { paused: true, writes: 0 }, resume: { paused: false, writes: 2 } };
      paused.push(f);
      r.faults.push(f);
    } else if (e.kind === 'handover') {
      const crash = e.mode === 'crash';
      r.faults.push({ kind: 'handover', mode: e.mode, at, claimed: at + (crash ? 33_000 : 1_000), ...(crash ? { woke: at + 36_000 } : {}), end: at + (crash ? 45_000 : 2_000), from: `agent-${epoch}`, epochBefore: epoch, epochAfter: epoch + 1 });
      if (crash) r.reads.push({ agent: `agent-${epoch}`, at: at + 36_500, line: 'election renewal failed: fetch failed' }, { agent: `agent-${epoch}`, at: at + 36_600, line: 'election changed revision 9 not taken (409 moved)' }, { agent: `agent-${epoch}`, at: at + 38_600, line: 'election not claimed (409 held by another agent)' });
      epoch++;
    } else r.faults.push({ kind: e.kind, at, end: at + (e.ms ?? 4_000) });
  }
  const isPaused = (t) => paused.some((f) => t > f.paused && t < f.resuming);
  const epochAt = (t) => 1 + r.faults.filter((f) => f.kind === 'handover' && f.claimed <= t).length;
  for (const g of ['Party totals', 'Count bug', 'Ticker']) r.rows.push({ id: r.rows.length + 1, graphic: g, t: 'play', at: T0 - 5_000 });
  let n = 0;
  for (let at = 0; at < plan.totalMs; at += CUE_SWITCH_MS) {
    const p = CUES[n++ % CUES.length];
    r.takes.push({ label: p.name, key: [p.district, p.candidate], clickAt: T0 + at, at: T0 + at + 300 });
  }
  const aired = (t) => r.takes.findLast((x) => x.at <= t);
  const person = (x) => key(x.key[0], x.key[1]);
  const events = [];
  // A Take writes its values and its play in one moment; the output reports what it shows.
  for (const x of r.takes) {
    events.push({ t: x.clickAt + 100, row: { graphic: 'Candidate card', t: 'update', data: { f0: person(x).name, f2: fmt(votesAt(person(x), 1)) } } });
    events.push({ t: x.clickAt + 100, row: { graphic: 'Candidate card', t: 'play' } });
    events.push({ t: x.clickAt + 900, row: { graphic: 'Candidate card', t: 'live', data: { f0: person(x).name } } });
  }
  const applied = [];
  for (let i = 0; T0 + i * STEP_MS < r.end; i++) {
    if (stepKind(i) !== 'count') continue;
    const rev = revisionAt(i);
    const t = T0 + i * STEP_MS;
    r.provider.push({ name: `count-${rev}`, at: t + 100 });
    r.reads.push({ agent: 'agent-1', at: t + 500, line: `${iso(t + 500)} election changed accepted=${rev} next=2000ms` });
    if (!isPaused(t + 1_000)) {
      applied.push({ t: t + 1_000, rev });
      events.push({ t: t + 1_000, row: { graphic: 'Party totals', t: 'update', src: 'api', data: { f8: fmt(partyVotes('KOK', rev)) } } });
      const a = aired(t + 1_500);
      if (a) events.push({ t: t + 1_500, row: { graphic: 'Candidate card', t: 'update', data: { f0: person(a).name, f2: fmt(votesAt(person(a), rev)) } } });
    }
  }
  events.sort((a, b) => a.t - b.t);
  for (const e of events) r.rows.push({ id: r.rows.length + 1, ...e.row, at: e.t });
  r.reads.push({ agent: 'agent-1', at: T0 + 9_000, line: `${iso(T0 + 9_000)} election unchanged accepted=1 next=2000ms` });
  r.reads.push({ agent: 'agent-1', at: T0 + 9_500, line: `${iso(T0 + 9_500)} election stale accepted=1 next=2000ms` });
  r.reads.push({ agent: 'agent-1', at: T0 + 9_800, line: `${iso(T0 + 9_800)} election invalid accepted=1 the provider's answer is not JSON next=2000ms` });
  r.reads.push({ agent: 'agent-1', at: T0 + 9_900, line: 'election changed revision 2 not taken (409 too_soon)' });
  // The output, read at 4 Hz: what the card and the board show as each row lands.
  let rev = 0;
  for (let t = T0; t < r.end; t += 250) {
    rev = applied.findLast((x) => x.t <= t - 250)?.rev ?? 0;
    const a = aired(t - 400);
    r.frames.push({ at: t, name: a ? person(a).name : '', votes: a && rev ? fmt(votesAt(person(a), rev)) : '', kok: rev ? fmt(partyVotes('KOK', rev)) : '', frames: 6 });
  }
  r.frames = r.frames.filter((f, i, all) => i === 0 || JSON.stringify({ ...f, at: 0 }) !== JSON.stringify({ ...all[i - 1], at: 0 }));
  for (let t = T0; t < r.end; t += 10_000) {
    const gc = (t - T0) % 60_000 === 0;
    const side = (heap) => ({ heap, nodes: 3_000, listeners: 600, documents: 4, frames: 6, channels: 3, gc });
    r.samples.push({ at: t, controller: side(30 * MIB), output: side(20 * MIB), stateReadsInFlight: 0, stateReadsMax: 1, agent: { reading: (t / 10_000) % 2, undelivered: 0, posting: 0 }, agentsAlive: 1, snapshots: 1, driver: { rss: 200 * MIB, heap: 50 * MIB, handles: 30 } });
    r.snapshots.push({ at: t, epoch: epochAt(t), revision: Math.max(1, Math.floor((t - T0) / STEP_MS)), state: 'changed', bytes: 164_000 });
  }
  let marks = 0;
  for (let at = 30_000; at < plan.totalMs; at += ACTION_MS) {
    const a = { at: T0 + at, n: r.actions.length + 1, outcome: 'ran', settled: 'accepted', marksBefore: marks, marksAfter: ++marks, end: T0 + at + 1_000 };
    if (a.n % 5 === 0) Object.assign(a, { duplicate: { outcome: 'duplicate', marks }, elsewhere: { outcome: 'stale', marks } });
    r.actions.push(a);
  }
  r.finalSnapshot = { accepted_revision: rev, owner_epoch: epoch };
  return r;
}

const failed = (record) => judge(record).checks.filter((c) => !c.ok).map((c) => c.name);
/** A defect turns exactly the check that names it red (and maybe its neighbours), never nothing. */
function red(name, mutate, expected) {
  test(`red: ${name}`, () => {
    const r = healthy();
    mutate(r);
    const names = failed(r);
    assert.ok(names.some((n) => expected.test(n)), `expected a check matching ${expected}, got ${JSON.stringify(names)}`);
  });
}

test('a healthy record passes every check', () => {
  const v = judge(healthy());
  assert.deepEqual(v.checks.filter((c) => !c.ok), []);
  for (const road of ['dispatch', 'dispatchToAir', 'fetchToApply', 'providerToApply', 'applyToRenderBound', 'providerToRenderBound', 'applyToRenderCandidates']) assert.ok(v.timings[road].n > 0, road);
  assert.equal(v.memory['controller.heap'].length, 2);
});

red('a wrong-person frame', (r) => {
  const late = r.takes[20].at + 8_000;
  r.frames.push({ at: late, name: 'Example 0500', votes: '', kok: '', frames: 6 });
  r.frames.sort((a, b) => a.at - b.at);
}, /wrong-person/);
red('the previous person still on air after the Take settled', (r) => {
  const t = r.takes[20];
  const before = r.takes[19];
  r.frames = r.frames.map((f) => (f.at > t.at + 6_000 && f.at < t.at + 12_000 ? { ...f, name: key(before.key[0], before.key[1]).name } : f));
}, /wrong-person/);
red('a figure of no revision of the person on air', (r) => {
  const f = r.frames.find((x) => x.votes);
  f.votes = fmt(Number(f.votes.replace(/,/g, '')) + 1_000_003);
}, /one person's at one revision/);
red('a card update row carrying another person', (r) => {
  const row = r.rows.find((x) => x.graphic === 'Candidate card' && x.t === 'update' && x.id > 200);
  row.data = { ...row.data, f0: 'Example 0007' };
}, /aired person/);
red('a stale-owner write: the epoch went back after a crash', (r) => {
  const crash = r.faults.find((f) => f.kind === 'handover' && f.mode === 'crash');
  r.snapshots.push({ at: crash.woke + 2_000, epoch: crash.epochBefore, revision: 9_999, state: 'changed', bytes: 1 });
  r.snapshots.sort((a, b) => a.at - b.at);
}, /never went back|old owner/);
red('an old owner that never tried to write proves nothing', (r) => {
  const crash = r.faults.find((f) => f.kind === 'handover' && f.mode === 'crash');
  r.reads = r.reads.filter((x) => !(x.agent === crash.from && x.at >= crash.woke));
}, /old owner/);
red('a duplicate Take', (r) => {
  const play = r.rows.find((x) => x.graphic === 'Candidate card' && x.t === 'play');
  r.rows.splice(r.rows.indexOf(play) + 1, 0, { ...play, id: play.id + 0.5 });
}, /one play row per candidate Take/);
red('a foreign action that ran twice', (r) => {
  const a = r.actions.find((x) => x.duplicate);
  a.duplicate = { outcome: 'ran', marks: a.marksAfter + 1 };
}, /sent twice with one id/);
red('a foreign action on an instance not on air that ran', (r) => {
  const a = r.actions.find((x) => x.elsewhere);
  a.elsewhere = { outcome: 'ran', marks: a.marksAfter + 1 };
}, /not on air was refused/);
red('a foreign action that did not run', (r) => {
  r.actions[3] = { ...r.actions[3], outcome: 'stale', settled: null, marksAfter: r.actions[3].marksBefore };
}, /every foreign action/);
red('a data change that took the card', (r) => r.rows.push({ id: 1e9, graphic: 'Party totals', t: 'play', at: r.t0 + 60_000 }), /one Take each/);
red('two provider reads in flight', (r) => (r.samples[40].agent.reading = 2), /pending provider reads/);
red('a second buffered revision', (r) => (r.samples[40].agent.undelivered = 2), /buffered updates/);
red('a second snapshot row for the source', (r) => (r.samples[40].snapshots = 2), /buffered updates/);
red('the controller\'s tree reads piling up', (r) => {
  for (const s of r.samples) if (s.at - r.t0 >= 20 * 60_000) Object.assign(s, { stateReadsMax: 6, stateReadsInFlight: 3 });
}, /tree reads in flight/);
red('a subscription leaked by a reload', (r) => {
  for (const s of r.samples) if (s.at - r.t0 >= 25 * 60_000) s.controller.channels = 4;
}, /subscriptions are back to baseline/);
red('an output instance left behind by a replacement', (r) => r.frames.push({ ...r.frames.at(-1), at: r.end, frames: 7 }), /graphic instances/);
red('two agents alive after a handover', (r) => (r.samples[100].agentsAlive = 2), /one agent alive/);
red('controller memory growing window on window', (r) => {
  for (const s of r.samples) if (s.at - r.t0 >= 20 * 60_000) s.controller.heap = 45 * MIB;
}, /memory and instance counts/);
red('listeners growing on the output', (r) => {
  for (const s of r.samples) if (s.at - r.t0 >= 20 * 60_000) s.output.listeners = 900;
}, /memory and instance counts/);
red('an unhandled error', (r) => r.errors.push({ where: 'output', message: 'TypeError: x is undefined', at: r.t0 }), /unhandled error/);
red('an update row while paused', (r) => {
  const f = r.faults.find((x) => x.kind === 'pause');
  r.rows.push({ id: 1e9, graphic: 'Count bug', t: 'update', src: 'api', data: { f2: '9 of 100' }, at: f.paused + 5_000 });
}, /Pause held/);
red('a Resume that sent nothing', (r) => (r.faults.find((x) => x.kind === 'pause').resume.writes = 0), /Resume sent/);
red('a revision over the ingress limit', (r) => (r.snapshots[30].bytes = BODY_CAP_BYTES + 1), /ingress limit/);
red('a refusal the run did not cause', (r) => r.reads.push({ agent: 'agent-1', at: r.t0, line: 'election changed revision 9 not taken (409 budget)' }), /did not cause/);
red('the credential in an agent log', (r) => (r.credentialLeaked = true), /credential/);
red('an output that never caught up after a disconnect', (r) => {
  const f = r.faults.find((x) => x.kind === 'disconnect');
  const frozen = r.frames.filter((x) => x.at <= f.at).at(-1);
  r.frames = r.frames.map((x) => (x.at > f.at && x.at < f.end + 25_000 ? { ...x, kok: frozen.kok } : x));
}, /caught up/);
red('a bound field slow to air', (r) => {
  for (const f of r.frames) f.at += f.at > r.t0 + 15 * 60_000 && f.at < r.t0 + 16 * 60_000 ? 12_000 : 0;
  r.frames.sort((a, b) => a.at - b.at);
}, /bound field/);
red('a run cut short', (r) => (r.end = r.t0 + 60_000), /minutes asked/);
red('a fault that never ended', (r) => delete r.faults[1].end, /fault ran to its end/);
red('a provider step never read as held', (r) => (r.reads = r.reads.filter((x) => !/ invalid /.test(x.line))), /each read and held/);

test('the fixture: 1,000 candidates, the package\'s people at their keys, inside the ingress limit with headroom', () => {
  assert.equal(people.length, 1000);
  assert.equal(new Set(people.map((p) => `${p.district}/${p.candidate}`)).size, 1000);
  assert.equal(new Set(people.map((p) => p.name)).size, 1000);
  assert.equal(key('02', 101).name, 'Aino Example');
  assert.equal(key('01', 101).name, 'Leo Example');
  assert.equal(key('02', 103).name, 'Sara Example');
  const size = measureFixture(60);
  assert.equal(size.candidates, 1000);
  assert.ok(size.bodyBytes < BODY_CAP_BYTES * 0.7, `${size.bodyBytes} bytes leaves less than 30% headroom`);
  assert.equal(STEP_MS, 5_000);
  assert.equal(CUE_SWITCH_MS, 15_000);
  assert.equal(BODY_CAP_BYTES, 262_144);
});

test('the timeline: one revision per step, the misbehaving steps on their pattern, deterministic', () => {
  const t = enduranceTimeline(60);
  assert.equal(t.length, 722);
  const kinds = Array.from({ length: t.length }, (_, i) => stepKind(i));
  for (const k of ['duplicate', 'older', 'malformed']) assert.ok(kinds.filter((x) => x === k).length >= 18, k);
  assert.equal(t.at(7).text, t.at(6).text, 'a duplicate is the step before, byte for byte');
  assert.equal(t.at(13).revision, revisionAt(13) - 3, 'an older revision arrives late');
  assert.throws(() => JSON.parse(t.at(18).text), 'malformed is not JSON');
  assert.equal(JSON.parse(t.at(20).text).revision, revisionAt(20));
  assert.equal(JSON.parse(t.at(20).text).candidates.items.length, 1000);
  const digest = (s) => createHash('sha256').update(s).digest('hex');
  assert.equal(digest(enduranceTimeline(60).at(300).text), digest(t.at(300).text));
});

test('the schedule: a cycle of every fault, the warmup cycle apart, handovers alternating', () => {
  const plan = schedule(60);
  assert.equal(plan.cycleMs, 600_000);
  assert.equal(plan.windows.length, 6);
  assert.deepEqual(plan.windows.filter((w) => w.warmup).map((w) => w.index), [0]);
  for (const k of ['pause', 'reload', 'disconnect', 'handover']) assert.equal(plan.events.filter((e) => e.kind === k).length, 6, k);
  assert.deepEqual(plan.events.filter((e) => e.kind === 'handover').map((e) => e.mode), ['release', 'crash', 'release', 'crash', 'release', 'crash']);
  assert.ok(plan.events.every((e) => e.at % CUE_SWITCH_MS === 3_000), 'each fault three seconds after a cue switch');
});

test('the replay server serves a timeline of its own, step by step', async () => {
  let now = 0;
  const token = randomBytes(8).toString('hex');
  const { makeTestCertificate } = await import('./election-replay-server.mjs');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'endurance-judge-'));
  const tls = makeTestCertificate(dir);
  const server = await startReplayServer({ token, cert: tls.cert, key: tls.key, clock: () => now, timeline: enduranceTimeline(1) });
  try {
    const { request } = await import('node:https');
    const get = () =>
      new Promise((resolve, reject) => {
        const req = request(server.url, { ca: tls.cert, headers: { authorization: `Bearer ${token}` } }, (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => resolve({ step: res.headers['x-replay-step'], body }));
        });
        req.on('error', reject);
        req.end();
      });
    assert.equal((await get()).step, 'count-1');
    now = 7 * STEP_MS;
    const dup = await get();
    assert.equal(dup.step, 'duplicate-7');
    assert.equal(server.index(), 7);
    assert.equal(server.steps, null);
    await assert.rejects(startReplayServer({ token, cert: tls.cert, key: tls.key, timeline: { length: 0, at: () => null } }), /length/);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
