// guards: src/join/joinPath.ts
//
// The join page's three doors (interaction spec D2, AC-5): `/j/<name>`, `/join/<name>` and
// `/join?p=<slug>` all name the same production, and the link handed out is the short one.
// The module imports nothing, so this transpiles the real file, as scripts/join-name.test.mjs does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../src/join/joinPath.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { joinSlugFrom, joinShortUrl } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

test('all three doors name the same production', () => {
  assert.equal(joinSlugFrom('/j/friday-night-live', ''), 'friday-night-live');
  assert.equal(joinSlugFrom('/join/friday-night-live', ''), 'friday-night-live');
  assert.equal(joinSlugFrom('/join', '?p=friday-night-live'), 'friday-night-live');
  // Clean URLs and trailing slashes.
  assert.equal(joinSlugFrom('/j/friday-night-live/', ''), 'friday-night-live');
  assert.equal(joinSlugFrom('/join.html', '?p=Ab3_x-Yz'), 'Ab3_x-Yz');
});

test('the query form wins over a path, as before', () => {
  assert.equal(joinSlugFrom('/j/one-name', '?p=other-name'), 'other-name');
});

test('/join is not read as /j plus a name', () => {
  assert.equal(joinSlugFrom('/join', ''), null);
  assert.equal(joinSlugFrom('/joinery', ''), null);
  assert.equal(joinSlugFrom('/jx/abc', ''), null);
});

test('anything that is not a slug never reaches the server', () => {
  assert.equal(joinSlugFrom('/j/', ''), null);
  assert.equal(joinSlugFrom('/j/ab', ''), null);
  assert.equal(joinSlugFrom('/j/a%20b%20c', ''), null);
  assert.equal(joinSlugFrom('/j/%E0%A4%A', ''), null);
  assert.equal(joinSlugFrom('/j/a/b/c', ''), null);
  assert.equal(joinSlugFrom(`/j/${'x'.repeat(41)}`, ''), null);
  assert.equal(joinSlugFrom('/join', '?p=<script>'), null);
});

test('the link handed out is the short one on the page origin', () => {
  assert.equal(joinShortUrl('https://noacg.studio', 'friday-night-live'), 'https://noacg.studio/j/friday-night-live');
  assert.equal(joinShortUrl('http://localhost:5175/', 'quiz-2026'), 'http://localhost:5175/j/quiz-2026');
  assert.equal(joinSlugFrom(new URL(joinShortUrl('https://noacg.studio', 'Ab3_x-Yz')).pathname, ''), 'Ab3_x-Yz');
});
