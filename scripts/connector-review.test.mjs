// guards: src/control/connectorReview.ts, src/control/sourceMapping.ts, src/model/productionData.ts
//
// THE CONNECT REVIEW FOR A CONNECTOR (docs/work-specs/playout-api-mapping/spec.md, E5.2; AC-1,
// AC-3, AC-4), in Node against the real modules:
//   - what a nested sample offers, under its own words, and its bounds at their edges;
//   - the proposal: a key naming the field first, then a name, a single list for a list field;
//   - the one write: the recipe for every leaf still bound, stamped with the source's own config
//     revision, rebuilt from known keys only (a token cannot reach a show or an export), let
//     through only when readSourceRecipe reads it, and fenced on the configuration the review read;
//   - a changed schema marks the mapping for repair and keeps its binding;
//   - the sample read: through the agent when one holds the source, the hosted fetcher otherwise,
//     never applied, and the data key never sent to the hosted fetcher.
// The browser walk is e2e/production-api-mapping.spec.ts; the agent's sample through the real route
// and database is e2e/configured/external-data-connector.spec.ts.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import './lib/tsResolve.mjs';

const review = await import('../src/control/connectorReview.ts');
const mapping = await import('../src/control/sourceMapping.ts');

const SAMPLE = {
  match: { home: { name: 'HIFK', score: 2 }, away: { name: 'Tappara', score: 1 }, period: 3, final: false },
  f2: 'Kaisaniemi',
  scorers: [
    { id: 'p1', name: 'Aino', team: 'HIFK', minute: 12 },
    { id: 'p2', name: 'Eero', team: 'Tappara', minute: 30 },
  ],
};

describe('what a sample offers', () => {
  test('every value under the fewest words that name it alone, a field id as its stable key, and each list of records whole', () => {
    const { scalars, collections } = review.jsonOffers('e1', SAMPLE);
    assert.deepEqual(
      scalars.map((s) => [s.path, s.label, s.sample, s.key]),
      [
        ['external.e1.match.home.name', 'home name', 'HIFK', undefined],
        ['external.e1.match.home.score', 'home score', '2', undefined],
        ['external.e1.match.away.name', 'away name', 'Tappara', undefined],
        ['external.e1.match.away.score', 'away score', '1', undefined],
        ['external.e1.match.period', 'period', '3', undefined],
        ['external.e1.match.final', 'final', 'false', undefined],
        ['external.e1.f2', 'f2', 'Kaisaniemi', 'f2'],
      ],
    );
    assert.deepEqual(collections, [{ path: 'external.e1.scorers', from: 'scorers', label: 'scorers', keys: ['id', 'name', 'team', 'minute'], id: 'id' }]);
  });

  test('null, a key the recipe cannot name, an empty list and a list that is not records are not offered', () => {
    const { scalars, collections } = review.jsonOffers('e1', { a: null, 'b c': 1, 'd.e': 2, empty: [], loose: ['x', 'y'], mixed: [{ a: 1 }, 2], ok: 0 });
    assert.deepEqual(scalars.map((s) => s.path), ['external.e1.ok']);
    assert.deepEqual(collections, []);
    assert.deepEqual(review.jsonOffers('e1', [1, 2]), { scalars: [], collections: [] }, 'a sample that is not an object offers nothing');
  });

  test('the record key: id or key when unique, else the first unique key, else none', () => {
    const key = (items) => review.jsonOffers('e1', { l: items }).collections[0].id;
    assert.equal(key([{ name: 'a', key: 1 }, { name: 'b', key: 2 }]), 'key');
    assert.equal(key([{ id: 1, name: 'a' }, { id: 1, name: 'b' }]), 'name');
    assert.equal(key([{ a: 1 }, { a: 1 }]), null);
    assert.equal(key([{ id: 1 }, { id: '1' }]), 'id', '1 and "1" are two ids');
  });

  test('bounds at their edges: 200 values, 20 lists, 8 keys deep', () => {
    const wide = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`k${i}`, i]));
    assert.equal(review.jsonOffers('e1', wide).scalars.length, review.MAX_OFFERS);
    assert.equal(review.MAX_OFFERS, 200);
    const lists = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`l${i}`, [{ a: i }]]));
    assert.equal(review.jsonOffers('e1', lists).collections.length, review.MAX_COLLECTIONS);
    assert.equal(review.MAX_COLLECTIONS, 20);
    const deep = (n) => {
      let v = 'x';
      for (let i = 0; i < n - 1; i += 1) v = { d: v };
      return { d: v };
    };
    assert.equal(review.jsonOffers('e1', deep(8)).scalars.length, 1, 'a value 8 keys deep is offered');
    assert.equal(review.jsonOffers('e1', deep(9)).scalars.length, 0, 'one 9 keys deep is not: a recipe could not read it');
    assert.equal(mapping.readSourceRecipe({ v: 1, sourceId: 'e1', configRevision: 1, outputs: { v: { from: review.jsonOffers('e1', deep(8)).scalars[0].path.slice('external.e1.'.length) } } }, 'e1', 1).status, 'ok');
  });

  test('a hostile sample costs a bounded walk', () => {
    const huge = { list: Array.from({ length: 200_000 }, (_, i) => ({ id: i, v: i })), wide: Object.fromEntries(Array.from({ length: 100_000 }, (_, i) => [`k${i}`, { x: i }])) };
    const t0 = performance.now();
    const out = review.jsonOffers('e1', huge);
    assert.ok(performance.now() - t0 < 1000, 'well under a second');
    assert.ok(out.scalars.length <= review.MAX_OFFERS && out.collections.length <= 1);
  });
});

const FIELDS = [
  { key: 'f0', label: 'Home score' },
  { key: 'f1', label: 'Away name' },
  { key: 'f2', label: 'Venue' },
  { key: 'f3', label: 'Clock' },
];

describe('the proposal', () => {
  test('a key naming the field first, then a unique name; a field nothing matches is unmatched', () => {
    const rows = review.proposeConnector(FIELDS, review.jsonOffers('e1', SAMPLE), {}, {}, () => false, () => true);
    assert.deepEqual(rows.map((r) => [r.fieldId, r.status, r.path]), [
      ['f0', 'name', 'external.e1.match.home.score'],
      ['f1', 'name', 'external.e1.match.away.name'],
      ['f2', 'key', 'external.e1.f2'],
      ['f3', 'unmatched', null],
    ]);
  });

  test('a list field takes a list, never a value; the sample\'s one list is its candidate', () => {
    const rows = review.proposeConnector([{ key: 'f0', label: 'Lines' }, { key: 'f1', label: 'scorers' }], review.jsonOffers('e1', SAMPLE), {}, { f0: 'lines' }, () => false, () => true);
    assert.deepEqual(rows.map((r) => [r.status, r.path]), [['name', 'external.e1.scorers'], ['unmatched', null]]);
  });

  test('a field prepared messages use is refused; a value the field cannot hold is never proposed', () => {
    const rows = review.proposeConnector(FIELDS.slice(0, 2), review.jsonOffers('e1', SAMPLE), {}, {}, (f) => f === 'f1', (f, text) => /^\d+$/.test(text));
    assert.deepEqual(rows.map((r) => r.status), ['name', 'refused']);
  });
});

const GRAPHIC = 'Scorebug';
const rowsFor = (bindings = {}, fields = FIELDS, adapters = {}) =>
  review.proposeConnector(fields, review.jsonOffers('e1', SAMPLE), bindings[GRAPHIC] ?? {}, adapters, () => false, () => true);
const plan = (over = {}) =>
  review.connectorPlan({
    graphic: GRAPHIC,
    bindings: {},
    source: { id: 'e1', label: 'Results', endpoint: 'https://results.example/live' },
    rows: rowsFor(over.bindings),
    choices: {},
    collections: review.jsonOffers('e1', SAMPLE).collections,
    adapters: {},
    columns: {},
    ...over,
  });

describe('the one write', () => {
  test('a new source: its registration at config revision 1 with the recipe for every connected leaf', () => {
    const p = plan();
    assert.deepEqual(p.source, {
      id: 'e1',
      kind: 'external',
      label: 'Results',
      config: {
        v: 1,
        configRevision: 1,
        endpoint: 'https://results.example/live',
        mapping: { v: 1, sourceId: 'e1', configRevision: 1, outputs: { 'match.home.score': { from: 'match.home.score' }, 'match.away.name': { from: 'match.away.name' }, f2: { from: 'f2' } } },
      },
    });
    assert.equal(p.fence, null);
    assert.deepEqual(p.entries.map((e) => [e.fieldId, e.path]), [['f0', 'external.e1.match.home.score'], ['f1', 'external.e1.match.away.name'], ['f2', 'external.e1.f2']]);
    assert.equal(mapping.readSourceRecipe(p.source.config.mapping, 'e1', 1).status, 'ok');
    // The sample evaluates, through the recipe, to exactly what the preview shows.
    const out = mapping.projectSource({ sourceId: 'e1', payload: SAMPLE, bindings: p.bindings, fieldsOf: () => null, mapping: p.source.config.mapping, configRevision: 1 });
    assert.deepEqual(out.writes, { 'external.e1.f2': 'Kaisaniemi', 'external.e1.match.away.name': 'Tappara', 'external.e1.match.home.score': '2' });
  });

  test('a list: its record key, the columns picked, and its native list registered', () => {
    const fields = [{ key: 'f0', label: 'Lines' }];
    const p = plan({ rows: rowsFor({}, fields, { f0: 'lines' }), adapters: { f0: 'lines' }, columns: { f0: ['team'] } });
    assert.deepEqual(p.source.config.lists, { scorers: 'lines' });
    assert.deepEqual(p.source.config.mapping.outputs, { scorers: { from: 'scorers', id: 'id', columns: [{ from: 'team' }] } });
    // A reconnect with no pick keeps the columns the source already reads for the leaf.
    const stored = { v: 1, configRevision: 1, endpoint: 'https://results.example/live', lists: { scorers: 'lines' }, mapping: p.source.config.mapping };
    const again = plan({ bindings: { [GRAPHIC]: { f0: 'external.e1.scorers' } }, source: { id: 'e1', label: 'Results', config: stored }, rows: rowsFor({ [GRAPHIC]: { f0: 'external.e1.scorers' } }, fields, { f0: 'lines' }), adapters: { f0: 'lines' } });
    assert.deepEqual(again.source.config.mapping.outputs.scorers.columns, [{ from: 'team' }]);
    const auto = plan({ rows: rowsFor({}, fields, { f0: 'schedule' }), adapters: { f0: 'schedule' } });
    assert.deepEqual(auto.source.config.mapping.outputs.scorers.columns, [{ from: 'name' }, { from: 'team' }], 'a schedule row has two cells, after the record key');
  });

  test('a reused source keeps its config revision and stamps the recipe with it; another graphic keeps its outputs', () => {
    const bindings = { Ticker: { f0: 'external.e1.scorers' }, Gone: {} };
    const stored = {
      v: 1,
      configRevision: 4,
      endpoint: 'https://results.example/live',
      lists: { scorers: 'lines', dropped: 'lines' },
      mapping: { v: 1, sourceId: 'e1', configRevision: 4, outputs: { scorers: { from: 'scorers', id: 'id', columns: [{ from: 'name' }] }, dropped: { from: 'x', columns: [{ from: 'a' }] } } },
    };
    const p = plan({ bindings, source: { id: 'e1', label: 'Results', config: stored } });
    assert.equal(p.source.config.configRevision, 4);
    assert.equal(p.source.config.mapping.configRevision, 4);
    assert.deepEqual(p.source.config.mapping.outputs.scorers, stored.mapping.outputs.scorers, 'the ticker reads as before');
    assert.equal(p.source.config.mapping.outputs.dropped, undefined, 'a leaf nobody reads any more leaves the recipe');
    assert.deepEqual(p.source.config.lists, { scorers: 'lines' });
    assert.equal(p.fence, JSON.stringify(stored), 'the write is fenced on the configuration as read');
  });

  test('nothing but the registration\'s own keys is written: a token is dropped, a local destination refused', () => {
    const stored = { v: 1, configRevision: 1, endpoint: 'https://results.example/live', token: 'SECRET-TOKEN', headers: { authorization: 'Bearer SECRET-TOKEN' } };
    const p = plan({ source: { id: 'e1', label: 'Results', config: stored } });
    assert.doesNotMatch(JSON.stringify(p.source), /SECRET-TOKEN|headers/);
    assert.deepEqual(Object.keys(p.source.config).sort(), ['configRevision', 'endpoint', 'mapping', 'v']);
    assert.match(plan({ source: { id: 'e1', label: 'Results', config: { ...stored, mode: 'local' } } }).error, /no configuration this build reads/);
    assert.match(plan({ source: { id: 'e1', label: 'Results', config: { ...stored, lists: { scorers: 'standings' } } } }).error, /no configuration/, 'an adapter the route refuses');
  });

  test('a recipe the reader would refuse is never written: too many outputs is an error, not a write', () => {
    const many = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`v${i}`, i]));
    const fields = Array.from({ length: 33 }, (_, i) => ({ key: `f${i}`, label: `v${i}` }));
    const rows = review.proposeConnector(fields, review.jsonOffers('e1', many), {}, {}, () => false, () => true);
    const p = review.connectorPlan({ graphic: GRAPHIC, bindings: {}, source: { id: 'e1', label: 'R', endpoint: 'https://x.example' }, rows, choices: {}, collections: [], adapters: {}, columns: {} });
    assert.match(p.error, /1 to 32 outputs/);
    const fits = review.connectorPlan({ graphic: GRAPHIC, bindings: {}, source: { id: 'e1', label: 'R', endpoint: 'https://x.example' }, rows: rows.slice(0, 32), choices: {}, collections: [], adapters: {}, columns: {} });
    assert.equal(Object.keys(fits.source.config.mapping.outputs).length, 32);
  });

  test('a later configuration is not rebuilt; disconnecting every field leaves no recipe', () => {
    assert.match(plan({ source: { id: 'e1', label: 'R', config: { v: 2, configRevision: 'x' } } }).error, /no configuration/);
    const bindings = { [GRAPHIC]: { f0: 'external.e1.match.home.score' } };
    const p = plan({ bindings, choices: { f0: null, f1: null, f2: null, f3: null } });
    assert.deepEqual(p.entries, [{ graphic: GRAPHIC, fieldId: 'f0', path: null }]);
    assert.equal(p.source.config.mapping, undefined);
  });
});

describe('repair', () => {
  test('a bound path the new sample lacks needs repair, keeps its binding, and is not retargeted', () => {
    const changed = { match: { home: { team: 'HIFK', goals: 2 } } };
    const offers = review.jsonOffers('e1', changed);
    const current = { f0: 'external.e1.match.home.score', f1: 'sheet.s1.x' };
    assert.deepEqual([...review.needsRepair(current, 'e1', offers)], ['f0']);
    const rows = review.proposeConnector([{ key: 'f0', label: 'goals' }], offers, current, {}, () => false, () => true);
    assert.equal(rows[0].path, 'external.e1.match.home.goals', 'the proposal');
    const p = review.connectorPlan({ graphic: GRAPHIC, bindings: { [GRAPHIC]: current }, source: { id: 'e1', label: 'R', config: { v: 1, configRevision: 1, endpoint: 'https://x.example' } }, rows, choices: {}, collections: [], adapters: {}, columns: {} });
    assert.deepEqual(p.entries, [], 'kept until the operator picks the new path');
    const picked = review.connectorPlan({ graphic: GRAPHIC, bindings: { [GRAPHIC]: current }, source: { id: 'e1', label: 'R', config: { v: 1, configRevision: 1, endpoint: 'https://x.example' } }, rows, choices: { f0: rows[0].path }, collections: [], adapters: {}, columns: {} });
    assert.deepEqual(picked.entries, [{ graphic: GRAPHIC, fieldId: 'f0', path: 'external.e1.match.home.goals' }]);
  });
});

describe('reading a sample', () => {
  /** A fake of the two doors, recording every request. */
  const doors = (answers) => {
    const asked = [];
    const fetcher = async (url, init = {}) => {
      asked.push({ url, init });
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return { status: next.status ?? 200, json: async () => next.body };
    };
    return { asked, fetcher };
  };
  let clock = 0;
  const base = { endpoint: 'https://results.example/live', wait: async (ms) => void (clock += ms), now: () => clock };

  test('a registered source with an agent: the ask, then its sample, the data key only to NoaCG', async () => {
    clock = 0;
    const { asked, fetcher } = doors([{ body: { ok: false, waiting: true, asked: 't1' } }, { body: { ok: false, waiting: true } }, { body: { ok: true, sample: SAMPLE } }]);
    const read = await review.readConnectorSample({ ...base, fetcher, key: 'DATA-KEY', sourceId: 'e1' });
    assert.deepEqual(read, { ok: true, sample: SAMPLE, via: 'agent' });
    assert.deepEqual(asked.map((a) => [a.url, JSON.parse(a.init.body)]), [
      ['/api/data/source', { v: 1, op: 'sample', sourceId: 'e1' }],
      ['/api/data/source', { v: 1, op: 'sample', sourceId: 'e1', asked: 't1' }],
      ['/api/data/source', { v: 1, op: 'sample', sourceId: 'e1', asked: 't1' }],
    ]);
    assert.ok(asked.every((a) => a.init.headers.authorization === 'Bearer DATA-KEY'));
  });

  test('no agent holds it: the hosted fetcher reads the public address, without the key', async () => {
    const { asked, fetcher } = doors([{ body: { ok: false, agent: false } }, { body: { ok: true, sample: SAMPLE } }]);
    assert.deepEqual(await review.readConnectorSample({ ...base, fetcher, key: 'DATA-KEY', sourceId: 'e1' }), { ok: true, sample: SAMPLE, via: 'hosted' });
    assert.equal(asked[1].url, `/api/data/feed?as=json&url=${encodeURIComponent(base.endpoint)}`);
    assert.equal(asked[1].init.headers, undefined, 'no credential of any kind travels to the hosted fetcher');
  });

  test('a new endpoint is read by the hosted fetcher alone; its refusal is said with its fix', async () => {
    const { asked, fetcher } = doors([{ status: 502, body: { ok: false, error: 'the address needs a credential', fix: 'Its agent reads it.' } }]);
    assert.deepEqual(await review.readConnectorSample({ ...base, fetcher }), { ok: false, error: 'the address needs a credential', fix: 'Its agent reads it.' });
    assert.equal(asked.length, 1);
  });

  test('an agent that never answers is given up at 45 seconds, polled every 1.5', async () => {
    clock = 0;
    const waiting = Array.from({ length: 100 }, () => ({ body: { ok: false, waiting: true } }));
    const { asked, fetcher } = doors([{ body: { ok: false, waiting: true, asked: 't1' } }, ...waiting]);
    const read = await review.readConnectorSample({ ...base, fetcher, key: 'K', sourceId: 'e1' });
    assert.match(read.error, /agent did not answer/);
    assert.equal(review.SAMPLE_WAIT_MS, 45_000);
    assert.equal(review.SAMPLE_POLL_MS, 1_500);
    assert.equal(asked.length, 1 + review.SAMPLE_WAIT_MS / review.SAMPLE_POLL_MS);
  });

  test('offline; any refusal of the source falls back to the hosted read; a closed review stops asking', async () => {
    assert.match((await review.readConnectorSample({ ...base, fetcher: doors([new Error('down')]).fetcher })).error, /could not be reached/);
    const gone = doors([{ status: 404, body: { ok: false, refused: 'gone' } }, { body: { ok: true, sample: SAMPLE } }]);
    assert.deepEqual(await review.readConnectorSample({ ...base, fetcher: gone.fetcher, key: 'K', sourceId: 'e1' }), { ok: true, sample: SAMPLE, via: 'hosted' });
    clock = 0;
    const stop = new AbortController();
    const waiting = doors([{ body: { ok: false, waiting: true, asked: 't1' } }, ...Array.from({ length: 50 }, () => ({ body: { ok: false, waiting: true } }))]);
    const wait = async (ms) => {
      clock += ms;
      if (clock >= 3 * review.SAMPLE_POLL_MS) stop.abort();
    };
    const read = await review.readConnectorSample({ ...base, wait, fetcher: waiting.fetcher, key: 'K', sourceId: 'e1', signal: stop.signal });
    assert.equal(read.ok, false);
    assert.equal(waiting.asked.length, 3, 'the ask, then two polls before the review closed: no more');
  });
});
