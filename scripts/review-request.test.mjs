// The two halves of `review-request.mjs` that can be wrong without failing: the porcelain parse,
// and whether the printed request still says the things a delegate has to be told.
//
// Both are covered because both have already been wrong once. The parse dropped the first
// character of the first path (see `git()` in the script); the request text is the only channel
// that reaches a delegated review at all, so a sentence quietly edited out of it is a rule that
// stops arriving with no gate anywhere else noticing.

import assert from 'node:assert/strict';
import test from 'node:test';

import { requestText, workingTreePaths } from './review-request.mjs';

test('a leading status column is not mistaken for part of the path', () => {
  // ` M path` - tracked, modified, unstaged - is the commonest line there is, and its first column
  // is a SPACE. Trimming the block before splitting eats it, and the path loses its first
  // character: `.agent-workflows/check.md` went out as `agent-workflows/check.md`.
  assert.deepEqual(workingTreePaths(' M .agent-workflows/check.md\0'), ['.agent-workflows/check.md']);
  assert.deepEqual(workingTreePaths('MM src/app.ts\0'), ['src/app.ts']);
  assert.deepEqual(workingTreePaths('?? scripts/new.mjs\0'), ['scripts/new.mjs']);
});

test('a rename yields the new path only, and swallows the source field', () => {
  // Under `-z` a rename is two fields: the entry carrying the NEW path, then the old one on its
  // own. Reading the follower as another entry puts a path the branch no longer has into the
  // scope, and shifts every field after it by one.
  assert.deepEqual(workingTreePaths('R  src/new.ts\0src/old.ts\0'), ['src/new.ts']);
  assert.deepEqual(workingTreePaths('R  a.ts\0b.ts\0 M c.ts\0'), ['a.ts', 'c.ts']);
  // A rename staged in the index and then modified in the worktree carries `R` in column one only.
  assert.deepEqual(workingTreePaths('RM a.ts\0b.ts\0 M c.ts\0'), ['a.ts', 'c.ts']);
});

test('a path git would have quoted arrives whole under -z', () => {
  // `-z` turns quoting off, so a name with a space or a non-ASCII byte needs no unescaping. Before
  // it, `zz-käyttö.md` arrived as `"zz-k\303\244ytt\303\266.md"` and was reported as DELETED,
  // because the escaped spelling resolves to no file on disk.
  assert.deepEqual(workingTreePaths('?? docs/a file.md\0'), ['docs/a file.md']);
  assert.deepEqual(workingTreePaths('?? zz-käyttö.md\0'), ['zz-käyttö.md']);
});

test('an empty status yields nothing, and short fields are ignored', () => {
  assert.deepEqual(workingTreePaths(''), []);
  assert.deepEqual(workingTreePaths('\0\0'), []);
  assert.deepEqual(workingTreePaths(' M a\0'), ['a']);
});

test('the request carries the scope, the ban on deriving it, and the refusal rule', () => {
  const text = requestText(
    {
      branch: 'claude/example',
      ref: 'origin/main',
      base: 'abc1234',
      files: ['src/a.ts', 'src/b.ts'],
      deleted: [],
      fetched: true,
    },
    'high',
  );
  assert.match(text, /claude\/example/);
  assert.match(text, /abc1234/);
  assert.match(text, /origin\/main/);
  assert.match(text, /Effort level: high/);
  // The three instructions that exist only here. Without the first the delegate derives a scope,
  // which is the whole defect; without the other two a disagreement is resolved silently in favour
  // of the delegate's own stale view, which is the defect wearing a different hat.
  assert.match(text, /Do not derive the changed set yourself/);
  assert.match(text, /IF YOU DISAGREE, REFUSE/);
  assert.match(text, /Report the merge-base sha and every file you actually read/);
  assert.match(text, /FILES \(2\):/);
  assert.match(text, /\n {2}src\/a\.ts\n {2}src\/b\.ts$/);
});

test('a failed fetch is declared in the request rather than hidden', () => {
  const text = requestText(
    { branch: 'b', ref: 'origin/main', base: 'abc', files: ['a.ts'], deleted: [], fetched: false },
    'high',
  );
  assert.match(text, /WARNING: `git fetch` failed/);
});

test('a deleted path is listed apart from the files to open, never among them', () => {
  // The first draft listed deletions under FILES. The request tells the delegate to REFUSE on a
  // file it cannot open, so that draft asked for a refusal on every branch that removed anything -
  // and it did exactly that on the branch that introduced this script.
  const text = requestText(
    {
      branch: 'b',
      ref: 'origin/main',
      base: 'abcdef1234567890',
      files: ['src/a.ts'],
      deleted: ['docs/gone.md'],
      fetched: true,
    },
    'high',
  );
  assert.match(text, /FILES \(1\):\n {2}src\/a\.ts/);
  assert.match(text, /DELETED \(1\)/);
  assert.match(text, /git show abcdef12:<path>/);
  // The deleted path must not appear where the refusal rule applies.
  assert.equal(text.slice(text.indexOf('FILES (1):'), text.indexOf('DELETED (1)')).includes('docs/gone.md'), false);
});

test('with nothing deleted the request has no DELETED section at all', () => {
  const text = requestText(
    { branch: 'b', ref: 'origin/main', base: 'abc', files: ['a.ts'], deleted: [], fetched: true },
    'high',
  );
  assert.equal(text.includes('DELETED'), false);
});

test('a branch that only removes files still gets a request that makes sense', () => {
  // Testing `files` alone for emptiness reported a deletion-only branch as nothing to review, which
  // tells the row to skip the check chain. The request has to read as a real instruction here, not
  // as "review the 0 files below".
  const text = requestText(
    { branch: 'b', ref: 'origin/main', base: 'abc', files: [], deleted: ['docs/gone.md'], fetched: true },
    'high',
  );
  assert.match(text, /only REMOVES files/);
  assert.match(text, /FILES: none\./);
  assert.match(text, /DELETED \(1\)/);
  assert.match(text, /docs\/gone\.md/);
  assert.equal(text.includes('FILES (0)'), false);
});
