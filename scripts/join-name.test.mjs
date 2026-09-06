// guards: src/control/joinName.ts
//
// The one rule the audience slug keeps in TypeScript: the shape we PROPOSE from a production's
// name. Everything about what is acceptable lives on the column in migration 0035, so these
// cases are about the proposal, never about validation.
//
// They run in the build gate rather than in Playwright because deriving a slug is pure text in,
// text out, and the cases that matter are the ones a naive `replace(/ /g, '-')` gets wrong.
//
// The module is TypeScript and imports nothing, so the test transpiles the REAL FILE and imports
// the result - the same technique as scripts/csv.test.mjs, and for the same reason:
// re-implementing the rule here would test the wrong code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../src/control/joinName.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { deriveJoinName, joinNameCandidates } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

test('an ordinary production name becomes the link an operator would read out', () => {
  assert.equal(deriveJoinName('Friday Night Live'), 'friday-night-live');
  assert.equal(deriveJoinName('Quiz 2026'), 'quiz-2026');
});

test('punctuation and repeated separators collapse to single hyphens', () => {
  assert.equal(deriveJoinName('Town Hall: Q&A!'), 'town-hall-q-a');
  assert.equal(deriveJoinName('  spaced   out  '), 'spaced-out');
  assert.equal(deriveJoinName('---edges---'), 'edges');
});

test('accented letters keep their letter', () => {
  // Dropping the accent must not drop the vowel: the naive strip gives "f-tbol".
  assert.equal(deriveJoinName('Fútbol Nocturno'), 'futbol-nocturno');
  assert.equal(deriveJoinName('Årets Match'), 'arets-match');
});

test('a long name is cut with room for the collision suffix, and never ends on a hyphen', () => {
  const slug = deriveJoinName('The Very Long Running Friday Night Championship Special Edition');
  assert.equal(slug.length <= 38, true);
  assert.equal(/-$/.test(slug), false);
  // The cut lands mid-word here; what matters is that the suffix still fits 0035's ceiling.
  assert.equal(`${slug}-9`.length <= 40, true);
});

test('a name with nothing to build from proposes nothing at all', () => {
  // The database already minted a random slug; inventing one for an emoji-only name would be
  // worse than keeping it.
  assert.equal(deriveJoinName('\u{1f3ac}\u{1f3a4}'), null);
  assert.equal(deriveJoinName(''), null);
  assert.deepEqual(joinNameCandidates('\u{1f3ac}'), []);
});

test('candidates are the name first, then numbered retries', () => {
  assert.deepEqual(joinNameCandidates('Friday Night Live', 3), [
    'friday-night-live',
    'friday-night-live-2',
    'friday-night-live-3',
  ]);
});

test('a name too short or reserved still produces candidates the database can accept', () => {
  // No reserved list and no length check live here on purpose. "tv" is two characters and
  // "admin" is reserved, so 0035 refuses both - and the numbered retry is what heals it.
  assert.deepEqual(joinNameCandidates('TV', 2), ['tv', 'tv-2']);
  assert.deepEqual(joinNameCandidates('Admin', 2), ['admin', 'admin-2']);
});
