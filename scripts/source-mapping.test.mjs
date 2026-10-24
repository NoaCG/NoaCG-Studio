// guards: src/control/sourceMapping.ts, src/control/externalSource.ts, src/control/contentFormats.ts, src/control/sheetSource.ts, api/_lib/dataTick.ts, api/data/[...path].ts, src/model/productionData.ts, supabase/migrations/0101_production_source_snapshots.sql
//
// THE SHARED EVALUATOR AND THE SOURCE ROUTE'S OWN EDGES (docs/work-specs/playout-external-connectors/
// spec.md, phase E4.2; AC-2, AC-4), in Node against the real modules:
//   - the identity projection: a scalar path to its text, a collection through the existing list
//     adapters, a valid empty list "", and everything that is not a value held (missing or unfit);
//   - one evaluator: the Sheet reader, the server tick and the route resolve a path's value with
//     the same `pathValue`;
//   - linear on hostile input: a 256 KiB list, a long whitespace run in a cell, deep nesting;
//   - the registration and the envelope: v 2 held read-only, a local destination refused, every
//     malformed envelope refused before the database is asked;
//   - the route's body cap, 256 KiB, at its edge, declared or counted, before any database call.
// The fence, the revision gap, the 64 KiB row, the budget and the receipt gap live in the database:
// migration 0101's self-check pins each at its edge, and e2e/configured/external-data-connector
// .spec.ts drives them through the real route.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import './lib/tsResolve.mjs';

const mapping = await import('../src/control/sourceMapping.ts');
const ext = await import('../src/control/externalSource.ts');
const sheet = await import('../src/control/sheetSource.ts');
const formats = await import('../src/control/contentFormats.ts');

const text = (key) => ({ key, label: key, kind: 'text', defaultValue: '' });
const number = (key) => ({ key, label: key, kind: 'number', defaultValue: '' });
const toggle = (key) => ({ key, label: key, kind: 'toggle', defaultValue: '' });

const project = (payload, bindings, { fields = {}, lists } = {}) =>
  mapping.projectSource({ sourceId: 'e1', payload, bindings, fieldsOf: (g) => fields[g] ?? null, lists });

describe('the identity projection', () => {
  const bindings = { Board: { f0: 'external.e1.units', f1: 'external.e1.status', f2: 'external.e1.final', f3: 'external.e1.totals.counted' } };
  const fields = { Board: [number('f0'), text('f1'), toggle('f2'), number('f3')] };

  test('a scalar path is its own text; a number and a boolean as their fields take them', () => {
    const out = project({ units: 60, status: 'PRELIMINARY', final: false, totals: { counted: 1.5 } }, bindings, { fields });
    assert.deepEqual(out.writes, { 'external.e1.units': '60', 'external.e1.status': 'PRELIMINARY', 'external.e1.final': '0', 'external.e1.totals.counted': '1.5' });
    assert.deepEqual([out.missing, out.unfit], [[], []]);
  });

  test('a missing leaf, null, an object, a value a field cannot hold and a prototype key are held', () => {
    const out = project({ units: 'sixty', status: null, final: { yes: true }, totals: {} }, { ...bindings, Other: { f0: 'external.e1.constructor' } }, { fields });
    assert.deepEqual(out.writes, {});
    assert.deepEqual(out.missing.sort(), ['constructor', 'totals.counted']);
    assert.deepEqual(out.unfit.sort(), ['final', 'status', 'units']);
  });

  test('paths of other sources and other prefixes are not this source\'s', () => {
    const out = project({ units: 1 }, { Board: { f0: 'external.e2.units', f1: 'sheet.e1.lines', f2: 'external.e1', f3: 'external.e1.units' } });
    assert.deepEqual(Object.keys(out.writes), ['external.e1.units']);
    assert.deepEqual([out.missing, out.unfit], [[], []], 'nothing but external.e1.<leaf> is read');
  });

  test('a collection goes through the list adapter its leaf registered; a valid empty one clears', () => {
    const b = { Ticker: { f0: 'external.e1.parties' }, Schedule: { f0: 'external.e1.slots' }, Credits: { f0: 'external.e1.crew' } };
    const lists = { parties: 'lines', slots: 'schedule', crew: 'credits' };
    const out = project(
      {
        parties: [{ party_id: 'KOK', votes: 225000 }, ['SDP', 215000], 'PS'],
        slots: [['20:00', 'News']],
        crew: [['Director', 'Aino'], ['# Thanks']],
      },
      b,
      { lists },
    );
    assert.deepEqual(out.writes, {
      'external.e1.parties': 'KOK\t225000\nSDP\t215000\nPS',
      'external.e1.slots': '20:00 | News',
      'external.e1.crew': 'Director | Aino\n# Thanks',
    });
    assert.deepEqual(project({ parties: [] }, b, { lists }).writes, { 'external.e1.parties': '' });
  });

  test('a list with no registered adapter, or an item that is not flat, is not a value', () => {
    const b = { Ticker: { f0: 'external.e1.parties' } };
    assert.deepEqual(project({ parties: ['a'] }, b).unfit, ['parties']);
    assert.deepEqual(project({ parties: [{ a: { b: 1 } }] }, b, { lists: { parties: 'lines' } }).unfit, ['parties']);
    assert.deepEqual(project({ parties: [[['x']]] }, b, { lists: { parties: 'lines' } }).unfit, ['parties']);
  });

  test('fields that need different forms of one value hold it, as for a Sheet', () => {
    const out = project({ flag: 'true' }, { A: { f0: 'external.e1.flag' }, B: { f0: 'external.e1.flag' } }, { fields: { A: [toggle('f0')], B: [text('f0')] } });
    assert.deepEqual([out.writes, out.unfit], [{}, ['flag']]);
  });
});

describe('one evaluator', () => {
  test('the Sheet reader, the server tick and the route call the same pathValue', async () => {
    assert.equal(sheet.pathValue, mapping.pathValue);
    const tick = readFileSync(new URL('../api/_lib/dataTick.ts', import.meta.url), 'utf8');
    const route = readFileSync(new URL('../api/data/[...path].ts', import.meta.url), 'utf8');
    assert.match(tick, /pathValue\(connectedFields\(/);
    assert.match(route, /from '\.\.\/\.\.\/src\/control\/sourceMapping\.js'/);
  });

  test('a cell reads the same as before: line breaks fold to one space', () => {
    const fill = (cells) => formats.fillList({ adapter: 'lines', main: 'f0' }, cells).values.f0;
    assert.equal(fill([['  Top \n\n  story  ', 'x\r\ny']]), 'Top story\tx y');
    assert.equal(fill([[' \n ']]), '');
  });
});

describe('linear on hostile input', () => {
  test('a 256 KiB list of 30 000 items and a 256 KiB whitespace cell evaluate in well under a second', () => {
    const items = Array.from({ length: 30_000 }, (_, i) => ['P' + i, i]);
    let at = Date.now();
    const out = project({ parties: items }, { T: { f0: 'external.e1.parties' } }, { lists: { parties: 'lines' } });
    assert.equal(out.writes['external.e1.parties'].split('\n').length, 30_000);
    assert.ok(Date.now() - at < 1000, `list took ${Date.now() - at} ms`);
    // The cell fold used to retry every start of a whitespace run: 200 KB of spaces took 47 s.
    at = Date.now();
    const blank = project({ parties: [[' '.repeat(256 * 1024) + 'x']] }, { T: { f0: 'external.e1.parties' } }, { lists: { parties: 'lines' } });
    assert.equal(blank.writes['external.e1.parties'], 'x');
    const folded = project({ parties: [[' \t'.repeat(128 * 1024) + '\n' + ' '.repeat(128 * 1024)]] }, { T: { f0: 'external.e1.parties' } }, { lists: { parties: 'lines' } });
    assert.equal(folded.writes['external.e1.parties'], '');
    assert.ok(Date.now() - at < 1000, `whitespace took ${Date.now() - at} ms`);
  });

  test('a deeply nested payload is walked only along the bound path', () => {
    let deep = 'end';
    for (let i = 0; i < 100_000; i += 1) deep = { d: deep };
    const out = project({ units: 1, deep }, { B: { f0: 'external.e1.units', f1: 'external.e1.deep.d.d' } });
    assert.deepEqual([out.writes, out.unfit], [{ 'external.e1.units': '1' }, ['deep.d.d']]);
  });
});

describe('the registration', () => {
  const entry = (config, over = {}) => ({ id: 'e1', kind: 'external', label: 'Results', config, ...over });
  const good = { v: 1, configRevision: 2, endpoint: 'https://results.example/r', lists: { parties: 'lines' } };

  test('a v 1 entry is read with its lists and Pause', () => {
    assert.deepEqual(ext.readExternalRegistration(entry(good, { paused: true })), { ok: true, registration: good });
  });

  test('a later version is held read-only; a missing one is refused', () => {
    const later = ext.readExternalRegistration(entry({ ...good, v: 2, recipe: { new: true } }));
    assert.deepEqual([later.ok, later.readOnly], [false, true]);
    assert.deepEqual([ext.readExternalRegistration(entry({ ...good, v: undefined })).readOnly], [false]);
  });

  test('a local destination in the production record is refused (local mode trusts whoever writes the config)', () => {
    for (const extra of [{ mode: 'local' }, { mode: 'hosted' }, { caFile: 'ca.pem' }]) {
      const read = ext.readExternalRegistration(entry({ ...good, ...extra }));
      assert.equal(read.ok, false);
      assert.match(read.error, /local destination/);
    }
  });

  test('a list adapter must be lines, schedule or credits on a dotted path', () => {
    for (const lists of [{ parties: 'standings' }, { 'a..b': 'lines' }, { parties: 1 }, []]) {
      assert.equal(ext.readExternalRegistration(entry({ ...good, lists })).ok, false, JSON.stringify(lists));
    }
    assert.equal(ext.readExternalRegistration(entry({ ...good, configRevision: 0 })).ok, false);
    assert.equal(ext.readExternalRegistration({ ...entry(good), kind: 'sheet' }).ok, false);
  });
});

describe('the envelope', () => {
  const acquisition = (over = {}) => ({ v: 1, sourceId: 'e1', configRevision: 2, ownerEpoch: 3, acceptedRevision: 4, checkedAt: '2026-10-24T12:00:00.000Z', status: 'changed', payload: { a: 1 }, ...over });
  const report = (over = {}, a = {}) => ({ v: 1, op: 'report', sourceId: 'e1', claim: 'agent:abcDEF123_-x', acquisition: acquisition(a), ...over });

  test('a claim, a report and a release parse', () => {
    assert.equal(ext.parseSourceEnvelope({ v: 1, op: 'claim', sourceId: 'e1', configRevision: 2 }).ok, true);
    assert.equal(ext.parseSourceEnvelope({ v: 1, op: 'release', sourceId: 'e1', configRevision: 2, claim: 'agent:abc' }).ok, true);
    assert.equal(ext.parseSourceEnvelope(report()).ok, true);
    assert.equal(ext.parseSourceEnvelope(report({}, { status: 'unchanged', payload: undefined })).ok, false, 'an unchanged report with a payload key');
    const unchanged = acquisition({ status: 'unchanged' });
    delete unchanged.payload;
    assert.equal(ext.parseSourceEnvelope({ ...report(), acquisition: unchanged }).ok, true);
  });

  test('a later version is refused as unsupported, never guessed at', () => {
    const later = ext.parseSourceEnvelope({ ...report(), v: 2 });
    assert.deepEqual([later.ok, later.unsupported], [false, true]);
    assert.equal(ext.parseSourceEnvelope(report({}, { v: 2 })).ok, false);
  });

  test('every malformed envelope is refused', () => {
    const bad = [
      null,
      [],
      { ...report(), op: 'patch' },
      { ...report(), sourceId: '../x' },
      { ...report(), claim: 'tick:abc' },
      { ...report(), claim: undefined },
      { v: 1, op: 'release', sourceId: 'e1', configRevision: 2 },
      { v: 1, op: 'claim', sourceId: 'e1', configRevision: 0 },
      report({}, { sourceId: 'e2' }),
      report({}, { ownerEpoch: -1 }),
      report({}, { acceptedRevision: 1.5 }),
      report({}, { status: 'take' }),
      report({}, { checkedAt: 'yesterday' }),
      report({}, { providerSequence: 'nine' }),
      report({}, { payload: undefined, status: 'changed' }),
    ].map((body) => {
      if (body && body.acquisition && body.acquisition.payload === undefined && body.acquisition.status === 'changed') delete body.acquisition.payload;
      return body;
    });
    for (const body of bad) assert.equal(ext.parseSourceEnvelope(body).ok, false, JSON.stringify(body));
  });

  test('sendPaths project an answer; a prototype key cannot be named', () => {
    assert.deepEqual(ext.projectPayload({ a: { b: 1, c: 2 }, d: [1], e: 3 }, ['a.b', 'd', 'x.y']), { a: { b: 1 }, d: [1] });
    assert.deepEqual(ext.projectPayload({ a: 1 }, null), { a: 1 });
    const base = { v: 1, sourceId: 's', productionId: 'p', endpoint: 'https://x.example/r', configRevision: 1 };
    assert.equal(ext.parseConnectorConfig({ ...base, sendPaths: ['a.__proto__'] }).ok, false);
    assert.equal(ext.parseConnectorConfig({ ...base, sendPaths: [] }).ok, false);
    assert.deepEqual(ext.parseConnectorConfig({ ...base, sendPaths: ['a.b'] }).config.sendPaths, ['a.b']);
  });
});

// Configured to a closed port: any database call would fail, so a 4xx here is the route's own.
process.env.SUPABASE_URL = 'http://127.0.0.1:9';
process.env.SUPABASE_SECRET_KEY = 'unit-test-key-not-a-real-one';
const route = (await import('../api/data/[...path].ts')).default;

describe('the route, before the database', () => {
  const post = (body, headers = {}) =>
    route.fetch(new Request('http://127.0.0.1/api/data/source', { method: 'POST', headers: { authorization: 'Bearer k', ...headers }, body }));
  /** A body of exactly `bytes` bytes that is JSON but not an envelope (so the parse answers 400). */
  const sized = (bytes) => `{"pad":"${'x'.repeat(bytes - 10)}"}`;

  test('a body of exactly 256 KiB is read; one byte more is refused, counted or declared', async () => {
    assert.equal(sized(256 * 1024).length, 256 * 1024);
    assert.equal((await post(sized(256 * 1024))).status, 400);
    assert.equal((await post(sized(256 * 1024 + 1))).status, 413);
    assert.equal((await post('{}', { 'content-length': String(256 * 1024 + 1) })).status, 413);
  });

  test('no key, the wrong method and a later envelope are refused before the database', async () => {
    assert.equal((await route.fetch(new Request('http://127.0.0.1/api/data/source', { method: 'POST', body: '{}' }))).status, 401);
    assert.equal((await route.fetch(new Request('http://127.0.0.1/api/data/source', { headers: { authorization: 'Bearer k' } }))).status, 405);
    assert.equal((await post(JSON.stringify({ v: 2, op: 'claim', sourceId: 'e1', configRevision: 1 }))).status, 422);
    assert.equal((await post('not json')).status, 400);
  });
});
