// guards: src/model/regexMatches.ts, scripts/check-output-reader.mjs, output.html
// CasparCG 2.3's Chromium 71 and the output (#2603). `matchesOf` stands in for `matchAll` in code
// the output loads, so it must give the same matches; the build's check must find a call of a
// built-in Chromium 71 lacks; and output.html's shims must behave as the built-ins they replace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transform } from 'sucrase';
import { Parser } from 'acorn';

import { missingBuiltIns, SHIMMED } from './check-output-reader.mjs';

const dataUrl = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const { matchesOf } = await import(dataUrl(transform(readFileSync('src/model/regexMatches.ts', 'utf8'), { transforms: ['typescript'] }).code));

const plain = (list) => list.map((m) => ({ all: [...m], index: m.index, groups: m.groups }));

test('matchesOf gives the matches matchAll gives', () => {
  const cases = [
    ['<!-- NOACG_ORGANIZATION {"a":1} -->\n<div>', /<!-- NOACG_ORGANIZATION ([\s\S]*?) -->\r?\n?/g],
    ['/* Imported font */ @font-face { font-family: "A" } @font-face { font-family: "B" }', /@font-face\s*\{[^}]*\}/g],
    ['+1 {f0|P1} and {playerA}', /\{([a-z][\w-]*)(?:\|([^{}]*))?\}/g],
    ['abc', /x*/g],
    ['a😀b', /(?:)/gu],
    ['a😀b', /(?:)/g],
    ['k1: 2, k2: \'v\'', /(?<key>\w+)\s*:/g],
    ['ABab', /a/gi],
    ['', /a/g],
  ];
  for (const [text, re] of cases) assert.deepEqual(plain(matchesOf(text, re)), plain([...text.matchAll(re)]), `${re} on ${JSON.stringify(text)}`);
});

test('matchesOf leaves the caller\'s lastIndex alone and starts where matchAll would', () => {
  const re = /a/g;
  re.lastIndex = 2;
  assert.deepEqual(plain(matchesOf('aaaa', re)), plain([...'aaaa'.matchAll(re)]));
  assert.equal(re.lastIndex, 2);
});

test('matchesOf refuses a pattern without the g flag, as matchAll does', () => {
  assert.throws(() => 'a'.matchAll(/a/), TypeError);
  assert.throws(() => matchesOf('a', /a/), TypeError);
});

const found = (code) => missingBuiltIns(Parser.parse(code, { ecmaVersion: 2020, sourceType: 'module' })).map((f) => f.what);

test('the build check finds each built-in Chromium 71 lacks, and not ordinary code', () => {
  assert.deepEqual(found('e.matchAll(/a/g)'), ['matchAll']);
  assert.deepEqual(found('s.replaceAll("a","b"); a.at(-1); a.findLast(f); a["matchAll"](r)'), ['replaceAll', 'at', 'findLast', 'matchAll']);
  assert.deepEqual(found('Object.hasOwn(o,"k"); Promise.allSettled(p); Promise.any(p)'), ['Object.hasOwn', 'Promise.allSettled', 'Promise.any']);
  assert.deepEqual(found('structuredClone(x); new WeakRef(x); window.structuredClone'), ['structuredClone', 'WeakRef', 'structuredClone']);
  assert.deepEqual(found('step.at; ({ at: 1, matchAll: 2 }); x.any(); z.groupBy(); s.match(/a/g); o.hasOwnProperty("k")'), []);
});

/** output.html's classic shim script, run in a context that lacks the built-ins it shims. */
function shimmedContext() {
  const html = readFileSync('output.html', 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const text of Object.values(SHIMMED)) assert.ok(script.includes(text), `output.html no longer carries "${text}"`);
  const context = vm.createContext({ Map, Set, Date, RegExp, Array, Object, DOMException });
  vm.runInContext('delete Promise.allSettled; var window = this;', context);
  vm.runInContext(script, context);
  return context;
}

test('output.html shims Promise.allSettled with the real result shape', async () => {
  const context = shimmedContext();
  const result = await vm.runInContext('Promise.allSettled([1, Promise.reject("no"), Promise.resolve(3)])', context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    { status: 'fulfilled', value: 1 },
    { status: 'rejected', reason: 'no' },
    { status: 'fulfilled', value: 3 },
  ]);
});

test('output.html shims structuredClone as a deep copy of plain data', () => {
  const context = shimmedContext();
  const clone = vm.runInContext('structuredClone', context);
  assert.equal(typeof clone, 'function');
  const source = { look: { brand: { colours: ['#fff', '#000'] } }, at: new Date(5), tags: new Set(['a']), map: new Map([['k', { v: 1 }]]), none: null, n: 0, missing: undefined };
  source.self = source;
  const copy = clone(source);
  for (const value of [copy, structuredClone(source)]) {
    assert.notEqual(value, source);
    assert.notEqual(value.look.brand, source.look.brand);
    assert.equal(JSON.stringify(value.look), JSON.stringify(source.look)); // the shim's objects are another realm's
    assert.equal(value.at.getTime(), 5);
    assert.equal(JSON.stringify([...value.tags]), '["a"]');
    assert.equal(JSON.stringify(value.map.get('k')), '{"v":1}');
    assert.equal(value.self, value);
    assert.ok('missing' in value);
  }
  assert.throws(() => clone({ f() {} }));
});
