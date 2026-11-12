// guards: src/control/jsonSource.ts, src/control/sheetSource.ts, src/control/connectorReview.ts, src/control/externalSource.ts, src/model/shows.ts
//
// A PUBLIC JSON ADDRESS READ BY NOACG, IN THE BROWSER (docs/work-specs/obs-scenes/spec.md, OS5a;
// AC-9, rules R1 to R18), run in Node against the real modules with a fake clock, route and lease
// storage.
//
// What is pinned: the interval is clamped to 10 s at least and an hour at most; the page asks
// NoaCG's JSON route, never the address; it reads at once and then at its interval, never sooner;
// a good read is one snapshot evaluated by the shared evaluator, written only where a connected
// path changed, so an operator's value holds until the source's changes; a failed, malformed or
// late read writes nothing and three in a row mark the source stale; checked and changed are two
// times, changed moving only when the payload does; two tabs share one lease and only one reads;
// a Pause reads and writes nothing and Resume writes only what changed meanwhile; an answer that
// arrives after Stop writes nothing; a typed field, a collection and a missing leaf are said, never
// written. The review keeps `read` unless the operator changes it, and never moves the config
// revision.

import assert from 'node:assert/strict';
import test from 'node:test';
import './lib/tsResolve.mjs';

const { createJsonReader, jsonCadence, jsonEveryMs, jsonFingerprint, jsonRouteUrl, projectJson, readJsonRoute, collectionReads, JSON_FLOOR_MS } = await import('../src/control/jsonSource.ts');
const { readExternalRegistration } = await import('../src/control/externalSource.ts');
const { connectorPlan } = await import('../src/control/connectorReview.ts');
const { noacgReads, hasReaderLine, sourceKindWord } = await import('../src/model/shows.ts');

const URL_ = 'https://scores.example/live.json';
const S = 1000;

/** A clock whose timers run when the test moves time, each after the promises before it. */
function fakeClock() {
  let now = 1_000_000;
  let seq = 0;
  const timers = new Map();
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return {
    now: () => now,
    setTimer: (run, ms) => {
      const id = ++seq;
      timers.set(id, { at: now + ms, run });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    async advance(ms) {
      const end = now + ms;
      await settle();
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].run();
        await settle();
        await settle();
      }
      now = end;
      await settle();
    },
  };
}

const respond = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

const FIELDS = {
  Board: [
    { key: 'f0', label: 'Home', kind: 'text', defaultValue: '' },
    { key: 'f1', label: 'Away', kind: 'number', defaultValue: '' },
  ],
};
const fieldsOf = (g) => FIELDS[g] ?? null;
const REG = { ok: true, registration: { v: 1, configRevision: 1, endpoint: 'https://scores.example/live.json' } };
const BINDINGS = { Board: { f0: 'external.j1.home', f1: 'external.j1.score' } };

/** One browser: its lease storage and the route, whose answer the test sets. */
function browser() {
  const clock = fakeClock();
  const leases = new Map();
  const route = { answer: { ok: true, payload: { home: 'Ada', score: 1 }, fetchedAt: '2026-11-12T12:00:00.000Z' }, status: 200, asked: [], hold: null };
  const io = {
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    fetch: async (url, init) => {
      route.asked.push(url);
      if (route.hold) {
        await Promise.race([route.hold.promise, new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))]);
      }
      return respond(route.status, route.answer);
    },
    readLease: (key) => (leases.has(key) ? structuredClone(leases.get(key)) : null),
    writeLease: (key, lease) => leases.set(key, structuredClone(lease)),
  };
  return { clock, leases, route, io };
}

function tab(b, name, { everyMs = 30 * S, bindings = BINDINGS } = {}) {
  const t = { writes: [], statuses: [], paused: false, bindings };
  t.reader = createJsonReader({
    key: 'prod-1:j1',
    sourceId: 'j1',
    url: URL_,
    everyMs,
    tab: name,
    world: 'local',
    io: b.io,
    connected: () => new Set(Object.values(t.bindings).flatMap((f) => Object.values(f))),
    paused: () => t.paused,
    project: (payload) => projectJson({ sourceId: 'j1', payload, bindings: t.bindings, fieldsOf, registration: REG }),
    write: async (patch) => {
      t.writes.push(patch);
      return true;
    },
    onStatus: (s) => t.statuses.push(s),
  });
  t.status = () => t.statuses.at(-1);
  return t;
}

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

// ── The interval and the route ───────────────────────────────────────────────

test('the interval is 10 s at least and an hour at most, and the lease is renewed at least every 20 s', () => {
  assert.equal(JSON_FLOOR_MS, 10 * S);
  assert.equal(jsonEveryMs(9_999), 10 * S);
  assert.equal(jsonEveryMs(10_000), 10 * S);
  assert.equal(jsonEveryMs(3_600_000), 3_600_000);
  assert.equal(jsonEveryMs(3_600_001), 3_600_000);
  assert.deepEqual(jsonCadence(5_000), { everyMs: 10 * S, renewMs: 10 * S, timeoutMs: 25 * S });
  assert.equal(jsonCadence(5 * 60 * S).renewMs, 20 * S);
});

test('the page asks NoaCG’s JSON route, and reads its answer as a payload or a failure with its fix', async () => {
  assert.equal(jsonRouteUrl(URL_), `/api/data/json?url=${encodeURIComponent(URL_)}`);
  const ask = (status, body) => readJsonRoute(async () => respond(status, body), URL_, new AbortController().signal);
  assert.deepEqual(await ask(200, { ok: true, payload: { a: 1 }, fetchedAt: 'x' }), { ok: true, payload: { a: 1 } });
  assert.deepEqual(await ask(200, { ok: true, payload: null }), { ok: true, payload: null });
  assert.deepEqual(await ask(502, { ok: false, error: 'the address did not answer JSON', fix: 'Check the address answers JSON.' }), {
    ok: false,
    error: 'the address did not answer JSON',
    fix: 'Check the address answers JSON.',
  });
  assert.equal((await ask(429, { error: { code: 'rate_limited' } })).error, 'too many reads from this computer');
  assert.equal((await ask(500, '<html>')).ok, false);
  // An ok answer with no payload is not a read.
  assert.equal((await ask(200, { ok: true })).ok, false);
  const offline = await readJsonRoute(async () => {
    throw new TypeError('Failed to fetch');
  }, URL_, new AbortController().signal);
  assert.match(offline.error, /offline/);
});

// ── One snapshot ──────────────────────────────────────────────────────────────

test('a read writes every changed connected path in one write, in the form its fields take, and nothing unchanged', async () => {
  const b = browser();
  const t = tab(b, 'a');
  await b.clock.advance(0);
  assert.equal(b.route.asked.length, 1);
  assert.deepEqual(t.writes, [{ external: { j1: { home: 'Ada', score: '1' } } }]);
  // The same payload again: nothing written.
  await b.clock.advance(30 * S);
  assert.equal(b.route.asked.length, 2);
  assert.equal(t.writes.length, 1);
  // One leaf changes: only it is written.
  b.route.answer = { ok: true, payload: { home: 'Ada', score: 2 } };
  await b.clock.advance(30 * S);
  assert.deepEqual(t.writes.at(-1), { external: { j1: { score: '2' } } });
  t.reader.stop();
});

test('the reader reads at its interval and never sooner, whatever the renewals between', async () => {
  const b = browser();
  const t = tab(b, 'a', { everyMs: 60 * S });
  await b.clock.advance(0);
  await b.clock.advance(59 * S);
  assert.equal(b.route.asked.length, 1, 'renewals at 20 s and 40 s read nothing');
  await b.clock.advance(1 * S);
  assert.equal(b.route.asked.length, 2);
  t.reader.stop();
  // An interval below the floor reads every 10 s.
  const c = browser();
  const u = tab(c, 'a', { everyMs: 1 * S });
  await c.clock.advance(0);
  await c.clock.advance(9_999);
  assert.equal(c.route.asked.length, 1);
  await c.clock.advance(1);
  assert.equal(c.route.asked.length, 2);
  u.reader.stop();
});

test('checked moves with every good read; changed moves only when the payload does', async () => {
  const b = browser();
  const t = tab(b, 'a');
  await b.clock.advance(0);
  const first = t.status();
  assert.equal(first.state, 'ok');
  assert.equal(first.checkedAt, first.changedAt);
  await b.clock.advance(30 * S);
  assert.equal(t.status().checkedAt, first.checkedAt + 30 * S);
  assert.equal(t.status().changedAt, first.changedAt, 'same payload: changed holds');
  // A change outside the bound leaves is still a change of the content.
  b.route.answer = { ok: true, payload: { home: 'Ada', score: 1, clock: '12:00' } };
  await b.clock.advance(30 * S);
  assert.equal(t.status().changedAt, t.status().checkedAt);
  // Key order is not content.
  assert.equal(jsonFingerprint({ a: 1, b: [1, { c: 2, d: 3 }] }), jsonFingerprint({ b: [1, { d: 3, c: 2 }], a: 1 }));
  assert.notEqual(jsonFingerprint({ a: 1 }), jsonFingerprint({ a: '1' }));
  t.reader.stop();
});

test('an operator’s value on a bound path holds until the source’s value there changes', async () => {
  const b = browser();
  const t = tab(b, 'a');
  await b.clock.advance(0);
  // The operator writes 5 to the score elsewhere; the source still says 1: nothing is written.
  await b.clock.advance(30 * S);
  assert.equal(t.writes.length, 1);
  b.route.answer = { ok: true, payload: { home: 'Ada', score: 3 } };
  await b.clock.advance(30 * S);
  assert.deepEqual(t.writes.at(-1), { external: { j1: { score: '3' } } });
  t.reader.stop();
});

// ── Failures write nothing ────────────────────────────────────────────────────

test('a failed or malformed read writes nothing, keeps the values, says why, and three in a row are stale', async () => {
  const b = browser();
  const t = tab(b, 'a');
  await b.clock.advance(0);
  const written = t.writes.length;
  b.route.status = 502;
  b.route.answer = { ok: false, error: 'the address did not answer JSON', fix: 'Check the address answers JSON.', failingSince: null };
  await b.clock.advance(30 * S);
  assert.equal(t.writes.length, written);
  assert.equal(t.status().state, 'failing');
  assert.equal(t.status().error, 'the address did not answer JSON');
  assert.equal(t.status().stale, false);
  await b.clock.advance(60 * S);
  assert.equal(t.status().missed, 3);
  assert.equal(t.status().stale, true);
  assert.equal(t.writes.length, written);
  // The next good read clears it and writes only what changed.
  b.route.status = 200;
  b.route.answer = { ok: true, payload: { home: 'Bo', score: 1 } };
  await b.clock.advance(30 * S);
  assert.equal(t.status().stale, false);
  assert.deepEqual(t.writes.at(-1), { external: { j1: { home: 'Bo' } } });
  t.reader.stop();
});

test('a late read (past the reader’s timeout) writes nothing, even when its answer arrives after', async () => {
  const b = browser();
  const t = tab(b, 'a');
  await b.clock.advance(0);
  const written = t.writes.length;
  b.route.hold = deferred();
  b.route.answer = { ok: true, payload: { home: 'Late', score: 9 } };
  await b.clock.advance(30 * S + 25 * S);
  assert.equal(t.status().state, 'failing');
  b.route.hold.resolve();
  await b.clock.advance(0);
  assert.equal(t.writes.length, written, 'the late answer wrote nothing');
  t.reader.stop();
});

test('an answer arriving after Stop writes nothing', async () => {
  const b = browser();
  const t = tab(b, 'a');
  await b.clock.advance(0);
  const written = t.writes.length;
  b.route.hold = deferred();
  b.route.answer = { ok: true, payload: { home: 'Gone', score: 7 } };
  await b.clock.advance(30 * S);
  t.reader.stop();
  b.route.hold.resolve();
  await b.clock.advance(1 * S);
  assert.equal(t.writes.length, written);
});

// ── The lease, Pause and Resume ───────────────────────────────────────────────

test('two tabs share one lease: one reads, the other shows its status, and takes over once it is gone', async () => {
  const b = browser();
  const one = tab(b, 'a');
  await b.clock.advance(0);
  const two = tab(b, 'b');
  await b.clock.advance(0);
  await b.clock.advance(60 * S);
  // One reader's cadence only: at 0, 30 and 60 s.
  assert.equal(b.route.asked.length, 3);
  assert.equal(two.writes.length, 0);
  assert.equal(two.status().reader, 'other');
  one.reader.stop();
  await b.clock.advance(30 * S);
  assert.ok(b.route.asked.length >= 4);
  assert.equal(two.status().reader, 'this');
  two.reader.stop();
});

test('paused, nothing is read or written; Resume reads at once and writes only what changed meanwhile', async () => {
  const b = browser();
  const t = tab(b, 'a');
  await b.clock.advance(0);
  t.paused = true;
  const asked = b.route.asked.length;
  b.route.answer = { ok: true, payload: { home: 'Ada', score: 4 } };
  await b.clock.advance(90 * S);
  assert.equal(b.route.asked.length, asked);
  assert.equal(t.writes.length, 1);
  assert.equal(t.status().state, 'paused');
  t.paused = false;
  t.reader.poke();
  await b.clock.advance(0);
  assert.equal(b.route.asked.length, asked + 1);
  assert.deepEqual(t.writes.at(-1), { external: { j1: { score: '4' } } });
  t.reader.stop();
});

// ── What is said, never written ───────────────────────────────────────────────

test('a missing leaf, a value its fields cannot hold, a typed field and a collection are said and never written', () => {
  const bindings = { Board: { f0: 'external.j1.home', f1: 'external.j1.score', f2: 'external.j1.result' } };
  const fields = { Board: [...FIELDS.Board, { key: 'f2', label: 'Result', kind: 'text', defaultValue: '', typed: true }] };
  const read = projectJson({ sourceId: 'j1', payload: { score: 'many', result: { a: 1 } }, bindings, fieldsOf: (g) => fields[g] ?? null, registration: REG, collections: true });
  assert.deepEqual(read.writes, {});
  assert.ok(read.problems.some((p) => p.startsWith('home is not in the JSON')));
  assert.ok(read.problems.some((p) => p.startsWith('score holds a value not every field')));
  assert.ok(read.problems.some((p) => p.startsWith('result feeds a field that takes typed values')));
  assert.ok(read.problems.some((p) => p.startsWith('its collection cards')));
  assert.equal(collectionReads([{ sourceId: 'j1' }], 'j1'), true);
  assert.equal(collectionReads([{ sourceId: 'other' }], 'j1'), false);
  assert.equal(collectionReads(undefined, 'j1'), false);
  // A registration the reader cannot use writes nothing and says why.
  const unusable = projectJson({ sourceId: 'j1', payload: { home: 'Ada' }, bindings: BINDINGS, fieldsOf, registration: { ok: false, readOnly: false, error: 'configRevision must be a whole number from 1' } });
  assert.deepEqual(unusable.writes, {});
  assert.deepEqual(unusable.problems, ['the source cannot be used (configRevision must be a whole number from 1), so every value holds']);
});

test('a list leaf goes through the list adapter its registration names, as an agent’s report does', () => {
  const bindings = { Ticker: { f0: 'external.j1.games' } };
  const read = projectJson({
    sourceId: 'j1',
    payload: { games: [{ a: 'Ada', b: 'Bo' }, { a: 'Cy', b: 'Di' }] },
    bindings,
    fieldsOf: () => [{ key: 'f0', label: 'Lines', kind: 'lines', defaultValue: '' }],
    registration: { ok: true, registration: { v: 1, configRevision: 1, endpoint: URL_, lists: { games: 'lines' } } },
  });
  assert.equal(read.writes['external.j1.games'].split('\n').length, 2);
});

// ── The registration ──────────────────────────────────────────────────────────

test('a connector is read by NoaCG only with a finite interval, and is called JSON then', () => {
  const entry = (read) => ({ id: 'j1', kind: 'external', label: 'Scores', config: { v: 1, configRevision: 1, endpoint: URL_, ...(read === undefined ? {} : { read }) } });
  assert.equal(noacgReads(entry({ everyMs: 30_000 })), true);
  assert.equal(noacgReads(entry(undefined)), false);
  assert.equal(noacgReads(entry({ everyMs: 'soon' })), false);
  assert.equal(noacgReads(entry(null)), false);
  assert.equal(noacgReads({ ...entry({ everyMs: 30_000 }), config: { v: 2, read: { everyMs: 30_000 } } }), false);
  assert.equal(hasReaderLine(entry({ everyMs: 30_000 })), true);
  assert.equal(hasReaderLine(entry(undefined)), false);
  assert.equal(sourceKindWord(entry({ everyMs: 30_000 })), 'JSON');
  assert.equal(sourceKindWord(entry(undefined)), 'Connector');
  const read = readExternalRegistration(entry({ everyMs: 30_000 }));
  assert.deepEqual(read.ok && read.registration.read, { everyMs: 30_000 });
  const bad = readExternalRegistration(entry({ everyMs: Infinity }));
  assert.equal(bad.ok && bad.registration.read, undefined);
});

test('the review keeps read unless the operator changes it, and never moves the config revision', () => {
  const stored = { v: 1, configRevision: 4, endpoint: URL_, read: { everyMs: 45_000 } };
  const base = { graphic: 'Board', bindings: {}, rows: [], choices: {}, collections: [], adapters: {}, columns: {} };
  const keep = connectorPlan({ ...base, source: { id: 'j1', label: 'Scores', config: stored } });
  assert.deepEqual(keep.source.config.read, { everyMs: 45_000 });
  assert.equal(keep.source.config.configRevision, 4);
  const off = connectorPlan({ ...base, source: { id: 'j1', label: 'Scores', config: stored }, read: null });
  assert.equal(off.source.config.read, undefined);
  assert.equal(off.source.config.configRevision, 4);
  const on = connectorPlan({ ...base, source: { id: 'j2', label: 'New', endpoint: URL_ }, read: { everyMs: 30_000 } });
  assert.deepEqual(on.source.config.read, { everyMs: 30_000 });
  assert.equal(on.source.config.configRevision, 1);
  const agent = connectorPlan({ ...base, source: { id: 'j3', label: 'Agent', endpoint: URL_ } });
  assert.equal(agent.source.config.read, undefined);
});
