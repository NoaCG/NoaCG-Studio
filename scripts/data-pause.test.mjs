// guards: supabase/migrations/0100_data_api_pause.sql, scripts/data-pause-conformance.mjs, api/data/[...path].ts, api/_lib/dataIngest.ts, src/control/anotherSystem.ts, scripts/data-sample-sender.mjs
//
// ANOTHER SYSTEM AND ITS PAUSE (docs/work-specs/data-sources/spec.md, phase C5; AC-3, AC-7, AC-8).
//
// What is pinned here, in Node:
// - The Pause cases 0100's self-check runs against the real plpgsql bodies are the table in
//   scripts/data-pause-conformance.mjs, case for case, and the table covers what the C5 row names:
//   a push, Pause, a push with a null, an /update while paused, a press while paused, Resume.
// - The data route, run from the JavaScript Vercel emits with the database answered by a stub:
//   a held /patch and a held /update answer 200 and SAY they were held; an unpaused write does not
//   claim it; the key only ever reaches the data RPCs (no Take, Continue, Reset or machine event
//   exists behind it).
// - The card's example: one path per field under `api.`, a graphic's own group kept, two graphics
//   never sharing a path by accident, the example body and command, and neither carries the key.
// - The prepared sample sender: names normalized onto the destinations, a failed acquisition sends
//   nothing, a correction is a second send, the key is read from the environment and never printed.
// - Parsing and normalizing input from outside stays linear on a large hostile report.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import './lib/tsResolve.mjs';
import { buildApiRuntime } from './api-runtime-build.mjs';
import { PAUSE_CONFORMANCE } from './data-pause-conformance.mjs';
import { acquire, main, normalize, receipt } from './data-sample-sender.mjs';

const { apiDestinations, apiGroup, apiOffers, exampleCurl, examplePatch, receivedWords, senderExample } = await import('../src/control/anotherSystem.ts');

const FIXTURES = 'scripts/fixtures/data-sample';

// ── The conformance table and the migration ──────────────────────────────────────────────────

test("0100's self-check runs exactly the conformance table, case for case", () => {
  const text = readFileSync('supabase/migrations/0100_data_api_pause.sql', 'utf8');
  const block = /\$pause\$([\s\S]*?)\$pause\$/.exec(text);
  assert.ok(block, '0100 must carry its cases in a $pause$ dollar-quoted literal');
  assert.deepEqual(
    JSON.parse(block[1]),
    PAUSE_CONFORMANCE,
    'the plpgsql Pause no longer answers the table - answer an added case in a new migration that calls the bodies',
  );
});

test('the table covers the C5 matrix: push, Pause, a push with a null, /update while paused, a press while paused, Resume once', () => {
  const steps = (c) => c.steps.map((s) => s.op);
  const between = (c, op) => {
    const ops = steps(c);
    const p = ops.indexOf('pause');
    const r = ops.lastIndexOf('resume');
    return p >= 0 && ops.slice(p + 1, r).includes(op);
  };
  assert.ok(PAUSE_CONFORMANCE.some((c) => between(c, 'patch')), 'a push while paused');
  assert.ok(
    PAUSE_CONFORMANCE.some((c) => c.steps.some((s) => s.op === 'patch' && JSON.stringify(s.patch).includes('null')) && between(c, 'patch')),
    'a push with a null while paused',
  );
  assert.ok(PAUSE_CONFORMANCE.some((c) => between(c, 'update')), 'an /update while paused');
  assert.ok(PAUSE_CONFORMANCE.some((c) => between(c, 'press')), 'an operator press while paused');
  assert.ok(PAUSE_CONFORMANCE.some((c) => between(c, 'sheet')), 'the server tick while paused');
  assert.ok(PAUSE_CONFORMANCE.some((c) => between(c, 'owner')), "the owner's Data view while paused");
  assert.ok(PAUSE_CONFORMANCE.some((c) => between(c, 'data')), 'what operators read while paused');
  // Resume sends each graphic at most once, as 'api', and only update rows exist at all.
  for (const c of PAUSE_CONFORMANCE) {
    const ops = steps(c);
    if (!ops.includes('resume') || !ops.includes('pause')) continue;
    const api = c.rows.filter((r) => r.src === 'api').map((r) => r.graphic);
    assert.equal(new Set(api).size, api.length, `${c.name}: a graphic was sent twice by Resume`);
  }
});

// ── The route, with the database stubbed ─────────────────────────────────────────────────────

let built;
let route;
/** The stub's answer per RPC name, and every RPC the route called. */
let answers = {};
const called = [];
const realFetch = globalThis.fetch;

before(async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  globalThis.fetch = async (url, init) => {
    const name = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(String(url))?.[1];
    if (!name) return realFetch(url, init);
    called.push({ name, body: JSON.parse(init.body) });
    const value = answers[name];
    return new Response(JSON.stringify(value === undefined ? null : value), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  built = await buildApiRuntime(['api/data/[...path].ts']);
  route = (await import(pathToFileURL(path.join(built.outputDir, 'api/data/[...path].js')).href)).default;
});
after(async () => {
  globalThis.fetch = realFetch;
  await built?.cleanup();
});

const production = [{ id: '00000000-0000-4000-8000-000000000100', panel: [{ name: 'Card', fields: [{ field: 'f0', ftype: 'textfield', title: 'Score' }] }], cues: [] }];
const call = (verb, body, ip) =>
  route.fetch(
    new Request(`https://noacg.test/api/data/${verb}`, {
      method: verb === 'patch' ? 'PATCH' : 'POST',
      headers: { authorization: 'Bearer key-under-test', 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    }),
  );

test('a held /patch answers 200 and says it was held; an unpaused one does not claim it', async () => {
  answers = { control_data_resolve: production, control_data_patch: { data: { api: { card: { score: '2' } } }, writes: [], paused: true } };
  const held = await call('patch', { api: { card: { score: '2' } } }, '203.0.113.10');
  assert.equal(held.status, 200);
  const body = await held.json();
  assert.equal(body.ok, true);
  assert.equal(body.paused, true);
  assert.match(body.message, /paused Another system/);
  assert.deepEqual(body.writes, []);

  answers.control_data_patch = { data: { api: { card: { score: '3' } } }, writes: [{ graphic: 'Card', event: 7, applied: { f0: '3' } }] };
  const aired = await (await call('patch', { api: { card: { score: '3' } } }, '203.0.113.10')).json();
  assert.equal(aired.paused, undefined);
  assert.equal(aired.message, undefined);
  assert.equal(aired.writes.length, 1);
});

test('a held /update answers 200 with no event and says it was held; an aired one carries its event', async () => {
  answers = { control_data_resolve: production, control_data_send: null };
  const held = await (await call('update', { graphic: 'Card', values: { Score: '9' } }, '203.0.113.11')).json();
  assert.equal(held.ok, true);
  assert.equal(held.event, null);
  assert.equal(held.paused, true);
  assert.deepEqual(held.applied, { f0: '9' });

  answers.control_data_send = 41;
  const aired = await (await call('update', { graphic: 'Card', values: { Score: '9' } }, '203.0.113.11')).json();
  assert.equal(aired.event, 41);
  assert.equal(aired.paused, undefined);
});

test('the data key reaches only the data RPCs: no Take, Continue, Reset or machine event behind it', () => {
  const allowed = new Set(['control_data_resolve', 'control_data_patch', 'control_data_send', 'control_data_read']);
  assert.ok(called.length > 0);
  for (const c of called) assert.ok(allowed.has(c.name), `the route called ${c.name}`);
  const route = readFileSync('api/data/[...path].ts', 'utf8') + readFileSync('api/_lib/dataIngest.ts', 'utf8');
  for (const verb of ['control_send', 'control_stage', 'control_data_pause_by_slug']) {
    assert.ok(!new RegExp(`'${verb}'`).test(route), `${verb} must never be reachable with the data key`);
  }
});

// ── The card's example ───────────────────────────────────────────────────────────────────────

test('each field is offered its own path under api., named after its label, the whole graphic keyed', () => {
  const offers = apiOffers({}, 'Riverside count', [
    { key: 'f0', label: 'Leading' },
    { key: 'f1', label: 'Margin %' },
    { key: 'f2', label: 'Margin %' },
    { key: 'f3', label: '' },
  ], { f0: 'Harbour List' });
  assert.deepEqual(offers.map((o) => o.path), [
    'api.riverside_count.leading',
    'api.riverside_count.margin',
    'api.riverside_count.margin_2',
    'api.riverside_count.f3',
  ]);
  assert.deepEqual(offers.map((o) => o.key), ['f0', 'f1', 'f2', 'f3']);
  assert.equal(offers[0].sample, 'Harbour List');
});

test('a graphic keeps its group and its connected paths; two graphics never share a group by accident', () => {
  const bindings = { 'Score Bug': { f0: 'api.score_bug.home' }, 'score bug!': { f0: 'match.home' } };
  assert.equal(apiGroup(bindings, 'Score Bug'), 'score_bug');
  assert.equal(apiGroup(bindings, 'score bug!'), 'score_bug_2', 'the same name made unique');
  const kept = apiOffers(bindings, 'Score Bug', [{ key: 'f0', label: 'Home goals' }, { key: 'f1', label: 'Home' }], {});
  assert.deepEqual(kept.map((o) => o.path), ['api.score_bug.home', 'api.score_bug.home_2']);
});

test('the example nests the connected paths, and neither the command nor the sender file carries the key', () => {
  const bindings = { Card: { f0: 'api.card.score', f1: 'show.title', f2: 'api.card.name' }, Gone: { f0: 'api.gone.x' } };
  const dests = apiDestinations(bindings, [{ name: 'Card', fields: [{ key: 'f0', label: 'Score' }, { key: 'f2', label: "O'Neil" }], values: { f0: '3', f2: 'Ann' } }]);
  assert.deepEqual(dests.map((d) => d.path), ['api.card.name', 'api.card.score'], 'only graphics still in the production, in path order');
  assert.deepEqual(examplePatch(dests), { api: { card: { name: 'Ann', score: '3' } } });
  const curl = exampleCurl('https://noacg.test/api/data/patch', { api: { q: "it's" } });
  assert.match(curl, /\$NOACG_DATA_KEY/);
  assert.match(curl, /it'\\''s/, 'a quote in a value cannot end the shell string');
  const file = JSON.parse(senderExample('https://noacg.test/api/data/patch', dests));
  assert.deepEqual(Object.keys(file), ['address', 'patch', 'fields']);
  assert.ok(!/key/i.test(JSON.stringify(file).replace(/"fields"/, '')), 'no key in the downloaded file');
});

test('the receipt reads in seconds, then minutes, and says when nothing arrived', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  assert.equal(receivedWords(null, now), 'Nothing received yet');
  assert.equal(receivedWords('2026-10-22T11:59:56Z', now), 'Received 4 s ago');
  assert.equal(receivedWords('2026-10-22T11:59:01Z', now), 'Received 59 s ago');
  assert.equal(receivedWords('2026-10-22T11:59:00Z', now), 'Received 1 min ago');
  assert.equal(receivedWords('2026-10-22T11:57:00Z', now), 'Received 3 min ago');
});

// ── The prepared sample sender ───────────────────────────────────────────────────────────────

const example = JSON.parse(readFileSync(`${FIXTURES}/another-system.json`, 'utf8'));

test('the sender names its synthetic records after the unfamiliar fields, and reports what it did not send', async () => {
  const { synthetic, records } = await acquire(`${FIXTURES}/results-first.json`);
  assert.equal(synthetic, true, 'the fixture says it is invented');
  const out = normalize(example, records);
  assert.deepEqual(out.patch, { api: { riverside_count: { counted: '38 %', leading: 'Harbour List', margin: '412', turnout: '57.1 %' } } });
  assert.deepEqual(out.missing, []);
  assert.deepEqual(out.unused, ['Polling stations']);
  // A destination whose path runs through another's is reported, never a crash.
  const clash = normalize({ fields: [{ path: 'api.a.b', label: 'Leading' }, { path: 'api.a.b.c', label: 'Margin' }] }, records);
  assert.deepEqual(clash.patch, { api: { a: { b: 'Harbour List' } } });
  assert.deepEqual(clash.missing, ['Margin']);
  // Names in any script stay distinct; two records that read as one name fill neither field.
  const jp = normalize({ fields: [{ path: 'api.x.name', label: '名前' }, { path: 'api.x.score', label: '得点' }] }, { 名前: '田中', 得点: 9 });
  assert.deepEqual(jp.patch, { api: { x: { name: '田中', score: '9' } } });
  const twins = normalize({ fields: [{ path: 'api.x.m', label: 'Margin' }, { path: 'api.x.c', label: 'Counted' }] }, { 'Margin %': '1', margin: '2', Counted: '3', '%%': '4' });
  assert.deepEqual(twins.patch, { api: { x: { c: '3' } } });
  assert.deepEqual(twins.missing, ['Margin']);
});

test('a failed acquisition sends nothing: a cut-off file, a missing one, no records, a value that is not text', async () => {
  const fake = (text) => async () => text;
  await assert.rejects(acquire(`${FIXTURES}/results-cut-off.json`), /not complete JSON/);
  await assert.rejects(acquire(`${FIXTURES}/no-such-report.json`), /could not read/);
  await assert.rejects(acquire('x', fake('{"records":{}}')), /no records/);
  await assert.rejects(acquire('x', fake('{"records":{"Margin":{"v":1}}}')), /not text or a number/);

  const requests = [];
  const log = [];
  const code = await main(['--example', `${FIXTURES}/another-system.json`, '--input', `${FIXTURES}/results-cut-off.json`], {
    log: (l) => log.push(l),
    env: { NOACG_DATA_KEY: 'secret-under-test' },
    fetchImpl: async (...a) => requests.push(a),
  });
  assert.equal(code, 1);
  assert.equal(requests.length, 0, 'nothing was sent');
  assert.match(log.join('\n'), /Nothing was sent/);
});

test('a report and its correction are two sends with the key from the environment, never printed; a held answer says so', async () => {
  const requests = [];
  const log = [];
  let paused = false;
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    const body = paused
      ? { ok: true, data: {}, writes: [], paused: true, message: 'Held: this production has paused Another system. Resume sends the latest values once.' }
      : { ok: true, data: {}, writes: [{ graphic: 'Riverside count', event: 1, applied: { f1: '214' } }] };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const run = (input) => main(['--example', `${FIXTURES}/another-system.json`, '--input', `${FIXTURES}/${input}`], { log: (l) => log.push(l), env: { NOACG_DATA_KEY: 'secret-under-test' }, fetchImpl });
  assert.equal(await run('results-first.json'), 0);
  paused = true;
  assert.equal(await run('results-correction.json'), 0);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, example.address);
  assert.equal(requests[0].init.method, 'PATCH');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-under-test');
  assert.equal(JSON.parse(requests[1].init.body).api.riverside_count.margin, '214', 'the correction');
  assert.ok(!log.join('\n').includes('secret-under-test'), 'the key is never printed');
  assert.match(log.join('\n'), /Received \(200\): Riverside count \(f1\)/);
  assert.match(log.join('\n'), /Held \(200\)/);
  assert.match(receipt({ status: 401, body: { ok: false, error: { message: 'Unknown data key.' } } }), /Refused \(401\): Unknown data key/);
});

test('a report that names no connected field sends nothing', async () => {
  const requests = [];
  const log = [];
  const read = async () => '{"synthetic":true,"records":{"Weather":"Rain"}}';
  const { records } = await acquire('x', read);
  assert.deepEqual(normalize(example, records).sent, []);
  const input = path.join(await mkdtemp(path.join(tmpdir(), 'sender-')), 'weather.json');
  await writeFile(input, await read());
  const code = await main(['--example', `${FIXTURES}/another-system.json`, '--input', input], { log: (l) => log.push(l), env: { NOACG_DATA_KEY: 'k' }, fetchImpl: async (...a) => requests.push(a) });
  assert.equal(code, 1);
  assert.equal(requests.length, 0);
  assert.match(log.join('\n'), /Nothing matched a connected field/);
});

test('without a key the sender sends nothing and says where the key is', async () => {
  const requests = [];
  const log = [];
  const code = await main(['--example', `${FIXTURES}/another-system.json`, '--input', `${FIXTURES}/results-first.json`], { log: (l) => log.push(l), env: {}, fetchImpl: async (...a) => requests.push(a) });
  assert.equal(code, 2);
  assert.equal(requests.length, 0);
  assert.match(log.join('\n'), /NOACG_DATA_KEY/);
});

test('a large hostile report and a graphic of many same-named fields stay linear', () => {
  const records = {};
  for (let i = 0; i < 200_000; i += 1) records[`Field ${i} ${'x'.repeat(i % 50)}`] = i;
  const fields = Array.from({ length: 20_000 }, (_, i) => ({ path: `api.big.f${i}`, label: `Field ${i * 10} ${'x'.repeat((i * 10) % 50)}`, graphic: 'Big', field: `f${i}` }));
  let started = Date.now();
  const out = normalize({ fields }, records);
  assert.equal(out.sent.length, 20_000);
  assert.ok(Date.now() - started < 2000, `normalize took ${Date.now() - started} ms`);

  started = Date.now();
  const offers = apiOffers({}, 'Big', Array.from({ length: 20_000 }, (_, i) => ({ key: `f${i}`, label: 'Same' })), {});
  assert.equal(new Set(offers.map((o) => o.path)).size, 20_000);
  assert.ok(Date.now() - started < 2000, `apiOffers took ${Date.now() - started} ms`);
});
