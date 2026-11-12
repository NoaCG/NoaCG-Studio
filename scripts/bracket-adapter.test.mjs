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
  const b = list.output.brackets['0'];
  assert.equal(b.id, 'G-1');
  assert.equal(b.title, 'Main event');
  const rounds = b.stages['0'].rounds;
  assert.deepEqual(Object.values(rounds).map((r) => r.name), ['Quarter-finals', 'Semi-finals', 'Final']);
  assert.deepEqual(Object.values(rounds).flatMap((r) => Object.values(r.matches).map((m) => m.id)), ['m1', 'm2', 'm3', 'm4']);
  assert.deepEqual(rounds['0'].matches['1'], { id: 'm2', status: 'done', a: { name: 'Cedar', race: 'Z', seed: 4, score: 2 }, b: { name: 'Dahl', race: 'X', seed: 5, score: 3 } });
  assert.equal(rounds['1'].matches['0'].status, 'live');
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
  const sf = output.brackets['0'].stages['0'].rounds['1'].matches['0'];
  assert.equal(sf.b.score, null);
  const final = output.brackets['0'].stages['0'].rounds['2'].matches['0'];
  assert.deepEqual(final.a, { name: null, race: null, seed: null, score: null });
  assert.equal(output.ties['G-1'], ['Quarter-finals | Aster 3 | Birch 1', 'Quarter-finals | Cedar 2 | Dahl 3', 'Semi-finals | Aster 2 | Dahl —', 'Final | — | —'].join('\n'));
  assert.equal(forFields(output).brackets['0'].stages['0'].rounds['1'].matches['0'].b.score, '');
  assert.equal(tieLine('R|1', { a: { name: 'A\nB', score: 1 }, b: { name: 'C', score: null } }), 'R 1 | A B 1 | C —');
  assert.equal(tieKey('Group A / 1', 0), 'Group-A-1');
  assert.equal(tieKey('!!', 3), '3');
});

test('missing, empty, unnumbered and duplicated rows are reported, never guessed', () => {
  const rows = ROWS();
  const keyed = { data: { rows: { 1: rows[0], 2: rows[1], 4: rows[2], 5: 'x', note: rows[3] } } };
  const r = adaptBracket(keyed, adapter());
  assert.deepEqual(r.report, ['row “note” has no row number, so it is left out', 'row 3 is missing', 'row 5 is empty']);
  assert.deepEqual(r.matches.map((m) => m.id), ['m1', 'm2', 'm3']);
  const list = adaptBracket(asList([rows[0], null, rows[1]]), adapter());
  assert.deepEqual(list.report, ['row 2 is empty']);
  // An empty grouping or match id: left out, said.
  const noKey = adaptBracket(asList([rows[0], { ...rows[1], key: '' }, { ...rows[2], rnd: ' ' }]), adapter());
  assert.deepEqual(noKey.report, ['row 2 has no match id, so it is left out', 'row 3 has no round, so it is left out']);
  // The same row twice: left out, said.
  const same = adaptBracket(asList([rows[0], rows[1], structuredClone(rows[0])]), adapter());
  assert.deepEqual(same.report, ['row 3 repeats match m1, so it is left out']);
  assert.equal(Object.keys(same.output.brackets['0'].stages['0'].rounds['0'].matches).length, 2);
  // Two rows that disagree about one match: it keeps its values, its slot stays, its ties hold.
  const clash = adaptBracket(asList([rows[0], rows[1], rows[2], { ...rows[0], home: side('Aster', 'X', 1, 4) }]), adapter());
  assert.deepEqual(clash.report, ['row 1 and row 4 both give match m1 with other values, so it keeps its values']);
  const qf = clash.output.brackets['0'].stages['0'].rounds['0'].matches;
  assert.deepEqual(qf['0'], { id: 'm1' });
  assert.equal(qf['1'].id, 'm2');
  assert.equal('G-1' in clash.output.ties, false);
  // Rows not where the mapping says: the whole read holds.
  assert.deepEqual(adaptBracket({ other: [] }, adapter()), { problem: 'data.rows is not in the JSON' });
  assert.deepEqual(adaptBracket({ data: { rows: 3 } }, adapter()), { problem: 'data.rows holds no rows' });
});

test('players: each named side once, in first appearance; two values for one player are null and said', () => {
  const { output, report } = adaptBracket(asList(ROWS()), adapter());
  assert.deepEqual(Object.values(output.players).map((p) => p.name), ['Aster', 'Birch', 'Cedar', 'Dahl']);
  assert.deepEqual(output.players['0'], { name: 'Aster', race: 'X', seed: 1, league: 'Gold' });
  assert.deepEqual(report, []);
  const two = adaptBracket(asList([...ROWS(), row('m5', 'x', 'Extra', side('Birch', 'Q', 8, 1), side('Cedar', 'Z', 4, 0))]), adapter());
  assert.equal(two.output.players['1'].race, null);
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
