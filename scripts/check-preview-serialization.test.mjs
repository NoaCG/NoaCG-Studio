// Both halves of scripts/check-preview-serialization.mjs. The DENY half is the one that matters:
// a gate that has only ever been seen to pass is a gate nobody knows is wired up. The rest pins
// what it must NOT refuse, because a source check that fails correct code gets deleted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findViolations, moduleScopeNames } from './check-preview-serialization.mjs';

let dir;
function fixture(name, lines) {
  dir ??= mkdtempSync(join(tmpdir(), 'noacg-serialization-'));
  const file = join(dir, name);
  writeFileSync(file, lines.join('\n'), 'utf8');
  return file;
}

test('a hand-written binding of an IMPORTED helper is refused', () => {
  const file = fixture('compose.ts', [
    "import { killAllTimelines } from './simulatorRuntime';",
    'const tag = `<script>',
    '  var killAllTimelines = ${killAllTimelines.toString()};',
    '</script>`;',
  ]);
  const found = findViolations([file]);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 3, 'the line number points at the binding, not at the file');
});

test('a helper declared in the same file is refused too - it is renamed just the same', () => {
  const file = fixture('local.ts', [
    'function killAllTimelines(w) { return w; }',
    'const tag = `${killAllTimelines.toString()}`;',
  ]);
  assert.equal(findViolations([file]).length, 1);
});

test('prose describing the hazard is not the hazard', () => {
  const file = fixture('notes.ts', [
    '// Never hand-write ${fn.toString()} into a document.',
    '/** Every `${fn.toString()}` goes through serializeHelper. */',
    'export const x = 1;',
  ]);
  assert.deepEqual(findViolations([file]), []);
});

test('the door itself needs no exemption - its `fn` is a parameter, not module scope', () => {
  const file = fixture('door.ts', [
    'function serializeHelper(fn: { name: string; toString(): string }, alias: string): string {',
    '  return `var ${fn.name} = ${fn.toString()};`;',
    '}',
  ]);
  assert.deepEqual(findViolations([file]), []);
});

test('ordinary toString calls are left alone', () => {
  const file = fixture('ordinary.ts', [
    'export function f(base: string, rows: number[]) {',
    '  const count = rows.length;',
    '  return `${new URL(base).toString()} ${count.toString()}`;',
    '}',
  ]);
  assert.deepEqual(findViolations([file]), []);
});

test('a module-scope value that is not a function can say so on the line', () => {
  const lines = [
    'const total = 42;',
    'export const label = `${total.toString()}`;',
  ];
  assert.equal(findViolations([fixture('noisy.ts', lines)]).length, 1, 'refused without the marker');
  lines[1] += ' // check-preview-serialization: not a function';
  assert.deepEqual(findViolations([fixture('quiet.ts', lines)]), []);
});

test('module scope covers named, default and aliased imports as well as declarations', () => {
  const names = moduleScopeNames(
    [
      "import gsapSource from '../assets/gsap.min.js?raw';",
      "import { settleGraphic, reportGraphicBox as report } from './settleGraphic';",
      "import type { SpxTemplate } from '../model/types';",
      'export function composeDocument() {}',
      'const inner = 1;',
      'class Thing {}',
    ].join('\n'),
  );
  for (const n of ['gsapSource', 'settleGraphic', 'report', 'SpxTemplate', 'composeDocument', 'inner', 'Thing']) {
    assert.ok(names.has(n), `${n} is module scope`);
  }
  assert.ok(!names.has('reportGraphicBox'), 'an aliased import is bound under the alias only');
});

test('module scope survives layout: shapes a line-anchored reading of the text dropped are still bound', () => {
  // Each of these left the old regex table while the hazard stayed in the file, so the gate
  // skipped a real violation and passed.
  const shapes = [
    ["import gsap, { killAllTimelines } from './a';", 'killAllTimelines'],
    ["import * as runtime from './a';", 'runtime'],
    ['  function indented(w) { return w; }', 'indented'],
    ['@sealed\nclass Decorated {}', 'Decorated'],
    ['const first = 1, second = () => 0;', 'second'],
    ['const { picked } = helpers;', 'picked'],
    ['export default function named() {}', 'named'],
  ];
  for (const [declaration, name] of shapes) {
    const file = fixture(`shape-${name}.ts`, [declaration, `const tag = \`\${${name}.toString()}\`;`]);
    assert.equal(findViolations([file]).length, 1, `${JSON.stringify(declaration)} binds ${name} at module scope`);
  }
});

test('the resolved table is counted only over files that interpolate a toString()', () => {
  const stats = {};
  const plain = fixture('plain.ts', ['export const a = 1;']);
  findViolations([plain], stats);
  assert.equal(stats.resolved, 0, 'a file with nothing to judge adds nothing');
  const door = fixture('door-count.ts', [
    "import { x } from './x';",
    'function serializeHelper(fn) { return `${fn.toString()}`; }',
  ]);
  findViolations([plain, door], stats);
  assert.equal(stats.resolved, 2);
});
