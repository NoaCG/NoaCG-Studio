// The prerequisite list's rules, pinned. Every failure mode here is silent by construction: a
// report that says OK over a setting nobody checked reads exactly like one where everything is in
// place, which is the state the landing machinery was in the night this file was written.
import assert from 'node:assert/strict';
import test from 'node:test';

import { CHECK_IDS, preflightReport } from './owner-preflight.mjs';

const all = (value) => Object.fromEntries(CHECK_IDS.map((id) => [id, value]));

test('everything in place reports one OK line per check and nothing missing', () => {
  const { lines, missing, unknown } = preflightReport(all(true));
  assert.deepEqual(missing, []);
  assert.deepEqual(unknown, []);
  assert.equal(lines.length, CHECK_IDS.length);
  assert.ok(lines.every((l) => l.startsWith('  OK')));
});

test('a missing prerequisite names why it matters and the command that fixes it', () => {
  const { lines, missing } = preflightReport({ ...all(true), 'org-actions-pr': false });
  assert.deepEqual(missing, ['org-actions-pr']);
  const text = lines.join('\n');
  assert.match(text, /MISSING {2}the organisation lets Actions open a pull request/);
  assert.match(text, /refused at `gh pr create`/, 'a miss says what it costs, not just that it is missing');
  assert.match(text, /fix: node scripts\/landing-ruleset\.mjs --apply/, 'a miss carries a command, not a description');
});

test('an answer this login cannot obtain is unknown, never missing', () => {
  // Reading the organisation's Actions policy needs `admin:org`. Reporting "missing" to somebody
  // who simply could not look is how a list stops being read.
  const { missing, unknown, lines } = preflightReport({ ...all(true), 'org-actions-pr': null });
  assert.deepEqual(missing, []);
  assert.deepEqual(unknown, ['org-actions-pr']);
  assert.match(lines.join('\n'), /unknown {2}the organisation lets Actions open a pull request/);
  // An absent key is the same thing as an explicit null: nothing was observed.
  assert.deepEqual(preflightReport({}).unknown, CHECK_IDS);
});

test('the token row does not pretend the command can supply the value', () => {
  const { lines } = preflightReport({ ...all(true), 'migration-token': false });
  const text = lines.join('\n');
  assert.match(text, /the owner holds the value; nothing here can/);
  assert.ok(!/gh secret set/.test(text), 'never print a command that would put a secret on a command line');
});

test('every check id has a row, and every row a distinct one', () => {
  const { lines } = preflightReport(all(true));
  assert.equal(new Set(lines).size, lines.length, 'two checks reading the same is a copy-paste, not a check');
  assert.equal(CHECK_IDS.length, new Set(CHECK_IDS).size);
});
