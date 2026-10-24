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
//   - the route's body cap, 256 KiB, at its edge, declared or counted, before any database call;
//   - E5.1's recipe (docs/work-specs/playout-api-mapping/spec.md, AC-2, AC-4): each v1 operation,
//     every bound at its edge, the holds (an invalid recipe, payload, number, date or row), a later
//     version read-only, and a source with no recipe projecting exactly as before.
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
    // One path segment: `e1` must not be able to write the paths of `e1.x`.
    assert.equal(ext.readExternalRegistration({ ...entry(good), id: 'e1.x' }).ok, false);
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
      report({ sourceId: 'e1.x' }, { sourceId: 'e1.x' }),
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

// ── E5.1: the versioned recipe (docs/work-specs/playout-api-mapping/spec.md, AC-2, AC-4) ──────

const NBSP = ' ';
const recipe = (outputs, over = {}) => ({ v: 1, sourceId: 'e1', configRevision: 2, outputs, ...over });
const mapped = (payload, bindings, mapping, { fields = {}, lists, configRevision = 2 } = {}) =>
  mapping_.projectSource({ sourceId: 'e1', payload, bindings, fieldsOf: (g) => fields[g] ?? null, lists, mapping, configRevision });
const mapping_ = mapping;
const results = () => ({
  updated: '2026-10-24T18:30:00Z',
  counted: 87.5,
  final: false,
  note: '',
  parties: [
    { party_id: 'KOK', region: 'Uusimaa', votes: 225000, share: 20.8, seats: 48, leader: 'Orpo' },
    { party_id: 'SDP', region: 'Uusimaa', votes: 215000, share: 19.9, seats: 43, leader: null },
    { party_id: 'PS', region: 'Pirkanmaa', votes: 215000, share: 19.9, seats: 46 },
    { party_id: 'KESK', region: 'Uusimaa', votes: 0, share: 0, seats: 0, leader: 'Kaikkonen' },
  ],
});
const ticker = { Ticker: { f0: 'external.e1.board' } };
const lines = { board: 'lines' };
const list = (over) => ({ board: { from: 'parties', id: 'party_id', columns: [{ from: 'party_id' }, { from: 'votes' }], ...over } });
const board = (over, payload = results(), opts = {}) => mapped(payload, ticker, recipe(list(over)), { lists: lines, ...opts });
const written = (out) => out.writes['external.e1.board'];

describe('a recipe: each v1 operation', () => {
  test('select and project columns, in the order the recipe names them', () => {
    assert.equal(written(board({})), 'KOK\t225000\nSDP\t215000\nPS\t215000\nKESK\t0');
    assert.equal(written(board({ columns: [{ from: 'votes' }, { from: 'party_id' }] })), '225000\tKOK\n215000\tSDP\n215000\tPS\n0\tKESK');
  });

  test('filter by one typed equality: 0 is not "0", and false is a value', () => {
    assert.equal(written(board({ where: { path: 'region', equals: 'Uusimaa' } })), 'KOK\t225000\nSDP\t215000\nKESK\t0');
    assert.equal(written(board({ where: { path: 'votes', equals: 0 } })), 'KESK\t0');
    assert.equal(written(board({ where: { path: 'votes', equals: '0' } })), '', 'no string coercion: nothing matches, and an empty list clears');
    const flags = { parties: [{ party_id: 'A', out: false }, { party_id: 'B', out: true }] };
    assert.equal(written(board({ where: { path: 'out', equals: false }, columns: [{ from: 'party_id' }] }, flags)), 'A');
  });

  test('a stable sort, either way, ties broken by the id ascending; a reordered collection reads the same', () => {
    const desc = { sort: { by: 'votes', order: 'desc' } };
    assert.equal(written(board(desc)), 'KOK\t225000\nPS\t215000\nSDP\t215000\nKESK\t0');
    assert.equal(written(board({ sort: { by: 'votes', order: 'asc' } })), 'KESK\t0\nPS\t215000\nSDP\t215000\nKOK\t225000');
    assert.equal(written(board({ sort: { by: 'party_id', order: 'desc' } })), 'SDP\t215000\nPS\t215000\nKOK\t225000\nKESK\t0');
    const reordered = results();
    reordered.parties.reverse();
    assert.equal(written(board(desc, reordered)), written(board(desc)));
    // Numeric ids order as numbers, not as text.
    const numeric = { parties: [{ party_id: 10, v: 1 }, { party_id: 9, v: 1 }, { party_id: 100, v: 1 }] };
    assert.equal(written(board({ sort: { by: 'v', order: 'desc' }, columns: [{ from: 'party_id' }] }, numeric)), '9\n10\n100');
  });

  test('limit rows, after the filter and the sort', () => {
    assert.equal(written(board({ sort: { by: 'votes', order: 'desc' }, limit: 2 })), 'KOK\t225000\nPS\t215000');
    assert.equal(written(board({ where: { path: 'region', equals: 'Pirkanmaa' }, limit: 2 })), 'PS\t215000');
  });

  test('format finite numbers in an explicit locale with fixed decimals', () => {
    const fi = { kind: 'number', locale: 'fi-FI', decimals: 1 };
    assert.equal(written(board({ columns: [{ from: 'party_id' }, { from: 'share', format: fi }], limit: 2 })), 'KOK\t20,8\nSDP\t19,9');
    assert.equal(written(board({ columns: [{ from: 'votes', format: { kind: 'number', locale: 'fi-FI', decimals: 0 } }], limit: 1 })), `225${NBSP}000`);
    assert.equal(written(board({ columns: [{ from: 'votes', format: { kind: 'number', locale: 'en-GB', decimals: 2 } }], limit: 1 })), '225,000.00');
  });

  test('format dates in an explicit locale and zone, whatever the machine\'s own zone', () => {
    const at = (format) => mapped(results(), { B: { f0: 'external.e1.at' } }, recipe({ at: { from: 'updated', format } })).writes['external.e1.at'];
    const cases = () => [
      at({ kind: 'date', locale: 'fi-FI', timeZone: 'Europe/Helsinki', show: 'time' }),
      at({ kind: 'date', locale: 'fi-FI', timeZone: 'Europe/Helsinki', show: 'date' }),
      at({ kind: 'date', locale: 'en-GB', timeZone: 'Europe/Helsinki', show: 'datetime' }),
      at({ kind: 'date', locale: 'en-US', timeZone: 'America/New_York', show: 'datetime' }),
      at({ kind: 'date', locale: 'en-GB', timeZone: 'UTC', show: 'time' }),
    ];
    const expected = ['21.30', '24.10.2026', '24/10/2026, 21:30', '10/24/2026, 14:30', '18:30'];
    const zone = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles']) {
        process.env.TZ = tz;
        assert.deepEqual(cases(), expected, tz);
      }
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
    // An offset and epoch milliseconds are times too.
    const utc = { kind: 'date', locale: 'en-GB', timeZone: 'UTC', show: 'datetime' };
    const one = (updated) => mapped({ updated }, { B: { f0: 'external.e1.at' } }, recipe({ at: { from: 'updated', format: utc } }));
    assert.equal(one('2026-10-24T21:30:00.5+03:00').writes['external.e1.at'], '24/10/2026, 18:30');
    assert.equal(one(Date.UTC(2026, 9, 24, 18, 30)).writes['external.e1.at'], '24/10/2026, 18:30');
  });

  test('a fallback for a missing or null value; zero, false and "" are values', () => {
    const b = { B: { f0: 'external.e1.leader', f1: 'external.e1.final', f2: 'external.e1.note', f3: 'external.e1.gone', f4: 'external.e1.seats' } };
    const r = recipe({
      leader: { from: 'parties_leader', fallback: '-' },
      final: { from: 'final', fallback: 'x' },
      note: { from: 'note', fallback: 'x' },
      gone: { from: 'nowhere' },
      seats: { from: 'nil', fallback: '0' },
    });
    const out = mapped({ ...results(), nil: null }, b, r);
    assert.deepEqual(out.writes, { 'external.e1.leader': '-', 'external.e1.final': 'false', 'external.e1.note': '', 'external.e1.seats': '0' });
    assert.deepEqual(out.missing, ['gone'], 'no fallback: a missing value keeps its last good one');
    const cells = board({ columns: [{ from: 'party_id' }, { from: 'leader', fallback: '-' }] });
    assert.equal(written(cells), 'KOK\tOrpo\nSDP\t-\nPS\t-\nKESK\tKaikkonen');
    // Zero is a value, never the fallback.
    assert.equal(written(board({ columns: [{ from: 'votes', fallback: 'n/a' }], where: { path: 'party_id', equals: 'KESK' } })), '0');
  });

  test('a fallback the destination cannot hold is not written', () => {
    const out = mapped({}, { B: { f0: 'external.e1.n' } }, recipe({ n: { from: 'n', fallback: '-' } }), { fields: { B: [number('f0')] } });
    assert.deepEqual([out.writes, out.unfit], [{}, ['n']]);
    assert.match(out.problems.n, /fields cannot all hold/);
    assert.deepEqual(mapped({}, { B: { f0: 'external.e1.n' } }, recipe({ n: { from: 'n', fallback: '0' } }), { fields: { B: [number('f0')] } }).writes, { 'external.e1.n': '0' });
  });
});

describe('a recipe holds last good and names the correction, never a valid empty', () => {
  const held = (out, leaf = 'board') => {
    assert.deepEqual(out.writes, {});
    assert.deepEqual(out.unfit, [leaf]);
    return out.problems[leaf];
  };

  test('duplicate ids, a missing id, an item that is not a record', () => {
    const dup = results();
    dup.parties.push({ party_id: 'SDP', votes: 1 });
    assert.match(held(board({}, dup)), /two items of parties share the party_id "SDP"/);
    const noId = results();
    delete noId.parties[2].party_id;
    assert.match(held(board({}, noId)), /has no party_id/);
    assert.match(held(board({}, { parties: [...results().parties, 'loose'] })), /not a record/);
    // A record identity of 1 and "1" are two ids, not one.
    assert.equal(written(board({ columns: [{ from: 'party_id' }] }, { parties: [{ party_id: 1 }, { party_id: '1' }] })), '1\n1');
  });

  test('a missing or null cell with no fallback, an object cell, a sort key of mixed kinds', () => {
    assert.match(held(board({ columns: [{ from: 'leader' }] })), /leader has no value/);
    assert.match(held(board({ columns: [{ from: 'party_id' }] }, { parties: [{ party_id: { x: 1 } }] }), 'board'), /has no party_id/);
    assert.match(held(board({ columns: [{ from: 'leader' }] }, { parties: [{ party_id: 'A', leader: ['x'] }] })), /not text, a number or true\/false/);
    const mixed = { parties: [{ party_id: 'A', v: 1 }, { party_id: 'B', v: '2' }] };
    assert.match(held(board({ sort: { by: 'v', order: 'asc' } }, mixed)), /mixes kinds/);
    assert.match(held(board({ sort: { by: 'leader', order: 'asc' } })), /no leader to sort by/);
  });

  test('an invalid number or date is refused, never coerced from text or rolled over', () => {
    const one = (value, format) => mapped({ value }, { B: { f0: 'external.e1.out' } }, recipe({ out: { from: 'value', format } }));
    const num = { kind: 'number', locale: 'en-GB', decimals: 0 };
    const date = { kind: 'date', locale: 'en-GB', timeZone: 'UTC', show: 'date' };
    for (const [value, format] of [['60', num], [true, num], ['2026-10-24T18:30:00', date], ['2026-02-30T00:00Z', date], ['2026-10-24T24:00Z', date], ['24.10.2026', date], ['2026-10-24T18:30+15:00', date], [false, date]]) {
      const out = one(value, format);
      assert.deepEqual([out.writes, out.unfit], [{}, ['out']], JSON.stringify(value));
    }
    assert.match(one('60', num).problems.out, /not a number/);
    assert.match(one('2026-10-24T18:30:00', date).problems.out, /not a time with its zone/);
  });

  test('a payload that is not an object holds every recipe leaf', () => {
    for (const payload of ['text', [1, 2], null, 7]) assert.match(held(board({}, payload)), /payload is not a JSON object/);
    assert.match(held(board({}, { parties: { a: 1 } })), /parties is not a list/);
    assert.deepEqual(board({}, { other: 1 }).missing, ['board']);
  });

  test('the destination schema: every row must fit its native list, and the leaf needs one', () => {
    const three = list({ columns: [{ from: 'party_id' }, { from: 'votes' }, { from: 'seats' }] });
    assert.match(held(mapped(results(), ticker, recipe(three), { lists: lines })), /row 1: Only the first two cells are used/);
    const slots = { slots: [{ id: 1, time: '20:00', title: 'News' }, { id: 2, time: '21:00', title: '' }] };
    const schedule = recipe({ board: { from: 'slots', id: 'id', columns: [{ from: 'time' }, { from: 'title' }] } });
    assert.match(held(mapped(slots, ticker, schedule, { lists: { board: 'schedule' } })), /row 2: Needs a time and a programme/);
    slots.slots.pop();
    assert.equal(written(mapped(slots, ticker, schedule, { lists: { board: 'schedule' } })), '20:00 | News');
    assert.match(held(mapped(results(), ticker, recipe(list({})))), /no list adapter/);
  });

  test('a genuinely empty list clears the native list through its adapter', () => {
    for (const adapter of ['lines', 'schedule', 'credits']) {
      assert.deepEqual(mapped({ parties: [] }, ticker, recipe(list({})), { lists: { board: adapter } }).writes, { 'external.e1.board': '' }, adapter);
    }
  });

  test('an invalid recipe evaluates nothing: every bound leaf of the source holds, identity ones too', () => {
    const both = { ...ticker, Board: { f0: 'external.e1.counted' } };
    const good = list({});
    const invalid = [
      ['not a recipe', 'nonsense'],
      ['no version', { ...recipe(good), v: undefined }],
      ['version 0', { ...recipe(good), v: 0 }],
      ['an unknown key', { ...recipe(good), expression: 'x' }],
      ['another source', recipe(good, { sourceId: 'e2' })],
      ['an older config revision', recipe(good, { configRevision: 1 })],
      ['no outputs', recipe({})],
      ['an arbitrary operator', recipe(list({ map: 'x => x' }))],
      ['two predicates', recipe(list({ where: [{ path: 'a', equals: 1 }, { path: 'b', equals: 2 }] }))],
      ['a predicate with an operator', recipe(list({ where: { path: 'votes', gt: 1 } }))],
      ['a filter on an object', recipe(list({ where: { path: 'votes', equals: { $gt: 1 } } }))],
      ['a sort with no id', recipe({ board: { from: 'parties', sort: { by: 'votes', order: 'desc' }, columns: [{ from: 'party_id' }] } })],
      ['two sort keys', recipe(list({ sort: [{ by: 'votes', order: 'desc' }, { by: 'seats', order: 'desc' }] }))],
      ['a sort order', recipe(list({ sort: { by: 'votes', order: 'random' } }))],
      ['a general path', recipe(list({ from: '$.parties[*]' }))],
      ['a column that is not a value', recipe(list({ columns: ['party_id'] }))],
      ['a currency format', recipe(list({ columns: [{ from: 'votes', format: { kind: 'currency', locale: 'fi-FI' } }] }))],
      ['a format with no locale', recipe(list({ columns: [{ from: 'votes', format: { kind: 'number', decimals: 0 } }] }))],
      ['a locale this build cannot format', recipe(list({ columns: [{ from: 'votes', format: { kind: 'number', locale: 'xx-XX', decimals: 0 } }] }))],
      ['a date with no zone', recipe({ at: { from: 'updated', format: { kind: 'date', locale: 'fi-FI', show: 'time' } } })],
      ['an unknown zone', recipe({ at: { from: 'updated', format: { kind: 'date', locale: 'fi-FI', timeZone: 'Mars/Olympus', show: 'time' } } })],
      ['an unknown show', recipe({ at: { from: 'updated', format: { kind: 'date', locale: 'fi-FI', timeZone: 'UTC', show: 'week' } } })],
      ['a fallback that is not text', recipe({ at: { from: 'updated', fallback: 0 } })],
    ];
    for (const [name, r] of invalid) {
      const out = mapped({ ...results(), counted: 87.5 }, both, r, { lists: lines });
      assert.deepEqual([out.writes, out.unfit.sort(), out.held?.readOnly], [{}, ['board', 'counted'], false], name);
      assert.ok(out.held.error.length > 0, name);
    }
    // A prototype key is a valid name that never reaches the prototype: the value is missing.
    assert.deepEqual(mapped(results(), ticker, recipe(list({ from: 'constructor.prototype' })), { lists: lines }).missing, ['board']);
    // The correction names what to fix.
    assert.match(mapped(results(), both, recipe(good, { configRevision: 1 }), { lists: lines }).held.error, /config revision 1, not 2/);
  });
});

describe('a recipe\'s bounds, each at its edge', () => {
  const valid = (r) => mapping.readSourceRecipe(r, 'e1', 2).status;
  const many = (n) => Array.from({ length: n }, (_, i) => ({ party_id: `P${i}`, votes: i }));

  test('a row limit from 1 to 500', () => {
    const rows = (limit) => written(board({ limit }, { parties: many(600) }))?.split('\n').length;
    assert.deepEqual([rows(1), rows(500)], [1, 500]);
    for (const limit of [0, 501, 1.5, '2']) assert.equal(valid(recipe(list({ limit }))), 'invalid', String(limit));
    assert.equal(written(board({}, { parties: many(600) })).split('\n').length, 600, 'no limit: every row');
  });

  test('1 to 8 columns', () => {
    const cols = (n) => Array.from({ length: n }, () => ({ from: 'party_id' }));
    const out = mapped({ parties: [{ party_id: 'A' }] }, ticker, recipe(list({ columns: cols(8) })), { lists: { board: 'credits' } });
    assert.equal(written(out), 'A | A A A A A A A');
    assert.equal(valid(recipe(list({ columns: cols(9) }))), 'invalid');
    assert.equal(valid(recipe(list({ columns: [] }))), 'invalid');
  });

  test('a path of at most 8 keys, read along that path only', () => {
    const path = (n) => Array.from({ length: n }, () => 'd').join('.');
    let deep = 'end';
    for (let i = 0; i < 100_000; i += 1) deep = { d: deep };
    const at = mapped({ deep: { d: { d: { d: { d: { d: { d: { d: 'x' } } } } } } } }, { B: { f0: 'external.e1.v' } }, recipe({ v: { from: `deep.${path(7)}` } }));
    assert.deepEqual(at.writes, { 'external.e1.v': 'x' });
    assert.equal(valid(recipe({ v: { from: `deep.${path(8)}` } })), 'invalid');
    assert.equal(valid(recipe({ [`a.${path(7)}`]: { from: 'a' } })), 'ok');
    assert.equal(valid(recipe({ [`a.${path(8)}`]: { from: 'a' } })), 'invalid');
    const walked = mapped({ deep }, { B: { f0: 'external.e1.v' } }, recipe({ v: { from: `deep.${path(7)}` } }));
    assert.deepEqual(walked.unfit, ['v'], 'an object is not a value, however deep the rest goes');
  });

  test('0 to 6 decimals', () => {
    const fmt = (decimals) => recipe({ v: { from: 'v', format: { kind: 'number', locale: 'en-GB', decimals } } });
    assert.equal(mapped({ v: 1 / 3 }, { B: { f0: 'external.e1.v' } }, fmt(6)).writes['external.e1.v'], '0.333333');
    assert.equal(mapped({ v: 2.5 }, { B: { f0: 'external.e1.v' } }, fmt(0)).writes['external.e1.v'], '3');
    for (const d of [7, -1, 0.5]) assert.equal(valid(fmt(d)), 'invalid', String(d));
  });

  test('1 to 32 outputs', () => {
    const outputs = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`o${i}`, { from: 'v' }]));
    assert.equal(valid(recipe(outputs(32))), 'ok');
    assert.equal(valid(recipe(outputs(33))), 'invalid');
  });

  test('a fallback and a filter text of at most 200 characters', () => {
    assert.equal(mapped({}, { B: { f0: 'external.e1.v' } }, recipe({ v: { from: 'v', fallback: 'x'.repeat(200) } })).writes['external.e1.v'].length, 200);
    assert.equal(valid(recipe({ v: { from: 'v', fallback: 'x'.repeat(201) } })), 'invalid');
    assert.equal(written(board({ where: { path: 'party_id', equals: 'P'.repeat(200) } })), '');
    assert.equal(valid(recipe(list({ where: { path: 'party_id', equals: 'P'.repeat(201) } }))), 'invalid');
  });

  test('a 30 000-item collection filtered, sorted, limited and formatted in well under a second', () => {
    const items = Array.from({ length: 30_000 }, (_, i) => ({ party_id: `P${i}`, region: i % 2 ? 'A' : 'B', votes: i % 97, share: i / 7 }));
    const at = Date.now();
    const out = board(
      { where: { path: 'region', equals: 'A' }, sort: { by: 'votes', order: 'desc' }, limit: 500, columns: [{ from: 'party_id' }, { from: 'share', format: { kind: 'number', locale: 'fi-FI', decimals: 2 } }] },
      { parties: items },
    );
    assert.ok(Date.now() - at < 1000, `took ${Date.now() - at} ms`);
    const rows = written(out).split('\n');
    assert.equal(rows.length, 500);
    // votes 96 first (odd i with i % 97 = 96), ties by id ascending as text.
    assert.equal(rows[0].split('\t')[0], [...items].filter((x) => x.region === 'A' && x.votes === 96).map((x) => x.party_id).sort()[0]);
    const unsorted = Array.from({ length: 30_000 }, (_, i) => ({ party_id: i, v: 'x'.repeat(8) }));
    const t = Date.now();
    assert.equal(written(board({ sort: { by: 'v', order: 'asc' }, limit: 1, columns: [{ from: 'party_id' }] }, { parties: unsorted })), '0');
    assert.ok(Date.now() - t < 1000, `all ties took ${Date.now() - t} ms`);
  });
});

describe('a recipe beside the identity projection, and no other path', () => {
  test('a source with no recipe projects as before; a recipe leaves the leaves it does not name alone', () => {
    const b = { ...ticker, Board: { f0: 'external.e1.counted', f1: 'external.e1.final' } };
    const plain = mapped(results(), b, undefined, { lists: { board: 'lines' } });
    assert.deepEqual([plain.provenance, plain.held, plain.problems], [{ sourceId: 'e1', recipe: null }, undefined, {}]);
    const withRecipe = mapped(results(), b, recipe(list({ limit: 1 })), { lists: lines });
    assert.deepEqual(withRecipe.writes, { 'external.e1.board': 'KOK\t225000', 'external.e1.counted': '87.5', 'external.e1.final': 'false' });
    assert.deepEqual(withRecipe.provenance, { sourceId: 'e1', recipe: { v: 1, configRevision: 2 } }, 'the data names its source and mapping');
  });

  test('a later recipe version is held read-only: nothing is evaluated, not even in part', () => {
    const later = { v: 2, sourceId: 'e1', configRevision: 2, outputs: { board: { from: 'parties', select: 'keyed' } } };
    const out = mapped(results(), { ...ticker, Board: { f0: 'external.e1.counted' } }, later, { lists: lines });
    assert.deepEqual([out.writes, out.unfit.sort(), out.held.readOnly], [{}, ['board', 'counted'], true]);
    assert.match(out.held.error, /version 2.*held read-only/);
    assert.deepEqual(mapping.readSourceRecipe(later, 'e1', 2), { status: 'read-only', version: 2 });
  });

  test('a recipe writes only this source\'s bound paths: no command, no other source, no unbound output', () => {
    const r = recipe({ board: list({}).board, take: { from: 'counted' }, 'e2.x': { from: 'counted' } });
    const out = mapped(results(), { ...ticker, Other: { f0: 'external.e2.x' } }, r, { lists: lines });
    assert.deepEqual(Object.keys(out.writes), ['external.e1.board']);
    assert.deepEqual(Object.keys(out).sort(), ['missing', 'problems', 'provenance', 'unfit', 'writes']);
  });

  test('a recipe holds no credential: a key it does not define is refused, and a copied recipe needs its source rebound', () => {
    for (const extra of [{ headers: { authorization: 'Bearer x' } }, { token: 'x' }, { endpoint: 'https://x.example' }]) {
      assert.equal(mapping.readSourceRecipe({ ...recipe(list({})), ...extra }, 'e1', 2).status, 'invalid', Object.keys(extra)[0]);
      assert.equal(mapping.readSourceRecipe(recipe({ board: { ...list({}).board, ...extra } }), 'e1', 2).status, 'invalid');
    }
    assert.match(mapping.readSourceRecipe(recipe(list({})), 'e9', 2).error, /another source/);
  });

  test('the registration carries the recipe as stored to the evaluator', () => {
    const config = { v: 1, configRevision: 2, endpoint: 'https://results.example/r', lists: lines, mapping: recipe(list({})) };
    const read = ext.readExternalRegistration({ id: 'e1', kind: 'external', label: 'Results', config });
    assert.deepEqual(read.registration.mapping, config.mapping);
    const { registration } = read;
    const out = mapping.projectSource({ sourceId: 'e1', payload: results(), bindings: ticker, fieldsOf: () => null, lists: registration.lists, mapping: registration.mapping, configRevision: registration.configRevision });
    assert.equal(written(out), 'KOK\t225000\nSDP\t215000\nPS\t215000\nKESK\t0');
    const route = readFileSync(new URL('../api/data/[...path].ts', import.meta.url), 'utf8');
    assert.match(route, /mapping: registration\.ok \? registration\.registration\.mapping/);
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
