// guards: src/model/productionData.ts
//
// Unit tests for the production-data contract (src/model/productionData.ts).
//
// These run in the BUILD GATE rather than in Playwright because there is no browser in the
// question: paths in, values out. The module imports nothing, which is what makes one
// `transpileModule` call enough (the csv.test.mjs pattern).
//
// MERGE_PATCH_CONFORMANCE below is the important half. The hosted ingress planned in
// docs/PRODUCTION_DATA_PLAN.md §4 performs the same merge in plpgsql, for write atomicity, and
// two implementations of one semantic is exactly how a system develops two opinions quietly.
// The table is therefore written as DATA, not as prose: when the SQL twin lands, its own
// migration test walks this same list and must agree case for case.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
// The rules live in ONE place, because they are implemented twice - here against the real
// TypeScript module, and in 0048's self-check against the real plpgsql body.
import { MERGE_PATCH_CONFORMANCE } from './merge-patch-conformance.mjs';
import * as rules from './rules.mjs';

const source = readFileSync(fileURLToPath(new URL('../src/model/productionData.ts', import.meta.url)), 'utf8');

// The module stays self-contained: no imports (type-only ones included), no DOM, no storage.
// Checked here, before the transpile, because a real import would otherwise fail the data: URL
// load below with a resolution error that names neither the file nor the reason.
const SELF_CONTAINED = rules.text('model/imports-nothing-touches-dom-storage-deliberate');
assert.doesNotMatch(source, /^\s*import\b|\bimport\s*\(|^\s*export\b[^;\n]*\bfrom\s+['"]|^\s*\}\s*from\s+['"]/m, SELF_CONTAINED);
assert.doesNotMatch(source, /\b(document|window|localStorage|sessionStorage|indexedDB|navigator)\b/, SELF_CONTAINED);

const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const {
  applyPatch,
  deletePath,
  diffResolved,
  flattenLeaves,
  formatValue,
  getPath,
  mergePatch,
  parseLiteral,
  parsePath,
  patchForPath,
  reparseLeaf,
  replacementPatch,
  resolveBindings,
  retypeLeaf,
  setPath,
  splitBoundWrites,
  suggestPath,
  withTreeWrites,
} = mod;

test('merge-patch conformance table (TypeScript side)', () => {
  for (const c of MERGE_PATCH_CONFORMANCE) {
    const frozen = JSON.parse(JSON.stringify(c.base));
    assert.deepEqual(applyPatch(c.base, c.patch), c.expect, c.name);
    // Immutability is part of the contract: React state and the undo story both assume the
    // input tree was not edited underneath them.
    assert.deepEqual(c.base, frozen, `${c.name} - the base must not be mutated`);
  }
});

test('mergePatch at a non-object root replaces, per the RFC', () => {
  assert.equal(mergePatch({ a: 1 }, 'scalar'), 'scalar');
  assert.deepEqual(mergePatch(undefined, { a: 1 }), { a: 1 });
  assert.deepEqual(mergePatch('was a string', { a: 1 }), { a: 1 });
});

test('paths parse, or refuse', () => {
  assert.deepEqual(parsePath('match.home.score'), ['match', 'home', 'score']);
  assert.deepEqual(parsePath('drivers.0.gap'), ['drivers', '0', 'gap']);
  assert.equal(parsePath(''), null);
  assert.equal(parsePath('  '), null);
  assert.equal(parsePath('a..b'), null);
  assert.equal(parsePath('a.'), null);
});

test('getPath walks objects and array indices, and gives up honestly', () => {
  const data = { match: { home: { score: 3 } }, drivers: [{ name: 'A' }, { name: 'B' }] };
  assert.equal(getPath(data, 'match.home.score'), 3);
  assert.equal(getPath(data, 'drivers.1.name'), 'B');
  assert.equal(getPath(data, 'match.away.score'), undefined);
  assert.equal(getPath(data, 'match.home.score.deeper'), undefined);
  assert.equal(getPath(data, 'drivers.9.name'), undefined);
  assert.equal(getPath(data, ''), undefined);
});

test('setPath builds missing branches and edits array elements in place', () => {
  assert.deepEqual(setPath({}, 'match.home.score', 4), { match: { home: { score: 4 } } });
  const withList = { drivers: [{ gap: 'LEADER' }, { gap: '+1.2' }] };
  assert.deepEqual(setPath(withList, 'drivers.1.gap', '+0.9'), {
    drivers: [{ gap: 'LEADER' }, { gap: '+0.9' }],
  });
  // The array survives as an array - the whole reason setPath exists beside mergePatch.
  assert.ok(Array.isArray(setPath(withList, 'drivers.0.gap', 'X').drivers));
  const base = { a: { b: 1 } };
  setPath(base, 'a.c', 2);
  assert.deepEqual(base, { a: { b: 1 } }, 'setPath must not mutate its input');
});

test('deletePath removes a key, splices an array element, and ignores misses', () => {
  assert.deepEqual(deletePath({ a: { b: 1, c: 2 } }, 'a.b'), { a: { c: 2 } });
  assert.deepEqual(deletePath({ rows: [1, 2, 3] }, 'rows.1'), { rows: [1, 3] });
  assert.deepEqual(deletePath({ a: 1 }, 'nope.deep'), { a: 1 });
});

test('patchForPath refuses array indices, which merge-patch cannot express', () => {
  assert.deepEqual(patchForPath('match.home.score', 4), { match: { home: { score: 4 } } });
  assert.equal(patchForPath('drivers.0.gap', 'x'), null);
});

test('formatValue writes strings, or writes nothing at all', () => {
  assert.equal(formatValue('Finland'), 'Finland');
  assert.equal(formatValue(3), '3');
  assert.equal(formatValue(17.4), '17.4');
  assert.equal(formatValue(0), '0');
  assert.equal(formatValue(true), 'true');
  assert.equal(formatValue(false), 'false');
  assert.equal(formatValue(['Yes', 'No']), 'Yes\nNo');
  assert.equal(formatValue([1, 2]), '1\n2');
  // The three "write nothing" cases - a live field keeps its last good value.
  assert.equal(formatValue(undefined), null);
  assert.equal(formatValue(null), null);
  assert.equal(formatValue({ a: 1 }), null);
  assert.equal(formatValue([{ a: 1 }]), null);
  assert.equal(formatValue(NaN), null);
});

test('flattenLeaves finds every bindable leaf, including through arrays of objects', () => {
  const data = {
    match: { home: { name: 'Finland', score: 3 } },
    poll: { open: true, options: [{ label: 'Yes', votes: 72 }] },
    headlines: ['one', 'two'],
  };
  const paths = flattenLeaves(data).map((l) => l.path);
  assert.deepEqual(paths, [
    'match.home.name',
    'match.home.score',
    'poll.open',
    'poll.options.0.label',
    'poll.options.0.votes',
    'headlines',
  ]);
  // A scalar array is ONE leaf (a `lines` field takes it whole), not one leaf per element.
  assert.equal(flattenLeaves(data).find((l) => l.path === 'headlines').text, 'one\ntwo');
});

test('resolveBindings skips what it cannot write, and never invents a blank', () => {
  const data = { match: { home: { score: 3 } }, obj: { deep: { a: 1 } } };
  const bindings = {
    Scorebug: { f1: 'match.home.score', f2: 'match.away.score', f3: 'obj.deep' },
    Ticker: { f0: 'nothing.here' },
  };
  assert.deepEqual(resolveBindings(data, bindings), { Scorebug: { f1: '3' } });
  assert.deepEqual(resolveBindings(data, undefined), {});
});

test('diffResolved sends only what changed, and never a disappearance', () => {
  const before = { A: { f1: '1', f2: 'x' }, B: { f0: 'same' } };
  const after = { A: { f1: '2', f2: 'x' }, B: { f0: 'same' } };
  assert.deepEqual(diffResolved(before, after), { A: { f1: '2' } });
  // A path that vanished is absent from `after`, so nothing is sent - the field keeps its last
  // value rather than going blank on air.
  assert.deepEqual(diffResolved(before, { A: { f2: 'x' }, B: { f0: 'same' } }), {});
  // A cold start reconciles everything once.
  assert.deepEqual(diffResolved({}, after), after);
});

test('suggestPath binds an unambiguous name and refuses a contested one', () => {
  const leaves = flattenLeaves({
    match: { home: { scoreA: 1 }, clock: '12:31' },
    other: { name: 'x' },
    team: { name: 'y' },
  });
  assert.equal(suggestPath('Score A', leaves), 'match.home.scoreA');
  assert.equal(suggestPath('match.clock', leaves), 'match.clock');
  // Two leaves end in `name`: bind nothing rather than guess (the API's `ambiguous` doctrine).
  assert.equal(suggestPath('Name', leaves), null);
  assert.equal(suggestPath('nothing like this', leaves), null);
  assert.equal(suggestPath('', leaves), null);
});

test('parseLiteral reads the value box the way an operator means it', () => {
  assert.equal(parseLiteral('4'), 4);
  assert.equal(parseLiteral('17.4'), 17.4);
  assert.equal(parseLiteral('-2'), -2);
  assert.equal(parseLiteral('true'), true);
  assert.equal(parseLiteral('false'), false);
  assert.equal(parseLiteral('null'), null);
  assert.deepEqual(parseLiteral('[1,2]'), [1, 2]);
  assert.deepEqual(parseLiteral('{"a":1}'), { a: 1 });
  assert.equal(parseLiteral('Finland'), 'Finland');
  // Quoting is how an operator says "the TEXT four".
  assert.equal(parseLiteral('"4"'), '4');
  // Malformed JSON stays the text that was typed rather than throwing into an edit.
  assert.equal(parseLiteral('{not json'), '{not json');
  assert.equal(parseLiteral(''), '');
});

test('reparseLeaf keeps a list a list when its box is edited', () => {
  // The row editor renders a scalar array as newline-joined text. Reading it back with
  // parseLiteral alone would turn ["a","b"] into the single string "a\nb" - the graphic would
  // look identical and the TYPE would have changed under every future consumer.
  assert.deepEqual(reparseLeaf(['a', 'b'], 'a\nb\nc'), ['a', 'b', 'c']);
  assert.deepEqual(reparseLeaf([1, 2], '3\n4'), [3, 4]);
  assert.deepEqual(reparseLeaf(['a'], ''), []);
  // Anything that was NOT a list reads as an ordinary literal.
  assert.equal(reparseLeaf('text', '42'), 42);
  assert.equal(reparseLeaf(3, '4'), 4);
  assert.equal(reparseLeaf(undefined, 'Finland'), 'Finland');
});

test('replacementPatch turns before into after EXACTLY, removals included', () => {
  // The round trip is the property that matters: applying the patch must reproduce `after`,
  // because the hosted path can only accept patches and a surface that replaces a whole tree
  // (Reset, Clear, Raw JSON) has to say the removals out loud.
  const cases = [
    [{ a: 1, b: 2 }, { a: 1 }],
    [{ a: { b: 1, c: 2 } }, { a: { b: 1 } }],
    [{ a: 1 }, {}],
    [{}, { a: { b: 1 } }],
    [{ match: { home: { score: 1 } }, weather: { t: 4 } }, { match: { home: { score: 2 } } }],
    [{ rows: [1, 2] }, { rows: [3] }],
    [{ a: { b: 1 } }, { a: 'scalar' }],
  ];
  for (const [before, after] of cases) {
    const patch = replacementPatch(before, after);
    assert.deepEqual(applyPatch(before, patch), after, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  }
});

test('replacementPatch names only what changed', () => {
  // A patch carrying untouched branches would be bigger than the edit and, on the wire, would
  // re-send values a feed may have moved in the meantime.
  assert.deepEqual(replacementPatch({ a: { b: 1 }, c: 2 }, { a: { b: 1 }, c: 3 }), { c: 3 });
  assert.deepEqual(replacementPatch({ a: { b: 1 } }, { a: { b: 1 } }), {});
  assert.deepEqual(replacementPatch({ a: { b: 1, c: 2 } }, { a: { b: 9, c: 2 } }), { a: { b: 9 } });
});

test('a clock string is never mistaken for a number', () => {
  // 12:31 must survive as text; a value box that "helpfully" parsed it would air 12.
  assert.equal(parseLiteral('12:31'), '12:31');
  assert.equal(parseLiteral('+1.231'), '+1.231');
});

// ── The press boundary: a control surface writing BACK into the tree (§2.9's Phase 3) ────

test('retypeLeaf keeps the type the leaf already had', () => {
  // The press hands over a STRING because that is what a field holds. What lands in the tree has
  // to be what a feed would have written, or the shape of `control_shows.data` depends on who
  // moved the value last.
  assert.equal(retypeLeaf(4, '5', 'adjust'), 5);
  assert.equal(retypeLeaf('4', '5', 'adjust'), '5');
  assert.equal(retypeLeaf(true, 'false', 'set'), false);
  assert.deepEqual(retypeLeaf(['a', 'b'], 'a\nb\nc', 'list'), ['a', 'b', 'c']);
  assert.deepEqual(retypeLeaf([1, 2], '1\n2\n3', 'list'), [1, 2, 3]);
  assert.deepEqual(retypeLeaf(['a'], '', 'list'), []);
});

test('an EMPTY list is still a list, which is the state a list starts a show in', () => {
  // `isLeafValue([])` is false on purpose - an empty array writes nothing into a field, which is
  // what stops a board going blank - and reading that "no" as "not an array" turned the FIRST
  // press on a bingo board's `called` from [] into the string "K7". Every press after that
  // appended to a string, and only a tree that never started empty stayed an array.
  assert.deepEqual(retypeLeaf([], 'K7', 'list'), ['K7']);
  assert.deepEqual(withTreeWrites({ called: [] }, [{ path: 'called', text: 'K7', verb: 'list' }]), { called: ['K7'] });
  assert.deepEqual(withTreeWrites({ called: ['K7'] }, [{ path: 'called', text: 'K7\nB2', verb: 'list' }]), {
    called: ['K7', 'B2'],
  });
});

test('a jersey number stays text, because the TEXT is not where the type comes from', () => {
  // reparseLeaf reads the type out of the text, which is right for a value box (the operator is
  // saying what they mean) and wrong for a press (the type is already known). 07 + 1 must not
  // silently become the number 8 on a path a feed writes as a string.
  assert.equal(retypeLeaf('07', '8', 'adjust'), '8');
  assert.equal(reparseLeaf('07', '8'), 8);
});

test('a leaf that is not there yet takes the type the PRESS implies', () => {
  assert.equal(retypeLeaf(undefined, '1', 'adjust'), 1);
  assert.equal(retypeLeaf(undefined, 'Final', 'set'), 'Final');
  assert.deepEqual(retypeLeaf(undefined, 'K7', 'list'), ['K7']);
  // Arithmetic that did not produce a number stays text rather than becoming NaN, which is not
  // JSON at all.
  assert.equal(retypeLeaf(undefined, 'x', 'adjust'), 'x');
});

test('withTreeWrites applies in order, so one press can move a path twice', () => {
  const tree = { match: { home: { score: 4 } } };
  const next = withTreeWrites(tree, [
    { path: 'match.home.score', text: '5', verb: 'adjust' },
    { path: 'match.home.score', text: '6', verb: 'adjust' },
  ]);
  assert.deepEqual(next, { match: { home: { score: 6 } } });
  assert.deepEqual(tree, { match: { home: { score: 4 } } }, 'the tree handed in must not be mutated');
});

test('withTreeWrites reaches an ARRAY ELEMENT, which a merge patch cannot address', () => {
  // `drivers.0.gap` is the plan's own example of a binding. patchForPath answers null for it by
  // design, so a press that built its patch that way would silently do nothing.
  assert.equal(patchForPath('drivers.0.gap', 'LEADER'), null);
  assert.deepEqual(
    withTreeWrites({ drivers: [{ gap: 'x' }, { gap: 'y' }] }, [{ path: 'drivers.1.gap', text: '+1.2', verb: 'set' }]),
    { drivers: [{ gap: 'x' }, { gap: '+1.2' }] },
  );
});

test('splitBoundWrites sends a bound key to the tree and leaves every other key alone', () => {
  const split = splitBoundWrites(
    { f1: '5', f2: 'Finland', f3: 'a\nb' },
    { f1: 'match.home.score', f3: 'headlines' },
    (key) => (key === 'f1' ? 'adjust' : 'list'),
  );
  assert.deepEqual(split.fields, { f2: 'Finland' });
  assert.deepEqual(split.tree, [
    { path: 'match.home.score', text: '5', verb: 'adjust' },
    { path: 'headlines', text: 'a\nb', verb: 'list' },
  ]);
});

test('a production that has bound nothing splits nothing - the old road, exactly', () => {
  const values = { f1: '5', f2: '3' };
  for (const paths of [undefined, {}]) {
    const split = splitBoundWrites(values, paths, () => 'adjust');
    assert.deepEqual(split.fields, values);
    assert.deepEqual(split.tree, []);
  }
  // A graphic name or a field id is somebody's typed text: an inherited key is not a binding.
  assert.deepEqual(splitBoundWrites({ constructor: '5' }, {}, () => 'adjust').fields, { constructor: '5' });
});
