// guards: api/_lib/dataTick.ts, api/_lib/systemSettings.ts, api/data/[...path].ts, vercel.json
//
// THE SERVER TICK (docs/work-specs/data-sources/spec.md, phase C2; sheet-data-flow AC-4, AC-5),
// run in Node against the JavaScript tree Vercel emits for the data function (api-runtime-build
// .mjs), so this also proves the Sheet reader's shared core loads in the function.
//
// What is pinned: without the exact `Bearer <CRON_SECRET>` the tick answers 401 and makes no
// request at all; with it, a switch that cannot be read is off; the switch reads off once its
// expiry passes and while it lies more than 48 hours ahead; a tick reads due sources under the
// lease, writes a changed cell once and an unchanged one never (so an override kept on the row
// survives the handover), skips a source a page leased first, lets every lease go, keeps the
// 10-second read timeout, starts no read after 20 seconds, and records its start, duration and
// outcomes; a field's own form is written (TRUE is 1 for a toggle); an oversized tab is not read.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { buildApiRuntime } from './api-runtime-build.mjs';

let built;
let route;
let tick;
let settings;

before(async () => {
  built = await buildApiRuntime(['api/data/[...path].ts']);
  const load = (file) => import(pathToFileURL(path.join(built.outputDir, file)).href);
  route = (await load('api/data/[...path].js')).default;
  tick = await load('api/_lib/dataTick.js');
  settings = await load('api/_lib/systemSettings.js');
});
after(async () => {
  await built?.cleanup();
});

/** Run `body` with these environment variables set, and every outbound request counted. */
async function withEnv(env, body) {
  const saved = {};
  for (const key of Object.keys(env)) {
    saved[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  const realFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push(String(url));
    return realFetch(url, init);
  };
  try {
    return await body(requests);
  } finally {
    globalThis.fetch = realFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const call = (authorization) =>
  route.fetch(new Request('https://noacg.test/api/data/tick', authorization === undefined ? {} : { headers: { authorization } }));

test('the tick answers 401 to anything but the exact Bearer, before it reads or writes anything', async () => {
  // A database that refuses connections: any request it made would show in `requests`.
  const env = { CRON_SECRET: 'test-cron-secret', SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SECRET_KEY: 'sb_secret_test' };
  await withEnv(env, async (requests) => {
    for (const authorization of [undefined, '', 'test-cron-secret', 'Bearer', 'Bearer ', 'bearer test-cron-secret', 'Bearer  test-cron-secret', 'Bearer test-cron-secreT', 'Bearer test-cron-secret-and-more', 'Basic test-cron-secret']) {
      const response = await call(authorization);
      assert.equal(response.status, 401, `refused: ${JSON.stringify(authorization)}`);
    }
    assert.deepEqual(requests, [], 'a refused call reaches no database');
  });
  // With no secret configured, nothing is the exact Bearer, the empty one included.
  await withEnv({ ...env, CRON_SECRET: undefined }, async (requests) => {
    assert.equal((await call('Bearer ')).status, 401);
    assert.equal((await call('Bearer undefined')).status, 401);
    assert.deepEqual(requests, []);
  });
  assert.equal((await route.fetch(new Request('https://noacg.test/api/data/tick', { method: 'POST' }))).status, 405);
});

test('with the exact Bearer, a switch that cannot be read is off: the tick reads nothing and records nothing', async () => {
  const env = { CRON_SECRET: 'test-cron-secret', SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SECRET_KEY: 'sb_secret_test' };
  await withEnv(env, async (requests) => {
    const response = await call('Bearer test-cron-secret');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, on: false });
    assert.ok(requests.length > 0 && requests.every((url) => url.includes('/rest/v1/system_settings')), 'only the switch was asked');
  });
});

test('the switch holds an expiry: off once it passes, off while it lies more than 48 hours ahead, off on anything unreadable', () => {
  const now = Date.parse('2026-10-21T12:00:00Z');
  const at = (ms) => ({ until: new Date(now + ms).toISOString() });
  const { dataTickOnAt, DATA_TICK_WINDOW_MS } = settings;
  assert.equal(DATA_TICK_WINDOW_MS, 48 * 3600 * 1000);
  assert.equal(dataTickOnAt(at(60_000), now), true);
  assert.equal(dataTickOnAt(at(DATA_TICK_WINDOW_MS), now), true, 'exactly 48 hours ahead is inside the window');
  assert.equal(dataTickOnAt(at(DATA_TICK_WINDOW_MS + 1), now), false, 'more than 48 hours ahead reads off');
  assert.equal(dataTickOnAt(at(0), now), false, 'expired at this instant');
  assert.equal(dataTickOnAt(at(-1), now), false, 'after its expiry');
  for (const value of [null, undefined, true, 'on', 1, [], {}, { until: 1 }, { until: 'soon' }, { until: null }, [at(60_000)]]) {
    assert.equal(dataTickOnAt(value, now), false, `off for ${JSON.stringify(value)}`);
  }
});

// ── One tick, with fakes ─────────────────────────────────────────────────────────────────────

const csv = (text) => async () => ({ ok: true, status: 200, text: async () => text });

/** A database and a clock the tick runs against. `rows` is the read state by source id. */
function world({ due, sheets, leased = new Set(), rows = {}, step = 0 }) {
  let now = 1_000_000;
  const calls = { leases: [], commits: [], records: [], fetched: [] };
  const timers = [];
  const io = {
    now: () => (now += step),
    due: async () => structuredClone(due),
    lease: async (slug, source, claim, ttlMs) => {
      calls.leases.push({ source, claim, ttlMs });
      if (ttlMs === 0) return { ok: false, released: true };
      if (leased.has(source)) return { ok: false, owner: 'tab-a' };
      const r = rows[source] ?? {};
      return { ok: true, claim: `tick:${source}`, snapshot: r.snapshot ?? {}, content: r.content ?? null, status: r.status ?? {} };
    },
    commit: async (slug, source, claim, writes, state) => {
      calls.commits.push({ source, claim, writes, state });
      return { ok: true };
    },
    record: async (startedAt, durationMs, sources) => calls.records.push({ startedAt, durationMs, sources }),
    fetch: async (url, init) => {
      const id = /\/d\/([^/]+)\//.exec(url)[1];
      calls.fetched.push(id);
      return sheets[id](url, init);
    },
    setTimer: (run, ms) => {
      timers.push({ run, ms });
      return timers.length - 1;
    },
    clearTimer: (i) => {
      timers[i] = null;
    },
  };
  return { io, calls, timers };
}

const source = (id, shape = 'lines') => ({ id, kind: 'sheet', label: id, config: { sheetId: `sheet-${id}`, gid: '0', shape } });
const ticker = (id) => ({
  slug: 'slug-1',
  source: source(id),
  bindings: { News: { f0: `sheet.${id}.lines` } },
  fields: { News: [{ field: 'f0', ftype: 'textarea' }] },
});

test('a tick reads the due sources under the lease, writes a changed cell once, and skips a source a page holds', async () => {
  const w = world({
    due: [ticker('s1'), ticker('s2'), ticker('s3')],
    sheets: { 'sheet-s1': csv('one\ntwo\n'), 'sheet-s2': csv('kept\n'), 'sheet-s3': csv('x\n') },
    leased: new Set(['s3']),
    // s2 was last written "kept" by a page; the operator has typed over it since.
    rows: { s2: { snapshot: { 'sheet.s2.lines': 'kept' }, content: JSON.stringify({ lines: 'kept' }), status: { state: 'ok', changedAt: 5 } } },
  });
  const run = await tick.runDataTick(w.io);
  const by = Object.fromEntries(run.sources.map((s) => [s.source, s.outcome]));
  assert.deepEqual(by, { s1: 'read', s2: 'unchanged', s3: 'leased' });
  assert.deepEqual(w.calls.fetched.sort(), ['sheet-s1', 'sheet-s2'], 'the leased source is not read');
  const s1 = w.calls.commits.find((c) => c.source === 's1');
  assert.deepEqual(s1.writes, { 'sheet.s1.lines': 'one\ntwo' });
  assert.equal(s1.claim, 'tick:s1');
  assert.equal(s1.state.status.reader, 'server');
  assert.equal(s1.state.status.state, 'ok');
  const s2 = w.calls.commits.find((c) => c.source === 's2');
  assert.deepEqual(s2.writes, {}, 'an unchanged cell after the handover writes nothing over the override');
  assert.equal(s2.state.status.changedAt, 5, 'unchanged content keeps its changed time');
  // Every lease the tick took is let go; the one it never got is not touched.
  const released = w.calls.leases.filter((l) => l.ttlMs === 0).map((l) => l.source).sort();
  assert.deepEqual(released, ['s1', 's2']);
  assert.ok(w.calls.leases.filter((l) => l.ttlMs > 0).every((l) => l.ttlMs === tick.TICK_LEASE_MS));
  assert.equal(w.calls.records.length, 1);
  assert.deepEqual(w.calls.records[0].sources.map((s) => s.source).sort(), ['s1', 's2', 's3']);
});

test('a read that never answers is cut at 10 s and counts as a miss; three misses are stale', async () => {
  const hang = (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const w = world({ due: [ticker('s1')], sheets: { 'sheet-s1': hang }, rows: { s1: { status: { state: 'failing', missed: 2, failingSince: 7 } } } });
  const running = tick.runDataTick(w.io);
  await new Promise((resolve) => setImmediate(resolve));
  const cut = w.timers.find((t) => t && t.ms === 10_000);
  assert.ok(cut, 'the read has its 10-second timeout');
  cut.run();
  const run = await running;
  assert.equal(run.sources[0].outcome, 'failed');
  const status = w.calls.commits[0].state.status;
  assert.equal(status.missed, 3);
  assert.equal(status.stale, true);
  assert.equal(status.failingSince, 7);
  assert.deepEqual(w.calls.commits[0].writes, {}, 'a missed read writes nothing');
});

test('no read starts after 20 seconds: the rest are recorded as late, never leased', async () => {
  // Each clock read moves time 3 s, so the cut-off arrives part way through the queue.
  const due = Array.from({ length: 8 }, (_, i) => ticker(`s${i}`));
  const sheets = Object.fromEntries(due.map((d) => [d.source.config.sheetId, csv('a\n')]));
  const w = world({ due, sheets, step: 3_000 });
  const run = await tick.runDataTick(w.io);
  const late = run.sources.filter((s) => s.outcome === 'late').map((s) => s.source);
  assert.ok(late.length > 0, 'some sources were left for the next tick');
  for (const id of late) assert.ok(!w.calls.leases.some((l) => l.source === id), `${id} was never leased`);
  assert.equal(tick.NO_NEW_READ_MS, 20_000);
  assert.equal(w.calls.records[0].durationMs, run.durationMs);
});

test('the tick writes a field’s own form of a cell, as the browser does: TRUE is 1 for a toggle', async () => {
  const due = {
    slug: 'slug-1',
    source: source('v', 'values'),
    bindings: { Bug: { f1: 'sheet.v.values.Live', f2: 'sheet.v.values.Score' } },
    fields: { Bug: [{ field: 'f1', ftype: 'checkbox' }, { field: 'f2', ftype: 'number' }] },
  };
  const w = world({ due: [due], sheets: { 'sheet-v': csv('Name,Value\nLive,TRUE\nScore,abc\n') } });
  await tick.runDataTick(w.io);
  assert.deepEqual(w.calls.commits[0].writes, { 'sheet.v.values.Live': '1' }, 'a score of "abc" is held, not written');
  assert.match(w.calls.commits[0].state.status.problems.join(' '), /Score holds “abc”/);
});

test('an oversized tab is not read whole: past the byte cap the read fails and writes nothing', async () => {
  const big = new Uint8Array(tick.READ_BYTES + 1).fill(97);
  const fetcher = tick.cappedFetch(async () => new Response(big, { status: 200 }));
  const answer = await fetcher('https://docs.google.com/x', { signal: new AbortController().signal });
  await assert.rejects(answer.text(), /too large/);
  const small = tick.cappedFetch(async () => new Response('a,b\n', { status: 200 }));
  assert.equal(await (await small('https://docs.google.com/x', { signal: new AbortController().signal })).text(), 'a,b\n');
});

test('a read that starts late gets only what is left before 26 s, so its write and the record fit in 30', async () => {
  const hang = (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const w = world({ due: [ticker('s1')], sheets: { 'sheet-s1': hang } });
  // The run's clock reads: the start, then 19 s on when the read is set up.
  let reads = 0;
  w.io.now = () => 1_000_000 + (reads++ === 0 ? 0 : 19_000);
  const running = tick.runDataTick(w.io);
  await new Promise((resolve) => setImmediate(resolve));
  const cut = w.timers.find((t) => t && t.ms <= 10_000);
  // 26 s - 19 s, written out: an expectation computed from READS_END_MS would follow any change to it.
  assert.equal(cut.ms, 7_000);
  cut.run();
  await running;
});

// The cost record's ceiling (data-sources/evidence/tick-cost-estimate.md) holds only while the
// function stops at 30 s and the cron fires once a minute; nothing else checks either value.
test('vercel.json caps the data function at 30 s and runs the tick once a minute', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.functions['api/data/[...path].ts']?.maxDuration, 30);
  assert.deepEqual(config.crons.filter((c) => c.path === '/api/data/tick'), [{ path: '/api/data/tick', schedule: '* * * * *' }]);
});

test('a source paused on the row since the list was read is let go unread', async () => {
  const w = world({ due: [ticker('s1')], sheets: { 'sheet-s1': csv('x\n') } });
  const lease = w.io.lease;
  w.io.lease = async (...args) => ({ ...(await lease(...args)), ...(args[3] > 0 ? { paused: true } : {}) });
  const run = await tick.runDataTick(w.io);
  assert.equal(run.sources[0].outcome, 'moved');
  assert.deepEqual(w.calls.fetched, []);
  assert.deepEqual(w.calls.leases.map((l) => l.ttlMs), [tick.TICK_LEASE_MS, 0]);
});

test('the tick reads a field’s kind as the browser does: kindForField, without hidden fields', async () => {
  await import('./lib/tsResolve.mjs');
  const { fieldDescriptors } = await import('../src/control/controlModel.ts');
  const ftypes = ['textfield', 'textarea', 'number', 'filelist', 'dropdown', 'checkbox', 'color', 'hidden', 'instruction', 'caption', 'button', 'divider', 'spacer'];
  const fields = ftypes.map((ftype, i) => ({ field: `f${i}`, ftype, title: ftype, items: ftype === 'dropdown' ? [{ text: 'A', value: 'a' }] : undefined }));
  const browser = fieldDescriptors(fields).map((d) => [d.key, d.kind, d.options]);
  const server = tick.descriptorsOf(fields).map((d) => [d.key, d.kind, d.options]);
  assert.deepEqual(server, browser);
});
