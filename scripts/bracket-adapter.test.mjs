// guards: src/control/bracketAdapter.ts, src/control/jsonSource.ts, src/control/sheetSource.ts, src/control/externalSource.ts, src/control/connectorReview.ts
//
// THE BRACKET ADAPTER AND THE CURRENT MATCH (docs/work-specs/obs-scenes/spec.md, OS5b; AC-10,
// rules B1 to B15), in Node against the real modules. Every fixture is synthetic: invented field
// names, players and ids, so no site's words reach the product.
//
// What is pinned: both row shapes give the same ordered result with stable match ids; an unknown
// score is null and "—" in tie lines, and empty text on a field; missing, empty, unnumbered and
// duplicated rows are reported, never guessed; the field mapping is the source's setting, judged,
// and kept by the review only beside "Read by NoaCG"; the current match follows the operator's pick
// only, holds its last values with `held` true when its match disappears or changes players,
// against a small model of the rule; the memory travels with the snapshot, and the server tick
// never moves `current`.

import assert from 'node:assert/strict';
import test from 'node:test';
import './lib/tsResolve.mjs';

const { adaptBracket, readSourceAdapter, resolveCurrent, tieKey, tieLine, scoreOf, statusOf, CURRENT_MEMORY_KEY, forFields } = await import('../src/control/bracketAdapter.ts');
const { projectJson } = await import('../src/control/jsonSource.ts');
const { nextReadState, initialStatus } = await import('../src/control/sheetSource.ts');
const { readExternalRegistration } = await import('../src/control/externalSource.ts');
const { connectorPlan } = await import('../src/control/connectorReview.ts');

/** The mapping a source would hold for the synthetic feed below. */
const FIELDS = {
  bracket: 'grp',
  bracketTitle: 'grpName',
  stage: 'phase',
  round: 'rnd',
  roundName: 'rndName',
  match: 'key',
  status: 'state',
  aName: 'home.who',
  aRace: 'home.kind',
  aSeed: 'home.rank',
  aScore: 'home.pts',
  aLeague: 'home.tier',
  bName: 'away.who',
  bRace: 'away.kind',
  bSeed: 'away.rank',
  bScore: 'away.pts',
  bLeague: 'away.tier',
};
const ADAPTER = { v: 1, name: 'bracket', rows: 'data.rows', fields: FIELDS };
const adapter = () => readSourceAdapter(ADAPTER).adapter;

const side = (who, kind, rank, pts, tier = 'Gold') => ({ who, kind, rank, pts, tier });
const row = (key, rnd, rndName, home, away, state = 'done', grp = 'G-1', phase = 'P1') => ({ grp, grpName: 'Main event', phase, rnd, rndName, key, state, home, away });

/** Eight players, a quarter-final round, a semi with one score unknown, a final not yet played. */
const ROWS = () => [
  row('m1', 'qf', 'Quarter-finals', side('Aster', 'X', 1, 3), side('Birch', 'Y', 8, 1)),
  row('m2', 'qf', 'Quarter-finals', side('Cedar', 'Z', 4, '2'), side('Dahl', 'X', 5, 3)),
  row('m3', 'sf', 'Semi-finals', side('Aster', 'X', 1, 2), side('Dahl', 'X', 5, null), 'LIVE'),
  row('m4', 'f', 'Final', side('', null, null, ''), side(null, null, null, undefined), 'pending'),
];
const asList = (rows) => ({ data: { rows } });
const asObject = (rows, first = 1) => ({ data: { rows: Object.fromEntries(rows.map((r, i) => [String(first + i), r])) } });

test('the field mapping is the source’s setting, judged: unknown keys, bad paths, another name or no names are refused; a later version is read-only', () => {
  assert.equal(readSourceAdapter(undefined).status, 'none');
  assert.equal(readSourceAdapter(ADAPTER).status, 'ok');
  assert.equal(readSourceAdapter({ ...ADAPTER, rows: '' }).status, 'ok');
  assert.match(readSourceAdapter({ ...ADAPTER, fields: { ...FIELDS, winner: 'w' } }).error, /unknown field winner/);
  assert.match(readSourceAdapter({ ...ADAPTER, fields: { ...FIELDS, aScore: 'a..b' } }).error, /dotted path/);
  assert.match(readSourceAdapter({ ...ADAPTER, name: 'league' }).error, /only adapter is bracket/);
  assert.match(readSourceAdapter({ ...ADAPTER, fields: { aName: 'x' } }).error, /both players/);
  assert.match(readSourceAdapter({ ...ADAPTER, extra: 1 }).error, /unknown key extra/);
  assert.deepEqual(readSourceAdapter({ ...ADAPTER, v: 2 }), { status: 'read-only', version: 2 });
  // The registration keeps it as stored, beside read.
  const reg = readExternalRegistration({ id: 'b1', kind: 'external', config: { v: 1, configRevision: 1, endpoint: 'https://x.example/b.json', read: { everyMs: 10_000 }, adapter: ADAPTER } });
  assert.deepEqual(reg.registration.adapter, ADAPTER);
});

test('both row shapes give the same ordered result with stable match ids', () => {
  const list = adaptBracket(asList(ROWS()), adapter());
  const keyed = adaptBracket(asObject(ROWS()), adapter());
  const zero = adaptBracket(asObject(ROWS(), 0), adapter());
  assert.deepEqual(keyed.output, list.output);
  assert.deepEqual(zero.output, list.output);
  assert.deepEqual(list.report, []);
  const b = list.output.brackets['_0'];
  assert.equal(b.id, 'G-1');
  assert.equal(b.title, 'Main event');
  const rounds = b.stages['_0'].rounds;
  assert.deepEqual(Object.values(rounds).map((r) => r.name), ['Quarter-finals', 'Semi-finals', 'Final']);
  assert.deepEqual(Object.values(rounds).flatMap((r) => Object.values(r.matches).map((m) => m.id)), ['m1', 'm2', 'm3', 'm4']);
  assert.deepEqual(rounds['_0'].matches['_1'], { id: 'm2', status: 'done', a: { name: 'Cedar', race: 'Z', seed: 4, score: 2 }, b: { name: 'Dahl', race: 'X', seed: 5, score: 3 } });
  assert.equal(rounds['_1'].matches['_0'].status, 'live');
  assert.deepEqual(list.matches.map((m) => m.id), ['m1', 'm2', 'm3', 'm4']);
  // Without a match field, ids are the grouping and the place in the round: the same in both shapes.
  const noId = { ...ADAPTER, fields: { ...FIELDS, match: undefined } };
  delete noId.fields.match;
  const a = adaptBracket(asList(ROWS()), readSourceAdapter(noId).adapter);
  const o = adaptBracket(asObject(ROWS()), readSourceAdapter(noId).adapter);
  assert.deepEqual(a.output, o.output);
  assert.deepEqual(a.matches.map((m) => m.id), ['G-1:P1:qf:1', 'G-1:P1:qf:2', 'G-1:P1:sf:1', 'G-1:P1:f:1']);
});

test('an unknown score is null, never zero; "—" in the tie line; empty text on a field; no winner is inferred', () => {
  assert.equal(scoreOf(0), 0);
  assert.equal(scoreOf('0'), 0);
  for (const v of [null, undefined, '', ' ', 'W', '1-0', NaN, Infinity, true]) assert.equal(scoreOf(v), null, String(v));
  assert.equal(statusOf(' Done '), 'done');
  assert.equal(statusOf('finished'), 'unknown');
  const { output } = adaptBracket(asList(ROWS()), adapter());
  const sf = output.brackets['_0'].stages['_0'].rounds['_1'].matches['_0'];
  assert.equal(sf.b.score, null);
  const final = output.brackets['_0'].stages['_0'].rounds['_2'].matches['_0'];
  assert.deepEqual(final.a, { name: null, race: null, seed: null, score: null });
  assert.equal(output.ties['G-1'], ['Quarter-finals | Aster 3 | Birch 1', 'Quarter-finals | Cedar 2 | Dahl 3', 'Semi-finals | Aster 2 | Dahl —', 'Final | — | —'].join('\n'));
  assert.equal(forFields(output).brackets['_0'].stages['_0'].rounds['_1'].matches['_0'].b.score, '');
  assert.equal(tieLine('R|1', { a: { name: 'A\nB', score: 1 }, b: { name: 'C', score: null } }), 'R 1 | A B 1 | C —');
  assert.equal(tieKey('Group A / 1', 0), 'Group-A-1');
  assert.equal(tieKey('!!', 3), '_3');
  assert.equal(tieKey('12', 0), '_12');
});

test('missing, empty, unnumbered and duplicated rows are reported, never guessed', () => {
  const rows = ROWS();
  const keyed = { data: { rows: { 1: rows[0], 2: rows[1], 4: rows[2], 5: 'x', note: rows[3] } } };
  const r = adaptBracket(keyed, adapter());
  assert.deepEqual(r.report, ['row “note” has no row number, so it is left out', 'row 3 is missing', 'row 5 is empty']);
  assert.deepEqual(r.matches.map((m) => m.id), ['m1', 'm2', 'm3']);
  // Far-apart or unsafe row numbers: one line per gap, never one per number.
  const far = adaptBracket({ data: { rows: { 1: rows[0], 3: rows[1], 1000000000: rows[2], '9007199254740993': rows[3] } } }, adapter());
  assert.deepEqual(far.report, ['row “9007199254740993” has no row number, so it is left out', 'row 2 is missing', 'rows 4 to 999999999 are missing']);
  const list = adaptBracket(asList([rows[0], null, rows[1]]), adapter());
  assert.deepEqual(list.report, ['row 2 is empty']);
  // An empty grouping or match id: left out, said.
  const noKey = adaptBracket(asList([rows[0], { ...rows[1], key: '' }, { ...rows[2], rnd: ' ' }]), adapter());
  assert.deepEqual(noKey.report, ['row 2 has no match id, so it is left out', 'row 3 has no round, so it is left out']);
  // The same row twice: left out, said.
  const same = adaptBracket(asList([rows[0], rows[1], structuredClone(rows[0])]), adapter());
  assert.deepEqual(same.report, ['row 3 repeats match m1, so it is left out']);
  assert.equal(Object.keys(same.output.brackets['_0'].stages['_0'].rounds['_0'].matches).length, 2);
  // Two rows that disagree about one match: it keeps its values, its slot stays, its ties hold.
  const clash = adaptBracket(asList([rows[0], rows[1], rows[2], { ...rows[0], home: side('Aster', 'X', 1, 4) }]), adapter());
  assert.deepEqual(clash.report, ['row 1 and row 4 both give match m1 with other values, so it keeps its values']);
  const qf = clash.output.brackets['_0'].stages['_0'].rounds['_0'].matches;
  assert.deepEqual(qf['_0'], { id: 'm1' });
  assert.equal(qf['_1'].id, 'm2');
  assert.equal('G-1' in clash.output.ties, false);
  // Rows not where the mapping says: the whole read holds.
  assert.deepEqual(adaptBracket({ other: [] }, adapter()), { problem: 'data.rows is not in the JSON' });
  assert.deepEqual(adaptBracket({ data: { rows: 3 } }, adapter()), { problem: 'data.rows holds no rows' });
});

test('players: each named side once, in first appearance; two values for one player are null and said', () => {
  const { output, report } = adaptBracket(asList(ROWS()), adapter());
  assert.deepEqual(Object.values(output.players).map((p) => p.name), ['Aster', 'Birch', 'Cedar', 'Dahl']);
  assert.deepEqual(output.players['_0'], { name: 'Aster', race: 'X', seed: 1, league: 'Gold' });
  assert.deepEqual(report, []);
  const two = adaptBracket(asList([...ROWS(), row('m5', 'x', 'Extra', side('Birch', 'Q', 8, 1), side('Cedar', 'Z', 4, 0))]), adapter());
  assert.equal(two.output.players['_1'].race, null);
  assert.deepEqual(two.report, ['Birch has two values for race, so it is left empty']);
});

test('one bracket per group, ties keyed by a path-safe id; a second bracket with the same key has no tie lines, said', () => {
  const rows = [row('a1', 'r1', 'R1', side('A', 'X', 1, 1), side('B', 'X', 2, 0), 'done', 'Group A'), row('b1', 'r1', 'R1', side('C', 'X', 1, 1), side('D', 'X', 2, 0), 'done', 'Group-A')];
  const r = adaptBracket(asList(rows), adapter());
  assert.deepEqual(Object.keys(r.output.ties), ['Group-A']);
  assert.equal(r.output.ties['Group-A'], 'R1 | A 1 | B 0');
  assert.deepEqual(r.report, ['bracket Group-A has the same tie key as another, so it has no tie lines']);
});

// ── The current match ────────────────────────────────────────────────────────

/**
 * The model, from B12 alone: what the operator sees on a `current` field after each read, given
 * the pick and the feed's match. `shown` changes only on a new pick that is found, or on a read of
 * the same pick whose remembered players still stand.
 */
function model() {
  let resolved = null; // { id, a, b } the pick last resolved
  let shown = null;
  let held = null;
  return {
    read(pick, match) {
      if (pick === null) {
        resolved = null;
        return { shown, held };
      }
      const known = (was, now) => was === null || was === now;
      if (!match) {
        if (!resolved || resolved.id !== pick) resolved = { id: pick, a: null, b: null };
        held = true;
        return { shown, held };
      }
      if (resolved && resolved.id === pick && !(known(resolved.a, match.a) && known(resolved.b, match.b))) {
        held = true;
        return { shown, held };
      }
      resolved = resolved && resolved.id === pick ? { id: pick, a: resolved.a ?? match.a, b: resolved.b ?? match.b } : { id: pick, a: match.a, b: match.b };
      shown = `${match.a}-${match.b}:${match.score}`;
      held = false;
      return { shown, held };
    },
  };
}

test('the current match follows the operator’s pick only, and holds with held true when its match is gone or changes players (against the model)', () => {
  const steps = [
    // [pick, the feed's match for that pick: names and score, or null when gone]
    ['m1', { a: 'Aster', b: 'Birch', score: 1 }],
    ['m1', { a: 'Aster', b: 'Birch', score: 2 }], // a read moves the score
    ['m1', null], // gone: held, last values kept
    ['m1', { a: 'Aster', b: 'Birch', score: 3 }], // back: follows again
    ['m1', { a: 'Aster', b: 'Elm', score: 3 }], // other players: held
    ['m1', { a: 'Aster', b: 'Elm', score: 4 }], // still held: a read never moves it
    ['m2', { a: 'Cedar', b: 'Dahl', score: 0 }], // the operator picks another: moves
    ['m4', { a: null, b: null, score: 0 }], // a final with no players yet
    ['m4', { a: 'Aster', b: null, score: 0 }], // a slot filled later is not a change
    ['m4', { a: 'Aster', b: 'Dahl', score: 1 }],
    ['m4', { a: 'Cedar', b: 'Dahl', score: 1 }], // a filled slot then changing is
    ['m9', null], // a pick not in the feed: held
    [null, null], // no pick: nothing written
    ['m2', { a: 'Cedar', b: 'Dahl', score: 5 }],
  ];
  const m = model();
  let memory = null;
  let shown = null;
  let held = null;
  for (const [i, [pick, match]] of steps.entries()) {
    const r = resolveCurrent(pick, memory, (id) =>
      match && id === pick ? { round: 'R', match: { id, status: 'live', a: { name: match.a, race: null, seed: null, score: match.score }, b: { name: match.b, race: null, seed: null, score: 0 } } } : null,
    );
    memory = r.memory;
    if (r.current && r.current.held === false) shown = `${r.current.a.name}-${r.current.b.name}:${r.current.a.score}`;
    if (r.current) held = r.current.held;
    assert.deepEqual({ shown, held }, m.read(pick, match), `step ${i}: ${JSON.stringify([pick, match])}`);
    if (pick === null) assert.equal(r.current, null);
  }
});

// ── Through the reader: the snapshot, the page and the tick ──────────────────

const PREFIX = 'external.b1';
const FIELD_LIST = {
  Card: [
    { key: 'f0', label: 'Player A', kind: 'text', defaultValue: '' },
    { key: 'f1', label: 'Score A', kind: 'text', defaultValue: '' },
    { key: 'f2', label: 'Player B', kind: 'text', defaultValue: '' },
    { key: 'f3', label: 'Held', kind: 'text', defaultValue: '' },
    { key: 'f4', label: 'Pick', kind: 'text', defaultValue: '' },
  ],
  Board: [{ key: 'f1', label: 'Ties', kind: 'text', defaultValue: '' }],
};
const BINDINGS = {
  Card: { f0: `${PREFIX}.current.a.name`, f1: `${PREFIX}.current.a.score`, f2: `${PREFIX}.current.b.name`, f3: `${PREFIX}.current.held`, f4: `${PREFIX}.currentMatchId` },
  Board: { f1: `${PREFIX}.ties.G-1` },
};
const connected = new Set(Object.values(BINDINGS).flatMap((f) => Object.values(f)));
const registration = readExternalRegistration({ id: 'b1', kind: 'external', config: { v: 1, configRevision: 1, endpoint: 'https://x.example/b.json', read: { everyMs: 10_000 }, adapter: ADAPTER } });

/** One read through the shared reader state, as the page (with the pick) or the tick (without). */
function readOnce(held, payload, pick) {
  const project = (p, previous) =>
    projectJson({ sourceId: 'b1', payload: p, bindings: BINDINGS, fieldsOf: (g) => FIELD_LIST[g] ?? null, registration, ...(pick === undefined ? {} : { current: { pick, previous } }) });
  return nextReadState(held, { ok: true, payload }, { sourceId: 'b1', shape: 'values', connected, project }, 1_000, pick === undefined ? 'server' : 'this');
}

test('through the reader: current is written on a pick, held with its last values, its memory kept with the snapshot, and the tick never moves it', () => {
  let held = { snapshot: {}, content: null, status: initialStatus('this') };
  // No pick yet: brackets and ties are written, nothing under current, no pick reported missing.
  let r = readOnce(held, asList(ROWS()), '');
  assert.deepEqual(Object.keys(r.writes), [`${PREFIX}.ties.G-1`]);
  assert.deepEqual(r.next.status.problems, []);
  held = r.next;
  // The operator picks m3: every current value, held false, one unknown score as empty text.
  r = readOnce(held, asList(ROWS()), 'm3');
  assert.deepEqual(r.writes, { [`${PREFIX}.current.a.name`]: 'Aster', [`${PREFIX}.current.a.score`]: '2', [`${PREFIX}.current.b.name`]: 'Dahl', [`${PREFIX}.current.held`]: 'false' });
  assert.equal(JSON.parse(r.next.snapshot[CURRENT_MEMORY_KEY]).matchId, 'm3');
  held = r.next;
  // The tick reads (no pick): it changes the ties, never current, and keeps the memory.
  const later = ROWS();
  later[2].home.pts = 3;
  later[2].away.who = 'Elm';
  r = readOnce(held, asList(later), undefined);
  assert.deepEqual(Object.keys(r.writes), [`${PREFIX}.ties.G-1`]);
  assert.equal(r.next.snapshot[CURRENT_MEMORY_KEY], held.snapshot[CURRENT_MEMORY_KEY]);
  held = r.next;
  // The page reads the changed players: held true, nothing else, said on the line.
  r = readOnce(held, asList(later), 'm3');
  assert.deepEqual(r.writes, { [`${PREFIX}.current.held`]: 'true' });
  assert.deepEqual(r.next.status.problems, ['the current match is held: match m3 now has other players, so it keeps its values']);
  held = r.next;
  // The match disappears: still held, nothing more under current (the ties lose its line).
  r = readOnce(held, asList(later.slice(0, 2)), 'm3');
  assert.deepEqual(Object.keys(r.writes), [`${PREFIX}.ties.G-1`]);
  assert.match(r.next.status.problems.join(), /match m3 is not in the feed/);
  held = r.next;
  // The operator picks another: it moves (only what differs from what is shown is written).
  r = readOnce(held, asList(later.slice(0, 2)), 'm2');
  assert.deepEqual(r.writes, { [`${PREFIX}.current.a.name`]: 'Cedar', [`${PREFIX}.current.held`]: 'false' });
  assert.equal(r.next.snapshot[`${PREFIX}.current.b.name`], 'Dahl');
  held = r.next;
  // The pick cleared: nothing under current written, the memory forgets the match.
  r = readOnce(held, asList(later.slice(0, 2)), '');
  assert.deepEqual(r.writes, {});
  assert.equal(JSON.parse(r.next.snapshot[CURRENT_MEMORY_KEY]).matchId, '');
});

test('after a hold, None then the same match again takes the match as it is now, even with its paths bound', () => {
  const bound = { ...BINDINGS, Card: { ...BINDINGS.Card, f4: `${PREFIX}.current.matchId` } };
  const step = (held, payload, pick) =>
    nextReadState(held, { ok: true, payload }, { sourceId: 'b1', shape: 'values', connected: new Set(Object.values(bound).flatMap((f) => Object.values(f))), project: (p, previous) => projectJson({ sourceId: 'b1', payload: p, bindings: bound, fieldsOf: (g) => FIELD_LIST[g] ?? null, registration, current: { pick, previous } }) }, 1_000, 'this');
  let held = { snapshot: {}, content: null, status: initialStatus('this') };
  held = step(held, asList(ROWS()), 'm3').next;
  const later = ROWS();
  later[2].away.who = 'Elm';
  let r = step(held, asList(later), 'm3');
  assert.equal(r.writes[`${PREFIX}.current.held`], 'true');
  r = step(r.next, asList(later), '');
  r = step(r.next, asList(later), 'm3');
  assert.deepEqual(r.writes, { [`${PREFIX}.current.b.name`]: 'Elm', [`${PREFIX}.current.held`]: 'false' });
});

test('the picker’s matches: offered with a match id, kept through a read that cannot say, none without an adapter', () => {
  const page = (payload, previous = {}, reg = registration) => projectJson({ sourceId: 'b1', payload, bindings: BINDINGS, fieldsOf: (g) => FIELD_LIST[g] ?? null, registration: reg, current: { pick: '', previous } });
  assert.deepEqual(page(asList(ROWS())).choices.map((c) => c.label), ['Quarter-finals: Aster v Birch', 'Quarter-finals: Cedar v Dahl', 'Semi-finals: Aster v Dahl', 'Final: ? v ?']);
  assert.equal(page({ x: 1 }).choices, undefined);
  const plain = readExternalRegistration({ id: 'b1', kind: 'external', config: { v: 1, configRevision: 1, endpoint: 'https://x.example/b.json', read: { everyMs: 10_000 } } });
  assert.equal(page({ x: 1 }, {}, plain).choices, null);
  // A read that cannot say keeps the last offer on the line.
  let held = { snapshot: {}, content: null, status: initialStatus('this') };
  const project = (p, previous) => page(p, previous);
  held = nextReadState(held, { ok: true, payload: asList(ROWS()) }, { sourceId: 'b1', shape: 'values', connected, project }, 1_000, 'this').next;
  held = nextReadState(held, { ok: true, payload: { x: 1 } }, { sourceId: 'b1', shape: 'values', connected, project }, 2_000, 'this').next;
  assert.equal(held.status.choices.length, 4);
  // More matches than the picker takes: said.
  const many = Array.from({ length: 201 }, (_, i) => row(`k${i}`, 'r', 'R', side(`A${i}`, 'X', 1, 1), side(`B${i}`, 'X', 2, 0)));
  const big = page(asList(many));
  assert.equal(big.choices.length, 200);
  assert.ok(big.problems.includes('only the first 200 of 201 matches can be picked here'));
});

test('an adapter that cannot be used, or rows not where it says, hold every value and say why', () => {
  const bad = readExternalRegistration({ id: 'b1', kind: 'external', config: { v: 1, configRevision: 1, endpoint: 'https://x.example/b.json', read: { everyMs: 10_000 }, adapter: { ...ADAPTER, v: 2 } } });
  const p = projectJson({ sourceId: 'b1', payload: asList(ROWS()), bindings: BINDINGS, fieldsOf: (g) => FIELD_LIST[g] ?? null, registration: bad });
  assert.deepEqual(p.writes, {});
  assert.match(p.problems[0], /adapter is version 2/);
  const nowhere = projectJson({ sourceId: 'b1', payload: { x: 1 }, bindings: BINDINGS, fieldsOf: (g) => FIELD_LIST[g] ?? null, registration });
  assert.deepEqual(nowhere.writes, {});
  assert.match(nowhere.problems[0], /data\.rows is not in the JSON/);
  // A long report is cut to five lines and a count.
  const many = projectJson({ sourceId: 'b1', payload: { data: { rows: [1, 2, 3, 4, 5, 6, 7] } }, bindings: BINDINGS, fieldsOf: (g) => FIELD_LIST[g] ?? null, registration });
  assert.deepEqual(many.problems.slice(0, 6), ['row 1 is empty', 'row 2 is empty', 'row 3 is empty', 'row 4 is empty', 'row 5 is empty', 'and 2 more in the rows']);
});

test('the review keeps the adapter beside read, drops it with read, and never moves the config revision', () => {
  const stored = { id: 'b1', kind: 'external', label: 'Bracket', config: { v: 1, configRevision: 3, endpoint: 'https://x.example/b.json', read: { everyMs: 10_000 }, adapter: ADAPTER } };
  const base = { graphic: 'Card', bindings: {}, source: stored, rows: [], choices: {}, collections: [], adapters: {}, columns: {} };
  const kept = connectorPlan(base);
  assert.deepEqual(kept.source.config.adapter, ADAPTER);
  assert.equal(kept.source.config.configRevision, 3);
  const changed = connectorPlan({ ...base, adapter: { ...ADAPTER, rows: '' } });
  assert.equal(changed.source.config.adapter.rows, '');
  assert.equal(changed.source.config.configRevision, 3);
  const off = connectorPlan({ ...base, read: null });
  assert.equal('read' in off.source.config, false);
  assert.equal('adapter' in off.source.config, false);
  const cleared = connectorPlan({ ...base, adapter: null });
  assert.equal('adapter' in cleared.source.config, false);
});

test('Rules-first amendments: positional ids give no current match; stages prefix tie rounds; empty rows take no place', () => {
  const noId = { ...ADAPTER, fields: { ...FIELDS } };
  delete noId.fields.match;
  const r = adaptBracket(asList([ROWS()[0], null, ROWS()[1]]), readSourceAdapter(noId).adapter, { pick: 'G-1:P1:qf:1', memory: null });
  assert.equal('current' in r.output, false);
  assert.equal(r.current, undefined);
  assert.deepEqual(r.matches.map((m) => m.id), ['G-1:P1:qf:1', 'G-1:P1:qf:2']);
  assert.deepEqual(r.report, ['no match id is mapped, so matches are known by their place and there is no current match', 'row 2 is empty']);
  const two = adaptBracket(asList([row('g1', 'r1', 'Round 1', side('A', 'X', 1, 1), side('B', 'X', 2, 0), 'done', 'G-1', 'Groups'), row('p1', 'r1', 'Round 1', side('A', 'X', 1, 2), side('C', 'X', 3, 1), 'done', 'G-1', 'Playoffs')]), adapter());
  assert.equal(two.output.ties['G-1'], 'Groups Round 1 | A 1 | B 0\nPlayoffs Round 1 | A 2 | C 1');
});

test('with no memory (a fresh tree, or an older build held the lease), the bound current paths stand in for it', () => {
  const later = ROWS();
  later[2].away.who = 'Elm';
  const previous = { [`${PREFIX}.current.matchId`]: 'm3', [`${PREFIX}.current.a.name`]: 'Aster', [`${PREFIX}.current.b.name`]: 'Dahl' };
  const bound = { ...BINDINGS, Card: { ...BINDINGS.Card, f4: `${PREFIX}.current.matchId` } };
  const fields = { ...FIELD_LIST };
  const p = projectJson({ sourceId: 'b1', payload: asList(later), bindings: bound, fieldsOf: (g) => fields[g] ?? null, registration, current: { pick: 'm3', previous } });
  assert.equal(p.writes[`${PREFIX}.current.held`], 'true');
  assert.equal(p.writes[`${PREFIX}.current.b.name`], undefined);
  // Nothing to stand in: the match is adopted.
  const fresh = projectJson({ sourceId: 'b1', payload: asList(later), bindings: bound, fieldsOf: (g) => fields[g] ?? null, registration, current: { pick: 'm3', previous: {} } });
  assert.equal(fresh.writes[`${PREFIX}.current.b.name`], 'Elm');
  assert.equal(fresh.writes[`${PREFIX}.current.held`], 'false');
});

test('a pick taken on this page is new at its next read, so None then the held match recovers whatever the timing', () => {
  const later = ROWS();
  later[2].away.who = 'Elm';
  const previous = { [CURRENT_MEMORY_KEY]: JSON.stringify({ matchId: 'm3', a: 'Aster', b: 'Dahl' }) };
  const project = (fresh) => projectJson({ sourceId: 'b1', payload: asList(later), bindings: BINDINGS, fieldsOf: (g) => FIELD_LIST[g] ?? null, registration, current: { pick: 'm3', previous, fresh } });
  assert.equal(project(false).writes[`${PREFIX}.current.held`], 'true');
  const picked = project(true);
  assert.equal(picked.writes[`${PREFIX}.current.b.name`], 'Elm');
  assert.equal(picked.writes[`${PREFIX}.current.held`], 'false');
});

test('a current match two rows disagree about is held, and the line says why', () => {
  const rows = ROWS();
  const clash = asList([...rows, { ...rows[2], home: side('Aster', 'X', 1, 9) }]);
  const p = projectJson({ sourceId: 'b1', payload: clash, bindings: BINDINGS, fieldsOf: (g) => FIELD_LIST[g] ?? null, registration, current: { pick: 'm3', previous: {} } });
  assert.equal(p.writes[`${PREFIX}.current.held`], 'true');
  assert.ok(p.problems.includes('the current match is held: match m3 is given twice with other values, so it keeps its values'));
});

// ── A feed whose rows are sides, nested under a list of brackets (B17 to B20) ─────────────────

/** One side of one match: invented field names throughout. */
const sideRow = (pair, step, stepName, who, kind, pts, lane = 'upper') => ({ pair, lane, step, stepName, who, ...(kind === undefined ? {} : { kind }), pts });
/**
 * Two brackets in a list. Each holds its rows three numbered levels down; the leaves are a list in
 * one place and an object keyed by row number in another. `lane` repeats across brackets (it is a
 * side of the bracket, so it serves as the stage). The roster beside them holds every seed.
 */
const NESTED = () => ({
  cups: [
    {
      grid: {
        1: {
          1: {
            1: [sideRow('x1', 'r1', 'Round 1', 'Aster', 'X', 2), sideRow('x1', 'r1', 'Round 1', 'Birch', undefined, 1)],
            2: { 1: sideRow('x2', 'r1', 'Round 1', 'Cedar', 'Z', 0), 2: sideRow('x2', 'r1', 'Round 1', 'dahl', 'X', 2) },
          },
        },
      },
    },
    {
      grid: {
        1: { 1: { 1: [sideRow('y1', 'r1', 'Round 1', 'Elm', 'Y', null), sideRow('y1', 'r1', 'Round 1', 'Fir', 'Y', '')], 2: [sideRow('y9', 'f', 'Final', 'Elm', 'Y', null)] } },
      },
    },
  ],
  roster: {
    a: { handle: 'ASTER', kind: 'X', rank: 1 },
    b: { handle: 'birch', kind: 'Q', rank: 8 },
    c: { handle: 'Cedar', kind: 'Z', rank: 4 },
    d: { handle: 'Dahl', kind: 'X', rank: 5 },
    e: { handle: 'Elm', kind: 'Y', rank: 2 },
  },
});
const SIDES = {
  v: 1,
  name: 'bracket',
  rows: 'cups.*.grid.*.*.*',
  rowsAre: 'sides',
  bracketLevel: 1,
  fields: { match: 'pair', stage: 'lane', round: 'step', roundName: 'stepName', name: 'who', race: 'kind', score: 'pts' },
  players: { at: 'roster', fields: { name: 'handle', race: 'kind', seed: 'rank' } },
};
const sidesAdapter = (over = {}) => readSourceAdapter({ ...SIDES, ...over }).adapter;
const matchesOf = (output) =>
  Object.values(output.brackets).flatMap((b) => Object.values(b.stages).flatMap((s) => Object.values(s.rounds).flatMap((r) => Object.values(r.matches))));

test('the new settings are additive and judged: side fields only with rowsAre sides, a level that names a *, a players section with a name', () => {
  assert.equal(readSourceAdapter(SIDES).status, 'ok');
  assert.match(readSourceAdapter({ ...SIDES, rowsAre: 'teams' }).error, /whole matches, or sides/);
  assert.match(readSourceAdapter({ ...SIDES, fields: { ...SIDES.fields, aName: 'x' } }).error, /unknown field aName/);
  assert.match(readSourceAdapter({ ...ADAPTER, fields: { ...FIELDS, name: 'x' } }).error, /unknown field name/);
  assert.match(readSourceAdapter({ ...SIDES, fields: { name: 'who' } }).error, /name and its match id/);
  assert.match(readSourceAdapter({ ...SIDES, bracketLevel: 5 }).error, /bracket level must name a \*/);
  assert.match(readSourceAdapter({ ...SIDES, fields: { ...SIDES.fields, bracket: 'lane' } }).error, /a field or from a level, not both/);
  assert.match(readSourceAdapter({ ...SIDES, rows: 'cups.**' }).error, /dotted path/);
  assert.match(readSourceAdapter({ ...SIDES, players: { at: 'roster', fields: { seed: 'rank' } } }).error, /players section needs the name/);
  // A setting without the new keys reads exactly as before.
  assert.deepEqual(readSourceAdapter(ADAPTER).adapter, { v: 1, name: 'bracket', rows: 'data.rows', fields: FIELDS });
});

test('side rows: the rows of one match id are side a then side b; a one-row match stays, with an unknown side, said, and no winner', () => {
  const r = adaptBracket(NESTED(), sidesAdapter());
  const all = matchesOf(r.output);
  assert.deepEqual(all.map((m) => m.id), ['x1', 'x2', 'y1', 'y9']);
  assert.deepEqual(all[0].a, { name: 'Aster', race: 'X', seed: 1, score: 2 });
  assert.deepEqual(all[0].b, { name: 'Birch', race: 'Q', seed: 8, score: 1 });
  assert.deepEqual(all[3].b, { name: null, race: null, seed: null, score: null });
  assert.equal(all[3].status, 'unknown');
  assert.ok(r.report.includes('match y9 has one side in the rows'));
  assert.equal(r.output.ties._2, ['Round 1 | Elm — | Fir —', 'Final | Elm — | —'].join('\n'));
});

test('nested rows are gathered through a list and numbered levels, in feed order, from list and keyed leaves alike', () => {
  const r = adaptBracket(NESTED(), sidesAdapter());
  assert.deepEqual(r.matches.map((m) => m.label), ['Round 1: Aster v Birch', 'Round 1: Cedar v dahl', 'Round 1: Elm v Fir', 'Final: Elm v ?']);
  // A branch without the next key is said, never filled in.
  const odd = NESTED();
  odd.cups.push({ other: 1 });
  assert.ok(adaptBracket(odd, sidesAdapter()).report.includes('cups.3 has no grid'));
  assert.deepEqual(adaptBracket({ cups: [] }, sidesAdapter()), { problem: 'cups has no entries' });
  // An empty level inside is said too, and the rest is read.
  const hollow = NESTED();
  hollow.cups[1].grid = {};
  const h = adaptBracket(hollow, sidesAdapter());
  assert.ok(h.report.includes('cups.2.grid has no entries'));
  assert.deepEqual(h.matches.map((m) => m.id), ['x1', 'x2']);
});

test('the bracket is the position at the chosen level; a field that repeats across brackets is the stage', () => {
  const r = adaptBracket(NESTED(), sidesAdapter());
  assert.deepEqual(Object.values(r.output.brackets).map((b) => b.id), ['1', '2']);
  assert.deepEqual(Object.values(r.output.brackets).map((b) => b.stages['_0'].id), ['upper', 'upper']);
  assert.deepEqual(Object.keys(r.output.ties), ['_1', '_2']);
});

test('the players section fills seeds (and a race the row lacks) by name in any case; an unmatched name is said; players come from it', () => {
  const r = adaptBracket(NESTED(), sidesAdapter());
  const all = matchesOf(r.output);
  assert.deepEqual(all[1].b, { name: 'dahl', race: 'X', seed: 5, score: 2 });
  assert.equal(all[0].a.race, 'X');
  assert.equal(all[0].b.race, 'Q');
  assert.equal(all[2].b.seed, null);
  assert.ok(r.report.includes('Fir is not in the players list'));
  assert.deepEqual(Object.values(r.output.players).map((p) => [p.name, p.seed]), [['ASTER', 1], ['birch', 8], ['Cedar', 4], ['Dahl', 5], ['Elm', 2]]);
  // A section that is not there is said; the sides keep what the rows give.
  const gone = adaptBracket(NESTED(), sidesAdapter({ players: { at: 'nobody', fields: { name: 'handle' } } }));
  assert.ok(gone.report.includes('the players list (nobody) is not in the JSON'));
  assert.equal(matchesOf(gone.output)[0].a.seed, null);
});

test('side rows that cannot form one match keep its values and are said; the current match follows a side-row match', () => {
  const three = NESTED();
  three.cups[0].grid[1][1][1].push(sideRow('x1', 'r1', 'Round 1', 'Gum', 'X', 0));
  const r = adaptBracket(three, sidesAdapter());
  assert.ok(r.report.includes('match x1 has 3 rows, so it keeps its values'));
  assert.deepEqual(matchesOf(r.output)[0], { id: 'x1' });
  const apart = NESTED();
  apart.cups[0].grid[1][1][2][2].step = 'r2';
  assert.ok(adaptBracket(apart, sidesAdapter()).report.includes('the two sides of match x2 disagree about where it is, so it keeps its values'));
  const picked = adaptBracket(NESTED(), sidesAdapter(), { pick: 'x2', memory: null });
  assert.deepEqual(picked.output.current, { matchId: 'x2', round: 'Round 1', a: { name: 'Cedar', race: 'Z', seed: 4, score: 0 }, b: { name: 'dahl', race: 'X', seed: 5, score: 2 }, held: false });
});

test('the review finds nested rows through *, a players section, and the keys of each', async () => {
  const { bracketRowPaths, bracketRowKeys, bracketSectionPaths, bracketSectionKeys } = await import('../src/control/bracketAdapter.ts');
  assert.ok(bracketRowPaths(NESTED()).includes('cups.*.grid.*.*.*'));
  assert.deepEqual(bracketRowKeys(NESTED(), 'cups.*.grid.*.*.*'), ['pair', 'lane', 'step', 'stepName', 'who', 'kind', 'pts']);
  assert.ok(bracketSectionPaths(NESTED()).includes('roster'));
  assert.deepEqual(bracketSectionKeys(NESTED(), 'roster'), ['handle', 'kind', 'rank']);
});

test('connecting a field to a deep leaf of the bracket shape writes no recipe output, and the read reaches it by its own path', async () => {
  const { jsonOffers } = await import('../src/control/connectorReview.ts');
  const { bracketReviewSample } = await import('../src/control/bracketAdapter.ts');
  const sample = bracketReviewSample(NESTED(), sidesAdapter()).sample;
  const deep = 'external.b1.brackets._1.stages._0.rounds._0.matches._0.b.name';
  assert.equal(jsonOffers('b1', sample).scalars.some((o) => o.path === deep), false);
  assert.ok(jsonOffers('b1', sample, { depth: 12, max: 1000 }).scalars.some((o) => o.path === deep));
  const stored = { id: 'b1', kind: 'external', label: 'Cups', config: { v: 1, configRevision: 1, endpoint: 'https://x.example/b.json', read: { everyMs: 10_000 }, adapter: SIDES } };
  const plan = connectorPlan({ graphic: 'Card', bindings: {}, source: stored, rows: [{ fieldId: 'f0', label: 'Player A', status: 'matched', path: deep, current: null }], choices: {}, collections: [], adapters: {}, columns: {} });
  assert.equal(plan.bindings.Card.f0, deep);
  assert.equal(plan.source.config.mapping, undefined);
  const reg = readExternalRegistration({ id: 'b1', kind: 'external', config: plan.source.config });
  const p = projectJson({ sourceId: 'b1', payload: NESTED(), bindings: plan.bindings, fieldsOf: () => [{ key: 'f0', label: 'Player A', kind: 'text', defaultValue: '' }], registration: reg });
  assert.deepEqual(p.writes, { [deep]: 'Fir' });
});

test('every path the bracket shape gives is one a source write can address: no segment of digits alone', async () => {
  const { patchForPath } = await import('../src/model/productionData.ts');
  const leaves = (value, at = []) => (value !== null && typeof value === 'object' ? Object.entries(value).flatMap(([k, v]) => leaves(v, [...at, k])) : [at.join('.')]);
  for (const [shape, a] of [[asList(ROWS()), adapter()], [NESTED(), sidesAdapter()]]) {
    const r = adaptBracket(shape, a, { pick: a.fields.match ? (a.rowsAre ? 'x1' : 'm1') : null, memory: null });
    const paths = leaves(forFields(r.output));
    assert.ok(paths.length > 20);
    for (const leaf of paths) assert.notEqual(patchForPath(`external.b1.${leaf}`, 'x'), null, leaf);
  }
});

test('side rows: a repeated side is said and left out; a round name on one side only does not hold the match', () => {
  const twice = NESTED();
  twice.cups[0].grid[1][1][1] = [sideRow('x1', 'r1', 'Round 1', 'Aster', 'X', 2), sideRow('x1', 'r1', 'Round 1', 'Aster', 'X', 2)];
  const r = adaptBracket(twice, sidesAdapter());
  assert.ok(r.report.includes('row cups.1.grid.1.1.1.2 repeats a side of match x1, so it is left out'));
  assert.ok(r.report.includes('match x1 has one side in the rows'));
  assert.equal(matchesOf(r.output)[0].b.name, null);
  const named = NESTED();
  named.cups[0].grid[1][1][2][1].stepName = '';
  const n = adaptBracket(named, sidesAdapter());
  assert.deepEqual(matchesOf(n.output)[1].a.name, 'Cedar');
  assert.equal(n.report.some((l) => l.includes('disagree')), false);
});

test('the same side rows under two brackets are not repeats: the match is placed in two brackets, so it keeps its values', () => {
  const rows = [sideRow('m1', 'r1', 'Round 1', 'Aster', 'X', 1), sideRow('m1', 'r1', 'Round 1', 'Birch', 'X', 0)];
  const feed = { cups: [{ rows: structuredClone(rows) }, { rows: structuredClone(rows) }] };
  const r = adaptBracket(feed, readSourceAdapter({ v: 1, name: 'bracket', rows: 'cups.*.rows', rowsAre: 'sides', bracketLevel: 1, fields: { match: 'pair', name: 'who' } }).adapter);
  assert.ok(r.report.includes('match m1 has 4 rows, so it keeps its values'));
  assert.equal(r.report.some((l) => l.includes('repeats')), false);
  assert.deepEqual(matchesOf(r.output)[0], { id: 'm1' });
});

test('a mapped players list a read cannot give leaves players out, so its fields keep their values; its gaps and clashes are said', () => {
  const gone = NESTED();
  delete gone.roster;
  const r = adaptBracket(gone, sidesAdapter());
  assert.equal('players' in r.output, false);
  assert.ok(r.report.includes('the players list (roster) is not in the JSON'));
  const p = projectJson({
    sourceId: 'b1',
    payload: gone,
    bindings: { Card: { f0: 'external.b1.players._0.name' } },
    fieldsOf: () => [{ key: 'f0', label: 'Player', kind: 'text', defaultValue: '' }],
    registration: readExternalRegistration({ id: 'b1', kind: 'external', config: { v: 1, configRevision: 1, endpoint: 'https://x.example/b.json', read: { everyMs: 10_000 }, adapter: SIDES } }),
  });
  assert.deepEqual(p.writes, {});
  // A nameless entry keeps its place; a name given twice in other case with other values fills nothing.
  const odd = NESTED();
  odd.roster = { a: { rank: 3 }, b: { handle: 'Aster', kind: 'X', rank: 1 }, c: { handle: 'ASTER', kind: 'X', rank: 9 } };
  const o = adaptBracket(odd, sidesAdapter());
  assert.ok(o.report.includes('entry 1 of the players list has no name'));
  assert.ok(o.report.includes('the players list gives ASTER twice with other values, so it fills nothing for that name'));
  assert.deepEqual(Object.values(o.output.players).map((x) => x.name), [null, 'Aster', 'ASTER']);
  assert.equal(matchesOf(o.output)[0].a.seed, null);
});

test('a side row left out takes its match with it, said; a bracket id like __proto__ keeps its tie lines', () => {
  const cut = NESTED();
  cut.cups[0].grid[1][1][1][1].step = '';
  const r = adaptBracket(cut, sidesAdapter());
  assert.ok(r.report.includes('row cups.1.grid.1.1.1.2 has no round, so it is left out'));
  assert.ok(r.report.includes('match x1 is left out with that row'));
  const proto = adaptBracket({ rows: [{ pair: 'p1', g: '__proto__', who: 'A', pts: 1 }, { pair: 'p1', g: '__proto__', who: 'B', pts: 0 }] }, readSourceAdapter({ v: 1, name: 'bracket', rows: 'rows', rowsAre: 'sides', fields: { match: 'pair', bracket: 'g', name: 'who', score: 'pts' } }).adapter);
  assert.ok(Object.prototype.hasOwnProperty.call(proto.output.ties, '__proto__'));
  assert.equal(proto.output.ties.__proto__, '1 | A 1 | B 0');
});
